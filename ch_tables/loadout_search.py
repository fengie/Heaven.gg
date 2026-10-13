"""Exact, bounded, interaction-preserving equipment search over supplied metrics.

This is an optimization *oracle/proxy*, not a calibrated Celtic Heroes DPS
calculator. Candidate metrics must share one explicitly identified scenario.
Unknown release/cost/effect information is never silently treated as zero.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product
import math

from .loadout_foundation import (BuildContext, EquipmentCandidate, METRICS,
                                 SLOTS, loadout_legal, permitted)


def _finite(value: float) -> bool:
    return type(value) in (int, float) and math.isfinite(value)


@dataclass(frozen=True)
class Interaction:
    """Explicit scenario-specific conditional *measured* metric adjustment.

    A rule applies when all item IDs and family counts are present. Adjustment
    may be negative (shield drawback or mutually exclusive bonus). Unknown
    interactions must remain uncertain rather than represented by an empty rule.
    """
    name: str
    metric_delta: tuple[float, ...]
    metric_basis: str
    required_item_ids: frozenset[str] = frozenset()
    required_families: tuple[tuple[str, int], ...] = ()

    def __post_init__(self):
        if not self.name or not self.metric_basis or len(self.metric_delta) != len(METRICS):
            raise ValueError("Interaction requires name, basis and six metric deltas")
        if not all(_finite(x) for x in self.metric_delta):
            raise ValueError("Interaction deltas must be finite")
        if not self.required_item_ids and not self.required_families:
            raise ValueError("Interaction cannot be unconditionally applied")
        if len({f for f, _ in self.required_families}) != len(self.required_families):
            raise ValueError("Repeated set family")
        for family, n in self.required_families:
            if not family or type(n) is not int or n < 1:
                raise ValueError("Set threshold requires positive integer")

    def applies(self, items: tuple[EquipmentCandidate, ...]) -> bool:
        ids = {i.item_id for i in items}
        families: dict[str, int] = {}
        for item in items:
            if item.set_family:
                families[item.set_family] = families.get(item.set_family, 0) + 1
        return (self.required_item_ids <= ids and
                all(families.get(family, 0) >= n
                    for family, n in self.required_families))


@dataclass(frozen=True)
class SearchSpec:
    candidates: tuple[EquipmentCandidate, ...]
    context: BuildContext
    slots: tuple[str, ...]
    metric_basis: str
    weights: tuple[float, ...]
    budget_gold: int | None = None
    interactions: tuple[Interaction, ...] = ()
    incompatible_pairs: tuple[tuple[str, str], ...] = ()
    # Applicability of mounted combat WITH other equipment is separate from
    # persistence of the mount's resource bonuses in combat.
    mount_combinations_verified: bool = False
    allow_uncertain_effects: bool = False
    max_nodes: int = 200_000

    def __post_init__(self):
        if (type(self.mount_combinations_verified) is not bool or
                type(self.allow_uncertain_effects) is not bool):
            raise ValueError("Search evidence flags must be booleans")
        if not self.metric_basis or len(self.weights) != len(METRICS):
            raise ValueError("A common scenario basis and six objective weights are required")
        if not all(_finite(x) and x >= 0 for x in self.weights) or not any(self.weights):
            raise ValueError("Finite, nonnegative, nonzero objective weights required")
        if not self.slots or len(set(self.slots)) != len(self.slots) or any(
                s not in SLOTS for s in self.slots):
            raise ValueError("Unique supported required slots needed")
        if self.budget_gold is not None and (type(self.budget_gold) is not int or self.budget_gold < 0):
            raise ValueError("Budget must be an integer amount of gold")
        if type(self.max_nodes) is not int or not 1 <= self.max_nodes <= 5_000_000:
            raise ValueError("Bounded search node limit required")
        if len({i.item_id for i in self.candidates}) != len(self.candidates):
            raise ValueError("Duplicate exact item IDs in catalog")
        if any(not a or not b or a == b for a, b in self.incompatible_pairs):
            raise ValueError("Invalid incompatibility pair")
        if len({i.name for i in self.interactions}) != len(self.interactions):
            raise ValueError("Duplicate interaction rule")
        if any(i.metric_basis != self.metric_basis for i in self.interactions):
            raise ValueError("Cannot combine interaction measurements from different scenarios")
        ids = {i.item_id for i in self.candidates}
        if any(not i.required_item_ids <= ids for i in self.interactions):
            raise ValueError("Interaction references unknown item ID")
        if any(a not in ids or b not in ids for a,b in self.incompatible_pairs):
            raise ValueError("Incompatibility references unknown item ID")


@dataclass(frozen=True)
class LoadoutScore:
    item_ids: tuple[str, ...]
    score: float
    gold_cost: int
    metrics: tuple[float, ...]
    triggered_interactions: tuple[str, ...]
    skill_bonuses: tuple[tuple[str, int], ...]
    unknown_effects: bool

    def as_dict(self) -> dict:
        return {"item_ids": list(self.item_ids), "objective_score": self.score,
                "acquisition_gold": self.gold_cost,
                "metrics": dict(zip(METRICS, self.metrics)),
                "interactions": list(self.triggered_interactions),
                "skill_bonus_levels": dict(self.skill_bonuses),
                "has_unverified_effects": self.unknown_effects}


@dataclass(frozen=True)
class SearchResult:
    winners: tuple[LoadoutScore, ...]
    certified_exact: bool
    visited_nodes: int
    evaluated_loadouts: int
    pruned_by_bound: int
    eligible_items: int
    warning: str

    def as_dict(self) -> dict:
        return {"method": "bounded_exact_interaction_search_v1",
                "certified_exact": self.certified_exact,
                "visited_nodes": self.visited_nodes,
                "evaluated_loadouts": self.evaluated_loadouts,
                "pruned_by_bound": self.pruned_by_bound,
                "eligible_items": self.eligible_items,
                "winners": [w.as_dict() for w in self.winners],
                "warning": self.warning}


def _price(item: EquipmentCandidate) -> int | None:
    return 0 if item.owned else item.cost_gold


def _eligible_groups(spec: SearchSpec) -> list[list[EquipmentCandidate]]:
    groups = []
    for slot in spec.slots:
        group = []
        for item in spec.candidates:
            if item.slot != slot or not permitted(item, spec.context):
                continue
            if item.metric_basis != spec.metric_basis:
                continue  # Never add incompatible units or patch-specific observations.
            if item.unknown_effects and not spec.allow_uncertain_effects:
                continue
            price = _price(item)
            if price is None:  # Unknown acquisition price is not a free item.
                continue
            if spec.budget_gold is not None and price > spec.budget_gold:
                continue
            group.append(item)
        group.sort(key=lambda it: (-sum(w * x for w, x in zip(spec.weights, it.metrics)), it.item_id))
        groups.append(group)
    return groups


def _compatible(items: tuple[EquipmentCandidate, ...], spec: SearchSpec) -> bool:
    ids = {x.item_id for x in items}
    if any(a in ids and b in ids for a, b in spec.incompatible_pairs):
        return False
    if not spec.mount_combinations_verified and any(x.role == "mount" for x in items):
        if any(x.slot in {"mainhand", "offhand", "pet"} for x in items):
            return False
    return True


def _evaluate(items: tuple[EquipmentCandidate, ...], spec: SearchSpec) -> LoadoutScore:
    metrics = [sum(item.metrics[i] for item in items) for i in range(len(METRICS))]
    activated = []
    for rule in spec.interactions:
        if rule.applies(items):
            activated.append(rule.name)
            for i, delta in enumerate(rule.metric_delta):
                metrics[i] += delta
    bonus: dict[str, int] = {}
    for item in items:
        for name, count in item.skill_bonus_levels:
            bonus[name] = bonus.get(name, 0) + count
    score = sum(w * v for w, v in zip(spec.weights, metrics))
    if not _finite(score) or not all(_finite(v) for v in metrics):
        raise ValueError("Loadout arithmetic overflow; rescale explicit metrics/weights")
    return LoadoutScore(tuple(x.item_id for x in items),
                        score,
                        sum(_price(it) for it in items),
                        tuple(metrics), tuple(activated),
                        tuple(sorted(bonus.items())),
                        any(x.unknown_effects for x in items))


def _ranked_insert(winners: list[LoadoutScore], candidate: LoadoutScore, k: int) -> None:
    winners.append(candidate)
    winners.sort(key=lambda x: (-x.score, x.gold_cost, x.item_ids))
    if len(winners) > k:
        del winners[k:]


def optimize_loadouts(spec: SearchSpec, *, top_k: int = 1) -> SearchResult:
    """Exact top-K under explicit additive metrics and triggered interactions.

    Branch-and-bound uses only optimistic per-slot scores and the sum of every
    positive interaction reward, including interactions that cannot actually
    fire: loose but *admissible*. If the work cap is hit, results are partial.
    """
    if type(top_k) is not int or not 1 <= top_k <= 100:
        raise ValueError("top_k must be 1..100")
    groups = _eligible_groups(spec)
    count = sum(map(len, groups))
    if any(not g for g in groups):
        return SearchResult((), True, 0, 0, 0, count, "No eligible loadout for at least one required slot")
    suffix_max = [0.0] * (len(groups) + 1)
    suffix_min_cost = [0] * (len(groups) + 1)
    for i in range(len(groups) - 1, -1, -1):
        suffix_max[i] = suffix_max[i+1] + max(sum(w*x for w,x in zip(spec.weights,it.metrics)) for it in groups[i])
        suffix_min_cost[i] = suffix_min_cost[i+1] + min(_price(it) for it in groups[i])
    extra_upper = sum(max(0.0, sum(w * v for w, v in zip(spec.weights, rule.metric_delta)))
                      for rule in spec.interactions)
    winners: list[LoadoutScore] = []
    nodes = evaluated = pruned = 0
    exhausted = False

    def visit(depth: int, chosen: tuple[EquipmentCandidate, ...], cost: int, proxy: float) -> None:
        nonlocal nodes, evaluated, pruned, exhausted
        if exhausted:
            return
        if nodes >= spec.max_nodes:
            exhausted = True
            return
        nodes += 1
        if spec.budget_gold is not None and cost + suffix_min_cost[depth] > spec.budget_gold:
            pruned += 1
            return
        if len(winners) >= top_k and proxy + suffix_max[depth] + extra_upper < winners[-1].score - 1e-9:
            pruned += 1
            return
        if depth == len(groups):
            if loadout_legal(chosen, spec.context) and _compatible(chosen, spec):
                evaluated += 1
                _ranked_insert(winners, _evaluate(chosen, spec), top_k)
            return
        for item in groups[depth]:
            nxt = chosen + (item,)
            if not _compatible(nxt, spec):
                continue
            price = _price(item)
            if spec.budget_gold is not None and cost + price > spec.budget_gold:
                continue
            visit(depth + 1, nxt, cost + price,
                  proxy + sum(w*x for w,x in zip(spec.weights,item.metrics)))
            if exhausted:
                return

    visit(0, (), 0, 0.0)
    return SearchResult(tuple(winners), not exhausted, nodes, evaluated, pruned, count,
                        "UNCALIBRATED metric proxy; cannot infer real DPS from unmeasured "
                        "bonuses/skill ranks/availability. " +
                        ("Search exhausted its node budget: winners NOT proven optimal."
                         if exhausted else "Search exact only for the explicitly encoded mechanics."))


def exhaustive_oracle(spec: SearchSpec, *, top_k: int = 1, max_combinations: int = 100_000) -> tuple[LoadoutScore, ...]:
    """Independent tiny-case oracle; never silently enumerate large catalogs."""
    if type(top_k) is not int or not 1 <= top_k <= 100:
        raise ValueError("top_k must be 1..100")
    groups = _eligible_groups(spec)
    combinations = math.prod(len(g) for g in groups)
    if combinations > max_combinations:
        raise ValueError("Oracle size cap exceeded")
    winners: list[LoadoutScore] = []
    for chosen in product(*groups):
        if not loadout_legal(chosen, spec.context) or not _compatible(chosen, spec):
            continue
        cost = sum(_price(it) for it in chosen)
        if spec.budget_gold is not None and cost > spec.budget_gold:
            continue
        _ranked_insert(winners, _evaluate(chosen, spec), top_k)
    return tuple(winners)

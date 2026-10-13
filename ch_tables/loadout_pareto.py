"""Exact (within a work cap) multiobjective equipment frontier, not real-game DPS.

Uses the same eligibility, interaction, mount and acquisition contracts as the
bounded scalar optimizer. All six additive scenario metrics are maximized;
acquisition gold is minimized. A distinct score-weight preference does not
silently remove a nondominated alternative.

No live game calibration is inferred from exact combinatorial enumeration.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product
import math

from .loadout_foundation import METRICS, loadout_legal
from .loadout_search import (SearchSpec, LoadoutScore, _eligible_groups,
                             _compatible, _price, _evaluate)

OBJECTIVES = tuple((name, "maximize") for name in METRICS) + (("acquisition_gold", "minimize"),)


def dominates(a: LoadoutScore, b: LoadoutScore) -> bool:
    """Strong Pareto dominance; do not use weighted sums or epsilon truncation."""
    return (a.gold_cost <= b.gold_cost and
            all(x >= y for x, y in zip(a.metrics, b.metrics)) and
            (a.gold_cost < b.gold_cost or any(x > y for x, y in zip(a.metrics, b.metrics))))


def _equal_objectives(a: LoadoutScore, b: LoadoutScore) -> bool:
    return a.gold_cost == b.gold_cost and a.metrics == b.metrics


def _frontier_insert(frontier: list[LoadoutScore], candidate: LoadoutScore) -> None:
    """Deterministic canonical representative for identical outcome vectors."""
    for old in frontier:
        if dominates(old, candidate):
            return
        if _equal_objectives(old, candidate) and old.item_ids <= candidate.item_ids:
            return
    frontier[:] = [old for old in frontier if not dominates(candidate, old) and
                   not (_equal_objectives(candidate, old) and candidate.item_ids < old.item_ids)]
    frontier.append(candidate)


def _sort_key(item: LoadoutScore) -> tuple:
    # Stable display only: never affects frontier membership.
    return (-item.metrics[0], item.gold_cost, tuple(-v for v in item.metrics[1:]), item.item_ids)


@dataclass(frozen=True)
class ParetoResult:
    frontier: tuple[LoadoutScore, ...]
    certified_exact: bool
    visited_nodes: int
    evaluated_loadouts: int
    pruned_by_bound: int
    eligible_items: int
    stop_reason: str | None
    warning: str

    def as_dict(self) -> dict:
        return {
            "method": "bounded_exact_pareto_v1",
            "certified_exact": self.certified_exact,
            "stop_reason": self.stop_reason,
            "objectives": [{"name": n, "direction": direction} for n, direction in OBJECTIVES],
            "frontier": [item.as_dict() for item in self.frontier],
            "visited_nodes": self.visited_nodes,
            "evaluated_loadouts": self.evaluated_loadouts,
            "pruned_by_bound": self.pruned_by_bound,
            "eligible_items": self.eligible_items,
            "warning": self.warning,
        }


def pareto_loadouts(spec: SearchSpec, *, max_frontier: int = 2000) -> ParetoResult:
    """Certified complete only if node and output caps do not interrupt search.

    Each branch upper bound is deliberately *optimistic in every dimension*:
    the largest remaining-slot contribution PLUS the positive component of
    EVERY interaction, whether achievable or not. A branch is discarded only
    if an already-feasible loadout strictly dominates that optimistic bound
    even when remaining gold is charged at its minimum possible amount.

    This may be slow for many independent objectives: correctness is favored
    over unsupported multiobjective pruning. A node/output cap never produces
    a misleading full-Pareto certificate.
    """
    if type(max_frontier) is not int or not 1 <= max_frontier <= 100_000:
        raise ValueError("max_frontier must be an integer from 1..100000")
    groups = _eligible_groups(spec)
    eligible = sum(len(g) for g in groups)
    if any(not g for g in groups):
        return ParetoResult((), True, 0, 0, 0, eligible, None,
                            "No eligible complete loadout. Source metrics uncalibrated.")

    count_metrics = len(METRICS)
    suffix_upper = [[0.0] * count_metrics for _ in range(len(groups) + 1)]
    suffix_min_cost = [0] * (len(groups) + 1)
    for idx in range(len(groups) - 1, -1, -1):
        suffix_upper[idx] = [suffix_upper[idx + 1][m] + max(item.metrics[m] for item in groups[idx])
                             for m in range(count_metrics)]
        suffix_min_cost[idx] = suffix_min_cost[idx + 1] + min(_price(it) for it in groups[idx])
    interaction_upper = [sum(max(0.0, rule.metric_delta[m]) for rule in spec.interactions)
                         for m in range(count_metrics)]

    frontier: list[LoadoutScore] = []
    nodes = evaluated = pruned = 0
    stop_reason: str | None = None

    def visit(depth: int, chosen: tuple, cost: int, metrics: tuple[float, ...]) -> None:
        nonlocal nodes, evaluated, pruned, stop_reason
        if stop_reason is not None:
            return
        if nodes >= spec.max_nodes:
            stop_reason = "node_limit"
            return
        nodes += 1
        min_cost = cost + suffix_min_cost[depth]
        if spec.budget_gold is not None and min_cost > spec.budget_gold:
            pruned += 1
            return
        # Deliberately widen floating-point upper bounds before pruning:
        # different addition orders must not silently discard a winner.
        def upper_component(m: int) -> float:
            v = metrics[m] + suffix_upper[depth][m] + interaction_upper[m]
            if (metrics[m] == 0 and suffix_upper[depth][m] == 0 and
                    interaction_upper[m] == 0):
                # Exact structural zero: rounding cannot create extra value.
                return 0.0
            slack = 1e-10 * max(1., abs(metrics[m]), abs(suffix_upper[depth][m]),
                                abs(interaction_upper[m]))
            return math.nextafter(v + slack, math.inf)

        optimistic = tuple(upper_component(m) for m in range(count_metrics))
        # Equality cannot prune: a later equal vector may have the canonical
        # smaller item-ID tuple, particularly when all upper bounds are zero.
        if any(winner.gold_cost <= min_cost and
               all(x >= bound for x, bound in zip(winner.metrics, optimistic)) and
               (winner.gold_cost < min_cost or
                any(x > bound for x, bound in zip(winner.metrics, optimistic)))
               for winner in frontier):
            pruned += 1
            return
        if depth == len(groups):
            if loadout_legal(chosen, spec.context) and _compatible(chosen, spec):
                evaluated += 1
                _frontier_insert(frontier, _evaluate(chosen, spec))
                if len(frontier) > max_frontier:
                    # No hidden approximation: keep a partial representative
                    # and report that a complete front could not be certified.
                    frontier.sort(key=_sort_key)
                    del frontier[max_frontier:]
                    stop_reason = "frontier_limit"
            return
        for item in groups[depth]:
            next_choices = chosen + (item,)
            if not _compatible(next_choices, spec):
                continue
            new_cost = cost + _price(item)
            if spec.budget_gold is not None and new_cost > spec.budget_gold:
                continue
            visit(depth + 1, next_choices, new_cost,
                  tuple(metrics[m] + item.metrics[m] for m in range(count_metrics)))
            if stop_reason is not None:
                return

    visit(0, (), 0, (0.0,) * count_metrics)
    frontier.sort(key=_sort_key)
    return ParetoResult(
        tuple(frontier), stop_reason is None, nodes, evaluated, pruned, eligible,
        stop_reason,
        "UNCALIBRATED scenario-specific additive metrics, NOT practical Celtic Heroes DPS. "
        + ("Incomplete frontier: node/output limit reached; do not call this the Pareto front."
           if stop_reason else "Exact Pareto frontier only for the explicitly modeled mechanics and prices."),
    )


def exhaustive_pareto_oracle(spec: SearchSpec, *, max_combinations: int = 100_000) -> tuple[LoadoutScore, ...]:
    """Unpruned tiny-case truth reference with an independent enumeration path."""
    if type(max_combinations) is not int or max_combinations < 1:
        raise ValueError("Positive integer oracle cap required")
    groups = _eligible_groups(spec)
    if math.prod(len(g) for g in groups) > max_combinations:
        raise ValueError("Oracle size cap exceeded")
    candidates = []
    for items in product(*groups):
        if loadout_legal(items, spec.context) and _compatible(items, spec):
            cost = sum(_price(item) for item in items)
            if spec.budget_gold is None or cost <= spec.budget_gold:
                candidates.append(_evaluate(items, spec))
    nondominated = []
    for point in candidates:
        if any(dominates(other, point) or
               (_equal_objectives(other, point) and other.item_ids < point.item_ids)
               for other in candidates):
            continue
        nondominated.append(point)
    return tuple(sorted(nondominated, key=_sort_key))

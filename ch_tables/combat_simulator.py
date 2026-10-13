"""Deterministic discrete-event combat *model*, not validated game mechanics.

All durations, hit rates, post-mitigation damage and resource rates are explicit
scenario inputs. The scheduling, cast interruption, buff stacking, potion use,
and DoT refresh semantics are assumptions to calibrate against game observations.
No live client/server connections, invented skill curves, or secret game data.

Run: python -m ch_tables.combat_simulator --scenario path/to/scenario.json
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import hashlib
import heapq
import json
import math
from pathlib import Path
import random
from statistics import mean

EPS = 1e-9
MAX_EVENTS = 500_000
MODEL_VERSION = "synthetic_discrete_event_v2_UNCALIBRATED"


def _nonnegative(*values: float) -> None:
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or
           not math.isfinite(v) or v < 0 for v in values):
        raise ValueError("Expected finite, nonnegative measured inputs")


def _chance(v: float) -> None:
    _nonnegative(v)
    if v > 1:
        raise ValueError("Probability must be between zero and one")


@dataclass(frozen=True)
class Attack:
    interval_s: float
    damage: float  # supplied POST-mitigation, per hit, not a game stat formula
    hit_probability: float = 1.0
    crit_probability: float = 0.0
    crit_multiplier: float = 1.0

    def __post_init__(self):
        _nonnegative(self.interval_s, self.damage, self.crit_multiplier)
        _chance(self.hit_probability)
        _chance(self.crit_probability)
        if self.interval_s <= 0 or self.crit_multiplier < 1:
            raise ValueError("Attack interval > 0 and crit multiplier >= 1 required")


@dataclass(frozen=True)
class DamageOverTime:
    tick_damage: float
    tick_interval_s: float
    ticks: int

    def __post_init__(self):
        _nonnegative(self.tick_damage, self.tick_interval_s)
        if self.tick_interval_s <= 0 or type(self.ticks) is not int or self.ticks < 1:
            raise ValueError("DoT needs a positive tick interval and count")


@dataclass(frozen=True)
class TimedEffect:
    name: str
    duration_s: float
    outgoing_multiplier: float = 1.0
    incoming_multiplier: float = 1.0

    def __post_init__(self):
        _nonnegative(self.duration_s, self.outgoing_multiplier, self.incoming_multiplier)
        if type(self.name) is not str or not self.name.strip() or self.duration_s <= 0:
            raise ValueError("Effect name and positive duration required")


@dataclass(frozen=True)
class SwapDelay:
    item_id: str
    slot: str
    equip_s: float
    restore_s: float

    def __post_init__(self):
        if (type(self.item_id) is not str or not self.item_id.strip() or
                type(self.slot) is not str or not self.slot.strip()):
            raise ValueError("Swap item and slot required")
        _nonnegative(self.equip_s, self.restore_s)


@dataclass(frozen=True)
class SimSkill:
    name: str
    damage: float
    cooldown_s: float
    cast_s: float
    energy_cost: float = 0.0
    heal: float = 0.0
    hit_probability: float = 1.0
    priority: int = 0
    dot: DamageOverTime | None = None
    effect: TimedEffect | None = None
    swaps: tuple[SwapDelay, ...] = ()

    def __post_init__(self):
        if type(self.name) is not str or not self.name.strip() or type(self.priority) is not int:
            raise ValueError("Skill name and integer priority required")
        _nonnegative(self.damage, self.cooldown_s, self.cast_s,
                     self.energy_cost, self.heal)
        _chance(self.hit_probability)
        if self.cooldown_s <= 0:
            raise ValueError("Skill cooldown must be positive")
        if len(self.swaps) > 3 or len({s.slot for s in self.swaps}) != len(self.swaps):
            raise ValueError("At most three swaps, in distinct slots, per skill")

    @property
    def occupied_s(self) -> float:
        return self.cast_s + sum(s.equip_s + s.restore_s for s in self.swaps)


@dataclass(frozen=True)
class Potion:
    restore: float
    charges: int
    threshold_fraction: float
    action_s: float
    cooldown_s: float
    gold_each: int = 0

    def __post_init__(self):
        _nonnegative(self.restore, self.action_s, self.cooldown_s)
        _chance(self.threshold_fraction)
        if (type(self.charges) is not int or self.charges < 0 or
                type(self.gold_each) is not int or self.gold_each < 0):
            raise ValueError("Invalid potion charges/cost")
        if self.charges and self.restore <= 0:
            raise ValueError("Potion with charges must restore a resource")


@dataclass(frozen=True)
class MountBonus:
    max_hp: float = 0.0
    max_energy: float = 0.0
    verified_in_combat: bool = False

    def __post_init__(self):
        _nonnegative(self.max_hp, self.max_energy)
        if type(self.verified_in_combat) is not bool:
            raise ValueError("Mount verification must be a boolean, not a truthy value")
        if (self.max_hp or self.max_energy) and not self.verified_in_combat:
            raise ValueError("Unverified mount effects cannot alter combat resources")


@dataclass(frozen=True)
class Encounter:
    duration_s: float
    max_hp: float
    max_energy: float
    auto: Attack | None = None
    skills: tuple[SimSkill, ...] = ()
    enemy: Attack | None = None
    pet: Attack | None = None
    hp_regen_s: float = 0.0
    energy_regen_s: float = 0.0
    hp_potion: Potion | None = None
    energy_potion: Potion | None = None
    mount: MountBonus = field(default_factory=MountBonus)
    boss_hp: float | None = None
    evidence: str = "synthetic"
    source_url: str = ""

    def __post_init__(self):
        _nonnegative(self.duration_s, self.max_hp, self.max_energy,
                     self.hp_regen_s, self.energy_regen_s)
        if self.duration_s <= 0 or self.duration_s > 86400 or self.max_hp <= 0:
            raise ValueError("Positive fight duration <=24h and HP required")
        if self.boss_hp is not None:
            _nonnegative(self.boss_hp)
            if self.boss_hp <= 0:
                raise ValueError("Boss HP must be positive")
        if self.evidence not in ("synthetic", "user_estimate", "observed", "community_model"):
            raise ValueError("Explicit input evidence category required")
        if self.evidence in ("observed", "community_model") and not self.source_url.startswith("https://"):
            raise ValueError("Observed/modelled game inputs need public HTTPS provenance")
        if len({s.name for s in self.skills}) != len(self.skills):
            raise ValueError("Duplicate skill names")


def from_build_choices(choices: tuple, *, priority: dict[str, int] | None = None) -> tuple[SimSkill, ...]:
    """Convert planner Choice ranks/swaps into event skills without extrapolation.

    Caller supplies already eligibility-checked planner choices. An unselected
    skill (rank=None) is omitted. No hidden 0-DPS or guessed cooldown curve.
    """
    result = []
    for choice in choices:
        if choice.rank is None:
            continue
        rank = choice.rank
        result.append(SimSkill(
            name=choice.skill,
            damage=rank.expected_damage + sum(s.direct_damage for s in choice.swaps),
            cooldown_s=rank.cooldown_s,
            cast_s=rank.occupied_s,
            energy_cost=rank.energy_cost,
            heal=rank.healing,
            hit_probability=rank.hit_probability,
            priority=(priority or {}).get(choice.skill, 0),
            swaps=tuple(SwapDelay(s.item_id, s.slot, s.equip_seconds,
                                  s.unequip_seconds) for s in choice.swaps),
        ))
    return tuple(result)


def simulate(encounter: Encounter, *, seed: int = 0, trace_limit: int = 0) -> dict:
    """Simulate a fixed horizon; shared per-source RNG streams aid comparisons.

    Mechanics assumptions: cast/swap/potion actions occupy the same player
    lock, missed auto ticks restart one interval after unlock, cooldowns
    start on cast begin, DoTs refresh rather than stack for the same skill,
    timed multipliers stack multiplicatively and expire before same-time hits.
    Absent explicit server observations these are NOT Celtic Heroes facts.
    """
    if type(seed) is not int or type(trace_limit) is not int or not 0 <= trace_limit <= 500:
        raise ValueError("Integer seed and trace limit 0..500 required")
    queue: list[tuple[float, int, int, str, object]] = []
    seq = 0
    pending_actions: set[float] = set()

    def put(t: float, order: int, kind: str, data: object = None) -> None:
        nonlocal seq
        if t <= encounter.duration_s + EPS:
            # Identical wake-ups carry no payload. Coalesce while queued, not
            # forever: zero-time actions may legitimately wake again after pop.
            if kind == "act":
                if t in pending_actions:
                    return
                pending_actions.add(t)
            seq += 1
            heapq.heappush(queue, (t, order, seq, kind, data))

    rngs: dict[str, random.Random] = {}

    def roll(channel: str) -> random.Random:
        if channel not in rngs:
            key = hashlib.sha256(f"{seed}:{channel}".encode()).digest()
            rngs[channel] = random.Random(int.from_bytes(key[:16], "big"))
        return rngs[channel]

    p = encounter
    maxhp, maxen = p.max_hp + p.mount.max_hp, p.max_energy + p.mount.max_energy
    _nonnegative(maxhp, maxen)
    hp, energy = maxhp, maxen
    boss_left = p.boss_hp
    now = 0.0
    last = 0.0
    busy_until = 0.0
    cd = {s.name: 0.0 for s in p.skills}
    potion_cd = {"hp": 0.0, "energy": 0.0}
    potion_left = {"hp": p.hp_potion.charges if p.hp_potion else 0,
                   "energy": p.energy_potion.charges if p.energy_potion else 0}
    effects: dict[str, tuple[int, TimedEffect]] = {}
    # Never recycle a generation after expiry: an older scheduled expiry can
    # outlive a shorter replacement and must not remove a later application.
    effect_generations: dict[str, int] = {}
    dots: dict[str, int] = {}
    damage = {"auto": 0.0, "skills": 0.0, "dots": 0.0, "pet": 0.0}
    attempted_hits = 0
    skill_casts: dict[str, int] = {s.name: 0 for s in p.skills}
    potion_uses = {"hp": 0, "energy": 0}
    swap_operations = 0
    actions = 0
    trace: list[dict] = []
    end_reason = "time_limit"

    def log(kind: str, **details: object) -> None:
        if len(trace) < trace_limit:
            trace.append({"time_s": round(now, 6), "event": kind, **details})

    def outgoing() -> float:
        result = 1.0
        for _, buff in effects.values():
            result *= buff.outgoing_multiplier
        return result

    def incoming() -> float:
        result = 1.0
        for _, buff in effects.values():
            result *= buff.incoming_multiplier
        return result

    def deal(amount: float, part: str) -> bool:
        nonlocal boss_left
        _nonnegative(amount)  # Finite inputs can still overflow on multiplication.
        if boss_left is not None:
            amount = min(amount, boss_left)
            boss_left = max(0.0, boss_left - amount)
        damage[part] += amount
        return boss_left is not None and boss_left <= EPS

    def sampled(attack: Attack, channel: str) -> float:
        r = roll(channel)
        if r.random() >= attack.hit_probability:
            return 0.0
        crit = attack.crit_multiplier if r.random() < attack.crit_probability else 1.0
        return attack.damage * crit

    put(0.0, 9, "act")
    for name, attack in (("auto", p.auto), ("enemy", p.enemy), ("pet", p.pet)):
        if attack:
            put(attack.interval_s, {"enemy": 1, "pet": 5, "auto": 6}[name], name)
    count = 0
    while queue:
        count += 1
        if count > MAX_EVENTS:
            raise RuntimeError("Event cap exceeded; inspect scenario intervals")
        t, _, _, event, payload = heapq.heappop(queue)
        if event == "act":
            pending_actions.discard(t)
        if t > p.duration_s + EPS:
            break
        dt = max(0.0, t - last)
        hp = min(maxhp, hp + p.hp_regen_s * dt)
        energy = min(maxen, energy + p.energy_regen_s * dt)
        last = now = t
        if event == "expire":
            name, generation = payload
            if name in effects and effects[name][0] == generation:
                del effects[name]
                log("effect_expired", name=name)
        elif event == "enemy":
            hit = sampled(p.enemy, "enemy") * incoming()
            _nonnegative(hit)
            hp = max(0.0, hp - hit)
            log("enemy_hit", damage=round(hit, 4), hp=round(hp, 4))
            put(t + p.enemy.interval_s, 1, "enemy")
            if hp <= EPS:
                end_reason = "player_died"
                break
            put(t, 9, "act")
        elif event == "auto":
            if t + EPS < busy_until:
                put(busy_until + p.auto.interval_s, 6, "auto")
            else:
                attempted_hits += 1
                if deal(sampled(p.auto, "auto") * outgoing(), "auto"):
                    end_reason = "boss_killed"
                    break
                put(t + p.auto.interval_s, 6, "auto")
        elif event == "pet":
            attempted_hits += 1
            if deal(sampled(p.pet, "pet") * outgoing(), "pet"):
                end_reason = "boss_killed"
                break
            put(t + p.pet.interval_s, 5, "pet")
        elif event == "skill_done":
            skill = payload
            if roll("skill:" + skill.name).random() < skill.hit_probability:
                if deal(skill.damage * outgoing(), "skills"):
                    end_reason = "boss_killed"
                    break
                if skill.dot:
                    gen = dots.get(skill.name, 0) + 1
                    dots[skill.name] = gen
                    put(t + skill.dot.tick_interval_s, 2, "dot", (skill, gen, 1))
            hp = min(maxhp, hp + skill.heal)
            if skill.effect:
                gen = effect_generations.get(skill.effect.name, 0) + 1
                effect_generations[skill.effect.name] = gen
                effects[skill.effect.name] = (gen, skill.effect)
                put(t + skill.effect.duration_s, 0, "expire", (skill.effect.name, gen))
            log("skill_done", name=skill.name, hp=round(hp, 4))
            put(t, 9, "act")
        elif event == "dot":
            skill, gen, tick = payload
            if dots.get(skill.name) == gen:
                if deal(skill.dot.tick_damage * outgoing(), "dots"):
                    end_reason = "boss_killed"
                    break
                if tick < skill.dot.ticks:
                    put(t + skill.dot.tick_interval_s, 2, "dot", (skill, gen, tick + 1))
        elif event == "potion_done":
            kind, potion = payload
            if kind == "hp":
                hp = min(maxhp, hp + potion.restore)
            else:
                energy = min(maxen, energy + potion.restore)
            log("potion_done", resource=kind)
            put(t, 9, "act")
        elif event == "act":
            if t + EPS < busy_until:
                continue
            chosen = None
            for kind, potion, current, maximum in (
                    ("hp", p.hp_potion, hp, maxhp),
                    ("energy", p.energy_potion, energy, maxen)):
                if (potion and potion_left[kind] > 0 and
                    t + EPS >= potion_cd[kind] and
                    current < maximum - EPS and
                    current <= potion.threshold_fraction * maximum + EPS):
                    chosen = kind, potion
                    break
            if chosen:
                kind, potion = chosen
                potion_left[kind] -= 1
                potion_uses[kind] += 1
                actions += 1
                potion_cd[kind] = t + potion.cooldown_s
                busy_until = t + potion.action_s
                log("potion_started", resource=kind)
                put(busy_until, 4, "potion_done", (kind, potion))
                continue
            ready = [s for s in p.skills if cd[s.name] <= t + EPS and
                     energy + EPS >= s.energy_cost]
            if ready:
                skill = min(ready, key=lambda s: (-s.priority, s.name))
                energy = max(0.0, energy - skill.energy_cost)
                cd[skill.name] = t + skill.cooldown_s
                busy_until = t + skill.occupied_s
                actions += 1
                swap_operations += 2 * len(skill.swaps)
                skill_casts[skill.name] += 1
                log("skill_started", name=skill.name, energy=round(energy, 4))
                put(busy_until, 3, "skill_done", skill)
                continue
            # Wake at the earliest instant a skill can run, including regen.
            wake = []
            for skill in p.skills:
                if skill.energy_cost > maxen + EPS:
                    continue
                needed = max(0.0, skill.energy_cost - energy)
                if needed > EPS and p.energy_regen_s <= 0:
                    continue
                resource_at = t + (needed / p.energy_regen_s if needed > EPS else 0.0)
                candidate = max(cd[skill.name], resource_at)
                if candidate > t + EPS:
                    wake.append(candidate)
            # Potion cooldowns may allow recovery before next enemy tick.
            for kind, potion, current, maximum in (
                    ("hp", p.hp_potion, hp, maxhp),
                    ("energy", p.energy_potion, energy, maxen)):
                if (potion and potion_left[kind] and current < maximum - EPS and
                    current <= potion.threshold_fraction * maximum + EPS and
                    potion_cd[kind] > t + EPS):
                    wake.append(potion_cd[kind])
            if wake:
                put(min(wake), 9, "act")
        else:
            raise AssertionError(f"Unknown queued event: {event}")
    # Finish passive resource recovery to the horizon even when nothing else
    # needs scheduling (e.g. an auto-less/resource-starved character).
    if end_reason == "time_limit" and last < p.duration_s:
        dt = p.duration_s - last
        hp = min(maxhp, hp + p.hp_regen_s * dt)
        energy = min(maxen, energy + p.energy_regen_s * dt)
    stop = now if end_reason != "time_limit" else p.duration_s
    gold = ((p.hp_potion.gold_each if p.hp_potion else 0) * potion_uses["hp"] +
            (p.energy_potion.gold_each if p.energy_potion else 0) * potion_uses["energy"])
    total = sum(damage.values())
    _nonnegative(total, total / p.duration_s, total / stop if stop > EPS else 0.0)
    return {
        "input_evidence": p.evidence,
        "source_url": p.source_url or None,
        "model": MODEL_VERSION,
        "seed": seed,
        "target_duration_s": p.duration_s,
        "elapsed_s": round(stop, 6),
        "end_reason": end_reason,
        "survived_full_window": end_reason == "time_limit",
        "total_damage": round(total, 6),
        "fixed_window_dps": round(total / p.duration_s, 6),
        "active_time_dps": round(total / stop, 6) if stop > EPS else 0.0,
        "damage_breakdown": {k: round(v, 6) for k, v in damage.items()},
        "remaining_hp": round(hp, 6),
        "remaining_energy": round(energy, 6),
        "remaining_boss_hp": round(boss_left, 6) if boss_left is not None else None,
        "skill_casts": skill_casts,
        "potions_used": potion_uses,
        "consumable_gold": gold,
        "swap_operations": swap_operations,
        "player_actions": actions,
        "attempted_auto_and_pet_hits": attempted_hits,
        "events_processed": count,
        "trace": trace,
        "warning": "UNCALIBRATED scenario model, not observed Celtic Heroes DPS. "
                   "All timing, hit rates and combat mechanics require "
                   "patch- and encounter-specific measurement.",
    }


def encounter_from_dict(data: dict) -> Encounter:
    """Strict structured JSON adapter, no executable input or hidden defaults."""
    d = dict(data)
    for key in ("auto", "enemy", "pet"):
        if d.get(key) is not None:
            d[key] = Attack(**d[key])
    for key in ("hp_potion", "energy_potion"):
        if d.get(key) is not None:
            d[key] = Potion(**d[key])
    if d.get("mount") is not None:
        d["mount"] = MountBonus(**d["mount"])
    skills = []
    for raw in d.get("skills", []):
        s = dict(raw)
        if s.get("dot") is not None:
            s["dot"] = DamageOverTime(**s["dot"])
        if s.get("effect") is not None:
            s["effect"] = TimedEffect(**s["effect"])
        s["swaps"] = tuple(SwapDelay(**x) for x in s.get("swaps", []))
        skills.append(SimSkill(**s))
    d["skills"] = tuple(skills)
    return Encounter(**d)


def compare_candidates(candidates: dict[str, Encounter], seeds: tuple[int, ...]) -> dict:
    """Paired-seed horizon comparisons; observational uncertainty not inferred."""
    if not candidates or not seeds or len(seeds) > 1000 or len(set(seeds)) != len(seeds):
        raise ValueError("Need candidate scenarios and 1..1000 unique seeds")
    reference = next(iter(candidates.values()))
    context = lambda case: (case.duration_s, case.enemy, case.boss_hp, case.evidence)
    if any(context(case) != context(reference) for case in candidates.values()):
        raise ValueError("Paired candidates must use the same encounter duration, enemy, boss HP and evidence kind")
    rows = {}
    for name, case in candidates.items():
        outcomes = [simulate(case, seed=s) for s in seeds]
        rows[name] = {
            "mean_fixed_window_dps": mean(x["fixed_window_dps"] for x in outcomes),
            "survival_fraction": mean(x["end_reason"] != "player_died" for x in outcomes),
            "full_window_fraction": mean(x["survived_full_window"] for x in outcomes),
            "boss_kill_fraction": mean(x["end_reason"] == "boss_killed" for x in outcomes),
            "mean_potion_gold": mean(x["consumable_gold"] for x in outcomes),
            "mean_swap_operations": mean(x["swap_operations"] for x in outcomes),
            "per_seed": [{"seed": x["seed"], "dps": x["fixed_window_dps"],
                          "end_reason": x["end_reason"]} for x in outcomes],
        }
    return {"method": "paired_per_source_seed_comparison_UNCALIBRATED",
            "model": MODEL_VERSION,
            "seeds": list(seeds), "candidates": rows}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scenario", type=Path, required=True)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--trace-limit", type=int, default=0)
    args = ap.parse_args()
    case = encounter_from_dict(json.loads(args.scenario.read_text(encoding="utf-8")))
    print(json.dumps(simulate(case, seed=args.seed, trace_limit=args.trace_limit), indent=2))


if __name__ == "__main__":
    main()

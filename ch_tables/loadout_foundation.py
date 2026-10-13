"""Interaction-aware equipment candidates and safe conditional Pareto reduction.

This layer deliberately avoids converting undocumented Vitality/Focus into HP
or Energy and never presumes a mount stays active in combat. It preserves
conditional set effects, proc mechanics, skill rank breakpoints and offhand
roles. It is a *prefilter*, not a combat simulator.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

METRICS = (
    "damage_proxy", "max_hp", "max_energy", "hp_regen_s",
    "energy_regen_s", "incoming_dps_reduction",
)
SLOTS = frozenset({
    "mainhand", "offhand", "head", "torso", "legs", "hands", "feet",
    "neck", "charm", "ring1", "ring2", "ring3", "ring4",
    "bracelet1", "bracelet2", "mount", "pet",
})


@dataclass(frozen=True)
class EquipmentCandidate:
    item_id: str
    slot: str
    role: str  # weapon, shield, offhand, mount, pet, armor, jewellery
    metrics: tuple[float, float, float, float, float, float]
    cost_gold: int | None = None
    min_level: int = 1
    classes: frozenset[str] = frozenset()
    class_scope: str = "unknown"  # unknown, all, restricted
    metric_basis: str = ""  # exact observation/calibration scenario identity
    set_family: str | None = None
    skill_bonus_levels: tuple[tuple[str, int], ...] = ()
    mechanics: frozenset[str] = frozenset()
    unknown_effects: bool = True
    in_combat_effect_verified: bool = False
    released_documented: bool = False
    owned: bool = False
    weapon_family: str | None = None

    def __post_init__(self):
        if type(self.item_id) is not str or not self.item_id.strip() or self.slot not in SLOTS:
            raise ValueError("Exact item ID and supported canonical slot required")
        if self.class_scope not in ("unknown", "all", "restricted"):
            raise ValueError("Invalid class eligibility evidence")
        if self.class_scope == "restricted" and not self.classes:
            raise ValueError("Restricted class rule needs class names")
        if self.class_scope == "all" and self.classes:
            raise ValueError("Unrestricted class rule cannot have a class whitelist")
        if (type(self.min_level) is not int or self.min_level < 1 or
                self.cost_gold is not None and (type(self.cost_gold) is not int or self.cost_gold < 0)):
            raise ValueError("Level and known gold price must be exact nonnegative integers")
        if any(type(getattr(self, name)) is not bool for name in
               ("unknown_effects", "in_combat_effect_verified", "released_documented", "owned")):
            raise ValueError("Evidence and ownership flags must be booleans")
        if len(self.metrics) != len(METRICS) or any(
            type(v) not in (int, float) or not (-1e20 < v < 1e20)
            for v in self.metrics
        ):
            raise ValueError("Metrics must be six finite explicitly sourced values")
        if any(v < 0 for v in self.metrics[1:]):
            raise ValueError("Nonnegative HP/energy/regen/mitigation bonuses required")
        if self.role == "mount" and self.slot != "mount":
            raise ValueError("Mount must use mount slot")
        if self.role == "pet" and self.slot != "pet":
            raise ValueError("Pet must use pet slot")
        if self.role == "shield" and self.slot != "offhand":
            raise ValueError("Shield competes for offhand slot")
        if self.role in ("weapon",) and self.slot != "mainhand":
            raise ValueError("Main weapon must use mainhand slot")
        if len({name for name, _ in self.skill_bonus_levels}) != len(self.skill_bonus_levels):
            raise ValueError("Duplicate skill bonus name")
        if any(type(name) is not str or not name.strip() or
               type(value) is not int or value < 0 for name, value in self.skill_bonus_levels):
            raise ValueError("Invalid skill bonus")


@dataclass(frozen=True)
class BuildContext:
    player_class: str
    level: int
    include_owned_unverified: bool = True
    allow_unknown_mount_in_combat: bool = False

    def __post_init__(self):
        if (type(self.level) is not int or self.level < 1 or
                type(self.player_class) is not str or not self.player_class.strip()):
            raise ValueError("Text class and positive integer level required")
        if (type(self.include_owned_unverified) is not bool or
                type(self.allow_unknown_mount_in_combat) is not bool):
            raise ValueError("Context evidence flags must be booleans")


def permitted(item: EquipmentCandidate, context: BuildContext) -> bool:
    if item.min_level > context.level:
        return False
    if item.class_scope == "unknown":
        return False
    if item.class_scope == "restricted" and context.player_class not in item.classes:
        return False
    if not item.released_documented and not (
        item.owned and context.include_owned_unverified
    ):
        return False
    if item.role == "mount" and not item.in_combat_effect_verified and not (
        context.allow_unknown_mount_in_combat
    ):
        return False
    return True


def loadout_legal(equipped: Iterable[EquipmentCandidate],
                  context: BuildContext) -> bool:
    items = list(equipped)
    ids, slots = [x.item_id for x in items], [x.slot for x in items]
    return (
        len(set(ids)) == len(ids) and len(set(slots)) == len(slots) and
        all(permitted(x, context) for x in items)
    )


def can_safely_dominate(a: EquipmentCandidate, b: EquipmentCandidate) -> bool:
    """A dominates B only within an *identical interaction boundary*.

    Conservative by design. Unlike naive DPS sorting, a lower-DPS
    shield/mount/skill-granting offhand cannot be removed just because
    one numerical metric looks lower.
    """
    if a.item_id == b.item_id or a.slot != b.slot or a.role != b.role:
        return False
    if a.unknown_effects or b.unknown_effects:
        return False
    if not a.metric_basis or not b.metric_basis or a.metric_basis != b.metric_basis:
        return False
    if (
        a.classes != b.classes or a.class_scope != b.class_scope or
        a.set_family != b.set_family or
        a.skill_bonus_levels != b.skill_bonus_levels or
        a.mechanics != b.mechanics or a.weapon_family != b.weapon_family or
        a.in_combat_effect_verified != b.in_combat_effect_verified or
        a.released_documented != b.released_documented or
        a.owned != b.owned
    ):
        return False
    # "No known price" cannot be treated as zero cost.
    if a.cost_gold is None or b.cost_gold is None:
        return False
    # Lower level requirement means never harder to equip.
    if a.min_level > b.min_level or a.cost_gold > b.cost_gold:
        return False
    return (
        all(x >= y for x, y in zip(a.metrics, b.metrics)) and
        (any(x > y for x, y in zip(a.metrics, b.metrics)) or
         a.cost_gold < b.cost_gold or a.min_level < b.min_level)
    )


def safe_prefilter(items: Iterable[EquipmentCandidate],
                   context: BuildContext) -> tuple[list[EquipmentCandidate], dict]:
    """Exact O(n^2) only *within narrow comparison classes*, not gear tuples.

    Never constructs full equipment permutations. A later integer/CP solver
    explores the survivors with cross-slot interactions preserved.
    """
    candidates = list(items)
    if len({x.item_id for x in candidates}) != len(candidates):
        raise ValueError("Duplicate item IDs in one candidate catalog")
    eligible = [x for x in candidates if permitted(x, context)]
    groups: dict[tuple, list[EquipmentCandidate]] = {}
    for item in eligible:
        key = (
            item.slot, item.role, item.classes, item.class_scope,
            item.metric_basis, item.set_family,
            item.skill_bonus_levels, item.mechanics, item.weapon_family,
            item.in_combat_effect_verified, item.released_documented, item.owned,
        )
        groups.setdefault(key, []).append(item)
    survivors = []
    rejected = []
    for group in groups.values():
        for item in group:
            winner = next(
                (other for other in group if can_safely_dominate(other, item)),
                None,
            )
            if winner:
                rejected.append({"item_id": item.item_id, "dominated_by": winner.item_id})
            else:
                survivors.append(item)
    return survivors, {
        "input_count": len(candidates),
        "eligible_count": len(eligible),
        "retained_count": len(survivors),
        "proven_conditional_dominance": rejected,
        "note": "Safe only for the explicitly modeled six metrics and identical "
                "interaction signatures; unmodeled mechanics inhibit pruning.",
    }

"""Offline, source-labeled AION 2 exchange economics. No live pricing or trading.

Use integer Kina/Quna inputs and exact Fraction results; server settlement
rounding and fill probability are deliberately not inferred.
"""
from fractions import Fraction
from functools import reduce
from math import gcd


def _natural(value, label, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, int) or value < (1 if positive else 0):
        raise ValueError(f"{label} must be a {'positive' if positive else 'nonnegative'} integer")
    return value


def _basis_points(value, label):
    if _natural(value, label) > 10_000:
        raise ValueError(f"{label} must be at most 10000")
    return value


def _offers(rows):
    if not isinstance(rows, list) or not rows:
        raise ValueError("offers must be a nonempty list")
    by_kina = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("offer must be an object")
        amount = _natural(row.get("kina"), "chest Kina", positive=True)
        price = _natural(row.get("quna"), "asking Quna", positive=True)
        _natural(row.get("listings", 0), "listing count")
        if amount in by_kina:
            raise ValueError("duplicate chest Kina denomination")
        by_kina[amount] = {"kina": amount, "quna": price}
    return [by_kina[kina] for kina in sorted(by_kina)]


def analyze_exchange(offers, *, tax_basis_points=1000, morph_basis_points=1000):
    """Analyze seller asks. Fractions represent *pre-rounding* estimates, not fills."""
    tax = _basis_points(tax_basis_points, "tax basis points")
    morph = _basis_points(morph_basis_points, "morph basis points")
    output = {}
    for offer in _offers(offers):
        kina, quna = offer["kina"], offer["quna"]
        morph_cost = Fraction(kina * (10_000 + morph), 10_000)
        if morph_cost.denominator != 1:
            raise ValueError("fractional Kina morph cost requires client rounding evidence")
        net_quna = Fraction(quna * (10_000 - tax), 10_000)
        output[kina] = {
            "asking_quna": quna,
            "buyer_kina_per_quna": Fraction(kina, quna),
            "morph_cost_kina": int(morph_cost),
            "net_quna_before_rounding": net_quna,
            "net_quna_per_million_morph_kina": net_quna * 1_000_000 / morph_cost,
        }
    return output


def cheapest_exact_purchase(target_kina, offers):
    """Unbounded minimum-asking-price basket for exact Kina; no listing-depth assumption.

    None means that no denomination combination equals the target. We do not
    silently treat limited listing counts or asking prices as actual liquidity.
    """
    _natural(target_kina, "target Kina")
    rows = _offers(offers)
    divisor = reduce(gcd, (row["kina"] for row in rows))
    if target_kina % divisor:
        return None
    units = target_kina // divisor
    if units > 10_000:
        raise ValueError("target exceeds bounded offline optimizer limit")
    dp = [None] * (units + 1)
    dp[0] = (0, 0, (0,) * len(rows))
    for goal in range(1, units + 1):
        for i, row in enumerate(rows):
            size = row["kina"] // divisor
            if size > goal or dp[goal - size] is None:
                continue
            prior_price, prior_count, prior_counts = dp[goal - size]
            counts = list(prior_counts)
            counts[i] += 1
            candidate = (prior_price + row["quna"], prior_count + 1, tuple(counts))
            if dp[goal] is None or candidate < dp[goal]:
                dp[goal] = candidate
    result = dp[units]
    if result is None:
        return None
    return {
        "target_kina": target_kina,
        "total_quna": result[0],
        "chest_count": result[1],
        "counts": {row["kina"]: result[2][i] for i, row in enumerate(rows)},
    }


def farm_kina_per_hour(gross_kina, resource_cost_kina, minutes):
    """Net tradable Kina earned per hour on a repeatable run; excludes weekly caps."""
    _natural(gross_kina, "gross Kina")
    _natural(resource_cost_kina, "resource cost")
    _natural(minutes, "run minutes", positive=True)
    return Fraction((gross_kina - resource_cost_kina) * 60, minutes)


def upgrade_payback_claims(upgrade_cost_kina, before_net_kina, after_net_kina):
    """Number of completed identical claims to recover an upgrade (not a forecast)."""
    _natural(upgrade_cost_kina, "upgrade Kina")
    _natural(before_net_kina, "before net Kina")
    _natural(after_net_kina, "after net Kina")
    increase = after_net_kina - before_net_kina
    return (upgrade_cost_kina + increase - 1) // increase if increase > 0 else None

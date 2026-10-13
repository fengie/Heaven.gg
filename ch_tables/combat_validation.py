"""Fail-closed fixed-window, session-held-out validation for combat simulation.

This does not fit hidden game coefficients or infer game mechanics. Every model
parameter must be frozen separately, before viewing holdout observations.
Only compare the SAME patch, target, build, action policy, and fixed horizon.
Synthetic fixtures cannot confer empirical calibration status.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
from statistics import mean

from .combat_simulator import Encounter, encounter_from_dict, simulate

MAX_OBSERVATIONS = 1000
MAX_SEEDS = 512
HEX = frozenset("0123456789abcdef")


def _sha256(value: object) -> str:
    """Canonical JSON identity, independent of whitespace and dict ordering."""
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         allow_nan=False, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def scenario_digest(raw: dict) -> str:
    if type(raw) is not dict:
        raise ValueError("Scenario must be a JSON object")
    return _sha256(raw)


def _digest(value: str) -> bool:
    return type(value) is str and len(value) == 64 and all(x in HEX for x in value)


def _measurement(value: float, label: str) -> float:
    if (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
        raise ValueError(f"{label} requires finite nonnegative measurement")
    return float(value)


@dataclass(frozen=True)
class ObservedFight:
    session_id: str
    recording_sha256: str
    duration_s: float
    elapsed_s: float
    total_damage: float
    end_reason: str
    hp_potions: int
    energy_potions: int
    split: str

    def __post_init__(self):
        if not self.session_id or len(self.session_id) > 120:
            raise ValueError("Session identity required (non-PII opaque label)")
        if not _digest(self.recording_sha256):
            raise ValueError("External recording SHA-256 is mandatory")
        _measurement(self.duration_s, "duration")
        _measurement(self.elapsed_s, "elapsed")
        _measurement(self.total_damage, "damage")
        if not 0 < self.duration_s <= 86400 or not 0 <= self.elapsed_s <= self.duration_s + 1e-9:
            raise ValueError("Invalid fixed-window or elapsed time")
        if self.end_reason not in ("time_limit", "player_died", "boss_killed"):
            raise ValueError("Unknown encounter end reason")
        if self.end_reason == "time_limit" and abs(self.elapsed_s - self.duration_s) > 1e-6:
            raise ValueError("Completed fixed window must have full elapsed time")
        if self.split not in ("calibration", "holdout"):
            raise ValueError("Split must be calibration or holdout")
        for label, value in (("HP", self.hp_potions), ("energy", self.energy_potions)):
            if type(value) is not int or value < 0:
                raise ValueError(f"{label} potion counts must be nonnegative integers")


@dataclass(frozen=True)
class ObservationBundle:
    schema_version: int
    evidence_kind: str
    patch_id: str
    boss_id: str
    build_id: str
    scenario_sha256: str
    sessions: tuple[ObservedFight, ...]
    frozen_model_sha256: str

    def __post_init__(self):
        if type(self.schema_version) is not int or self.schema_version != 1:
            raise ValueError("Unknown combat observation schema")
        if self.evidence_kind not in ("synthetic", "recorded_gameplay"):
            raise ValueError("Evidence must explicitly be synthetic or recorded_gameplay")
        for name, value in (("patch_id", self.patch_id), ("boss_id", self.boss_id),
                            ("build_id", self.build_id)):
            if type(value) is not str or not value.strip() or len(value) > 160:
                raise ValueError(f"Nonempty bounded {name} is required")
        if not _digest(self.scenario_sha256) or not _digest(self.frozen_model_sha256):
            raise ValueError("Canonical scenario and precommitted model SHA-256 required")
        if not 1 <= len(self.sessions) <= MAX_OBSERVATIONS:
            raise ValueError("Observation count outside supported limits")
        if len({s.session_id for s in self.sessions}) != len(self.sessions):
            raise ValueError("Repeated measurement session ID")
        if len({s.recording_sha256 for s in self.sessions}) != len(self.sessions):
            raise ValueError("Repeated recording is not an independent session")
        if not any(s.split == "holdout" for s in self.sessions):
            raise ValueError("At least one independent held-out session is mandatory")
        if len({s.duration_s for s in self.sessions}) != 1:
            raise ValueError("Different encounter windows cannot be pooled")


def load_observations(raw: dict) -> ObservationBundle:
    if type(raw) is not dict:
        raise ValueError("Observation bundle must be JSON object")
    allowed = {"schema_version", "evidence_kind", "patch_id", "boss_id",
               "build_id", "scenario_sha256", "frozen_model_sha256", "sessions"}
    if set(raw) != allowed or type(raw["sessions"]) is not list:
        raise ValueError("Missing/extra observation fields or malformed sessions")
    expected = set(ObservedFight.__dataclass_fields__)
    sessions = []
    for row in raw["sessions"]:
        if type(row) is not dict or set(row) != expected:
            raise ValueError("Invalid session field schema")
        sessions.append(ObservedFight(**row))
    return ObservationBundle(**{k: v for k, v in raw.items() if k != "sessions"},
                             sessions=tuple(sessions))


def _quantile(values: list[float], q: float) -> float:
    seq = sorted(values)
    pos = (len(seq) - 1) * q
    i = int(pos)
    return seq[i] + (seq[min(i + 1, len(seq) - 1)] - seq[i]) * (pos - i)


def evaluate_holdout(encounter: Encounter, scenario: dict,
                     bundle: ObservationBundle, *, seeds: int = 128) -> dict:
    """Independent-session comparison; samples represent simulator variance ONLY.

    Does not tune the model, infer error thresholds, or mislabel synthetic
    observations as real. A provenance hash is an identity, not a proof that
    a recording is accurate or truly predates the frozen model.
    """
    if type(seeds) is not int or not 2 <= seeds <= MAX_SEEDS:
        raise ValueError("Need 2..512 deterministic simulation seeds")
    if scenario_digest(scenario) != bundle.scenario_sha256:
        raise ValueError("Scenario changed since observation bundle was prepared")
    if bundle.frozen_model_sha256 != bundle.scenario_sha256:
        # Until an independent fit manifest exists, scenario bytes ARE the
        # frozen model. No trusting an arbitrary unrelated 'model hash'.
        raise ValueError("Frozen model must be the exact scenario configuration")
    # The caller-supplied Encounter MUST be the decoded version of the hashed
    # scenario. Without this binding, a different skill/attack/potion model can
    # be evaluated while borrowing another scenario's apparently valid SHA.
    # Dataclass equality covers nested skills, pets, attacks, buffs and resources.
    if encounter != encounter_from_dict(scenario):
        raise ValueError("Encounter does not match frozen scenario configuration")
    holdout = [s for s in bundle.sessions if s.split == "holdout"]
    if any(abs(s.duration_s - encounter.duration_s) > 1e-6 for s in holdout):
        raise ValueError("Observed horizon differs from simulated fixed window")
    if bundle.evidence_kind == "recorded_gameplay" and encounter.evidence != "observed":
        raise ValueError("Gameplay comparison requires sourced observed scenario inputs")
    if bundle.evidence_kind == "synthetic" and encounter.evidence != "synthetic":
        raise ValueError("Synthetic fixtures must remain labeled synthetic")
    runs = [simulate(encounter, seed=k) for k in range(seeds)]
    predicted = [r["fixed_window_dps"] for r in runs]
    obs_dps = [s.total_damage / s.duration_s for s in holdout]
    expected = mean(predicted)
    lower, upper = _quantile(predicted, .05), _quantile(predicted, .95)
    metrics = {
        "fixed_window_dps": {
            "observed_mean": round(mean(obs_dps), 6),
            "model_mean": round(expected, 6),
            "signed_bias_model_minus_observed": round(expected - mean(obs_dps), 6),
            "holdout_mae_vs_simulated_mean": round(mean(abs(d - expected) for d in obs_dps), 6),
            "simulated_predictive_p05_p95": [round(lower, 6), round(upper, 6)],
            "observed_in_predictive_band": sum(lower <= d <= upper for d in obs_dps),
        }
    }
    for label, value_getter in (
        ("hp_potions", lambda r: r["potions_used"]["hp"]),
        ("energy_potions", lambda r: r["potions_used"]["energy"]),
        ("player_death_probability", lambda r: int(r["end_reason"] == "player_died")),
        ("boss_kill_probability", lambda r: int(r["end_reason"] == "boss_killed")),
    ):
        simulated_mean = mean(value_getter(r) for r in runs)
        observed_values = ([s.hp_potions for s in holdout] if label == "hp_potions" else
                           [s.energy_potions for s in holdout] if label == "energy_potions" else
                           [int(s.end_reason == "player_died") for s in holdout] if label == "player_death_probability" else
                           [int(s.end_reason == "boss_killed") for s in holdout])
        metrics[label] = {"observed_mean": round(mean(observed_values), 6),
                          "model_mean": round(simulated_mean, 6),
                          "signed_bias_model_minus_observed": round(
                              simulated_mean - mean(observed_values), 6)}
    return {
        "status": ("synthetic_regression_only" if bundle.evidence_kind == "synthetic"
                   else "empirical_holdout_evaluated_not_game_verified" if len(holdout) >= 3
                   else "empirical_holdout_sparse_not_game_verified"),
        "provenance": {"patch_id": bundle.patch_id, "boss_id": bundle.boss_id,
                       "build_id": bundle.build_id,
                       "scenario_sha256": bundle.scenario_sha256,
                       "recording_sha256s": [s.recording_sha256 for s in holdout]},
        "simulation_model": runs[0]["model"],
        "n_heldout_sessions": len(holdout),
        "n_calibration_sessions_excluded": sum(s.split == "calibration" for s in bundle.sessions),
        "n_simulation_seeds": seeds,
        "metrics": metrics,
        "limitations": [
            "The tool does not fit any coefficients; scenario values must be frozen BEFORE holdout collection.",
            "A recording checksum authenticates file identity, not measurement validity or chronology.",
            "Simulation p05-p95 is a predictive distribution, not a confidence interval for game truth.",
            "No model-success threshold is inferred; inspect timing, damage breakdown and patch before recommendation.",
            "Game skill/armour/evasion/mount rules remain unvalidated until controlled recordings exist.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", type=Path, required=True)
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--seeds", type=int, default=128)
    args = parser.parse_args()
    if max(args.scenario.stat().st_size, args.observations.stat().st_size) > 5_000_000:
        parser.error("Input exceeds per-file 5MB limit")
    scenario = json.loads(args.scenario.read_text(encoding="utf-8"))
    raw = json.loads(args.observations.read_text(encoding="utf-8"))
    result = evaluate_holdout(encounter_from_dict(scenario), scenario,
                              load_observations(raw), seeds=args.seeds)
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()

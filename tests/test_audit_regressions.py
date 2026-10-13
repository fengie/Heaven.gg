"""Reproduced correctness/type/budget escapes. All combat inputs are synthetic."""
from dataclasses import replace
import unittest
from unittest.mock import patch

from ch_tables.combat_simulator import (
    Attack, Encounter, MountBonus, Potion, SimSkill, TimedEffect,
    compare_candidates, simulate, encounter_from_dict, MODEL_VERSION,
)
from ch_tables.loadout_foundation import BuildContext, EquipmentCandidate
from ch_tables.combat_validation import evaluate_holdout, load_observations, scenario_digest
from ch_tables.loadout_search import Interaction, SearchSpec, optimize_loadouts
from ch_tables.loadout_pareto import exhaustive_pareto_oracle, pareto_loadouts


def item(name='a', damage=0, **updates):
    values = dict(item_id=name, slot='head', role='armor',
                  metrics=(damage, 0, 0, 0, 0, 0), cost_gold=0,
                  class_scope='all', metric_basis='audit-synthetic-v1',
                  unknown_effects=False, released_documented=True)
    values.update(updates)
    return EquipmentCandidate(**values)


def problem(items, **updates):
    values = dict(candidates=tuple(items), context=BuildContext('rogue', 220),
                  slots=('head',), metric_basis='audit-synthetic-v1',
                  weights=(1, 0, 0, 0, 0, 0))
    values.update(updates)
    return SearchSpec(**values)


class CombatAuditTests(unittest.TestCase):
    def test_obsolete_expiry_cannot_remove_a_reapplied_effect(self):
        long = SimSkill('long', 0, 6, 0, priority=1,
                        effect=TimedEffect('boost', 10, 2))
        short = SimSkill('short', 0, 100, 0,
                         effect=TimedEffect('boost', 1, 2))
        result = simulate(Encounter(11, 100, 0, auto=Attack(1, 100),
                                   skills=(long, short)), trace_limit=40)
        # At t=0 short replaces long, expires at t=1. Long returns at t=6;
        # its stale t=10 expiry must not remove the new t=6..16 generation.
        # Auto precedes the t=6 recast: attacks 7..11 receive the multiplier.
        self.assertEqual(result['total_damage'], 1600)
        expirations = [r['time_s'] for r in result['trace']
                       if r['event'] == 'effect_expired']
        self.assertEqual(expirations, [1.0])

    def test_kill_is_alive_but_not_a_completed_fixed_window(self):
        case = Encounter(10, 100, 0, auto=Attack(1, 100), boss_hp=30)
        outcome = simulate(case)
        self.assertEqual(outcome['end_reason'], 'boss_killed')
        self.assertFalse(outcome['survived_full_window'])
        row = compare_candidates({'candidate': case}, (0, 1))['candidates']['candidate']
        self.assertEqual(row['survival_fraction'], 1)
        self.assertEqual(row['boss_kill_fraction'], 1)
        self.assertEqual(row['full_window_fraction'], 0)

    def test_death_and_timeout_survival_stay_distinct(self):
        for case, alive, complete in [
            (Encounter(10, 10, 0, enemy=Attack(1, 100)), 0, 0),
            (Encounter(10, 100, 0), 1, 1),
        ]:
            with self.subTest(alive=alive):
                row = compare_candidates({'x': case}, (0,))['candidates']['x']
                self.assertEqual(row['survival_fraction'], alive)
                self.assertEqual(row['full_window_fraction'], complete)
                self.assertEqual(row['boss_kill_fraction'], 0)

    def test_paired_comparison_rejects_different_encounters(self):
        a = Encounter(10, 100, 0, enemy=Attack(1, 1), boss_hp=100)
        for change in ({'duration_s': 20}, {'enemy': Attack(2, 1)},
                       {'boss_hp': 200}, {'evidence': 'user_estimate'}):
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'same encounter'):
                compare_candidates({'a': a, 'b': replace(a, **change)}, (0, 1))
        # Changes to player gear/resources/skills are the intended comparison.
        compare_candidates({'a': a, 'b': replace(a, max_hp=200)}, (0, 1))

    def test_repeated_wakes_do_not_consume_the_event_budget(self):
        case = Encounter(120, 1e6, 0, enemy=Attack(.25, 0),
                         skills=(SimSkill('slow', 1, 20, 0),))
        with patch('ch_tables.combat_simulator.MAX_EVENTS', 1100):
            result = simulate(case)
        self.assertLess(result['events_processed'], 1100)
        self.assertEqual(result['total_damage'], 7)
        self.assertEqual(result['skill_casts']['slow'], 7)

    def test_potion_gold_is_an_integer_not_a_coercible_measurement(self):
        for value in (True, 1.5, float('nan'), float('inf'), -1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                Potion(1, 1, .5, 0, 1, value)
        self.assertEqual(Potion(1, 1, .5, 0, 1, 0).gold_each, 0)

    def test_mount_proof_requires_an_actual_boolean(self):
        for value in ('false', 'true', 1, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                MountBonus(max_hp=500, verified_in_combat=value)

    def test_finite_inputs_cannot_produce_infinite_combat_damage(self):
        case = Encounter(1, 100, 0, auto=Attack(1, 1e308, 1, 1, 1e308))
        with self.assertRaises(ValueError):
            simulate(case)

    def test_holdout_report_records_simulator_identity_without_promoting_evidence(self):
        raw = {"duration_s": 1, "max_hp": 100, "max_energy": 0}
        digest = scenario_digest(raw)
        observations = load_observations({
            "schema_version": 1, "evidence_kind": "synthetic", "patch_id": "toy",
            "boss_id": "toy", "build_id": "toy", "scenario_sha256": digest,
            "frozen_model_sha256": digest,
            "sessions": [{"session_id": "toy", "recording_sha256": "1" * 64,
                          "duration_s": 1, "elapsed_s": 1, "total_damage": 0,
                          "end_reason": "time_limit", "hp_potions": 0,
                          "energy_potions": 0, "split": "holdout"}],
        })
        result = evaluate_holdout(encounter_from_dict(raw), raw, observations, seeds=2)
        self.assertEqual(result["simulation_model"], MODEL_VERSION)
        self.assertEqual(result["status"], "synthetic_regression_only")


class LoadoutAuditTests(unittest.TestCase):
    def test_equal_frontier_bound_preserves_canonical_representative(self):
        effect = Interaction('penalty', (-10, 0, 0, 0, 0, 0),
                             'audit-synthetic-v1', required_item_ids=frozenset({'x'}))
        spec = problem([item('x', 10), item('a', 0)], interactions=(effect,))
        result = pareto_loadouts(spec)
        self.assertTrue(result.certified_exact)
        self.assertEqual(result.frontier, exhaustive_pareto_oracle(spec))
        self.assertEqual(result.frontier[0].item_ids, ('a',))

    def test_provenance_and_ownership_flags_are_not_truthy_strings(self):
        for field in ('owned', 'released_documented', 'unknown_effects', 'in_combat_effect_verified'):
            for value in ('false', 1, None):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    item(**{field: value})

    def test_prices_levels_and_skill_bonuses_are_exact_integers(self):
        for value in (True, 1.5, float('nan'), float('inf'), -1):
            for field in ('cost_gold', 'min_level'):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    item(**{field: value})
            with self.subTest(skill_bonus=value), self.assertRaises(ValueError):
                item(skill_bonus_levels=(('Quick Strike', value),))
        self.assertIsNone(item(cost_gold=None).cost_gold)
        self.assertEqual(item(cost_gold=0).cost_gold, 0)

    def test_boolean_metrics_are_not_measurements(self):
        for index in range(6):
            metrics = [0] * 6
            metrics[index] = True
            with self.subTest(index=index), self.assertRaises(ValueError):
                item(metrics=tuple(metrics))

    def test_context_has_typed_level_and_flags(self):
        for value in (True, 1.5, float('nan'), float('inf')):
            with self.subTest(level=value), self.assertRaises(ValueError):
                BuildContext('rogue', value)
        for field in ('include_owned_unverified', 'allow_unknown_mount_in_combat'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                BuildContext('rogue', 220, **{field: 'false'})

    def test_search_cannot_enable_uncertainty_with_a_string(self):
        for field in ('mount_combinations_verified', 'allow_uncertain_effects'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                problem([item()], **{field: 'false'})

    def test_finite_weights_cannot_certify_an_infinite_score(self):
        spec = problem([item('huge', 1e19)], weights=(1e308, 0, 0, 0, 0, 0))
        for solver in (optimize_loadouts, pareto_loadouts):
            with self.subTest(solver=solver.__name__), self.assertRaisesRegex(ValueError, 'overflow'):
                solver(spec)

    def test_identifiers_cannot_be_missing_or_non_text(self):
        for value in (1, True, '   '):
            with self.subTest(value=value), self.assertRaises(ValueError):
                item(name=value)


if __name__ == '__main__':
    unittest.main()

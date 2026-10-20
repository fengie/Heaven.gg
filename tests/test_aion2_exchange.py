"""AION 2 exchange economy regression fixtures — user screenshot, October 19, 2026."""
import json
import sys
import unittest
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ATLAS = ROOT / "apps" / "aion2-value-atlas"
sys.path.insert(0, str(ATLAS / "scripts"))
from exchange import analyze_exchange, cheapest_exact_purchase, farm_kina_per_hour, upgrade_payback_claims


class ExchangeEconomyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = json.loads((ATLAS / "data" / "exchange_observations_2026-10-19.json").read_text(encoding="utf-8"))
        cls.offers = cls.snapshot["offers"]

    def test_observation_is_dated_unverified_asking_prices_not_sales(self):
        self.assertEqual(self.snapshot["observed_date"], "2026-10-19")
        self.assertEqual(self.snapshot["price_kind"], "lowest_listing")
        self.assertEqual(self.snapshot["server"], "unknown")
        self.assertEqual([(r["kina"], r["quna"], r["listings"]) for r in self.offers], [
            (400_000, 217, 54), (2_000_000, 950, 88), (10_000_000, 5699, 22)
        ])

    def test_10m_purchase_basket_beats_large_chest_ask(self):
        result = cheapest_exact_purchase(10_000_000, self.offers)
        self.assertEqual(result["total_quna"], 4750)
        self.assertEqual(result["counts"], {400_000: 0, 2_000_000: 5, 10_000_000: 0})
        self.assertEqual(5699 - result["total_quna"], 949)

    def test_other_exact_targets_and_unavailable_exact_target(self):
        self.assertEqual(cheapest_exact_purchase(800_000, self.offers)["total_quna"], 434)
        self.assertIsNone(cheapest_exact_purchase(1_000_000, self.offers))
        self.assertEqual(cheapest_exact_purchase(0, self.offers)["total_quna"], 0)

    def test_seller_analysis_includes_morph_fee_and_sale_tax_separately(self):
        rows = analyze_exchange(self.offers, tax_basis_points=1000, morph_basis_points=1000)
        self.assertEqual(rows[400_000]["morph_cost_kina"], 440_000)
        self.assertEqual(rows[2_000_000]["morph_cost_kina"], 2_200_000)
        self.assertEqual(rows[10_000_000]["morph_cost_kina"], 11_000_000)
        self.assertEqual(rows[400_000]["net_quna_before_rounding"], Fraction(1953, 10))
        self.assertEqual(rows[2_000_000]["net_quna_before_rounding"], Fraction(855, 1))
        self.assertEqual(rows[10_000_000]["net_quna_before_rounding"], Fraction(51291, 10))
        self.assertGreater(rows[10_000_000]["net_quna_per_million_morph_kina"],
                           rows[400_000]["net_quna_per_million_morph_kina"])

    def test_no_free_round_trip_arbitrage_after_morphing(self):
        rows = analyze_exchange(self.offers)
        cheapest = cheapest_exact_purchase(10_000_000, self.offers)["total_quna"]
        marginal_1m_quna = Fraction(950, 2)
        proceeds = rows[10_000_000]["net_quna_before_rounding"]
        self.assertLess(proceeds, cheapest + marginal_1m_quna)

    def test_farm_and_upgrade_costs_need_effective_net_rates(self):
        self.assertEqual(farm_kina_per_hour(300_000, 100_000, 10), 1_200_000)
        self.assertEqual(upgrade_payback_claims(2_000_000, 300_000, 400_000), 20)
        self.assertIsNone(upgrade_payback_claims(2_000_000, 300_000, 300_000))

    def test_reject_invalid_prices_duplicate_chests_and_fee_settings(self):
        bad = [dict(self.offers[0]), dict(self.offers[0])]
        with self.assertRaises(ValueError):
            analyze_exchange(bad)
        with self.assertRaises(ValueError):
            cheapest_exact_purchase(10_000_000, bad)
        with self.assertRaises(ValueError):
            analyze_exchange(self.offers, tax_basis_points=10_001)
        with self.assertRaises(ValueError):
            cheapest_exact_purchase(-1, self.offers)
        with self.assertRaises(ValueError):
            farm_kina_per_hour(100, 200, 0)


if __name__ == "__main__":
    unittest.main()

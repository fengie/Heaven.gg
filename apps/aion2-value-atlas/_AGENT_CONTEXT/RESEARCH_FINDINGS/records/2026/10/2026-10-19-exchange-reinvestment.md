# AION 2 Global — exchange economics and progression reinvestment
Research checkpoint: 2026-10-19 (America/New_York). Product owner: `fengie/Heaven.gg`; this is **not** a Heaven Toolbox policy. Current screenshot source is private, so only non-identifying numerical observations are preserved.

## Observed market snapshot (user screenshot)
Exchange tab: Main. Displayed current tax: **10%**. Currency is Quna per Kina Chest. "Sales List" is the number of listings, **not completed transactions**.

| Chest Kina | Lowest listing Quna | Sales List | Kina per Quna (buyer) |
| ---: | ---: | ---: | ---: |
| 400,000 | 217 | 54 | 1,843.32 |
| 2,000,000 | 950 | 88 | 2,105.26 |
| 10,000,000 | 5,699 | 22 | 1,754.69 |

For a buyer needing **exactly 10M Kina**, five 2M chests cost **4,750 Quna** vs one 10M at **5,699** (saving **949 Quna / 16.65% of the large-chest asking price**). Twenty-five 400K chests cost 5,425. This is an *asking-price* comparison, conditional on at least five small enough 2M listings existing at the displayed minimum; the count of listings does not establish that depth.

## Seller economics: not the same optimization

The [community Global Kina guide](https://aion2.gg/guides/kina-and-market-guide) reports that Substance Morph charges **10% extra tradable Kina** to make a chest; an independent [October 10 field report](https://space4games.com/en/games-en/aion-2-kina-farming-guide/) describes that premium plus a 10% exchange tax. Under those explicit assumptions, **before unknown server rounding, extra listing fees, and whether a listing fills**:

| Chest | Tradable Kina required to morph | Net Quna at listed ask | Net Quna / 1M invested Kina |
| ---: | ---: | ---: | ---: |
| 400K | 440,000 | 195.3 | 443.86 |
| 2M | 2,200,000 | 855 | 388.64 |
| 10M | 11,000,000 | 5,129.1 | 466.28 |

The 10M chest has the strongest *nominal* return for a seller, but is the worst buyer value and only **22 listings** are visible. This is not evidence that any 5,699-Quna trade cleared. Do not blindly list large chests without checking real settlement prices and time-to-fill. The apparent arbitrage from buying five 2M chests for 4,750 Quna and reselling a newly morphed 10M chest ignores the extra 1M Kina required to morph: valuing that extra Kina at 475 Quna gives a 5,225-Quna cost against only 5,129.1-Quna pre-rounding proceeds (**95.9-Quna loss**).

## Upgrade-first capital allocation (conditional model)

Goal: maximize sustainable **net tradable Kina/hour**, not raw item level. Track `net_kina_per_hour=(tradable_claim_reward - resource_kinacost - consumable_cost) * 60 / minutes_per_clear`, plus weekly cap, downtime, group availability and fail rate. An item upgrade should be purchased only when it has cheaper alternatives and unlocks a threshold, reduces failure or makes farming materially faster.

[Community October 9 Global client-data/player report](https://www.reddit.com/r/Aion2/comments/1x1s93c/kina_farming_guide_for_global_main_2_alts_makes/) reports, per 40 Odyle claim, Conquest 1★ (700 gear score) 200K, 2★ (1400) 300K, 3★ (2100) 400K, Transcendence 4 (2500) 480K tradable Kina. These figures are third-party observations, not a current guaranteed payout. Example only: a 2M upgrade enabling 2★→3★ at unchanged cost and speed returns +100K Kina per claim, so **20 comparable claims** are required to break even, before weekly caps or risks.

**Official patch dependency:** NCSOFT [Oct 13/14 Global patch notice](https://lounge.plaync.com/feed/84134?country=US&locale=en-US) temporarily removed the Odyle Energy 16/server/week shop cap and increased the 4→20 per-character/week cap **during server transfer**. Do not extrapolate October 9 weekly alt totals after this change, or treat the temporary cap as permanent. `Special Quai Membership`/Market and Quna Exchange access, Pending Quna, server-specific rules and eligibility must be verified in current client; source starting point: [Global launch FAQ](https://aion2.gg/launch/faq).

**Potential gear thrift experiment, unverified for this character:** compare enhancement on lower-item-level Unique gear followed by transfer to higher Unique gear, against upgrading target gear directly. Track full transfer inputs, binding, resale loss, per-enhancement success rate, sink and account-specific level. Do not promote quoted 5.3M versus 12.6M price estimates without exact item/patch and observed transfer eligibility.

**Suggested sequence:** (1) confirm actual character/class, server, membership and bound/unbound balances; (2) log three repeatable clear times, loot and spent Odyle/consumables; (3) price cheapest threshold-raising upgrade and payback; (4) reserve running capital; (5) sell genuine surplus on exchange using fulfilled-sale evidence, or buy medium chests when converting Quna to Kina at this snapshot's asks. Alts are a capital/effort decision only after reliable main farming.

## Source confidence, implementation and scope

- **Direct observation:** the three asks, listing counts and 10% displayed exchange tax from the 2026-10-19 private screenshot. Server and exact fill/settlement are unknown; screenshot itself is not published.
- **Official:** NCSOFT October 14 patch above; previous shop research under `apps/aion2-value-atlas/_AGENT_CONTEXT/RESEARCH_FINDINGS/records/2026/10/2026-10-09-shop-economics.md`.
- **Community/client-data:** Kina chest Substance Morph premium, 40-Odyle dungeon tier/payout claims, membership details. Need in-game independent confirmation before use as a firm profitability forecast.
- **Implementation:** `apps/aion2-value-atlas/scripts/exchange.py` calculates exact asking-price baskets and rational pre-rounding seller/payback/farm metrics; `apps/aion2-value-atlas/data/exchange_observations_2026-10-19.json` is a static, dated input. Regression tests: `tests/test_aion2_exchange.py` (root unittest discovery).
- **Explicit non-goals:** no trading/automation, no live price or sales claims, no Quna purchase, no character-specific recommendation, no fee-rounding prediction, no publication of personal screenshots, and no assertions of deployment. Future UI/live import and authenticated market sources require their own design, permissions and tests.

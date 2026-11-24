# AION 2 Character Intelligence — consolidated research and source preservation

**Research date:** 2026-11-23 (America/New_York). **Owner:** fengie/Heaven.gg. **Scope:** character-aware, whole-build stat optimization and progression opportunities, Global first. **Status:** source candidate pushed; production integration and live-data acceptance remain open.

## Start here

- [Issue #32](https://github.com/fengie/Heaven.gg/issues/32) is the active product task. Preserve and continue it rather than starting duplicate work.
- [Complete research history, v1–v7](../../../../../research/character-intelligence/research-history-2026-11-23.md): exact original public research bodies with source links, including equations, factorial comparisons, opportunity costs, API census, progression systems and refresh architecture. Later revisions qualify/supersede earlier assumptions.
- [Historical verification and delivery evidence](../../../../../research/character-intelligence/evidence/2026-11-23/): original delivery note, red/green Node output, patch-fixture test output, browser smoke script and result.
- [Implementation commit](https://github.com/fengie/Heaven.gg/commit/3126d0093ac9e80026a8028bb18afbe8474a1c6e) on [feat/aion2-character-intelligence-32](https://github.com/fengie/Heaven.gg/tree/feat/aion2-character-intelligence-32).

## Durable product decisions

1. Prefer official, permitted armory data; discover capabilities and distinguish observed fields from unknowns. No login credentials, private endpoint bypass, game instrumentation, automated purchases or recurring collectors.
2. Character identity is chosen once if not already confirmed, stored locally, refreshed on relevant use. Refresh independently mutable equipment/board details even when item IDs or CP are unchanged. Never conflate a successful HTTP response with a current in-game observation.
3. Whole-build performance, not popularity, is the objective. Equal effective state yields equal modeled utility. Legal rolls, competing slot choices, skill breakpoints, encounter mechanics and coordinated moves change the optimum. Separate theoretical, feasible and budgeted builds; report exact versus approximate status. CP remains observed-only until separately calibrated.
4. Display all discovered distinct opportunities, not a mandatory path or arbitrary top-N. Preference feedback changes ordering, never underlying facts or visibility. Unknown/stale inventory, Kina, materials, claim and quest state remain unknown; affordability must respect usable resource scope, reserves, combined cost and stochastic downside. Zero real-money allowance by default.
5. Compare long-term progression, unlock gates, time/effort, acquisition risk, permanent bonuses and actual combat execution. No unsupported gain, cost, eligibility or probability is filled with zero or a guessed number.

## Source and evidence audit

Verified original source commit against the candidate's five local Git blob hashes, and verified the three integration edits as exact insertions into the inspected base files:

| File (repository-relative) | Git blob |
| --- | --- |
| apps/aion2-value-atlas/intelligence.html | 2bac9860c8a480e78dec971d359e78097d416c47 |
| apps/aion2-value-atlas/scripts/armory-engine.mjs | 7a6434ff2358bc445c22f5e6703623227a65f0ee |
| apps/aion2-value-atlas/scripts/intelligence-engine.mjs | 182850cf1c0674cec6233aeb3a19e0af0997b97d |
| apps/aion2-value-atlas/scripts/intelligence-page.mjs | 1d879a8c9f88611857ee45d8ba50af5ad00790c6 |
| web/tests/aion-intelligence.test.mjs | 5818a2f13530321eeaa4eb1c25f44b2c057d88de |
| web/build.mjs | 32aff5321904d91b553cab0072d6104de48a90c7 |
| apps/aion2-value-atlas/src/profile.template.html | dbb7ecdff21604609116c5dc83563a115d28b2f1 |
| apps/aion2-value-atlas/profile.html | 9c69c47b965c50eef7354c95b2e739d90fcc928e |

Original base: 3773f52aced1e44c6de7ce0d7bb0ff8c0213a908. Toolbox main observed: 44dbc330d894e0ee60c6073ce41da48210074d4b. The original commit was one commit ahead and zero behind the inspected base. It contains the source preview, a pure bounded solver, observed/conditional opportunity listing, affordability and preferences, an official-web-endpoint adapter and Pages build integration. It does **not** connect a complete verified legal catalog, real calibrated combat/CP models or private wallet/quest/inventory sources.

Historical local verification: 14/14 Node tests, 14/14 after applying the patch to a fixture, and a browser smoke test using six synthetic opportunities and five intercepted requests. The red log is the pre-implementation missing-module failure, not a substantive behavioral regression. Browser navigation was blocked; the browser test injected exact HTML and rewrote module specifiers to test-local Blob URLs with mocked responses/storage. No live CORS, real browser persistence or actual player validation is established by those checks. The historical original delivery note predates the push; its “not pushed” status is superseded.

GitHub independently reported these three completed successful runs for **the original implementation SHA 3126d0093ac9e80026a8028bb18afbe8474a1c6e** at retrospective audit time:

- [Tests](https://github.com/fengie/Heaven.gg/actions/runs/45295923281)
- [Heaven.gg Website](https://github.com/fengie/Heaven.gg/actions/runs/45295923260)
- [Heaven AutoUpdate Contract](https://github.com/fengie/Heaven.gg/actions/runs/45295923142)

These run conclusions are historical source verification, not a current release/admission receipt, not proof of a later commit, and not evidence of a deployed feature or live NC data. No new tests were executed for this documentation preservation pass.

### Original local packaging inventory

All unique implementation source and human-readable verification evidence are preserved; the original packaging archive, redundant source patch and generated synthetic preview are not duplicated in Git. Source can be recovered from the exact commit diff, and the synthetic preview can be regenerated using the archived browser smoke script (its original sandbox-specific paths and browser launch options must be adapted to an authorized test environment). The original two user screenshots are intentionally excluded from the public repository. Original artifact hashes for traceability:

| Artifact | SHA-256 |
| --- | --- |
| heaven-gg-intelligence-candidate.zip | eb4e932e2d780eedb196c7961974d2a5c183a0fd3c31004685b4fc306213734b |
| implementation.patch | c24d48846e2f3566153b185d4bc648bf984288d2eadfdb789224da649fd11540 |
| verification/preview.png | e851640c95d24f715cea7ff6e74eb25fdb7b5d54b41759e6ad9448c893355976 |

## Next acceptance boundary

Continue the existing source branch and #32: satisfy executable Toolbox preflight and ownership/admission, verify permitted live armory transport/identity and CORS or authorized broker, source patch-compatible legal stat and progression catalogs, integrate real evaluator/solver results into the UI, obtain private resource state only via supported authorization or voluntary local import, calibrate on consented observations and validate deployed exact revision. Keep missing fields and unimplemented opportunity domains visible. The user intends to be the first live tester, not to publish personal game records. No merge/deployment/background execution is authorized by this archival checkpoint.

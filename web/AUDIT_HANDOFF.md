# Celtic Heroes core audit and delivery handoff — 2026-10-13

## Outcome and scope

**Source repaired and tested; full project release remains incomplete.** This cycle addressed the actual Python simulator and loadout optimizer as well as the website verification gap. It did not produce a calibrated live-game BIS engine, merge to main, or deploy the repaired candidate. Keep Toolbox #849/#664 freeze intact.

Canonical repository: `fengie/Heaven.gg`. Reuse `feat/web002-evidence-wardrobe-20261009`; do not replace its recovered implementation with main or touch the unrelated trader branch. Starting main was `3b0ebb13a06f23943f301fdb2b8e466e07e939e4`. The independently materialized audit baseline was `227974a5d4684937ff086d5059ca0d722e1b2ab2`.

Reviewed in depth: `combat_simulator.py`, `loadout_foundation.py`, `loadout_search.py`, `loadout_pareto.py`, `combat_validation.py`, their callers/tests, browser interaction tests and publication workflow. Catalog, intake, personal-planner and scientific constraints were inspected through source/contracts and the full existing test suite. This is not a claim of line-by-line review of every tracked file, a penetration test, a complete dependency audit or current-game data collection.

## Reproduced findings and implemented repairs

| Finding | Before | Repair and regression |
|---|---|---|
| Buff generation reuse | A long effect replaced by a shorter one, expired and reapplied could be removed by the original stale expiry. Synthetic case produced 1,400 rather than 1,600 damage. | Keep monotonically increasing generations separately from active effects. Test exact damage and expiry trace. |
| Survival aggregation | A living character that killed the boss contributed zero to `survival_fraction`. | Separate alive-at-end, full-window completion and boss-kill fractions; retain the literal meaning of `survived_full_window`. |
| Incompatible comparisons | Paired-seed results accepted different encounter durations, enemy attacks or boss HP. | Require matching encounter context and evidence kind; allow intended player gear/resource/skill differences. This does not prove real boss identity. |
| Duplicate event wakes | Identical pending action wakes consumed work and could exhaust the event cap. | Coalesce only while queued; remove the pending marker on pop so legitimate zero-time actions remain possible. |
| Pareto tie pruning | Equality with a zero upper bound pruned a later canonical smaller-ID representative; search returned `x`, exhaustive enumeration returned `a`. | Require strict dominance before pruning an optimistic branch; preserve deterministic equal-vector representatives. |
| Truthy evidence and malformed numbers | Strings such as `"false"`, booleans, fractional ranks/gold and nonfinite values crossed several model-input checks. | Exact boolean evidence controls; exact integer prices/levels/ranks; nonboolean numerical metrics and nonblank identifiers. Unknown remains distinct from zero. |
| Derived overflow | Finite inputs could produce infinite combat damage or loadout scores. | Reject nonfinite derived arithmetic rather than serialize or certify it. |
| Stale model identity | Holdout reports identified scenario bytes without naming the simulator implementation version. | Emit `synthetic_discrete_event_v2_UNCALIBRATED` and `simulation_model`; old model outputs need re-evaluation. This is version provenance, not proof of precommit chronology. |
| Incomplete CI discovery | The earlier green website job ran 12 tests, omitting new regression files. | `test:web` discovers all `*.test.mjs`, with a 64 MB V8 heap cap; 33 tests executed locally. |
| Browser checks not enforced | A browser harness existed, but successful packaging alone did not run it. | The existing website workflow now runs the actual portable artifact in runner Chrome with sandbox enabled, then uploads separate browser evidence. |

`tests/test_audit_regressions.py` adds 17 test methods with positive, negative and sibling cases. The initial 15-method pre-fix probe produced 56 failed subtest assertions and three errors; those are not 59 independent product defects. Final local discovery: **212 Python tests passed**, versus 195 in the baseline; **33 web tests passed**. Python compile checks also passed.

## Performance evidence — synthetic, not a whole-app speed claim

A 120-second model with HP 1,000,000, zero energy, a zero-damage enemy every 0.25 seconds, and a zero-cast skill dealing one damage every 20 seconds was run 31 times per implementation, interleaved in the same container after one warmup each.

| Measure | Original | Repaired |
|---|---:|---:|
| Processed events | 2,655 | 975 |
| Median runtime | 4.292867 ms | 1.836612 ms |
| Skill casts / total damage | 7 / 7 | 7 / 7 |

That is about **63.3% fewer events and 57.2% lower median runtime** in this workload. The regression uses an event budget, not a fragile wall-clock threshold. Local environment: Python 3.13.5; Node 22.16.0 for web tests. The timing is not a Windows/Heaven1 benchmark and does not establish a speedup for every encounter.

An additional bounded 250-case seeded simulation comparison preserved every compared combat outcome/trace after excluding the intentionally changed model identity and processed-event counter. A 5,000-case wide-range scalar top-K comparison found no mismatch against exhaustive enumeration. These sampled checks supplement, not replace, independent analytical bounds or current-game validation. Existing seeded scalar/Pareto oracle tests remain in the native suite.

To reproduce the structural performance case:

```python
from ch_tables.combat_simulator import Attack, Encounter, SimSkill, simulate
case = Encounter(120, 1e6, 0, enemy=Attack(.25, 0),
                 skills=(SimSkill('slow', 1, 20, 0),))
result = simulate(case)
assert result['events_processed'] == 975
assert result['total_damage'] == result['skill_casts']['slow'] == 7
```

Compare with the exact original simulator blob `ab71f7e7d76f00a6f7f0c7ca6d5926e67b4225e3`; do not substitute an unverified similarly named file.

## Source, artifact and CI verification

When direct container GitHub DNS was unavailable, source was retrieved through the authenticated GitHub Actions artifact route. The workflow captures `git archive` and NUL-delimited `git ls-tree` from the exact checked-out commit, separately from `dist`. Before local imports, all **176 baseline file blobs** and the recursively reconstructed Git root tree were verified: `3791fbd4b0cc1d32bba295beaf559fa0d70fe4a2`. Source ZIP SHA-256: `6cfdbfaec90bd62623fc1fcf4373ecf27afba9afa29dc138cfcf8882a34ce8b3`.

Repaired production blobs, checked against GitHub write readback:

| Path under `ch_tables/` | Git blob SHA |
|---|---|
| `combat_simulator.py` | `d590813391cbfc4fa8da3832612f782b5b1a76a1` |
| `combat_validation.py` | `0d4468c802fe0b00519c0f2cbe33a6060ee8b0c2` |
| `loadout_foundation.py` | `475b1e3ec4c92720dfd9811bf8ce820b8620acc6` |
| `loadout_search.py` | `a42650501fd650f3bc1d98cd9ec5a9b165652819` |
| `loadout_pareto.py` | `f5118e166b4d40efad5b9a48de4e4da01d9ba9e0` |

Code/browser-gate checkpoint `c6f5ea0a1e9e1f7d2ab4a213ab980963c3b2aa20` passed [Python CI](https://github.com/fengie/Heaven.gg/actions/runs/38359647022) and [website/browser CI](https://github.com/fengie/Heaven.gg/actions/runs/38359647041). Deployment was deliberately skipped on the branch. This handoff is a later documentation change: its own commit's applicable CI must be checked before reporting that head green.

The 17 browser groups cover catalogs, filters, sorting, pagination, comparison uncertainty, keyboard navigation/focus, gear/boss views, both embedded AION tools, decimal budgets, owned/unknown costs, stale-output clearing, import rejection/round trips, three viewport sizes and no network requests or JavaScript errors. Local Chromium exercised HTML via `set_content`; this is not physical iOS/Safari or public-URL verification. CI uses the same harness with runner Chrome; the report includes the actual browser version and exact artifact SHA-256. Playwright 1.57.0 is a pinned tested harness dependency, not a claim to be the latest release.

Source archives, browser reports/screenshots and Pages candidates are separate seven-day artifacts. Never ship a source archive as a Pages asset or confuse an expiring artifact with persistent source. The repository contains the implementation, tests, packaging and reconstruction commands.

## Research and decisions

Primary sources were used to challenge the implementation, not to substitute for tests:

- [Python priority-queue notes](https://docs.python.org/3/library/heapq.html): stable tie counters and invalidation of obsolete entries. Retain the existing heap and random streams rather than introducing a simulation framework; coalescing is limited to identical pending wake events.
- [Python numeric types](https://docs.python.org/3/library/stdtypes.html): booleans are a subtype of integers. The model needs explicit domain checks, not generic truthiness or `isinstance(int)` for gold/ranks/proof flags.
- [W3C APG tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): test keyboard behavior, tab stops and linked panels in a browser, not just markup strings.
- [Playwright CI guidance](https://playwright.dev/python/docs/ci): install a compatible automation runtime and exercise real browser behavior. Reuse runner Chrome and the existing harness instead of adding another deployment provider or managed agent.
- [scikit-learn leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html): keep holdout observations out of fitting and selection. More synthetic seeds cannot replace independent gameplay sessions.
- Sargent, *Verification and validation of simulation models*, DOI [10.1057/jos.2012.20](https://doi.org/10.1057/jos.2012.20), publisher abstract: distinguish implementation verification, conceptual-model validity and operational validation. This was a focused source review, not an exhaustive systematic literature review.

Exhaustive enumeration remains a tiny-instance test oracle; it is not the production strategy for the full item catalog. Broader scalar floating-point bound guarantees, current mechanics, upstream redistribution rights and complete nonlinear optimization remain separate acceptance work.

## Efficient successor handoff

1. Read this handoff and `_AGENT_CONTEXT/PROJECT_PLAN.md`; refresh main, the existing branch, claims and actual signed admission. Connected source-write success is not a signed Agent Control lease or merge authorization. One incorrect expected-blob write was rejected with HTTP 409, then corrected using freshly read exact provenance; no overwrite or force push occurred.
2. Run `python -m unittest discover -s tests -v` and `npm run check:web`. Inspect every relevant current-head CI job, including the browser step and its artifact hash. No inherited green from a different source/head. Preserve unique branch work and the original regression evidence.
3. Integration remains with the existing authorized release owner after explicit freeze release. Verify the actual served revision after release; the older public research portal is not this candidate. Do not re-open the stale Pages-disabled diagnosis without fresh evidence.
4. Full CH acceptance next requires independently recorded same-patch Rogue and resource-limited caster sessions, frozen equipment/rotation/resource assumptions and code/model identity, controlled calibration followed by held-out evaluation, then a player-facing planner integration with honest feasibility and uncertainty. Preserve the user's DEX-knuckleblade Rogue constraints; do not manufacture missing rank curves, prices, mount behavior or universal class winners.

**Reusable feedback:** persist effect generations beyond active-object lifetime; distinguish survival from observation-window completion; reject truthy evidence; test equality boundaries and derived overflow; verify which tests actually ran; bind source, candidate artifact and browser result separately. Product prevention is implemented here. Global Toolbox promotion remains `FACTORY_IMPROVEMENT_DEFERRED_TO_OWNER` pending deduplication and independent review; no broad policy/runtime change, new scheduler or recurring agent was created.

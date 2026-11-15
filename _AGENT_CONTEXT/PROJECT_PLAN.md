# Project Plan — Canonical Work Ledger

This file is the repository's durable current-work ledger. It follows the cross-repository contract in `fengie/heaven-toolbox@main:_AGENT_TRAINING/PROJECT_PLAN_CONTRACT.md`.

## Operating rules

- Allowed statuses: `PLANNED`, `READY`, `ACTIVE`, `BLOCKED`, `DEFERRED`, `DONE`, `SUPERSEDED`.
- Nonterminal items record source/evidence, owner or `unclaimed`, acceptance criteria/goal, and one concrete next action.
- Checkboxes become complete only from canonical-main or exact referenced evidence.
- Update this ledger after material ownership/status/blocker changes, after integration, and before handoff.
- Do not fabricate roadmap items to make a quiet repository appear active.

## Current plans & progress

### DATA-002 — Reproducible staged scrape pipeline

**Status:** DONE  
**Owner:** completed via issue #2 / PR #3  
**Source:** issue #2; current Codex Saved Builds schema; branch implementation  
**Goal:** make live scraped analysis inputs reproducible, schema-drift safe, validate-before-publish, and bounded in retained source evidence.

- [x] Select the Saved Builds table by semantic headers instead of first-table position.
- [x] Fail closed on missing/duplicate/malformed required columns or rows.
- [x] Retain content-addressed source HTML with bounded snapshot retention.
- [x] Stage raw/normalized/summary outputs and publish only after validation.
- [x] Emit a machine-readable manifest with source/output hashes, row counts, parser version, filters, and calibration sources.
- [x] Add regressions for unrelated leading tables, schema drift, failure preservation, and successful manifest publication.
- [x] Exact head `b78033f49d254ece4fac7fc82f4a172f93fea260` passed Tests run `37128924361`.
- [x] Merged as `2b1fd85a4468ce813bd101b5bfa34e6a2a680d8b` and verified remote `main` readback.

**Execution-path note:** the current ChatGPT session exposes the canonical Toolbox skills and authenticated GitHub mutation surface but no callable Heaven/Agent Control local-runtime namespace, so the mandatory local offload lane could not be exercised. Exact candidate GitHub CI is the mechanical verification path.

**Next action:** none for DATA-002; future schema changes must update parser fixtures/version and preserve the same fail-closed publication contract.


### DATA-003 — Complete public Codex Saved Builds catalog

**Priority:** P1
**Status:** DONE for public listing metadata; detailed all-build mechanics remain OPEN under OPT-002
**Source:** 2026-10-08 four-page Codex public Saved Builds listing (327 entries, 100/100/100/27)
**Acceptance:** unique source URLs, 306 damage + 21 tanks, complete pagination, fail-closed validation and atomic CSV/SQLite publication, 122 existing skill panels retained with provenance.
**Implementation:** `data/reference/codex_published_build_catalog.json`, `ch_tables/codex_catalog.py`, `docs/CODEX_CATALOG.md`. Raw complete CSV and filtered normalized/class tables published from one snapshot. Existing one-page scraper fails closed when pagination reveals incomplete coverage.
**Next action:** systematically expand independent detail-page coverage with source/terms review; neither raw modeled DPS nor a copied HTML page establishes real-game DPS accuracy.

### DATA-004 — Incremental public Codex detail coverage

**Priority:** P1
**Status:** ACTIVE
**Owner:** unclaimed for future source-compliant collection
**Source:** complete DATA-003 catalog, existing 12-build / 122-panel source archive
**Goal:** expand independent per-build skill evidence safely without discarding source identity or prior observations.
**Delivered:** `ch_tables/codex_detail_refresh.py` provides deterministic class-balanced missing-URL selection, capped rate-limited page requests, no retry on 429, schema-fail-closed incremental merging, independent original snapshot preservation and atomic publication. `tests/test_codex_detail_refresh.py` is entirely offline.
**Next action:** execute small authorized increments in an internet-enabled trusted runtime, measure successful independent build coverage and parser drift, get publisher/author permission before broad redistribution, then implement separate tank-specific detailed-metric extraction. Do not report all detail pages as ingested.

### OPT-001 — Equip/mount/consumable feasibility and research benchmark

**Priority:** P1  
**Status:** ACTIVE  
**Owner:** unclaimed for next implementation phase  
**Source:** personal user request October 8, 2026; `docs/OPTIMIZATION_ARCHITECTURE_2026_10_08.md`; Heaven Toolbox source `deddf600`.  
**Goal:** interaction-safe candidate screening and measured fight feasibility including mounts, shield/offhand, sustain, QoL, consumables and acquisition limits.

- [x] Document modular search/simulation/contracts, source uncertainty, legality and bounded phases.
- [x] Implement candidate interaction signatures and no-false-pruning tests.
- [x] Implement explicitly optimistic health/energy/potion/haste fight screen and adversarial tests.
- [ ] Validate mount stat persistence, combat availability and offhand classes/slots against in-game sources.
- [ ] Calibrate one Rogue and one resource-limited caster encounter before any real-DPS claims.

**Next action:** collect exact current-patch mount/CG offhand/runic shield, rotation and resource-regen observations, add sourced fixtures, then build a small exact oracle versus constraint solver.

### OPT-002 — Dynamic multi-objective simulator and planner UI

**Priority:** P1  
**Status:** ACTIVE  
**Owner:** simulator and validation slices delivered on verified main; in-game calibration remains unclaimed  
**Source:** `docs/OPTIMIZATION_ARCHITECTURE_2026_10_08.md`.  
**Acceptance:** seeded event-simulation fixtures agree with game observations; search agrees with exhaustive oracle for tiny cases; clear Pareto results with safe, priced gear sources and quality indicators.  
**Implemented slice:** `ch_tables/combat_simulator.py` models deterministic priority-queue events, resource caps, enemy/auto/pet attacks, cast/action occupation, finite potions, swaps, DoT refresh and buff expiry; a planner Choice adapter and paired-seed evaluation are included. `tests/test_combat_simulator.py` has 16 locally passing standard-library regression tests. `data/planner/synthetic_combat_scenario.json` is explicitly NOT real game data. See `docs/COMBAT_SIMULATOR.md`. Full OPT-002 acceptance is still pending.  
**Validation slice:** `ch_tables/combat_validation.py` provides strict source-identity and frozen-scenario gates, independent-session holdout comparison, seeded expected DPS/potion/death/kill metrics, and an explicitly synthetic CLI fixture (`tests/test_combat_validation.py`, 9 regression tests). It does **not** estimate coefficients or establish real-game accuracy. Targeted simulator+validation tests: 25 passed locally on Python 3.13. Exact implementation commit `81a41e09c6a0c3132cdc95039c531871f09f7fd3` verified on remote main; full GitHub Actions [Tests](https://github.com/fengie/CH-tables/actions/runs/37862267422), [README timestamp](https://github.com/fengie/CH-tables/actions/runs/37862267400), and [Heaven AutoUpdate Contract](https://github.com/fengie/CH-tables/actions/runs/37862267440) all completed successfully. Science acceptance (real-game validation) remains open.

**Exact loadout search slice (October 8):** `ch_tables/loadout_search.py` introduces bounded, exact top-K weighted equipment search with an independent tiny exhaustive oracle, optimistic interaction-aware branch upper bounds, explicit set/item synergy and incompatibility, gold feasibility, skill bonus traceability, no unknown pricing/effects by default, and explicit `certified_exact=false` on work cap. `tests/test_loadout_search.py` includes 16 local regression tests with 80 deterministic randomized oracle comparisons. See `docs/LOADOUT_SEARCH.md`. **This is not a calibrated actual-DPS optimizer or complete Pareto frontier.**

**Evidence acquisition slice (October 8):** `ch_tables/combat_evidence.py` accepts private local recordings and strict timestamped event transcriptions, hashes both original and transcript bytes, derives exact fixed-window combat/potion observations, rejects duplicate/invalid/escaping inputs, and emits the existing holdout validator's schema. `tests/test_combat_evidence.py` adds 18 targeted regressions, and `docs/COMBAT_EVIDENCE.md` supplies a first-party Rogue/caster recording protocol. This is capture/intake infrastructure, not real gameplay calibration.

**Validation-integrity correction (October 8):** the holdout evaluator now compares the actual supplied `Encounter` against the exact SHA-pinned scenario configuration before simulation, eliminating a mismatch that could otherwise produce apparently hash-validated predictions from a different model. Two adversarial regression tests cover changed damage, skills, HP, horizon, and a rehashed scenario with a stale model. Local simulator + validator + evidence-intake tests: 45 passed. Chronology and game-mechanics calibration remain unverified.

**Exact Pareto optimizer slice (October 8):** `ch_tables/loadout_pareto.py` produces a nondominated set across six explicit research metrics (maximized) and known acquisition cost (minimized), not merely a top-K weighted score. Branch-and-bound uses optimistic per-metric slot and conditional-effect bounds, checks compatibility/eligibility/budgets, deduplicates tied vectors deterministically, and refuses optimality claims on node or output caps. `tests/test_loadout_pareto.py` includes an independently coded unpruned oracle over 170 seeded mixed-synergy/negative-effect scenarios plus adversarial sustain, shield, mount, unknown-effects, and budget cases. Local isolated loadout-search/Pareto suite: 29 passed; a separate 500-case randomized cross-check passed. These results certify only **explicit uncalibrated inputs**, not current-patch Celtic Heroes DPS or complete nonlinear simulation objectives.

**Codex empirical surrogate (October 8):** `ch_tables/codex_surrogate.py` models Codex's published per-skill `Avg Damage` conditional on that **same panel's Max Damage**, using a per-skill robust median ratio with global fallback and independent whole-build holdouts. The pinned 12-build, 117-valid-panel retrospective LOBO study gives **4.03% mean absolute percentage error**, versus **5.12%** for a global baseline. Only ~59% of individual predictions meet 5%. Transferring `Max Damage` directly from another build fails badly (~57.25% MAPE on 88 comparable rows): new gear/rank/ability DPS and actual in-game combat remain unverified. See `docs/CODEX_EMPIRICAL_SURROGATE.md`. This is Codex MODEL-on-MODEL inference, not a measured 5%-accurate DPS engine.\n\n**Next action:** collect independently recorded same-patch Rogue and resource-limited caster traces (including source hash, timing, gear and policy); freeze calibrated inputs before holdout inspection, then compare against real sessions and audit model bias. Only after that proceed to the tiny exact solver/oracle.

### OPT-003 — Tooling case-study feedback

**Priority:** P2  
**Status:** ACTIVE  
**Owner:** unclaimed  
**Source:** `fengie/heaven-toolbox` project-training/provenance guidance and October 8 multi-repo user request.  
**Acceptance:** narrow cross-project evidence/case study saved in Toolbox, without copying CH-specific assumptions or adding broad unvalidated mandatory policies.  
**Next action:** run measured end-to-end development throughput/rework benchmark from two actual Toolbox projects and promote only verified wins.


### WEB-002 — Competitor-informed decision and collector experience

**Priority:** P1, following GitHub Pages issue #6  
**Status:** IN REVIEW — recovered wardrobe implementation candidate #22; not yet deployed  
**Owner:** WEB-002 recovery PR #22  
**Source:** 2026-10-09 competitor and scientific records, root `_AGENT_CONTEXT/RESEARCH_FINDINGS/records/2026/10/`.  
**Goal:** understandable, feasible, dated, player-specific comparisons without universal tier claims.  
**Acceptance:** CH compare has assumption/source/encounter evidence with incomplete-state guard; AION compare includes owned cosmetics, dye, expiry and region/binding; negative scenario tests, keyboard and mobile checks pass.  
**Recovery scope:** Original WEB-002 wardrobe/decision calculator source and tests are carried from the preserved branch into current Pages build with dedicated route checks and Chrome acceptance in PR #22. Snapshot limits remain explicit.  
**Next action:** verify PR #22 exact-head source/browser gates, integrate via native protections and independently observe served revision. After that reconcile issue #9 and the ledger. Validate a sourced cosmetic workflow separately. No scheduled agents or auto-purchase.

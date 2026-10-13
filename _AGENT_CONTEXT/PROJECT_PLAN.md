# Project Plan — Canonical Work Ledger

Updated October 13, 2026. This branch checkpoint is not a declaration that its changes reached main.

Canonical main observed: `3b0ebb13a06f23943f301fdb2b8e466e07e939e4`.
Existing repair branch: `feat/web002-evidence-wardrobe-20261009`.
Core repair and browser-gate checkpoint: `c6f5ea0a1e9e1f7d2ab4a213ab980963c3b2aa20`.

The full prior ledger, original experiments, implementation history and acceptance details remain preserved at [the immutable pre-audit ledger](https://github.com/fengie/Heaven.gg/blob/227974a5d4684937ff086d5059ca0d722e1b2ab2/_AGENT_CONTEXT/PROJECT_PLAN.md). Its historical test counts and WEB-002 implementation-unclaimed label are not current branch status.

## Operating rules

Statuses: PLANNED, READY, ACTIVE, BLOCKED, DEFERRED, DONE, SUPERSEDED. Source/CI, main integration and actual deployment are separate states. Nonterminal work records its next action and owner or unclaimed. Do not infer an authenticated lease from this ledger, an issue assignee or an assistant-written ownership label.

Toolbox #849/#664 merge freeze remains active. No merge, main write, new agent, deployment, game-account access or current-game calibration is established by this checkpoint.

## Current work

### DATA-002 — Reproducible staged scrape pipeline

**Status:** DONE on historical canonical main. **Owner:** completed issue #2 / PR #3.

Delivered semantic-header parsing, content-addressed bounded snapshots, staged validation/publication and rollback, and source/output identity manifests. Exact head `b78033f49d254ece4fac7fc82f4a172f93fea260` passed run `37128924361`; integration was `2b1fd85a4468ce813bd101b5bfa34e6a2a680d8b`.

**Next:** retain those invariants when the upstream schema changes. This audit did not perform another network refresh.

### DATA-003 — Public Codex listing catalog

**Status:** DONE for the pinned October 8 listing snapshot, not all detail pages. **Owner:** historical implementation.

327 source-linked entries, 306 damage and 21 tank listings, with four-page provenance and derived CSV/SQLite support. A listing's modeled DPS does not establish real combat accuracy. See `docs/CODEX_CATALOG.md`.

**Next:** detail acquisition continues under DATA-004; never relabel the dated catalog live.

### DATA-004 — Incremental detailed evidence

**Status:** ACTIVE. **Owner:** unclaimed for source-compliant collection.

`ch_tables/codex_detail_refresh.py` implements class-balanced bounded collection, rate limits, schema-fail-closed merging and prior-snapshot preservation. Existing archive covers 12 builds / 122 modeled skill panels, not every build.

**Next:** small authorized increments with independent coverage counts and upstream rights review, followed by separate tank-detail extraction. Do not publish private player data or broad unsanctioned copies.

### OPT-001 — Equipment and encounter feasibility

**Status:** ACTIVE. **Owner:** unclaimed for current-game measurements.

Interaction-aware candidate screening and optimistic resource feasibility exist. This branch now rejects malformed evidence/ownership flags, boolean measurements, fractional or nonfinite gold, and malformed levels/ranks. Unknown costs and unverified mount applicability remain unknown; ownership does not establish game mechanics.

**Acceptance still open:** current-patch mount persistence, offhand legality, skill/resource rates, and one Rogue plus one resource-limited caster encounter. See `docs/OPTIMIZATION_ARCHITECTURE_2026_10_08.md`.

**Next:** collect those controlled observations rather than inventing coefficients.

### OPT-002 — Simulator, search and personal planner

**Status:** ACTIVE; audited source repair is tested on this branch, full science/product acceptance remains open.
**Owner:** current operator-directed repair checkpoint; no independent controller lease asserted.

Existing modules include discrete-event combat, session-held-out validation, recording/transcript intake, bounded scalar search and seven-objective Pareto search. The audit repaired stale buff expiry, duplicate action wakes, boss-kill survival aggregation, incompatible comparison inputs, canonical Pareto tie pruning and nonfinite arithmetic. The simulator reports `synthetic_discrete_event_v2_UNCALIBRATED`; holdout output now identifies its simulator version.

**Verified local checkpoint:** 212 Python tests, 33 web tests, 17 browser acceptance groups. Synthetic before/after timing and scope are in `web/AUDIT_HANDOFF.md`. GitHub code checkpoint `c6f5ea0a1e9e1f7d2ab4a213ab980963c3b2aa20` passed Python run `38359647022` and website/browser run `38359647041`. Later commits need their own applicable checks; neither run is merge admission.

**Next:** independent exact-source review, then authorized integration after freeze release. Scientific next step remains separately collected same-patch Rogue/caster holdouts with frozen gear, timing and action policy. The Codex surrogate's historical model-on-model fit is not a calibrated actual-DPS engine. A usable research website is not a completed personal BIS optimizer.

### WEB-002 — Recovered research browser and collector tools

**Status:** BLOCKED for integration/release; implementation is present and tested, not unclaimed or absent.
**Owner:** existing recovery branch / issue #9; no new competing branch or agent.

Recovered the pre-existing comparison and wardrobe code. Hardened missing-value and provenance handling, exact-cent arithmetic, import consistency, selection focus and keyboard tabs. `web/offline.mjs` packages a portable research HTML with 327 builds, 259 displayed catalog entries and eight historical boss records, plus the existing AION tools. No game login, automatic purchases or invented live values.

CI now discovers all web tests and exercises the actual portable artifact in Chrome before uploading it. Reports carry artifact SHA-256; source audit snapshots are separate, expiring artifacts, never Pages assets. See `web/FIRST_DELIVERABLE.md` and `web/AUDIT_HANDOFF.md`.

**Next:** retain this candidate, independently review the complete branch, satisfy current release admission, then verify the served revision and real target-browser behavior. The previously recorded Pages-disabled diagnosis is stale: an earlier public research portal was observed serving revision `912fd09f6fc2f79aba5a3070935e2344e1c69077`; that is not this candidate's deployment.

### OPT-003 — Reusable Toolbox feedback

**Status:** ACTIVE. **Owner:** unclaimed for independent cross-project promotion.

Executable prevention is saved with the owning CH source/tests; reusable candidates are summarized in the audit handoff. Factory disposition: `FACTORY_IMPROVEMENT_DEFERRED_TO_OWNER` for global policy/runtime changes. One local benchmark does not establish company-wide throughput improvement.

**Next:** review the portable lessons against existing Toolbox knowledge, deduplicate and promote only independently verified cross-project value through its existing owner. Do not copy game coefficients into generic policy or create a parallel governance system.

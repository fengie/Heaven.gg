# Atreia Atlas — AION 2 Value Intelligence

**Version 0.1.0 · Research snapshot October 9, 2026 (America/New_York).**

**Canonical deployment:** https://fengie.github.io/Heaven.gg/aion2/index.html (GitHub Pages; verify exact deployed SHA and route). The former AppDeploy URL was a separate historical prototype, not the current release channel.

A visual, local/offline-first dashboard for comparing AION 2 Global cash-shop items: Quna packs, bonus A2 Mileage, direct-money cosmetics, passes, persistent convenience, regional patch history and source confidence. Intended for players who prioritize collecting skins and long-term enjoyment over combat meta.

## Open it right now

Open `index.html` in Chrome, Edge, Firefox or Safari. There is **no account login, network dependency, backend or required package installation**. The page uses system font fallbacks and performs no external requests to initialize.

## Features

- Adjustable fashion / playtime / meta preferences and sorted product catalog with source confidence.
- Quna versus Mileage normalized to 4,000/10,000/20,000/40,000 Quna, exact cent math.
- Budget optimizer up to $500 maximizing explicitly weighted Quna + Mileage; the mileage valuation is **your assumption** and adjustable.
- All ten listed A2 Mileage Shop products and their per-character/daily limits.
- Source-linked regional patch timeline, past events vs scheduled dates, community vs official evidence.
- Export source JSON directly from the dashboard.
- [Offline character/gear planner](profile.html), with local JSON/CSV import and transparent upgrade assumptions.
- [Offline Frame Generation Lab](performance.html), with explicit monitor Hz, FPS-counter source, generated-frame ratio and no invented input latency. These pages are copied into Heaven.gg's production Pages artifact.

## Canonical inputs & rebuild

Edit `data/catalog.json` to add sourced product observations, then:

```sh
python scripts/build.py
python -m unittest discover -s tests -v
```

Commit the JSON and generated `index.html` together. `scripts/build.py` validates source references and fails closed on invalid data. Static CI checks generated-byte parity and final embedded JavaScript syntax. The offline `index.html` is deliberately checked into Git for reproducibility and direct browser use.

## Scope, known gaps & responsible use

Initial coverage is **NOT an exhaustive current cash shop** and is not live-updating. Confirm exact products and purchase limits in the actual client. NCSOFT official data and user screenshot are distinguished from community estimates. Unknown direct cash Mileage is null rather than falsely treated as zero. No guarantee that spending Quna itself generates more Mileage. Scores are editorial, not objective arbitrage. Paid skins may be limited to a character/server and do not earn Collection Points.

## Heaven Toolbox alignment

Bootstrapped using `fengie/heaven-toolbox` guidance: `AGENTS.md`, `GLOBAL_GIT_DIRECTIVE.md`, `_AGENT_TRAINING/CONTINUITY_PROTOCOL.md`, `DEVELOPMENT_PIPELINE.md`, `VERIFICATION_DOCTRINE.md`, `APP_AUTOUPDATE_STANDARD.md`. Research and rationale live under `_AGENT_CONTEXT/RESEARCH_FINDINGS/records/2026/10/`. Source contract + test + release timestamps exist. **Current site release is GitHub Pages in fengie/Heaven.gg; source CI, provider deployment and independently served HTTP routes are separate gates.** `.heaven/update-policy.json` is a declared target only; see `NEXT-AGENT-START-HERE.md` for outstanding deployment work.

## Recent patches

- **0.1.0 — 2026-10-09:** Offline dashboard, data-source ledger, Quna pack optimizer, Mileage table and patch radar.

© Fan research, not affiliated with NCSOFT. No automated purchases or scheduled agents.
# AION 2 Global personal progress planner — research and implementation record

**As of:** 2026-10-19 (America/New_York). **Product owner:** `fengie/Heaven.gg`. **Scope:** Global release/Season 1 with dated source revisions. **Privacy:** no character or account data was copied from the user into this public repository. No login, server-side profiles, client memory reads, OCR, scraping, scheduled updates, bot automation or payment actions.

## Charter

- **Goal:** deliver an offline-first personal inventory/progression editor with portable JSON/gear CSV import, local saving, a source-labeled gear reference, and calculations that recompute when the user changes real progress; preserve honest unknowns and verify through the existing source/build/review gates.
- **Scope / Object / Subject:** Global AION 2 character progression economy / safe personal gear-and-farming recommendation workflow inside Atreia Atlas / per-slot gear, total item level, stone/enchant/soul-binding details, quest status, resource pools, measured dungeon claims, projected upgrades, and dated exchange quote examples.
- **Type:** exploratory to establish system differences and find available import APIs, followed by descriptive requirements for a deterministic offline MVP. Previously settled currency economics are reused, not restudied.
- **Q1:** Which exact gear/progression fields are needed to avoid wrong build or dungeon advice?
- **Q2:** Which upgrade and farming scenarios can be compared with measured rather than fabricated inputs?
- **Q3:** What import and persistence are reliably possible without NCGuard interference or new auth/privacy risk?
- **Q4:** What can be refreshed automatically, and what needs an actual current in-game observation?

## Canonical sources (ranked by closeness to fact)

| Rank | Source / version | Used for |
| --- | --- | --- |
| 1 | [NCSOFT official Global Oct. 14 notes](https://lounge.plaync.com/feed/84134?country=US&locale=en-US), [transfer Q&A](https://lounge.plaync.com/feed/83614?country=US&locale=en-US) | Temporary Odyle refill cap/window; avoid permanent model constants |
| 3 | `fengie/Heaven.gg@69c81a73039d4f62ed289109a31bf82ceb01d2e2`: `apps/aion2-value-atlas/src/app.template.html`, `scripts/build.py`, `data/exchange_observations_2026-10-19.json`, `web/build.mjs` | Actual static/offline application, user-observed exchange snapshot and deterministic Pages release |
| 4, explicitly provisional | [NCER gear advice hosted by NCSOFT](https://lounge.plaync.com/feed/83022?country=US&locale=en-US) dated Oct. 5 | Candidate slot-specific Soul Binding properties; page explicitly states it is AI-generated, **not** NCSOFT-verified |
| 4 | [AION 2 Builds gear guide](https://aion2builds.com/guides/gear/) (Global client 2026-10-14), [LUM item directory](https://lum.gg/aion-2/items) (Oct. 17) | Item/piece IL vs total character IL, grades, upgrade and item-slot taxonomy; cross-verify in client |
| 4 | [AION 2 Builds Spiritmaster sample](https://aion2builds.com/builds/spiritmaster/) (n=200, sampled Oct. 16), [item sample](https://aion2builds.com/database/items/) (n=1,600, sampled Oct. 16) | Small real-item name suggestions only; observational popularity is neither BIS nor a personalized effect |
| 4 | [Community Global Kina guide](https://raidrelay.com/aion-2-kina-guide), [Oct. 19 exchange study](./2026-10-19-exchange-reinvestment.md) | Example dungeon thresholds/rewards, unverified morphing/market assumptions; label estimates explicitly |
| 4 | [Read-only armory import options research](https://github.com/jonboy648/aion2-companion/blob/main/research/gear_import.md) | Third-party documented API/armory ideas, not verified endpoint schema or CORS/authorization for this site |

## Findings ledger

| ID | Observed claim / restriction | Source class | Questions | Design consequence |
| --- | --- | --- | --- | --- |
| F1 | Printed *piece* IL (e.g. 54) is not the character's *total* dungeon-gating item level (e.g. 2,100); enhancement, stones and progression can change the total. | Global client-derived, Oct. 14 | Q1 Q2 | Store separate user-confirmed itemTier and total itemLevel; **never sum piece IL into a claimed total**. |
| F2 | Gear has weapons, Guard, armor, rings/earrings/bracelets, belts/amulets, runes and Arcana; grade/caps and Soul Binding eligibility vary. | Global client-derived + provisional NCER | Q1 | Track 25 distinct slots, item name, grade, tier, enchant, Soul Binding, socketed stones; do not predict exact DPS or apply generic cap formulas. |
| F3 | Public Spiritmaster profiles name gear such as Spiritforged Orb/Guard and Bakarma armor, but sampled popularity and missing item rolls cannot prove best-in-slot. | Secondary sample n=200 | Q1 | Provide optional 17 sourced name suggestions; no BIS ranking, fake market pricing or automatic ownership import. |
| F4 | NCSOFT increased Odyle Energy limit per character from 4 to 20 temporarily and removed the 16/server cap **during server transfers**, ending in October for this cycle. | Primary Oct. 14 | Q2 Q4 | Conditional 20 cap, date-window guard, user-verified membership and vendor status; expire and warn rather than promising automatic future refills. |
| F5 | Headline higher-tier cube rewards do not prove a faster actual Kina/hour route; time, costs, failure, Odyle and server-wide tapers differ. | User inputs + community estimates | Q2 | Rank only activities with user-entered completion time; display unmeasured alternatives and model-only upgrade payback separately. |
| F6 | 400K/2M/10M asks and displayed tax in private Oct. 19 screenshot are *not* completed trades; conversion also costs morphing capital. | User screenshot (anonymized dated numeric snapshot) | Q2 Q4 | Keep rate/date editable and stale; show only nominal seller alternative, never automatic arbitrage or guaranteed sale. |
| F7 | Public armory and community import projects exist; no verified account API/cross-origin contract or authorized credentials are available for this product. | Community implementation study; contract not confirmed | Q3 | Versioned local JSON export/import, human-reviewed gear CSV and manual fields first; **no account link or third-party automatic fetch**. |
| F8 | Existing app is a self-contained, deterministic static page, copied to `dist/aion2/index.html` at build; no backend/account/storage standard exists. | Exact canonical Git source | Q3 Q4 | Add `profile.html` to the same generated static release with browser-only optional localStorage, no network calls and explicit export backup; recompute on each edit and revisit. |

## Scope filter

- **Discard:** Korean/Taiwan-only top gear, supposed Global Heroic availability, and undated dungeon/reward caps. These cannot establish Global October 19 recommendations.
- **Revise:** NCER's apparent publisher authority to **provisional AI-generated advice**. Community payout tables are models, not direct per-user payout evidence.
- **Reject:** market "best" rankings that use screenshots as executed-sales data and gear advice that confuses item-tier with total character IL.

## Object filter

- **Discard** unverified automatic import: a community code report of public API endpoints is not evidence a private static site can access them in CORS-compliant, sanctioned, stable fashion. Browser clipboard files and user-owned backups provide a safer first implementation.
- **Revise** gear examples to suggestions rather than BIS; sampled top players' equipped items and user-specific cost, roll, class/region/faction and obtainable status may differ.
- **Revise** the promise "at all times" to **recalculates from locally saved state whenever the page opens or inputs change**, with explicit model/market timestamps. This is not live game synchronization or background monitoring.

## Conclusions and design decisions

- **C1 (F1–F3):** Build a full 25-slot manual gear log, with the spellcaster Orb/Guard example plus all accessory/rune/Arcana fields. Source-labeled sample names only.
- **C2 (F4–F6):** User-recorded run times and costs determine net Kina/hour; a separate community-only payout path estimates eligibility and hypothetical per-claim upgrade payback. Bound-vs-tradeable Kina constrains Market affordability. Time-limited refill and exchange snapshots require freshness checks.
- **C3 (F7–F8):** Implement an entirely offline no-login `aion2/profile.html` linked from Atreia Atlas. JSON import/export and limited CSV gear import use strict schema, byte, slot and numeric validation. LocalStorage failure must not erase the form; export remains available.
- **C4 (F8):** Source code belongs under `apps/aion2-value-atlas/`, generated HTML is committed with source. Root web builder includes the new page and static tests. No generic lesson promotion: Toolbox's existing ownership/provenance enforcement already covers this case.

## Implementation steps and acceptance

1. Add dated `progression_catalog.json` with slot taxonomy, sources, narrow gear example catalog and sample dungeon eligibility — based on F1–F5.
2. Add `scripts/profile-engine.mjs` with standalone normalization/import/evaluation units; negative tests cover unsafe schema, duplicate slots, stale prices, expired refill caps, affordable Market-only upgrades and measured ROI — F1–F8.
3. Add `src/profile.template.html`, generated `profile.html`, and build-script deterministic, no-login embedding; display local browser backups, import/export, source warnings, per-item gear and measured farming — F7–F8.
4. Link through AION 2 Atlas and root Heaven.gg AION tab; static Pages build copies `aion2/profile.html`; exact source tests and root integration verify artifact parity.
5. Full root and web tests on exact PR head; independent CI and main-source readback before shipping. Runtime browser interactions require a real browser acceptance receipt; a successful parser/source test alone does not prove UI compatibility.

**Not covered:** direct in-game imports, auto-updates, screenshot OCR, current-item pricing, class combat optimization, transfer stone guaranteed compatibility, executed Market prices, automated data collection, verified deployment until actual GitHub Pages receipt. Missing character observations should produce "not measured", not invented optimized ROI.

## Next steps / risks

- Fill a profile from the player's actual character; input 3 measured runs per relevant activity and real candidate upgrade prices. Verify current item names/rolls against Global client and source dates before claiming personal BIS.
- Validate real browser local save, import/reimport, mobile overflow and timezone/freshness interaction when a permitted browser-testing route exists.
- Decide on future official/public armory JSON import only after confirming published API terms, endpoint response schema, CORS, per-user authorization, rate limits, and privacy; keep it independent from the game process.

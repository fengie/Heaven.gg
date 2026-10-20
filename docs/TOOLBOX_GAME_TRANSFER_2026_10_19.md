# Toolbox → Heaven.gg: game-product transfer and findings

**Date:** October 19, 2026. **Exact inspected parent:** fengie/heaven-toolbox main b557a0531021a483081f1932c44c69ff81b5bf8a. **Destination:** existing public fengie/Heaven.gg. **Objective:** test parent research → child product delivery and make game-specific outcomes available to users.

This user-authorized, connector-mediated migration is **not an automated parent-to-child synchronization**. The existing Toolbox plugin/Bridge did not independently run this operation. Branch/PR, copied blob, CI, deployed Pages and real user gameplay are separate verification states. Preserve those distinctions.

## Source audit and disposition

| Parent source | Decision | Child destination | Boundary |
| --- | --- | --- | --- |
| Dual-monitor AION 2 case study: [Toolbox research](https://github.com/fengie/heaven-toolbox/blob/b557a0531021a483081f1932c44c69ff81b5bf8a/_AGENT_TRAINING/CASE_STUDY_DUAL_MONITOR_GAME_LATENCY_2026-10-15.md) / [#1033](https://github.com/fengie/heaven-toolbox/issues/1033) | Port the public AION game-specific mechanism and vendor evidence, **not** raw private workstation captures | [Offline Frame Generation Lab](../apps/aion2-value-atlas/performance.html), [pure calculator](../apps/aion2-value-atlas/scripts/performance-engine.mjs) | Current actual FG multiplier, real FPS, GPU/display path, VRR and latency are still UNVERIFIED |
| Game-owned cache placement / Steam shader and driver cache research: [Toolbox Oct 17](https://github.com/fengie/heaven-toolbox/blob/b557a0531021a483081f1932c44c69ff81b5bf8a/_AGENT_CONTEXT/RESEARCH_FINDINGS/summaries/2026-10-17-heaven2-shader-and-game-cache-placement.md) | Transfer sanitized storage recommendations and approved source utilities | [Game storage guide](GAME_STORAGE_GUIDE.md) and [Windows tools](../tools/windows-game-utils/) | No real SSD/cache move, drive-specific performance gain or installed runtime was verified |
| External SSD shortcut generator and PowerShell fixture, Toolbox tools/game-shortcuts | Transfer exact game-specific tested source | New-HeavenGameShortcuts.ps1 and Test-HeavenGameShortcuts.ps1 under Windows tools | No actual Steam, Genshin or Overwatch launcher smoke |
| Toolbox tools/unified-workstation game-cache and Steam/Desktop shortcut icon code | Transfer only self-contained game-specific sources and fixtures | Ten additional .ps1 files, **12 total** | [Machine-readable Git blob source ledger](../data/research/toolbox-game-transfer-2026-10-19.json); no private source installer or control capability |
| Celtic Heroes optimization cross-project case: [Toolbox Oct 8](https://github.com/fengie/heaven-toolbox/blob/b557a0531021a483081f1932c44c69ff81b5bf8a/_AGENT_CONTEXT/RESEARCH_FINDINGS/records/2026/10/2026-10-08-ch-optimizer-second-project-2a414c10f189.md) | ALREADY PRODUCT OWNED — no duplicate model or stale numerical findings | Existing CH loadout search, Pareto modeling, skills, validation, tests and docs | Synthetic oracle/empirical saved-build estimates are not live current-patch gameplay DPS |
| Historical MHW mod-specific entries in Toolbox history/mhw-global-tooling | Separate owned product; not transferred into Heaven.gg application | [Heaven Mod Manager](https://github.com/fengie/Heaven-Mod_Manager) linked from [game tools hub](../web/game-tools.html) | No binaries, private update tokens, installer or mod operations copied |
| Generic display APIs/PowerShell collector [#1033](https://github.com/fengie/heaven-toolbox/issues/1033), [#788 workstation](https://github.com/fengie/heaven-toolbox/issues/788), [#936 storage](https://github.com/fengie/heaven-toolbox/issues/936) | Platform/host authority stays in Toolbox | Public explanatory links and calculation only | Physical H1/H2 diagnostics, machine permissions and agent Bridge entrypoints are not site features |
| Install-HeavenGameCacheTools.ps1 (private upstream commit pin) | **NOT COPIED** | Future child-owned distributor, if authorized | An installer that clones private Toolbox source would break independent public distribution and signing/rollback guarantees |

## Frame-generation interpretation and limits

Previous Toolbox research established a real **240 Hz built-in / 144 Hz external** configuration in a private operator report. For this public tool those are generic sample rates only; no personal workstation model, driver ID, account, raw capture or hardware path was copied.

- If an overlay reports 144 *displayed* FPS and an effective fixed 6× ratio with no drops, **144 ÷ 6 = 24** is a theoretical number of originally rendered frames per second.
- If the counter reports 144 *native rendered* FPS, dividing it by six is wrong. Hypothetical output may be up to six times native, while a 144 Hz panel cannot show more than 144 distinct refreshes each second.
- If the FPS counter source is **unknown**, the tool returns unknown for native/output estimates. The 240 FPS cap is a target, not a guarantee or image-quality setting. The tool never claims input-to-photon latency from refresh arithmetic.
- High FG ratios can introduce motion artifacts near moving UI, foliage, hair and effects. A reversible FG off → 2× → 6× comparison on an identical scene distinguishes the subjective trade-off.
- NCSOFT issued a targeted RTX 50-series Laptop G-SYNC + FG crash workaround; G-SYNC off and Control Panel V-Sync on was intended for affected combinations, **not** as a universal best-quality or latency preset.

**Public source canon:** [NVIDIA AION 2 DLSS announcement](https://www.nvidia.com/en-us/geforce/news/aion2-splitgate-arena-reloaded-dlss-4-multi-frame-gen/), [NCSOFT compatibility notice](https://lounge.plaync.com/feed/78597), [NCSOFT Global FAQ](https://help.plaync.com/faq/aion2global?faqNo=7248), [Microsoft display configuration](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig).

## Parent-child verification plan

1. **Repository and privacy identity:** parent commit and exact per-file Git blob SHA-1s pinned. Child web regression recomputes them; no secrets or private user paths in copied files. A copied file is not a native execution receipt.
2. **Game feature:** AION arithmetic tests cover both interpretations, unknown counter, cap, monitor refresh timing, invalid values and no fabricated latency. The static HTML has no remote scripts and never probes game memory.
3. **UI integration:** root portal, [game tools hub](../web/game-tools.html), AION sidebar, build output and checked-in generated files include the new functionality. The npm test:web script runs *all* existing browser engine suites, including AION profile tests formerly omitted.
4. **Windows fixtures:** isolated Windows PowerShell 5.1 CI checks the original game utilities. Fixture-only testing cannot verify a real interactive game, Steam shortcut, installed driver or disconnected SSD.
5. **Release proof:** reviewed PR with native/source checks, protected main merge, exact SHA GitHub Pages build/publish, and independent live HTTP route readback. Until success, call the result source candidate, not deployed.
6. **Feedback to parent:** link exact child PR/main commit and observed issues to existing #1033/#936/#781 or the owning generic platform issue without reopening duplicate trackers or copying product content to parent.

## Problems found and suggested next actions

1. **Missing web test coverage (fix in this slice):** npm run test:web previously ran only site.test.mjs, excluding the existing AION profile-engine regression suite. Execute all web/tests/*.test.mjs; do not call this full-browser E2E.
2. **Stale original Atreia Atlas README (fix in this slice):** it claimed no GitHub remote and used an old AppDeploy preview as the canonical host. Update to current GitHub Pages publication; dated product source coverage remains old until actively refreshed.
3. **Unverified player motion/lag:** actual rendered/generated output, V-Sync/G-SYNC effective mode, browser vs monitor latency, current game patch and real A/B/A frame-timing remains UNVERIFIED. Use PresentMon only on an admitted interactive PC, not browser-hosted telemetry.
4. **Windows installer and native cutover:** protected private Toolbox installer pins original git objects and assumes local workstation identity. Do not copy/activate or silently re-point it. Design versioned child distribution, verify real launchers on the user PC and preserve old installed source until an approved rollback-tested cutover.
5. **Risk of moving all caches:** NVIDIA and Windows-managed cache destinations differ from game-owned cache folders; do not mass junction or delete. Validate owner, app-closed state, free space, reparse path, backup and real game launch before a selected pilot.
6. **Cross-repository process not automated:** GitHub connector copies and source tests are proof of a *manual transfer*, not that the private parent Toolbox can autonomously discover, route and safely deploy into any owned public child. Existing ownership/lease/publisher and release doctor require separate installed runtime acceptance.
7. **CH provenance and rights:** 327 Saved Builds and synthetic Pareto tests do not guarantee current obtainable equipment/BIS or measured DPS. Community model outputs and private gear belong to their existing CH research boundaries.
8. **MHW separation:** the MHW Mod Manager and binary updater have their own owner/release channel. Link the project, do not transplant a real game's mod-manager runtime into a website or mix incompatible economic data.
9. **Browser interaction:** actual import/save/reload/mobile checks and keyboard/screen-reader review are still pending; successful Node static tests and served HTML do not complete end-user acceptance.

**Rollback:** revert the reviewed child commit through normal Git. Copied code does not change the original Toolbox host or installer. The parent's operational scripts remain available until an independently verified consumer migration.

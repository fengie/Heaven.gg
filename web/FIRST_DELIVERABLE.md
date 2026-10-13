# Heaven.gg — first usable research beta

Delivery date: 2026-10-13. Status: isolated WEB-002 candidate, not a production-release or live-game-calibration claim.

## Use the deliverable

The website workflow builds `dist/Heaven.gg-Research-Beta.html`, a portable single HTML file. Open it in a desktop browser: no account, install, backend, server, or font download is needed. Both game tabs and their dated datasets are embedded. External source links require an internet connection only when followed.

The normal multi-file website is also retained in `dist/`. The workflow artifact is `github-pages` and expires after seven days; all source, packaging code and tests remain in this branch. Inspect `version.json` or the portable file's `heaven-offline-manifest` for the exact source revision. Artifact creation is not deployment proof.

```sh
npm run test:web
npm run build
node web/offline.mjs
```

Optional browser acceptance, with Playwright and Chromium already installed:

```sh
python web/tests/browser-smoke.py --artifact dist/Heaven.gg-Research-Beta.html --output browser-evidence
```

The browser harness loads the complete portable artifact in memory; it does not navigate to the public website. It emits screenshots, an artifact SHA-256 and a JSON report. Its optional `--no-sandbox` switch is only for an isolated test container that requires it, not a recommendation for ordinary desktop use. Phone and tablet viewport coverage is not a claim of physical iOS/Safari verification. Local-file storage policies differ between browsers; use plan export/import when local storage is unavailable.

## What is included

Celtic Heroes: 327 source-linked community builds across five classes, search, sorting, pagination, two-build comparison, 259 cataloged gear entries and eight historical boss records. Build values remain calculator outputs, not measured combat DPS. Matching class/date alone never establishes a fair performance comparison. Missing numerical values are Unknown, not zero. Missing DPS on a damage build is not mislabeled as a tank.

AION 2: the existing shop atlas plus the existing wardrobe/wishlist work, now hardened for owned-item exclusion, exact-cent cash budgets, Quna top-ups, explicit unknown costs, partial Mileage, snapshot/region-bound plan imports, and export/import round trips. The dated prices and purchase assumptions must be checked against the client before spending. The top-up calculation assumes repeatable packs; purchase limits and availability are not verified by the algorithm.

Navigation: keyboard arrows, Home/End, associated tab panels, one active tab stop per tablist, preserved selection focus, and hidden-state rules that author CSS cannot override.

## Verification and reproduced defects

Before repair, the exact WEB-002 modules passed their original eight tests, but failed ten of thirteen independently added regression checks. The source snapshot was `e6f8c9df9a20b34e89ba3b012f3b2864b713f813`.

The new checks cover malformed/coercible/absent DPS, missing context, provenance, real calendar dates, merchant-only unknown costs, omitted prices, duplicate identities, prototype-sensitive pack names, invalid selection types, valid zero totals, and an independent exhaustive optimizer oracle across 120 seeded cases. A maximum-target test runs the 100,000-unit case without copying every intermediate purchase history. Decimal-cent parsing and atomic plan validation have separate tests.

Packaging tests cover deterministic output, JavaScript dollar-sequence preservation, hostile data escaping and rejection of unreviewed imports without replacing an existing artifact. The browser suite has 17 acceptance groups: catalogs, search, sorting, pagination, comparison evidence, keyboard navigation, gear/boss views, both embedded AION tools, decimal budgets, owned/unknown costs, stale-output clearing, rejected/valid imports, export round trip, three viewport sizes and zero network/JavaScript errors.

Use the workflow logs for the test results at the exact candidate revision. A previous passing run does not certify a later commit. The browser report identifies the exact HTML bytes it exercised. The full Python `Tests` workflow remains enabled and unchanged.

## Pipeline and release boundary

This work reused the pre-existing `feat/web002-evidence-wardrobe-20261009` branch and its implementation rather than rebuilding from main or touching the unrelated trader lane. Product source was updated through the connected authenticated GitHub API with existing-file blob checks. A real Bridge status request completed on heaven2, but that read-only response is not a signed product execution lease, a complete inventory of other agents, or deployment evidence.

Heaven Toolbox's October 11 merge freeze remains in force. No new branch, PR, agent, merge, release tag or public deployment was created. Candidate build/upload was enabled only on the existing WEB-002 lane; the deploy job still requires main. This delivery does not lift STOP/freeze controls or claim independent integration approval.

Outstanding before a production optimizer claim: calibrated current-game combat recordings, encounter/rotation/equipment evidence, independent candidate review, release admission, and exact served-artifact verification. Those are separate from delivering a usable research browser.

## Reusable Toolbox feedback

Factory disposition: `FACTORY_IMPROVEMENT_DEFERRED_TO_OWNER` for global policy changes. Product fixes and executable tests are applied here; no broad Toolbox runtime policy is changed from one case.

Reusable lessons: distinguish missing from zero and identical missing fields from verified agreement; model monetary completeness separately from reward completeness; use predecessor storage instead of copying full paths in dynamic programming; parse cents from decimal text; validate imported plans before any UI mutation; test rendered hidden state, not just its DOM attribute; use function replacements when embedding arbitrary JavaScript containing dollar sequences; and distinguish authenticated source reads, source writes, built artifacts, browser acceptance, and public deployment.

Research reused the existing WEB-002 dossiers and Toolbox development/continuity directives. Keyboard behavior was checked against the primary W3C APG Tabs pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Build-versus-deploy separation follows the GitHub Pages custom-workflow documentation (https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

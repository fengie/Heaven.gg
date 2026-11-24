# Heaven.gg — GitHub-first web release contract

## Product and provenance
Target repo: fengie/Heaven.gg (main). Web frontend in web/, built using node web/build.mjs with zero npm dependencies. Static output: dist/. No credentials required for local build, and no live scraping, payments, trackers or private character authentication.

- CH sources: data/reference/codex_published_build_catalog.json, data/catalog/priority_gear_lookup.json, data/reference/raid_boss_resistances_2026_10_08.json.
- AION app source: apps/aion2-value-atlas/index.html and profile.html, plus the product-owned performance.html and performance-engine.mjs, copied byte-for-byte. Recovered WEB-002 wardrobe.html/wardrobe.js and wardrobe.mjs/decision.mjs are copied from web/ to the published AION route and root module paths. The existing dated `apps/aion2-value-atlas/data/catalog.json` is copied to `dist/aion2/catalog.json`, because the wardrobe module loads it over same-origin HTTP. No live shop fetch. Its canonical editable JSON and generator remain in its directory.
- Build identity: dist/version.json records the exact GITHUB_SHA during CI.
- Game identity registry: `data/gaming/game-registry.json` is validated at build time and published as `dist/games.json`. The MHW Windows companion points only to the verified canonical public GitHub repository/release page; no binary is hosted by Pages. Changes to any game dataset require a new GitHub commit, validation and publication.
- No runtime process updates itself: GitHub Pages serves a newly published artifact, with GitHub Actions release/job history for rollback. This is a web-native release/update strategy. Separate Toolbox worker auto-consumption still must be verified outside site CI.

## CI and deployment sequence
1. npm run test:web: isolated build, deterministic output, two accessible game tabs, JSON schema/coverage/provenance, copied AION app and browser JS parser.
2. npm run build: generate dist/ from GitHub source only.
3. .github/workflows/site.yml checks dist/version.json against GITHUB_SHA and uploads the tested directory.
4. Only on main, GitHub Pages deploys that exact artifact. The standard URL is https://fengie.github.io/Heaven.gg/; changing the domain requires reviewing the exact origin allowlist.
5. The main-only verify-served job must execute **after** successful deployment and independently GET the public version.json, homepage, AION shop, AION character page, AION performance lab/engine, game tools hub and CH catalog, plus the public game registry and Mod Manager release navigation. It checks exact repository/SHA, presence of key controls, and catalog coverage with strict HTTPS origin, finite response limits and bounded CDN-propagation retries. The job emits a scoped served-observation receipt in Actions logs/summary, without treating it as a signature or interactive test.
6. The served verifier includes the AION wardrobe route and module assets, while browser acceptance tests an interactive selection/estimate and mobile viewport against the existing dated catalog.
7. The existing Pages workflow also runs **real Google Chrome** on the built PR artifact and on the exact served production site, via `web/browser-smoke.mjs` and a transient pinned `playwright-core@1.65.0` controller. It tests desktop research and game tabs, catalog filtering, mobile touch navigation, desktop release links, registry identity and mobile overflow; no new browser download or privileged runner access. These checks fail the build/served jobs if interactions regress.
8. A successful provider deployment with failed/skipped remote observation remains PROVIDER_PUBLISHED, not SERVED_OBSERVED. For a complete release check, independently exercise import/export, save/reload and mobile layout with synthetic data in a real browser. GitHub logs and job summaries are retention-limited; register exact run/commit evidence with existing release owner before expiry. If Pages is not enabled, activate GitHub Actions as source in Settings → Pages and retry through the existing approved workflow. Never claim end-user behavior merely because source merged or the Pages API returned success.

## Recovery and security
On failed publication, the old Pages artifact remains authoritative, and workflow reports failure. Restore the previous verified GitHub commit through protected history (prefer revert PR) and redeploy; do not force-push. No untrusted upload or write APIs. User-supplied strings are escaped before display and outgoing Codex source URLs are restricted to HTTPS. No external payment links or automation.

## Coverage limitations
Celtic Heroes: user-authored build samples and historical game record extraction, not exact live meta. AION 2: snapshot October 9, 2026 and incomplete shop coverage, not refreshed automatically. The site never combines incompatible games' economies or labels predictions verified. Store source URLs and dates with observations before expanding.

No scheduled or recurring agent was created. Github-first is mandatory; the former AppDeploy AION preview is not part of this release pipeline.


## AION 2 Character Intelligence: direct and local transport

The existing Pages build publishes the Character Intelligence interface, not a backend. Direct requests to the documented NCSOFT public website endpoints are attempted only after character lookup/selection or relevant refresh; a network/CORS/provider error remains visible. Do not interpret the page serving successfully as proof that NCSOFT allows cross-origin access.

An optional, zero-dependency Node preview serves the same built site on the IPv4 loopback address only:

```sh
npm run build
npm run serve:intelligence
```

Default URL: http://127.0.0.1:8787/aion2/intelligence.html. The read-only broker is disabled by default. An authorized local operator who has confirmed permission for the specific public endpoint use can set the environment variable `HEAVEN_ARMORY_UPSTREAM=allowed` before starting this preview. No account login, provider-cookie forwarding, arbitrary proxy destinations, redirect following, persistent server-side player storage, or automated retries. The handler rejects cross-origin requests and unexpected parameters, limits response size and per-origin request pace, and honors provider denial/backoff. Do not expose it publicly or weaken these restrictions as a CORS workaround. A production broker requires separately authorized hosting, provider permission, abuse/availability controls and exact-deployment verification. No process is installed, launched or deployed by this source change.

The local preview is an alternate transport, not proof of current upstream behavior or a private inventory API. Tests exercise synthetic responses, schema drift, provider failures and same-origin route selection. Actual official profile access, legal current item-roll catalog coverage, private wallet/quest availability, and combat calibration remain separate acceptance gates. Keep the original offline planner available when live lookup cannot be used.


### Portable observations and source boundaries

Character Intelligence accepts a full official HTTPS AION 2 character link containing exactly one region, server ID and character ID. It uses only those identifiers against the fixed armory routes, so a name-search failure does not prevent a direct profile request. It never fetches an arbitrary pasted URL.

The local observation interchange is versioned and bounded: `heaven-gg/aion2-observation-pack/v1` contains a normalized `heaven-gg/aion2-armory/v1` snapshot plus optional `heaven-gg/aion2-wallet-observation/v1` and `heaven-gg/aion2-item-reference/v1` data. The browser can also import those resource/reference records separately for a loaded character. It validates identity, timestamps, list bounds, item/board details, duplicate IDs and source/region metadata before replacing anything. Unknown/unpublished fields remain unavailable. Export includes only supported observation fields, not arbitrary raw provider data or credentials. The last usable observation is locally cached; Forget character clears the intelligence cache. An imported snapshot is explicitly historical and will not initiate a live lookup on reopening. Use the existing Refresh control to attempt an authorized live update. No automatic uploads, account linking or collection schedule.

Item references require a concrete Global region, dataset version, observation timestamp, HTTPS source URL, and exact item ID, item level, grade, slot family and stat ranges. They must come from a source the user has permission to use. Importing a file is not evidence that it is authoritative, patch-compatible, complete or licensed for redistribution. Only supported, unambiguous stat ranges are considered, matching observed item metadata and values; comparisons remain conditional. The dated built-in tier-102 example remains a fallback, not a universal legal catalog. Standalone Global item dictionary availability is still unverified.

Resource observations are bound to the exact character key and original observation time; missing holdings stay unknown, and values expire after 30 minutes. Bound and tradable Kina, the known named materials/currencies, and explicit bound/tradable item IDs are distinct. A file can carry observed resource values but cannot retrieve the private game wallet. Actual in-game balance, inventory, claim and quest synchronization requires a supported permissioned source that has not been established.

Provider availability was independently rechecked on Nov 23: the NCSOFT NA East server roster was readable as JSON through public web retrieval; a synthetic character-search request was inaccessible to that retrieval environment. Neither observation verifies browser CORS, a live selected-character payload, or permission for automated production access. See the official character page, upstream wrapper documentation and the issue #32 research archive. Existing source tests and actual Chrome synthetic-response checks remain separate from live provider/production acceptance.

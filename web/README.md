# Heaven.gg front end

The site has **two game tabs** at one URL. The Celtic Heroes tab searches, filters, sorts, and compares all 327 public Codex build summaries, explores candidate gear with release labels, and reviews historic boss records. The AION 2 tab runs the existing Atreia Atlas as a same-origin iframe to preserve its full shopping UI without rewriting it.

**Build:** npm run build. **Test:** npm run test:web. No dependencies or API keys. Browser output: dist/index.html, dist/aion2/index.html, dist/aion2/profile.html, dist/ch/catalog.json, dist/version.json. All generated content is derived deterministically from tracked GitHub sources; do not hand-edit dist.

Static hosting must support simple relative URLs, and cross-origin iframe embedding is unnecessary because AION is copied to the same deployment. Local browser CH fetch requires an HTTP server; AION itself can also be opened directly.

**Canonical publish:** GitHub Pages workflow (.github/workflows/site.yml). Build on PR, deploy on main; then verify the live served version and routes on main. Exact SHA must be present in version.json. This HTTP proof is not a browser-interaction test. See DEPLOYMENT.md.

This is a research interface, not a validated live-game optimal build recommender.

## Heaven Mod Manager — linked desktop companion

Heaven.gg includes a build-time-rendered Mod Manager entry on the homepage and
[Game Tools](game-tools.html). Both links derive from one
[allowlisted game registry](../data/gaming/game-registry.json), published
as `dist/games.json` for read-only discovery. The MHW game identifier
`monster-hunter-world` matches the built-in Windows GameProfile ID in
`fengie/Heaven-Mod_Manager`. Other research games are **not** asserted to be
supported mod deployment targets.

The Windows download opens the Mod Manager's canonical public
[latest release page](https://github.com/fengie/Heaven-Mod_Manager/releases/latest);
no binary or updater token is mirrored into GitHub Pages. Desktop installation,
mod archives, live-game file modification, Windows verification and rollback
remain solely owned by the desktop repository. The website does not access
local files or download third-party code.

Do not copy the same release URL independently into new HTML pages. Review
the registry, maintain the current origin allowlist, run `npm run test:web`,
and use the post-deploy HTTPS observation before claiming that the new hub
is served. This is a stable public navigation contract, not a remote desktop API.

## Real-browser acceptance

`web/browser-smoke.mjs` controls the preinstalled GitHub-hosted Google Chrome,
using a pinned transient Playwright Core package. The Pages PR gate runs the
headless browser against a loopback server containing the exact built `dist/`
output. Following publication and the existing read-only HTTPS SHA check, the
same smoke checks the production `https://fengie.github.io/Heaven.gg/` site.
Tests cover desktop game tabs, catalog filtering, mobile touch navigation,
the desktop companion download link and the public game registry. Any failure
leaves the PR/deployment gate red; no external profile, OS control, direct
native install or paid browser service is needed. A browser smoke is not a
general accessibility audit or proof that Windows updater E2E succeeded.

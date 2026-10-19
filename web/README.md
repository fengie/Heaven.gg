# Heaven.gg front end

The site has **two game tabs** at one URL. The Celtic Heroes tab searches, filters, sorts, and compares all 327 public Codex build summaries, explores candidate gear with release labels, and reviews historic boss records. The AION 2 tab runs the existing Atreia Atlas as a same-origin iframe to preserve its full shopping UI without rewriting it.

**Build:** npm run build. **Test:** npm run test:web. No dependencies or API keys. Browser output: dist/index.html, dist/aion2/index.html, dist/aion2/profile.html, dist/ch/catalog.json, dist/version.json. All generated content is derived deterministically from tracked GitHub sources; do not hand-edit dist.

Static hosting must support simple relative URLs, and cross-origin iframe embedding is unnecessary because AION is copied to the same deployment. Local browser CH fetch requires an HTTP server; AION itself can also be opened directly.

**Canonical publish:** GitHub Pages workflow (.github/workflows/site.yml). Build on PR, deploy on main; then verify the live served version and routes on main. Exact SHA must be present in version.json. This HTTP proof is not a browser-interaction test. See DEPLOYMENT.md.

This is a research interface, not a validated live-game optimal build recommender.

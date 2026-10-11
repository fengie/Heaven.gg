# Trader pre-release checkpoint — October 11, 2026 (EDT)

Owner: Heaven.gg product. Platform: Heaven Toolbox and native Heaven1 worker.

First delivery boundary: independent shareable webpage for a fixed Celtic Heroes 128 MT + 40 PT negotiated sale, ask $110; transparent calculations; no Discord bot; seller-reviewed persisted offers; database item name search only. No cross-game item price assumptions or invented live market prices.

Security invariants: host-only localhost process on Heaven1; Cloudflare Tunnel public hostname with HTTPS; random seller bearer secret; buyer capability hashes at rest; strict server-authoritative math; origin guard, response headers, zero dependencies; no funds or items transferred; no public seller-key URL.

Non-default alternative rejected: merging into main portal before testing (would couple research site to a new write service). Alternative rejected: running all user-facing operations on Heaven2 (violates personal-use machine isolation). Alternative rejected: implementing a Discord bot (user explicitly said no). Static-only preview also rejected as insufficient for saved buyer offers and seller decisions.

External deployment blocker: current chat has GitHub connector, not a proven live Heaven1/Toolbox Bridge call. GitHub PR cannot verify origin runtime. Honor current Toolbox emergency merge freeze; do not claim release, installed SHA, live URL, or operator acceptance without independent receipts. Merge/release only through protected exact-candidate admission and explicit lift of active hold.

Next:
1. Run exact-head CI, fix failures on the same PR, independently review replay/invalid-origin/access-control tests.
2. Stage via authorized Toolbox release owner; do not bypass incident freeze.
3. Deploy to Heaven1 under a non-admin principal with secrets outside repo; verify process identity, installed SHA and DB restart durability.
4. Configure HTTPS trader subdomain via existing Heaven1 tunnel; negative/positive live e2e.
5. Extend marketplace in a separate owned feature lane with validated item taxonomy, genuine world-specific evidence, multi-user identity and audited bid/auction transactions.

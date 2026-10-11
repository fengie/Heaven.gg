# Trader pre-release checkpoint — October 11, 2026 (EDT)

Owner: Heaven.gg product. Platform: Heaven Toolbox and native Heaven1 worker.

First delivery boundary: independent shareable webpage for a fixed Celtic Heroes 128 MT + 40 PT negotiated sale, ask $110; transparent calculations; no Discord bot; seller-reviewed persisted offers; database item name search only. No cross-game item price assumptions or invented live market prices.

Security invariants: host-only localhost process on Heaven1; Cloudflare Tunnel public hostname with HTTPS; random seller bearer secret; buyer capability hashes at rest; strict server-authoritative math; origin guard, response headers, zero dependencies; no funds or items transferred; no public seller-key URL.

Non-default alternative rejected: merging into main portal before testing (would couple research site to a new write service). Alternative rejected: running all user-facing operations on Heaven2 (violates personal-use machine isolation). Alternative rejected: implementing a Discord bot (user explicitly said no). Static-only preview also rejected as insufficient for saved buyer offers and seller decisions.

External deployment blocker: current chat has GitHub connector, not a proven live Heaven1/Toolbox Bridge call. GitHub PR cannot verify origin runtime. Honor current Toolbox emergency merge freeze; do not claim release, installed SHA, live URL, or operator acceptance without independent receipts. Merge/release only through protected exact-candidate admission and explicit lift of active hold.

## Verified subsequent hardening — October 11, 2026

- Original PR #10 `cf1cf8fa` advanced on **the same branch** to `5772c38b609befd98ecf7b3e2db4cab59132820e`. Main remained `3b0ebb13a06f23943f301fdb2b8e466e07e939e4`; no merge or other product PR was initiated.
- **Exact-head GitHub evidence:** 5/5 checks SUCCESS; Linux Node 22 7/7, GitHub-hosted Windows Node 22 7/7, enforce 1/1 and general tests 2/2. Hosted Windows runner is not physical Heaven1.
- Fixed Cloudflare loopback all-buyers-shared-rate-limit defect with opt-in trusted `CF-Connecting-IP` per-IP bucket + global cap; improved origin validation; state mutation now relooks up/authenticates current record inside the serialized write queue; conflicting terminal actions negative-tested.
- UI restores saved server-authoritative sliders, permits a public summary copied to Discord without leaking the buyer capability, and no longer displays invalid seller actions on pending counteroffers.
- Added credential-free `apps/trader/tests/live-smoke.mjs` for nonmutating checks on the real HTTPS origin, separate from host attestation.
- **DEFERRED-TO-LIVE:** there is no exposed working Heaven1 Bridge/toolbox MCP command in this normal Chat session. Toolbox #822 has no proven signed Chat→Heaven1 receipt, hosting #866 is not verified installed, and freeze #849 holds merges/releases. Do not replay blind commands, create new controller/signer, release a held PR, or claim the public URL is active. An authorized existing Toolbox owner must resume from the same exact head and acquire host/service/Cloudflare+independent file hash receipts before deployment acceptance.

## Remaining owner-specific sequence

1. Check fresh latest PR #10 head and five GitHub checks (metadata edits can trigger additional runs); resolve failures on the **same branch**, no duplicate PR.
2. Obtain authorized Toolbox exact-candidate/signed release gate and explicit #849 freeze lift; **no** exception for green code.
3. Through existing #822/#866 owner paths, run real native Heaven1 tests, provision non-admin service/secret/data dir, validate canonical installed SHA and file hashes; expose only via outbound Cloudflare Tunnel on Heaven1.
4. Run nonmutating origin smoke plus safe positive buyer/seller/counter flow on staging, restart persistence, negative authorization/CSRF cases and rollback, with signed target-side receipt. Only then publicize.
5. Keep issue #11 as the marketplace/auction source-of-truth roadmap, using provenance-backed catalog and real authenticated traders.

Previous plan snapshot:
1. Run exact-head CI, fix failures on the same PR, independently review replay/invalid-origin/access-control tests.
2. Stage via authorized Toolbox release owner; do not bypass incident freeze.
3. Deploy to Heaven1 under a non-admin principal with secrets outside repo; verify process identity, installed SHA and DB restart durability.
4. Configure HTTPS trader subdomain via existing Heaven1 tunnel; negative/positive live e2e.
5. Extend marketplace in a separate owned feature lane with validated item taxonomy, genuine world-specific evidence, multi-user identity and audited bid/auction transactions.

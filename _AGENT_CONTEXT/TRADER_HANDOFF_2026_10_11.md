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

## Continuation checkpoint — October 11, 2026, signed execution still DEFERRED-TO-LIVE

- Maintained ONLY existing PR #10 and roadmap #11. Latest source after this checkpoint must be freshly read back from PR head (do not trust historical SHAs). Heaven.gg main at last read `3b0ebb13a06f23943f301fdb2b8e466e07e939e4`, no merge or deployment.
- Extended integration suite with `apps/trader/tests/restart.test.mjs`: starts a real Node HTTP process, submits a buyer deal, kills/restarts service, seller counters, kills/restarts, buyer accepts, kills/restarts, verifies persisted accepted price, unauthorized list denial, cross-origin denial, hashed buyer key at rest. The separate `release-preflight.test.mjs` ensures missing release authorization fails closed.
- **Verified at executable head `4b7a7a4173e000760565eca5902dd16f2836c55e`:** all 5 GitHub check runs SUCCESS; hosted Linux Node 22 **9/9 tests**, hosted Windows Node 22 **9/9 tests**. Documentation commits afterward require fresh exact-head CI; never reuse stale green.
- Created `apps/trader/tools/release-preflight.mjs`: read-only exact 40-hex admitted SHA comparison to `git HEAD`, physical machine hostname `heaven` only, exact HTTPS origin, clean tracked product/catalog and SHA256 comparison of committed versus on-disk bytes. Output `SOURCE_BYTES_MATCH_PRECHECK_ONLY_NOT_RELEASE_APPROVED` is NOT signed admission, PID service proof, or public HTTPS verification. Physical execution is pending.
- `apps/trader/README.md` now separates the public Cloudflare Tunnel website route from Toolbox #866's private MCP tunnel and records explicit real-host acceptance evidence. The shell smoke examples and test commands were corrected.
- Live Toolbox refresh: #874 head last observed `7d6a41b94cce797b65b054af1884afea2669aa84` has new #882 Heaven1-only placement guards, but no proof of deployed controller cutover. #849 still freezes source integration. A prior approval-free relay request `chatgpt-pr874-bridge-health-20261011-0829` was checked at canonical `heaven-bridge` branch for status/receipt/rejection/result without finding terminal records. No replay/new request created. Historical successful signed physical `ci822-python-7aae57242-20261011-v2.json` was visible, but does NOT demonstrate a Trader deploy or current normal-Chat dispatch.
- Existing-owner coordination posted at Toolbox #822 comment 6110232675 and Heaven.gg #11 comment 6110235381. No new agents, parallel ownership claims, branches or signers.
- Remaining blockers: existing protected signer/Heaven1 authority and migration (#822/#874/#882/#863), signed exact-candidate merge admission and explicit #849 release, authorized physical non-admin Heaven1 installation, Cloudflare DNS/tunnel service route, on-host installed file/service hash and runtime PID receipts, independent external HTTPS and two-client positive/negative tests plus post-restart rollback proof.
- No accessible Heaven1 native Bridge function in this Chat toolset. Continue safe source repairs on same PR or stop at `DEFERRED-TO-LIVE`, NEVER bypass freeze or claim production from GitHub CI, physical CI for another feature, preflight JSON, or a healthy cloudflared connection alone.

# Heaven.gg Trader — standalone token negotiator (pre-release)

**Product home:** fengie/Heaven.gg, `apps/trader/`.
**Platform/worker:** Heaven Toolbox on Heaven1, not an independent source-of-truth repository.
**Scope:** one fixed Celtic Heroes listing: **128 Mount Tokens + 40 Pet Tokens, seller asks $110**.
This is an **offer-making and review prototype**, not escrow, marketplace execution, or a payment service. It does not verify ownership, world, live item tradability, fraud, or settlement.

## Buyer experience

Open the trader site from a Discord link, adjust pet value (40–45k in 0.5k increments), mount value (80–85k in 0.5k increments), and USD per million ($7–8 in $0.25 increments), then choose a $50–$200 cash offer. The UI **always** shows:

```text
Pet gold      = 40 × PetValueInThousands × 1000
Mount gold    = 128 × MountValueInThousands × 1000
Total gold    = Pet gold + Mount gold
USD estimate  = (Total gold / 1,000,000) × Chosen USD per million
Difference    = Buyer offer − USD estimate
Implied rate  = Buyer offer / (Total gold / 1,000,000)
```

Server independently validates integer scale values and recomputes totals (not trusting browser JS).
A buyer can copy a **public offer summary** to DM on Discord without granting anyone control of their deal. A buyer submitting an offer also receives a secret capability **link in the URL fragment**, so the secret is not sent as a normal URL query or referrer. **The link is private:** anyone possessing it can view the offer and accept/decline a seller counter. Buyer should save/share it carefully; do not publish it in public Discord channels.

The seller enters their private secret locally in the Seller Console, can view all incoming offers and accept/reject/counter. Seller acceptance of an unmodified buyer offer finalizes the decision; a seller counter **requires the buyer to explicitly accept** before the UI says accepted. A status is an online proposal agreement only, **not proof of in-game delivery or payment**.

## Heaven1 start (not yet deployed or runtime-verified)

Requires Node.js 22+; zero third-party runtime packages. Keep this product in `Heaven.gg`; use Toolbox's signed, exact-SHA release/admission pipeline and Heaven1 native execution receipt prior to activating a public service.

1. Obtain accepted/released commit of `fengie/Heaven.gg` through Toolbox's protected update channel. **Do not deploy a held PR or bypass Toolbox merge freeze.**
2. On Heaven1, provision a **separate private data directory** outside the Git checkout, backed up regularly and readable only by the service identity.
3. Provision a random 32+ byte `TRADER_SELLER_KEY` on Heaven1 in a secured secret store, never in source, issue comments, browser URL, or a public service command. Keep it away from Heaven2's routine UI.
4. Launch under the minimal worker identity with `TRADER_PORT=8787`, `TRADER_DATA_PATH=<absolute private offers.json path>`, `TRADER_PUBLIC_ORIGIN=https://trader.heaven.gg`, then run `node <absolute verified checkout path>/apps/trader/server.mjs` (pass a true absolute script path, not a relative one). Listen address is deliberately **127.0.0.1 only**.
5. In the existing Cloudflare Tunnel **on Heaven1**, add a public hostname (e.g. `trader.heaven.gg`) forwarding to `http://127.0.0.1:8787`. No inbound router port forwarding. Make sure the tunnel actually lives on Heaven1, not Heaven2. Restrict operator endpoints at the edge if a suitable private path policy can coexist with buyer access.
6. Add bounded Cloudflare WAF/rate limits for public `POST /api/offers` and monitor 429/5xx. For a verified localhost cloudflared-only ingress, set `TRADER_TRUST_CF_CONNECTING_IP=1` so valid `CF-Connecting-IP` addresses receive separate five/minute visitor buckets; the app also keeps an aggregate 100/minute cap. **Only enable after confirming the service cannot be reached except through trusted cloudflared on loopback** (the local host is still a privileged trust boundary). Without this flag, forwarded headers are ignored. If ingress changes, disable this setting and review proxy trust before re-enabling.
7. Verify live HTTPS route, valid Origin checks, non-seller inability to read offers, seller key acceptance, buyer submission/counter acceptance, state serialization under simultaneous actions, Cloudflare per-visitor quota with distinct external clients, and persistence across a **controlled restart**. `/healthz` contains an **operator-claimed** `TRADER_RELEASE_SHA`; it does **not** attest its own installed code. Independently record the Heaven1 process identity, executable path, on-disk file hashes, admitted release SHA, and protected runtime evidence before claiming the release.
8. Only then advertise a buyer-facing link. A healthy tunnel or a GitHub PR alone is not runtime proof.

`TRADER_PUBLIC_ORIGIN` must exactly match the browser's origin (scheme + host + optional port); the default is `http://127.0.0.1:8787` for local development. For a local private test, use a local seller key, e.g. a secure random 32-byte string exported by the trusted environment, and run `node apps/trader/server.mjs`. Never use the sample testing key in production.

## Heaven1 release evidence checklist — NOT YET EXECUTED

Toolbox #822 / #874 is the signed execution/CI lane; #849 is the merge freeze authority; #882 makes the future host locality Heaven1-only. The #866 OpenAI/MCP private tunnel does NOT configure the distinct public Cloudflare Tunnel website route. Reuse the already authorized owners, not a new signer, deployment lane, or privileged GitHub Action.

After the freeze is explicitly released and a signed exact-candidate Toolbox admission exists, the trusted Heaven1 owner can perform this READ-ONLY source check using the admitted revision. It fails on Heaven2 and cannot issue deployment approval or secrets:

~~~powershell
$env:TRADER_EXPECT_RELEASE_SHA = '<exact approved 40-character commit>'
$env:TRADER_PUBLIC_ORIGIN = 'https://trader.heaven.gg'
node apps/trader/tools/release-preflight.mjs
~~~

After an authorized owner starts Trader using an **absolute path** to the admitted checkout's `apps/trader/server.mjs` under a restricted non-admin account, obtain its actual PID from the approved service manager and run this separate read-only observation on **physical Windows Heaven1**:

~~~powershell
./apps/trader/tools/Verify-Heaven1TraderRuntime.ps1 -ExpectedCommit $env:TRADER_EXPECT_RELEASE_SHA -ExpectedPid <verified-numeric-service-PID> -Port 8787
~~~

It fails closed off Heaven1, on wrong commit/PID, if the process command line does not name the expected absolute entrypoint, if ownership is unreadable/SYSTEM, or if the listener is not exclusively `127.0.0.1:8787` under the same PID. It emits `UNSIGNED_RUNTIME_OBSERVATION_ONLY`, **not** a signed receipt or evidence that the user-facing HTTPS route works. Independently compare the admitted full-tree hashes, protect seller credentials/data ACLs, collect runtime signer evidence via Toolbox #822, and test external TLS through Cloudflare. A relative `node apps/trader/server.mjs` launch will not satisfy the observer because it cannot reliably bind the observed process to a checked-out entrypoint path.

Required separate receipts:
- Provenance: signed approval and lease, physical Heaven1 identity, admitted commit SHA, clean checkout and independently read-back file digests.
- Runtime: non-admin service identity; installed executable/Node and application paths; process PID and listening port 127.0.0.1:8787; secret and offer directory ACLs outside source; captured source-to-service linkage.
- Cloudflare: outbound cloudflared on physical Heaven1, managed under existing owner/credentials; hostname route trader.heaven.gg to http://127.0.0.1:8787; default unmatched route to 404; verify DNS, WAF, and outside-browser HTTPS. A healthy cloudflared control connection alone does NOT prove the origin route works.
- Negative tests: anonymous seller-list denial, invalid/cross-origin mutation, invalid capability, spoofed-header handling, body limits, persistence and restart/rollback. Capture status codes without credentials in logs.
- Positive tests: two independent real browser clients, submit a staging proposal, seller explicitly counters, buyer explicitly accepts, final math and status survive physical service restart; confirm the seller can view the offer. Prototype does NOT push automatic seller notifications.
- Truth: post-restart independent signed installed SHA/source hash and service/HTTPS receipts, not a self-claimed /healthz value. Public announcement only after every acceptance step succeeds.

Upstream references: [Cloudflare Tunnel routing](https://developers.cloudflare.com/tunnel/concepts/routing/), [Windows tunnel service](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/windows/), [troubleshooting misleading healthy tunnels](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/). Store sensitive tunnel and seller credentials solely in protected machine-side configuration, never in source or CI.

## Architecture and expansion

- `server.mjs`: strict validation, **single-process** atomic JSON file persistence for the tiny initial demo, hashed buyer capabilities, seller bearer secret, origin checks, CSP, body limits and seller/buyer state transitions. Only loopback listener.
- `index.html`, `app.js`, `style.css`: standalone responsive, client-side transparent presentation. No Discord bot; Discord carries a normal web link.
- `GET /api/catalog?q=...`: **read-only search** over existing checked-in `data/game/item_names.tsv` (23k+ historical entries). This is not a live market scraper or a price feed; release/tradability must be independently checked.
- Current storage is intentionally not a scalable multi-worker database. For the actual marketplace/auction system, introduce authenticated users, migration-controlled SQLite/PostgreSQL, listing/inventory entities, bid histories and idempotent transactions, moderation/reporting, audit events, consent and privacy/retention policies, anti-spam, server/world and item provenance, dispute/fraud processes and strict authorization tests.
- **No external marketplace scraping without source permission.** Data already sourced in `ch_tables` and `data/game` should be normalized and labeled, with any observed listings distinct from completed sales. Scraping alone cannot prove price or availability.
- No item exchange/payment processing, escrow, or private account login in this initial release.

## Build and tests

```sh
node --test apps/trader/tests/trader.test.mjs apps/trader/tests/restart.test.mjs apps/trader/tests/release-preflight.test.mjs
node --check apps/trader/server.mjs
node --check apps/trader/app.js
```

CI runs Node 22 tests on Linux **and a GitHub-hosted Windows runner** via `.github/workflows/trader.yml`. Windows hosted CI checks portability and exercises a **real child-process stop/start** over an isolated offer store (submission → counter → acceptance → persistence), **not native Heaven1 acceptance**. The release preflight script must never be treated as deployment authority.

A separate, no-credential, read-only HTTPS smoke script exercises the *real* public origin (one deliberately rejected cross-origin request is sent; no real offer is submitted):

```sh
TRADER_SMOKE_BASE_URL=https://trader.heaven.gg \
TRADER_EXPECT_RELEASE_SHA=<40-character-approved-commit-sha> \
node apps/trader/tests/live-smoke.mjs
```

Run the equivalent environment assignment using PowerShell when invoking on Heaven1. The smoke script explicitly marks its version as an **operator claim**, not runtime attestation. The authorized Toolbox owner must separately sign an exact-candidate release, observe physical Heaven1 PID/service identity, installed SHA and file hashes, Cloudflare ingress, restart persistence and rollback, plus successful positive end-to-end buyer/seller negotiation in an isolated staging deal before making the production link public. Never put the seller key in logs, screenshots, release comments or CI.

Toolbox release and host acceptance are **independent of green CI**. No recurring agent, autonomous market scraper, or live release is installed by this PR.

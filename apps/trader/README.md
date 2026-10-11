# Heaven.gg Trader — standalone token negotiator (pre-release)

**Product home:** fengie/Heaven.gg, \`apps/trader/\`.
**Platform/worker:** Heaven Toolbox on Heaven1, not an independent source-of-truth repository.
**Scope:** one fixed Celtic Heroes listing: **128 Mount Tokens + 40 Pet Tokens, seller asks $110**.
This is an **offer-making and review prototype**, not escrow, marketplace execution, or a payment service. It does not verify ownership, world, live item tradability, fraud, or settlement.

## Buyer experience

Open the trader site from a Discord link, adjust pet value (40–45k in 0.5k increments), mount value (80–85k in 0.5k increments), and USD per million ($7–8 in $0.25 increments), then choose a $50–$200 cash offer. The UI **always** shows:

\`\`\`text
Pet gold      = 40 × PetValueInThousands × 1000
Mount gold    = 128 × MountValueInThousands × 1000
Total gold    = Pet gold + Mount gold
USD estimate  = (Total gold / 1,000,000) × Chosen USD per million
Difference    = Buyer offer − USD estimate
Implied rate  = Buyer offer / (Total gold / 1,000,000)
\`\`\`

Server independently validates integer scale values and recomputes totals (not trusting browser JS).
A buyer submitting an offer receives a secret capability **link in the URL fragment**, so the secret is not sent as a normal URL query or referrer. **The link is private:** anyone possessing it can view the offer and accept/decline a seller counter. Buyer should save/share it carefully; do not publish it in public Discord channels.

The seller enters their private secret locally in the Seller Console, can view all incoming offers and accept/reject/counter. Seller acceptance of an unmodified buyer offer finalizes the decision; a seller counter **requires the buyer to explicitly accept** before the UI says accepted. A status is an online proposal agreement only, **not proof of in-game delivery or payment**.

## Heaven1 start (not yet deployed or runtime-verified)

Requires Node.js 22+; zero third-party runtime packages. Keep this product in \`Heaven.gg\`; use Toolbox's signed, exact-SHA release/admission pipeline and Heaven1 native execution receipt prior to activating a public service.

1. Obtain accepted/released commit of \`fengie/Heaven.gg\` through Toolbox's protected update channel. **Do not deploy a held PR or bypass Toolbox merge freeze.**
2. On Heaven1, provision a **separate private data directory** outside the Git checkout, backed up regularly and readable only by the service identity.
3. Provision a random 32+ byte \`TRADER_SELLER_KEY\` on Heaven1 in a secured secret store, never in source, issue comments, browser URL, or a public service command. Keep it away from Heaven2's routine UI.
4. Launch under the minimal worker identity with \`TRADER_PORT=8787\`, \`TRADER_DATA_PATH=<absolute private offers.json path>\`, \`TRADER_PUBLIC_ORIGIN=https://trader.heaven.gg\`, then \`node apps/trader/server.mjs\`. Listen address is deliberately **127.0.0.1 only**.
5. In the existing Cloudflare Tunnel **on Heaven1**, add a public hostname (e.g. \`trader.heaven.gg\`) forwarding to \`http://127.0.0.1:8787\`. No inbound router port forwarding. Make sure the tunnel actually lives on Heaven1, not Heaven2. Restrict operator endpoints at the edge if a suitable private path policy can coexist with buyer access.
6. Add bounded Cloudflare WAF/rate limits for public \`POST /api/offers\` and monitor 429/5xx. The app also limits offers to five/minute per observed socket, which is conservative when cloudflared shares one local origin IP.
7. Verify live HTTPS route, valid Origin checks, non-seller inability to read offers, seller key acceptance, buyer submission/counter acceptance, journal persistence across a **controlled restart**, and exact deployed release SHA from \`/healthz\`.
8. Only then advertise a buyer-facing link. A healthy tunnel or a GitHub PR alone is not runtime proof.

\`TRADER_PUBLIC_ORIGIN\` must exactly match the browser's origin (scheme + host + optional port); the default is \`http://127.0.0.1:8787\` for local development. For a local private test, use a local seller key, e.g. a secure random 32-byte string exported by the trusted environment, and run \`node apps/trader/server.mjs\`. Never use the sample testing key in production.

## Architecture and expansion

- \`server.mjs\`: strict validation, **single-process** atomic JSON file persistence for the tiny initial demo, hashed buyer capabilities, seller bearer secret, origin checks, CSP, body limits and seller/buyer state transitions. Only loopback listener.
- \`index.html\`, \`app.js\`, \`style.css\`: standalone responsive, client-side transparent presentation. No Discord bot; Discord carries a normal web link.
- \`GET /api/catalog?q=...\`: **read-only search** over existing checked-in \`data/game/item_names.tsv\` (23k+ historical entries). This is not a live market scraper or a price feed; release/tradability must be independently checked.
- Current storage is intentionally not a scalable multi-worker database. For the actual marketplace/auction system, introduce authenticated users, migration-controlled SQLite/PostgreSQL, listing/inventory entities, bid histories and idempotent transactions, moderation/reporting, audit events, consent and privacy/retention policies, anti-spam, server/world and item provenance, dispute/fraud processes and strict authorization tests.
- **No external marketplace scraping without source permission.** Data already sourced in \`ch_tables\` and \`data/game\` should be normalized and labeled, with any observed listings distinct from completed sales. Scraping alone cannot prove price or availability.
- No item exchange/payment processing, escrow, or private account login in this initial release.

## Build and tests

\`\`\`sh
node --test apps/trader/tests/trader.test.mjs
node --check apps/trader/server.mjs
node --check apps/trader/app.js
\`\`\`

CI runs these on PRs via \`.github/workflows/trader.yml\`. Toolbox release and host acceptance are **independent of green CI**. No recurring agent, autonomous market scraper, or live release is installed by this PR.

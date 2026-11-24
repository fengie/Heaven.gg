# AION 2 hosted armory connectivity pilot

Scope: issue #32. This branch proves a minimal deployable function boundary before a production character-data adapter. No UI redirect, character query, HAR upload, public proxy, automatic upstream request, credential forwarding, or new paid service.

## Deployment
- Import the existing `fengie/Heaven.gg` repository into the owner's existing **Free** Netlify team, granting access only to this repository. The root `netlify.toml` supplies the existing static build and the separate function directory. No new repository, tunnel, secret in Git, or custom domain.
- Prefer a deploy preview of this exact tested candidate; do not merge around the protected branch checks. Verify actual deployed revision and the function route.
- GET `/api/aion2/armory-probe` must return JSON with schema `heaven.gg/armory-probe/v1`, code `function-ready`, and `upstreamEnabled:false`. This establishes deployed function reachability only.

## Single permitted upstream probe
Default disabled. Public health does not call NCSOFT. Before enabling, independently establish provider permission for server-side retrieval. If permission cannot be established, leave disabled; pursue approved provider access. A third-party proxy, official browser success or prior 403 does not establish permission.

After documented authorization, scope `AION2_ARMORY_PROBE_ENABLED=true` and `AION2_ARMORY_PROBE_TOKEN` to Functions on the intended deploy only. Token must be a strong randomly generated 32–128-character base64url value; keep it in the provider secret store, never source, logs, screenshots, browser JS or chat. Redeploy after configuration changes. Make **one** empty POST to the same endpoint with Authorization: Bearer <secret>. No query parameters, no body, no cookies or credentials sent upstream.

The probe uses the existing fixed-route validator and bounded JSON reader, and the same server-directory schema validator as the armory client. It makes one ordinary read of the public Global NA East server directory; returns status and validated row count only, not raw data or character identities. An authenticated repeat is refused within a warm instance, but a serverless instance latch is not a global quota. Netlify per-domain-and-IP edge pacing is a supplemental guard, not a hard global rate cap. No automated callers, retries or alternate hosts. Disable immediately after the single probe (including failure); redeploy and check health shows disabled. On 401/403, stop, do not retry via another host or spoof origin. On other failures, record exact result and diagnose before any authorized future attempt.

## Acceptance
1. Native Node and website checks pass on exact head; Netlify deploy and GET health independently verified.
2. Only with permission: one actual POST returns code `provider-ok`, upstreamStatus 200, a nonempty validated directory count. Record status and exact deploy revision without token or raw response.
3. Disable probe and verify disabled health. A successful directory read does not prove search, profile, equipment, item or board access. Prove each required route with permission before exposing any public character-data adapter, including bounded shared quotas/caching, CORS for the exact Pages origin, and real-user browser acceptance.

Tests: `node --test web/tests/aion-netlify-probe.test.mjs`; full repository gate: `npm run check:web`. Fixture responses do not establish live provider access.

Sources: https://docs.netlify.com/build/functions/api/ ; https://docs.netlify.com/build/configure-builds/file-based-configuration/ ; https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/ . Related Toolbox connection-first lesson #1568. Existing local recovery PR #35 remains separate.

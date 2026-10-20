# Heaven.gg — combined game intelligence hub

**Canonical repository:** https://github.com/fengie/Heaven.gg. Two game-specific research environments, a shared game tools hub, and one source-verified GitHub Pages frontend. Windows game scripts remain manual and subject to native fixture/installed-host acceptance.

| Game | Research source | Browser view |
| --- | --- | --- |
| **Celtic Heroes** | Original ch_tables/, data/, docs/, tests/ | Build explorer (327 public samples), equipment and historical boss intelligence |
| **AION 2** | apps/aion2-value-atlas/ and its own tests/data | Atreia Atlas shop/Mileage, personal progression and offline FPS/Frame Generation lab |
| **Windows game tools** | tools/windows-game-utils/ and provenance manifest | Manually reviewed launcher, cache and shortcut sources (not automatically installed) |

## Run and ship

- npm run test:web exercises every browser engine regression (site, AION profile, FG calculator and parent source-blob parity). It does **not** replace actual browser interaction checks.
- npm run build creates deterministic dist/ from tracked files, including a byte-identical copy of the AION browser app.
- The Heaven.gg Website workflow (.github/workflows/site.yml) validates PRs, then on verified main publishes an atomic GitHub Pages artifact. It does not deploy from a chat copy, separate AppDeploy instance, or unreviewed web edits.
- GitHub Pages URL after **successful** publication: https://fengie.github.io/Heaven.gg/. The URL is not evidence of live availability until a Pages deployment and browser check pass.
- GitHub Pages may require the repo Settings → Pages → Build and deployment → GitHub Actions selection; a 404 or deployment 404 must be recorded and repaired rather than claiming live service.

## Invariants

- Celtic Heroes CLI, datasets and unit tests remain in place. The browser reader exposes public saved-build calculator values, not calibrated or measured live DPS. Boss figures are historical and released gear claims require evidence.
- AION 2 shop data is a dated, limited October 9 Global snapshot. Do not infer extra Mileage on Quna spending or guaranteed future prices; user values skins, collecting and long-term play above meta.
- No proprietary game art bundled. No login, paid purchases or scheduled agents.
- .heaven/update-policy.json follows this renamed repository exactly. See web/DEPLOYMENT.md for release controls.

## Parent → child implementation pilot (2026-10-19)

[Game tools hub](web/game-tools.html) · [AION frame generation lab](apps/aion2-value-atlas/performance.html) · [Game SSD storage decisions](docs/GAME_STORAGE_GUIDE.md) · [Toolbox source and problem ledger](docs/TOOLBOX_GAME_TRANSFER_2026_10_19.md) · [Machine-readable script blob parity](data/research/toolbox-game-transfer-2026-10-19.json).

The private Toolbox remains the owner of generic host controls and protected installation. MHW mod-manager stays its own product. Script copying by GitHub connector is not proof of automatic parent→child synchronization, installed game utilities, or verified AION input latency.

## Research strategy (2026-10-09)

[Prydwen/KQM/Fribbels/poe.ninja/Paimon competitor audit](_AGENT_CONTEXT/RESEARCH_FINDINGS/records/2026/10/2026-10-09-competitor-product-b500f55604b9.md) · [Scientific multiobjective, validation and provenance review](_AGENT_CONTEXT/RESEARCH_FINDINGS/records/2026/10/2026-10-09-science-multicriteria-1f9c1c451eea.md). These are dated design findings, **not** deployed features or proof of better performance. Existing CH optimization ADR and AION source ledger remain authoritative on their specific facts.

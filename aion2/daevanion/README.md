# Aion 2 Daevanion — corrected screenshot reconstruction

**Local candidate only. No GitHub commit or optimal game route is claimed.**

The originals are byte-identical to the five supplied conversation uploads. The old Step 6 archive was audited, not trusted as ground truth. It forced all inputs to 11×11, so its 605-cell total was wrong. The corrected total is **757 positions, 537 visible nodes, 220 absent positions**.

| Board label transcribed from selected tab | Grid | Visible nodes including start | Non-start nodes | Start (row,column) |
|---|---:|---:|---:|---|
| Nezekan | 11×11 | 89 | 88 | 6,6 |
| Zikel | 11×11 | 89 | 88 | 6,6 |
| Vaizel | 11×11 | 89 | 88 | 6,6 |
| Triniel | 13×13 | 117 | 116 | 7,7 |
| Azphel | 15×15 | 153 | 152 | 8,8 |

## What is verified locally

Every grid coordinate was visually transcribed from labelled enlarged tile crops. A separate pixel-feature implementation checked occupancy, symbol color and gold-lit treatment. The classifier was calibrated on the smaller three boards; the larger two were held out from threshold selection. Baseline labels agree on all 757 positions.

Twenty distinct parameter combinations per image perturb crop offsets/radii, brightness scaling and thresholds. All 100 sensitivity runs agree with the final transcriptions. This is NOT 100 independent observers or a 100% probability of correctness. The same images and assistant are involved; no independent human audit is claimed. The full per-cell features, trial labels and limitations are preserved.

The prior audit recorded matching non-start denominators on selected official character pages. That observation is historical and was not freshly reproduced from the same regional page in this delivery run. It corroborates neither every coordinate nor acquisition costs; do not mix regional layouts. See `research/mechanics-evidence.md`.

## Data and drafts

`originals/` holds unchanged source files. `enhanced/` holds strong brightness/contrast review copies; clipped highlights in these copies never replace raw pixels. `row-crops/` contains 61 enlarged row strips. `transcriptions/` keeps visual pass A and pixel pass B separate. `graphs/` holds deterministic JSON, one-based coordinates, visual class, basic symbol, observed lighting, unknown semantic acquisition state, and per-cell uncertainty.

`drafts/` contains ASCII, independently drawn PNG and SVG node maps. Optional `*-geometric-candidates.png` diagrams show only orthogonal proximity hypotheses, not verified game connections. `overlays/` shows source-aligned coordinates.

Gold is separated from symbol identity: a blue or green node can also have gold-lit UI treatment. The field `acquisition_state` remains `unknown`; visual brightness alone is not treated as proof that a node was purchased.

Triniel's bottom tile borders are slightly clipped by the supplied screenshot; the central glyphs remain visible. This limitation is recorded per affected cell.

## Intentionally unresolved

`verified_edges` is empty and all acquisition costs are null. Geometric neighbor candidates are segregated from game edges, with `weight: null`. The visible Azphel UI total of 232 is not a per-node price table. The truncated price at the right of Triniel is not evidence that every node costs 1. No game-route optimum, reward value, target build or remaining budget is invented.

Dijkstra is ready for a verified single-target nonnegative cost model. Multi-target purchases with shared nodes and budget-constrained reward optimization require separate objectives. The reusable algorithms and synthetic tests live only in the sibling Toolbox package.

## Rebuild and test

Keep the two candidate repository roots as siblings, or pass the Toolbox algorithm directory explicitly:

```sh
python aion2/daevanion/tools/verify_pixels.py ../heaven-toolbox/tools/graph-reconstruction
python aion2/daevanion/tools/build_outputs.py ../heaven-toolbox/tools/graph-reconstruction
python -m unittest discover -s aion2/daevanion/tests -v
```

Pillow and NumPy are required for image processing. Checkpoint environment versions are recorded at the archive root. Core graph algorithms use only the standard library. Run source/manifest checks before trusting resumed artifacts. No font files are included.

## Next acceptance boundary

Acquire version-matched evidence of allowed unlock adjacency, per-node costs, the intended target(s), current purchased nodes and resource budget. Then populate and validate the rules/weights rather than treating proximity as a mechanic. Refresh live owner, STOP/freeze and exact heads before any repository effect. Reuse the existing task/branch; no new branch, PR, agent or merge was created in this audit.


## Delivered observation report and final audit

Open `REPORT.html` for a self-contained, script-free five-board report with embedded maps, expandable ASCII coordinates and exact graph JSON. It does not require a server or network resources. Browser layout/navigation checks used local Chromium at desktop and mobile widths; Safari/iOS preview and native download handling are not verified. The archive's JSON files are available directly when a previewer blocks data-link downloads.

The actual builder previously ignored reconciliation evidence while exporting constant agreement and trial counts. The final exporter now derives each claim from the records, verifies exact input bytes, validates all boards before output generation, and stages generation before publication. It preserves true sensitivity dissent and refuses contradictory summaries. Staging prevents validation/render failures from publishing partial output; replacing the whole output set is not a transaction. Run the manifest verifier after delivery or interruption.

Final native results: **42 game-specific tests + 83 sibling Toolbox tests = 125 passed**. These include real production builds with seven trials instead of twenty, corrupt evidence, source changes during parsing/rendering, stable repeated rebuilds, and exact embedded report-data checks. No optimal game path or current-patch compatibility is claimed.

Rebuild the report after regenerating graph outputs:

```sh
python aion2/daevanion/tools/build_outputs.py --check
python aion2/daevanion/tools/build_outputs.py
python aion2/daevanion/tools/build_report.py
```

The implementation is not written to GitHub. The local package is an inspectable deliverable, not the original repository-delivery requirement being satisfied. Repository admission remains external to these tests.


## Current improvement build — 2026-10-13

The observations and original bytes are unchanged. Current domain coverage is 58 tests. Generation now binds 19 input files, producer source/runtime/font identities and 31 generated files; evidence/generation-receipt.json is written last. The report reads exactly those bound PNG/ASCII/JSON bytes, validates cell semantics, and checks for changes before replacing REPORT.html. A partial multi-file replacement is rejected, not silently accepted as a complete generation. Digests are integrity evidence only.

To avoid repeating unchanged work:

```sh
python -B aion2/daevanion/tools/build_outputs.py --reuse-verified
python -B aion2/daevanion/tools/build_report.py
```

The first command skips rendering only after evidence, input, producer and output checks pass. Two measured full renders and three checked reuse samples gave median 8.114s versus 0.339s (23.9x) on this local environment; this small measurement is indicative, not a confidence interval or device guarantee. See evidence/cache-benchmark.json. The receipt includes environment identities; regenerating on a different renderer/font environment intentionally invalidates reuse. No font files are supplied.

Chrome rendering was checked with the exact HTML injected into a blank page at desktop/mobile widths. This environment blocked direct file-URL navigation; native file opening and iOS Safari are not claimed tested.

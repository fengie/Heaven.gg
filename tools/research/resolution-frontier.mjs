/**
 * Research-only, no device access: 16:10 display/resolution arithmetic and
 * measured-only Pareto filtering. This is NOT a GPU benchmark or quality model.
 * See docs/research/resolution-frontier-2026-11-02.md for assumptions/sources.
 */
export const PANEL_1600P = Object.freeze({ width: 2560, height: 1600, refreshHz: 240 });

export const RENDER_CHOICES = Object.freeze([
  [1600, 1000], [1792, 1120], [1920, 1200], [2048, 1280],
  [2176, 1360], [2240, 1400], [2304, 1440], [2560, 1600]
].map(([width, height]) => Object.freeze({ width, height })));

// Model names describe processing families, not cross-vendor compute rankings.
// "Unmeasured" fields must stay null until source-matched benchmarks are supplied.
export const SCALER_FAMILIES = Object.freeze([
  ['off', 'No external spatial scaler', 'native'],
  ['ls1', 'LS1', 'external-spatial-machine-learning'],
  ['fsr1', 'FSR spatial', 'external-spatial'],
  ['nis', 'NIS', 'external-spatial'],
  ['sgsr', 'SGSR', 'external-spatial'],
  ['bcas', 'BCAS', 'external-spatial'],
  ['anime4k', 'Anime4K', 'content-specific-spatial'],
  ['xbr', 'xBR', 'pixel-art-spatial'],
  ['dlss-sr', 'DLSS Super Resolution', 'game-integrated-temporal-machine-learning']
].map(([id, name, family]) => Object.freeze({
  id, name, family, measuredGpuMs: null, measuredQuality: null
})));

export const RESHADE_PASSES = Object.freeze([
  ['vibrance-curves', 'Color grading (Vibrance/Curves)'],
  ['sharpen', 'CAS or other sharpening'],
  ['bloom', 'Bloom / glow'],
  ['depth-effects', 'Depth-based shaders']
].map(([id, name]) => Object.freeze({ id, name, measuredGpuMs: null })));

/** Exact arithmetic of input and target-display pixels, not actual GPU demand. */
function integerPositive(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('INVALID_' + label);
  }
  return value;
}
function finitePositive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 2000) {
    throw new RangeError('INVALID_' + label);
  }
  return value;
}
const round = (value, decimals = 3) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * Input resolution must share the display's aspect ratio (no stretching).
 * Adaptive has no guaranteed count of original-versus-generated frames.
 * ReShade, LSFG, LS1 and game shader compute are NOT inferred from pixel area.
 */
export function analyzeResolution({
  width = 2048, height = 1280,
  panel = PANEL_1600P, realFps = 120, targetFps = 237
} = {}) {
  integerPositive(width, 'WIDTH');
  integerPositive(height, 'HEIGHT');
  if (!panel || typeof panel !== 'object') throw new RangeError('INVALID_PANEL');
  integerPositive(panel.width, 'PANEL_WIDTH');
  integerPositive(panel.height, 'PANEL_HEIGHT');
  finitePositive(panel.refreshHz, 'REFRESH_HZ');
  finitePositive(realFps, 'REAL_FPS');
  finitePositive(targetFps, 'TARGET_FPS');
  if (width > panel.width || height > panel.height) throw new RangeError('SOURCE_EXCEEDS_DISPLAY');
  if (width * panel.height !== height * panel.width) throw new RangeError('ASPECT_RATIO_MISMATCH');

  const inputPixels = width * height;
  const outputPixels = panel.width * panel.height;
  const fraction = inputPixels / outputPixels;
  return Object.freeze({
    inputWidth: width, inputHeight: height, outputWidth: panel.width, outputHeight: panel.height,
    inputPixels, outputPixels,
    inputPixelFraction: round(fraction, 6),
    gamePixelsSavedPct: round(100 * (1 - fraction), 4),
    linearScaleFactor: round(panel.width / width, 6),
    baseFpsAssumption: realFps,
    adaptiveTargetFps: targetFps,
    baseFrameIntervalMs: round(1000 / realFps),
    targetFrameIntervalMs: round(1000 / targetFps),
    gamePixelRateMPs: round(inputPixels * realFps / 1e6),
    outputPixelRateMPs: round(outputPixels * targetFps / 1e6),
    targetExceedsRefresh: targetFps > panel.refreshHz,
    adaptiveGeneratedFrameCount: null,
    measuredNativeFps: null,
    measuredOutputFps: null,
    measuredGpuWatts: null,
    measuredLatencyMs: null,
    measuredVisualQuality: null,
    inference: 'pixel-count-arithmetic-only'
  });
}

export function resolutionRows(options = {}) {
  return Object.freeze(RENDER_CHOICES.map(({ width, height }) =>
    analyzeResolution({ ...options, width, height })
  ));
}

// Experimental values, NOT recommended weights. Require complete comparable
// observations before declaring any candidate dominated.
const MINIMIZE = Object.freeze(['p99FrameMs', 'gpuWatts', 'latencyMs', 'artifactRating']);
const MAXIMIZE = Object.freeze(['nativeFps', 'qualityRating']);
const METRICS = Object.freeze([...MINIMIZE, ...MAXIMIZE]);

/** Non-dominated rows; never invent an optimum from missing measurements. */
export function paretoMeasured(rows) {
  if (!Array.isArray(rows)) throw new TypeError('INVALID_MEASUREMENT_ROWS');
  const ids = rows.map((r) => r?.id);
  if (new Set(ids).size !== ids.length) throw new RangeError('DUPLICATE_MEASUREMENT_ID');
  if (!rows.length || rows.some((row) =>
    typeof row?.id !== 'string' || !row.id ||
    METRICS.some((key) => typeof row[key] !== 'number' ||
      !Number.isFinite(row[key]) || row[key] < 0)
  )) return Object.freeze({ status: 'UNMEASURED', ids: Object.freeze([]) });
  const dominates = (a, b) => {
    const noWorse = MINIMIZE.every((k) => a[k] <= b[k]) &&
      MAXIMIZE.every((k) => a[k] >= b[k]);
    const strictlyBetter = MINIMIZE.some((k) => a[k] < b[k]) ||
      MAXIMIZE.some((k) => a[k] > b[k]);
    return noWorse && strictlyBetter;
  };
  const frontier = rows.filter((row) => !rows.some((other) => other !== row && dominates(other, row)));
  return Object.freeze({ status: 'MEASURED_FRONTIER', ids: Object.freeze(frontier.map((r) => r.id)) });
}

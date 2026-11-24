import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PANEL_1600P, RENDER_CHOICES, SCALER_FAMILIES,
  analyzeResolution, resolutionRows, paretoMeasured
} from '../../tools/research/resolution-frontier.mjs';

test('source pixels and linear upscaling factors are exact for 16:10 panel', () => {
  const current = analyzeResolution({ width: 1920, height: 1200, realFps: 120 });
  const center = analyzeResolution({ width: 2048, height: 1280, realFps: 120 });
  const sharper = analyzeResolution({ width: 2240, height: 1400, realFps: 120 });
  assert.equal(current.inputPixelFraction, 0.5625);
  assert.equal(center.inputPixels, 2621440);
  assert.equal(center.inputPixelFraction, 0.64);
  assert.equal(center.gamePixelsSavedPct, 36);
  assert.equal(center.linearScaleFactor, 1.25);
  assert.equal(center.gamePixelRateMPs, 314.573);
  assert.equal(center.outputPixelRateMPs, 970.752);
  assert.equal(sharper.inputPixelFraction, 0.765625);
  assert.equal(PANEL_1600P.refreshHz, 240);
});

test('same input-output resolution means no spatial upscaling', () => {
  const row = analyzeResolution({ width: 2560, height: 1600 });
  assert.equal(row.linearScaleFactor, 1);
  assert.equal(row.gamePixelsSavedPct, 0);
  assert.equal(row.inputPixelFraction, 1);
});

test('refresh and theoretical output rate do not masquerade as measured FPS or latency', () => {
  const row = analyzeResolution({ width: 2048, height: 1280, realFps: 120, targetFps: 237 });
  assert.equal(row.baseFrameIntervalMs, 8.333);
  assert.equal(row.targetFrameIntervalMs, 4.219);
  assert.equal(row.targetExceedsRefresh, false);
  assert.equal(row.measuredNativeFps, null);
  assert.equal(row.measuredOutputFps, null);
  assert.equal(row.measuredGpuWatts, null);
  assert.equal(row.measuredLatencyMs, null);
  assert.equal(row.measuredVisualQuality, null);
  assert.equal(row.adaptiveGeneratedFrameCount, null);
  assert.equal(analyzeResolution({ width: 2048, height: 1280, targetFps: 300 }).targetExceedsRefresh, true);
});

test('all resolution choices preserve panel aspect ratio and list is ordered by area', () => {
  const rows = resolutionRows();
  assert.equal(rows.length, RENDER_CHOICES.length);
  assert(rows.every((r) => r.inputWidth * 1600 === r.inputHeight * 2560));
  assert(rows.every((r, i) => i === 0 || rows[i - 1].inputPixels < r.inputPixels));
  assert(rows.some((r) => r.inputWidth === 2048 && r.inputHeight === 1280));
});

test('no model is given fabricated TFLOPS, milliseconds, quality scores or a ranking', () => {
  assert(SCALER_FAMILIES.some((s) => s.id === 'ls1'));
  assert(SCALER_FAMILIES.some((s) => s.id === 'anime4k'));
  assert(SCALER_FAMILIES.some((s) => s.id === 'dlss-sr'));
  assert(SCALER_FAMILIES.every((s) => s.measuredGpuMs === null && s.measuredQuality === null));
  assert.equal(paretoMeasured([]).status, 'UNMEASURED');
  assert.equal(paretoMeasured([{ id: 'a', nativeFps: 100 }]).status, 'UNMEASURED');
});

test('measurement-only Pareto selection eliminates dominance but retains trade-offs', () => {
  const a = { id: 'a', nativeFps: 120, p99FrameMs: 10, gpuWatts: 140, latencyMs: 30, qualityRating: 4, artifactRating: 1 };
  const dominated = { id: 'b', nativeFps: 100, p99FrameMs: 12, gpuWatts: 160, latencyMs: 35, qualityRating: 3, artifactRating: 2 };
  const sharper = { id: 'c', nativeFps: 110, p99FrameMs: 11, gpuWatts: 180, latencyMs: 32, qualityRating: 5, artifactRating: 1 };
  const result = paretoMeasured([a, dominated, sharper]);
  assert.equal(result.status, 'MEASURED_FRONTIER');
  assert.deepEqual(result.ids, ['a', 'c']);
  assert.throws(() => paretoMeasured([a, { ...a, id: 'a' }]), /DUPLICATE/);
});

test('reject invalid numerical inputs rather than silently normalizing', () => {
  for (const patch of [
    { width: 0 }, { width: NaN }, { width: 2050.5 },
    { width: 1920, height: 1080 }, { height: -1 },
    { realFps: 0 }, { realFps: Infinity }, { targetFps: '237' },
    { targetFps: 0 }, { panel: { width: 0, height: 1600, refreshHz: 240 } }
  ]) assert.throws(() => analyzeResolution({ width: 2048, height: 1280, ...patch }));
});

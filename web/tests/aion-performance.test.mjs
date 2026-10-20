import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeFrameOutput, FRAME_LAB_SCHEMA } from '../../apps/aion2-value-atlas/scripts/performance-engine.mjs';

const sample = {
  refreshHz:144, reportedFps:144, fpsCounter:'displayed',
  multiplier:6, targetFps:240
};

test('reported 144 displayed FPS at fixed 6x distinguishes theoretical 24 native FPS', () => {
  const result=analyzeFrameOutput(sample);
  assert.equal(result.schema,FRAME_LAB_SCHEMA);
  assert.equal(result.counterKind,'displayed');
  assert.equal(result.estimatedNativeFps,24);
  assert.equal(result.estimatedGeneratedFps,120);
  assert.equal(result.estimatedTotalFps,144);
  assert.equal(result.visibleFpsCeiling,144);
  assert.equal(result.refreshIntervalMs,6.944);
  assert.equal(result.latencyMs,null, 'do not claim unmeasured input-to-photon latency');
  assert.equal(result.targetExceedsDisplay,true);
  assert.equal(result.assumption,'ideal-fixed-ratio-no-drops');
  assert(result.warnings.some(x=>/not a measurement|theoretical/i.test(x)));
});

test('reported 144 rendered FPS cannot be divided by frame generation', () => {
  const result=analyzeFrameOutput({...sample,fpsCounter:'rendered'});
  assert.equal(result.estimatedNativeFps,144);
  assert.equal(result.estimatedTotalFps,864);
  assert.equal(result.visibleFpsCeiling,144);
  assert(result.warnings.some(x=>/present|refresh|display/i.test(x)));
});

test('unknown FPS-counter provenance never invents a base FPS', () => {
  const result=analyzeFrameOutput({...sample,fpsCounter:'unknown'});
  assert.equal(result.estimatedNativeFps,null);
  assert.equal(result.estimatedGeneratedFps,null);
  assert.equal(result.estimatedTotalFps,null);
  assert(result.warnings.some(x=>/counter/i.test(x)));
});

test('both displays have different physical refresh periods, not measured input lag', () => {
  const fast=analyzeFrameOutput({...sample,refreshHz:240,targetFps:240});
  assert.equal(fast.refreshIntervalMs,4.167);
  assert.equal(fast.targetExceedsDisplay,false);
  assert.equal(fast.latencyMs,null);
  const noFg=analyzeFrameOutput({...sample,multiplier:1});
  assert.equal(noFg.estimatedNativeFps,144);
  assert.equal(noFg.estimatedGeneratedFps,0);
});

test('reject ambiguous invalid numbers and forged FG ratios', () => {
  const changes=[
    {refreshHz:0},{refreshHz:NaN},{refreshHz:10000},{refreshHz:'144'},
    {reportedFps:-1},{reportedFps:0},{reportedFps:Infinity},{reportedFps:'24'},
    {multiplier:0},{multiplier:7},{multiplier:2.5},{targetFps:-1},
    {fpsCounter:'uncalibrated'}
  ];
  for(const patch of changes) assert.throws(()=>analyzeFrameOutput({...sample,...patch}));
});

test('site publishes AION 2 frame lab with local-only inputs and source disclosures', () => {
  const html=readFileSync(new URL('../../apps/aion2-value-atlas/performance.html',import.meta.url),'utf8');
  for(const id of ['refresh-hz','reported-fps','counter-type','fg-ratio','fps-target','performance-result'])
    assert(html.includes('id="'+id+'"'),id);
  assert.match(html,/performance-engine\.mjs/);
  assert.match(html,/NCSOFT|plaync/i);
  assert.match(html,/no live measurement|not measured/i);
  assert.doesNotMatch(html,/<script[^>]*src=["']https?:/i);
  const hub=readFileSync(new URL('../game-tools.html',import.meta.url),'utf8');
  assert.match(hub,/AION 2/);
  assert.match(hub,/frame generation/i);
  assert.match(hub,/Celtic Heroes/i);
  assert.match(hub,/Monster Hunter/i);
});

// Offline AION 2 frame-pacing explanation. Estimates are arithmetic only, not game telemetry.
export const FRAME_LAB_SCHEMA = 'heaven-gg/aion2-frame-lab/v1';
const counterKinds=new Set(['displayed','rendered','unknown']);
const validNumber=(value,min,max,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new RangeError('INVALID_'+label);
  return value;
};
const round=(x,places=3)=>Math.round(x*10**places)/10**places;

/**
 * Multipliers are ideal fixed-ratio upper bounds. DLSS FG may select dynamic ratios,
 * drop intermediate frames, or use a counter with different provenance.
 * Never infer actual input-to-photon latency, native simulation tick rate or game settings.
 */
export function analyzeFrameOutput({refreshHz,reportedFps,fpsCounter,multiplier,targetFps}={}){
  validNumber(refreshHz,30,500,'REFRESH_HZ');
  validNumber(reportedFps,1,1200,'FPS_COUNTER');
  validNumber(targetFps,1,1200,'FPS_TARGET');
  validNumber(multiplier,1,6,'FG_MULTIPLIER');
  if(!Number.isInteger(multiplier))throw new RangeError('INVALID_FG_MULTIPLIER');
  if(!counterKinds.has(fpsCounter))throw new RangeError('INVALID_COUNTER_SOURCE');

  const estimateNative = fpsCounter==='displayed'
    ? reportedFps / multiplier
    : fpsCounter==='rendered' ? reportedFps : null;
  const estimateTotal = fpsCounter==='displayed' ? reportedFps
    : fpsCounter==='rendered' ? reportedFps*multiplier : null;
  const generated = fpsCounter==='displayed' ? reportedFps-estimateNative
    : fpsCounter==='rendered' ? estimateTotal-reportedFps : null;
  const visibleFps = estimateTotal===null ? null : Math.min(refreshHz,estimateTotal);
  const warnings=[
    'Theoretical ideal fixed-ratio estimate, not a measurement of AION 2 render, generated-frame delivery or frame pacing.',
    'No input-to-photon latency measured. Generated frames do not create additional game simulation or input samples.'
  ];
  if(fpsCounter==='unknown')warnings.push('Counter source unknown: do not divide 144 FPS by 6 or assert true rendered FPS.');
  if(targetFps>refreshHz)warnings.push('FPS target exceeds monitor refresh: the panel cannot show more distinct frames than its physical refresh rate.');
  if(estimateTotal!==null&&estimateTotal>refreshHz)warnings.push('Estimated output exceeds refresh: some output frames cannot appear as separate monitor refreshes.');
  if(multiplier>=4)warnings.push('High frame-generation ratios can create visible artifacts around UI, hair, particles, and fast camera movement; compare 1x/2x in the same scene.');
  warnings.push('For affected RTX 50-series Laptop GPUs, NCSOFT published a G-SYNC + Frame Generation crash workaround. Do not treat that as a universal latency fix.');
  return Object.freeze({
    schema:FRAME_LAB_SCHEMA,counterKind:fpsCounter,multiplier,
    refreshHz,targetFps,reportedFps,refreshIntervalMs:round(1000/refreshHz),
    estimatedNativeFps:estimateNative===null?null:round(estimateNative),
    estimatedGeneratedFps:generated===null?null:round(generated),
    estimatedTotalFps:estimateTotal===null?null:round(estimateTotal),
    visibleFpsCeiling:visibleFps===null?null:round(visibleFps),
    targetExceedsDisplay:targetFps>refreshHz,latencyMs:null,
    assumption:'ideal-fixed-ratio-no-drops',warnings:Object.freeze(warnings)
  });
}

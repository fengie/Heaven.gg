/* These are controlled calculator comparisons, never real-game calibration. */
const classes = new Set(['Rogue', 'Ranger', 'Warrior', 'Mage', 'Druid']);
const roles = new Set(['Damage', 'Tank']);
const nonblank = value => typeof value === 'string' && value.trim().length > 0;
const dateIsValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const sourceIsValid = value => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'the-codex.ch'
      && !url.username && !url.password && !url.port && url.pathname !== '/';
  } catch { return false; }
};

/** Null, blank strings, booleans and coercible objects are not measurements. */
export function formatMetric(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US') : 'Unknown';
}

export function compareBuilds(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return {comparable: false, reasons: ['Select two source-linked builds.'], modeledDelta: null};
  }
  const reasons = [];
  if (!classes.has(a.characterClass) || !classes.has(b.characterClass)
      || a.characterClass !== b.characterClass) reasons.push('Character classes differ or are missing');
  if (!Number.isSafeInteger(a.level) || a.level <= 0 || !Number.isSafeInteger(b.level)
      || b.level <= 0 || a.level !== b.level) reasons.push('Character levels differ or are missing');
  if (!roles.has(a.buildType) || !roles.has(b.buildType)
      || a.buildType !== b.buildType) reasons.push('Build roles differ or are missing');
  if (!dateIsValid(a.snapshotDate) || !dateIsValid(b.snapshotDate)
      || a.snapshotDate !== b.snapshotDate) reasons.push('Snapshots differ or dates are invalid');
  if (![a.benchmarkDps, b.benchmarkDps].every(value => typeof value === 'number'
      && Number.isFinite(value) && value >= 0)) reasons.push('At least one modeled DPS is absent or invalid');
  if (!sourceIsValid(a.sourceUrl) || !sourceIsValid(b.sourceUrl)) {
    reasons.push('Canonical HTTPS Codex source links are missing or invalid');
  }
  const fields = [
    ['scenarioFingerprint', 'Same boss, buffs, encounter and rotation not verified'],
    ['equipmentFingerprint', 'Equipment/stat control not verified'],
    ['modelVersion', 'Calculator model versions not matched']
  ];
  for (const [field, reason] of fields) {
    if (!nonblank(a[field]) || !nonblank(b[field]) || a[field] !== b[field]) reasons.push(reason);
  }
  return {comparable: reasons.length === 0, reasons,
    modeledDelta: reasons.length ? null : b.benchmarkDps - a.benchmarkDps};
}

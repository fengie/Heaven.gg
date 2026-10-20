import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROFILE_SCHEMA, emptyProfile, normalizeProfile, parseGearCsv,
  evaluateProfile, sourceFreshness
} from '../../apps/aion2-value-atlas/scripts/profile-engine.mjs';

const catalog = JSON.parse(readFileSync(new URL('../../apps/aion2-value-atlas/data/progression_catalog.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(readFileSync(new URL('../../apps/aion2-value-atlas/data/exchange_observations_2026-10-19.json', import.meta.url), 'utf8'));
const profile = (changes = {}) => ({ ...emptyProfile(), ...changes });

test('all gear slots have unique identities and sourced candidates never claim BIS', () => {
  assert.equal(catalog.schema, 'heaven-gg/aion2-progression-catalog/v1');
  assert.equal(new Set(catalog.gearSlots.map(s => s.id)).size, catalog.gearSlots.length);
  assert(catalog.gearSlots.length >= 19, 'include accessories, runes and Arcana slots');
  assert(catalog.gearExamples.length >= 8);
  assert(catalog.gearExamples.every(x => x.sourceId && catalog.sources.some(s => s.id === x.sourceId)));
  assert(catalog.gearExamples.some(x => x.name === 'Spiritforged Orb' && x.slot === 'weapon'));
  assert(catalog.gearExamples.every(x => !Object.hasOwn(x, 'bestInSlot')));
  assert(catalog.sources.some(x => x.grade === 'primary' && x.url.includes('lounge.plaync.com')));
});

test('blank profile does not pretend to know gear, class, prices or a best farming rate', () => {
  const p = normalizeProfile(emptyProfile(), catalog);
  assert.equal(p.schema, PROFILE_SCHEMA);
  assert.equal(p.itemLevel, 0);
  const result = evaluateProfile(p, catalog, snapshot, '2026-10-19');
  assert.equal(result.bestFarm, null);
  assert.equal(result.eligibleActivities.length, 0);
  assert(result.actions.some(x => x.id === 'need-level'));
  assert(result.actions.some(x => x.id === 'measure-runs'));
  assert.equal(result.exchangeAdvice.kind, 'unverified');
});

test('measured clear times choose net Kina per hour, not highest theoretical reward', () => {
  const p = normalizeProfile(profile({
    characterLevel: 45, itemLevel: 2100,
    runs: {
      conquest2: { minutes: 10, rewardKina: 300000, variableCostKina: 10000, successPct: 100 },
      conquest3: { minutes: 12, rewardKina: 400000, variableCostKina: 20000, successPct: 100 }
    }
  }), catalog);
  const result = evaluateProfile(p, catalog, snapshot, '2026-10-19');
  assert.equal(result.bestFarm.id, 'conquest3');
  assert.equal(result.bestFarm.netKinaPerHour, 1900000);
  assert(result.eligibleActivities.some(x => x.id === 'conquest2'));
  assert(!result.eligibleActivities.some(x => x.id === 'transcendence4'));
  const slower = normalizeProfile({
    ...p, runs: { ...p.runs, conquest3: { minutes: 25, rewardKina: 400000, variableCostKina: 20000, successPct: 70 } }
  }, catalog);
  assert.equal(evaluateProfile(slower, catalog, snapshot, '2026-10-19').bestFarm.id, 'conquest2');
});

test('proposed level-gate upgrades show conditional payback and market Kina affordability', () => {
  const p = normalizeProfile(profile({
    characterLevel: 45, itemLevel: 1400, boundKina: 3000000, tradableKina: 900000,
    runs: {
      conquest2: { minutes: 10, rewardKina: 300000, variableCostKina: 0, successPct: 100 }
    },
    upgrades: [
      { id: 'g1', name: 'Orb swap', slot: 'weapon', costKina: 2000000, targetItemLevel: 2100, funds: 'market' }
    ]
  }), catalog);
  const result = evaluateProfile(p, catalog, snapshot, '2026-10-19');
  const up = result.upgrades.find(x => x.id === 'g1');
  assert.equal(up.paybackClaims, 20, '2M / (400K - 300K) modeled before costs');
  assert.equal(up.affordable, false, 'bound Kina cannot pay for Market purchases');
  assert.equal(up.confidence, 'modeled');
  assert(result.actions.some(x => x.id === 'upgrade-g1'));
});

test('field validation rejects bad imports and leaves prior state unchanged', () => {
  assert.throws(() => normalizeProfile({ schema:'other/v999' }, catalog), /profile schema/i);
  assert.throws(() => normalizeProfile(profile({ itemLevel: -5 }), catalog), /itemLevel/);
  assert.throws(() => normalizeProfile(profile({ tradableKina: 1e16 }), catalog), /tradableKina/);
  assert.throws(() => normalizeProfile(profile({ className: '<script>'.repeat(40) }), catalog), /className/);
  assert.throws(() => normalizeProfile(profile({ gear: {unknownslot:{name:'Sword'}} }), catalog), /gear slot/);
  assert.throws(() => normalizeProfile(profile({ upgrades:[{id:'x',name:'a',slot:'weapon',costKina:0,targetItemLevel:2200,funds:'market'}, {id:'x',name:'b',slot:'guard',costKina:0,targetItemLevel:2200,funds:'all'}] }), catalog), /duplicate upgrade/);
});

test('imported gear CSV supports quoted names, column order, and rejects unsafe/silent partial imports', () => {
  const csv='name,slot,grade,itemTier,enchant,soulBinding,stones\r\n"Orb, of Testing",weapon,Unique,54,10,2,4\r\nSpiritforged Guard,guard,Unique,45,8,1,3\r\n';
  const gear = parseGearCsv(csv, catalog);
  assert.equal(gear.weapon.name, 'Orb, of Testing');
  assert.equal(gear.weapon.itemTier, 54);
  assert.equal(gear.guard.enchant, 8);
  assert.throws(() => parseGearCsv('slot,name\nweapon,Orb\nweapon,Other', catalog), /duplicate/i);
  assert.throws(() => parseGearCsv('slot,name\nunknown,Orb', catalog), /gear slot/i);
  assert.throws(() => parseGearCsv('slot,name\nweapon,"unclosed', catalog), /CSV/i);
  assert.throws(() => parseGearCsv('slot,name\nweapon,\n', catalog), /name/i);
});

test('outdated screenshot offers remain snapshots, never current tradable clearing prices', () => {
  const p = normalizeProfile(profile({ characterLevel:45, itemLevel:2100, tradableKina:11000000 }), catalog);
  const now = evaluateProfile(p, catalog, snapshot, '2026-10-19');
  assert.equal(now.exchangeAdvice.kind, 'snapshot-only');
  assert.equal(now.exchangeAdvice.bestNominalSellerChestKina, 10000000);
  const old = evaluateProfile(p, catalog, snapshot, '2026-11-19');
  assert.equal(old.exchangeAdvice.kind, 'stale');
  assert.equal(sourceFreshness('2026-10-19', '2026-11-19').stale, true);
});

test('vendor energy cap expires; future event timing cannot be silently assumed', () => {
  const p = normalizeProfile(profile({
    characterLevel:45, itemLevel:1400, membership:true, vendorConfirmed:true, vendorBought:4
  }), catalog);
  const active = evaluateProfile(p, catalog, snapshot, '2026-10-19');
  assert.equal(active.vendorOffersRemaining, 16);
  assert.equal(active.vendorExtraClaims, 16);
  const expired = evaluateProfile(p, catalog, snapshot, '2026-11-01');
  assert.equal(expired.vendorExtraClaims, 0);
  assert(expired.warnings.some(x => /expired|verify/i.test(x)));
});

test('profile page is built into the static site and contains offline import/export affordances', () => {
  const html=readFileSync(new URL('../../apps/aion2-value-atlas/profile.html',import.meta.url),'utf8');
  assert.match(html,/id="profile-upload"/);
  assert.match(html,/id="profile-export"/);
  assert.match(html,/id="gear-tracker"/);
  assert.match(html,/id="upgrade-tracker"/);
  assert.match(html,/type="module"/);
  assert.match(html,/PRIVATE|LOCAL ONLY/i);
  assert.doesNotMatch(html,/<script[^>]*src="https?:\/\//i);
  const atlas=readFileSync(new URL('../../apps/aion2-value-atlas/index.html',import.meta.url),'utf8');
  assert.match(atlas,/\.\/profile\.html/);
});

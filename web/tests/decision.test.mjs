import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {compareBuilds} from '../decision.mjs';
const a={sourceUrl:'https://the-codex.ch/damagebuilder/test-fixture',characterClass:'Rogue',level:220,buildType:'Damage',snapshotDate:'2026-10-08',benchmarkDps:100};
test('same class/date still cannot rank without encounter and gear evidence',()=>{
 const x=compareBuilds(a,{...a,benchmarkDps:150});assert.equal(x.comparable,false);assert.equal(x.modeledDelta,null);assert(x.reasons.some(s=>s.includes('boss')));
});
test('mismatch class, role, level or patch blocks winner',()=>{
 const a1={...a,scenarioFingerprint:'same',equipmentFingerprint:'same',modelVersion:'1'};
 for(const delta of [{characterClass:'Mage'},{buildType:'Tank'},{level:221},{snapshotDate:'2026-10-09'},{modelVersion:'2'}])
 assert.equal(compareBuilds(a1,{...a1,...delta}).comparable,false);
});
test('matching explicit controlled inputs only returns modeled difference',()=>{
 const b={...a,scenarioFingerprint:'same',equipmentFingerprint:'same',modelVersion:'1'};
 assert.deepEqual(compareBuilds(b,{...b,benchmarkDps:120}),{comparable:true,reasons:[],modeledDelta:20});
});

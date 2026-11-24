import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRawArmoryBundle,inspectA2Log,summarizeA2Log,appendCombatEvidence,normalizeCombatEvidence,compareRecordedFights} from '../../apps/aion2-value-atlas/scripts/evidence-import.mjs';
import {observedTotals} from '../../apps/aion2-value-atlas/scripts/intelligence-context.mjs';

const key={region:'nae',serverId:'1101',characterId:'fixture='};
const now=Date.parse('2026-11-23T12:00:00Z');
const raw=()=>({
 info:{profile:{characterId:'fixture%3D',serverId:1101,characterName:'Fixture',combatPower:1234},stat:{statList:[{type:'ItemLevel',value:2800},{type:'STR',name:'Might',value:100,statSecondList:['Attack increase +1.4%']}]},daevanion:{boardList:[{id:61,openNodeCount:1,totalNodeCount:2},{id:62,openNodeCount:0,totalNodeCount:1}]}},
 equipment:{equipment:{equipmentList:[{id:101,slotPos:1,name:'Shoulder'}]},skill:{skillList:[]}},
 daevanion:{61:{nodeList:[{boardId:61,nodeId:11,type:'Stat',open:1},{boardId:61,nodeId:12,type:'SkillLevel',open:0}],openStatEffectList:[],openSkillEffectList:[]}},
 secret:'discard-me'
});
test('Companion-shaped raw bundle preserves observed facts without inventing item details, freshness or totals',()=>{
 const s=normalizeRawArmoryBundle(raw(),key,now);
 assert.equal(s.checkedAt,0);assert.equal(s.upstreamObservedAt,null);
 assert.equal(s.itemLevel,2800);assert.equal(s.combatPower,1234);assert.equal(s.equipment[0].detail,null);
 assert.equal(s.boards[0].detail.nodeList.length,2);assert.equal(s.boards[1].detail,null);
 assert.equal(s.complete,false);assert.equal(s.resources,null);assert.equal(s.secret,undefined);
 assert.deepEqual(s.stats[1].statSecondList,['Attack increase +1.4%']);
 assert.equal(Object.hasOwn(observedTotals(s.stats),'attackIncrease'),false);
});
test('raw bundle fails closed on wrong server, character, region, and incoherent board data',()=>{
 assert.throws(()=>normalizeRawArmoryBundle(raw(),{...key,serverId:'999'},now));
 assert.throws(()=>normalizeRawArmoryBundle(raw(),{...key,characterId:'other'},now));
 const wrong=raw();wrong.info.profile.region='eu';assert.throws(()=>normalizeRawArmoryBundle(wrong,key,now));
 const truncated=raw();truncated.daevanion[61].nodeList.pop();assert.throws(()=>normalizeRawArmoryBundle(truncated,key,now));
 const bad=raw();bad.daevanion[61].nodeList[0].boardId=62;assert.throws(()=>normalizeRawArmoryBundle(bad,key,now));
 const extra=raw();extra.daevanion[99]={nodeList:[]};assert.throws(()=>normalizeRawArmoryBundle(extra,key,now));
 const missing=raw();delete missing.info.profile.serverId;assert.throws(()=>normalizeRawArmoryBundle(missing,key,now));
});
const log=()=>({format:'a2log',version:1,meta:{source:'fixture-meter 1',game_patch:'1.0',difficulty:'hard',encounter_type:'conquest',recorded_at:'2026-11-22T10:00:00Z'},players:[{id:'p1',name:'Fixture',stats:{attack:1000,double_pct:12.5},combat_power:1234},{id:'p2',name:'Other party member'}],segments:[{boss:'Boss',duration:10,hits:[{t:1,player:'p1',damage:100,skill_id:7,skill:'Skill',crit:true,multi:2},{t:2,player:'p1',damage:200,skill_id:7,skill:'Skill',crit:false},{t:3,player:'p1',damage:300,skill:'Other Skill'},{t:4,player:'p2',damage:9000,crit:true}]}]});
test('a2log explicitly selects one actor and segment; elapsed DPS and annotation denominators are correct',()=>{
 assert.equal(inspectA2Log(log()).players.length,2);
 assert.throws(()=>summarizeA2Log(log(),{key,playerId:'p1',segmentIndex:0,now}));
 const x=summarizeA2Log(log(),{key,playerId:'p1',segmentIndex:0,confirmed:true,now});
 assert.equal(x.damage,600);assert.equal(x.dps,60);assert.equal(x.hits,3);
 assert.deepEqual(x.flags.crit,{positive:1,known:2});assert.deepEqual(x.flags.double,{positive:0,known:0});
 assert.deepEqual(x.multi,{extraHits:2,known:1});assert.equal(x.stats.double_pct,12.5);
 assert.equal(x.skills[0].damage,300);assert.equal(x.completeness,'unknown');
 assert.equal(JSON.stringify(x).includes('Other party member'),false);assert.equal(Object.hasOwn(x,'players'),false);
});
test('a2log rejects unsupported versions, invalid identities, malformed damage and invalid time',()=>{
 const options={key,playerId:'p1',segmentIndex:0,confirmed:true,now};
 const wrong=log();wrong.version=2;assert.throws(()=>inspectA2Log(wrong));
 const duplicate=log();duplicate.players.push(duplicate.players[0]);assert.throws(()=>inspectA2Log(duplicate));
 for(const hit of [{t:11,player:'p1',damage:1},{t:1,player:'missing',damage:1},{t:1,player:'p1',damage:-1},{t:1,player:'p1',damage:1,crit:'yes'}]){
  const d=log();d.segments[0].hits.push(hit);assert.throws(()=>summarizeA2Log(d,options));
 }
 assert.throws(()=>summarizeA2Log(log(),{...options,playerId:'missing'}));
 assert.throws(()=>summarizeA2Log(log(),{...options,segmentIndex:-1}));
});
test('combat evidence is key-scoped, deduplicated, bounded and recomputes DPS; comparisons require recorded context',()=>{
 const options={key,playerId:'p1',segmentIndex:0,confirmed:true,now};
 const a=summarizeA2Log(log(),options),next=log();next.meta.recorded_at='2026-11-23T10:00:00Z';next.segments[0].hits[0].damage=200;
 const b=summarizeA2Log(next,options),history=appendCombatEvidence(null,a,key,now);
 assert.equal(appendCombatEvidence(history,a,key,now).fights.length,1);
 assert.equal(appendCombatEvidence(history,b,key,now).fights.length,2);
 assert.equal(normalizeCombatEvidence({...history,fights:[{...a,dps:9999}]},key,now).fights[0].dps,60);
 assert.throws(()=>normalizeCombatEvidence(history,{...key,characterId:'other'},now));
 assert.ok(Math.abs(compareRecordedFights(a,b).changePct-100/6)<1e-8);
 assert.equal(compareRecordedFights(a,{...b,patch:'2.0'}),null);
 assert.equal(compareRecordedFights(a,{...b,completeness:'flagged partial'}),null);
 assert.equal(compareRecordedFights(a,{...b,recordedAt:null}),null);
});

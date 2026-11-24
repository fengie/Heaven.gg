import {test} from 'node:test';
import {strict as a} from 'node:assert';
import {damageIndex, enumerateBuilds, statReplacements, affordability, rankLedger, planRefresh, buildLedger} from '../../apps/aion2-value-atlas/scripts/intelligence-engine.mjs';
import {ArmoryClient, characterKey, normalizeArmory, normalizeSearch} from '../../apps/aion2-value-atlas/scripts/armory-engine.mjs';
const key={region:'nae',serverId:'1101',characterId:'abc='};
const info={profile:{characterId:'abc=',characterName:'Fixture',characterLevel:45,combatPower:1234,className:'Spiritmaster',serverName:'Siel'},stat:{statList:[{type:'ItemLevel',name:'Item Level',value:2790}]},daevanion:{boardList:[{id:1,name:'Board',openNodeCount:1,totalNodeCount:3}]}};
const equip={equipment:{equipmentList:[{slotPos:1,slotPosName:'Weapon',id:10,name:'Orb',enchantLevel:5,exceedLevel:0}]},skill:{skillList:[{id:2,name:'Skill',skillLevel:15,equip:true}]}};
const item={id:10,subStats:[{id:'Crit',name:'Critical Hit',value:'+40'}],maxEnchantLevel:10};
const board={nodeList:[{nodeId:1,type:'Stat',open:true,name:'Owned'},{nodeId:2,type:'Stat',open:false,name:'New'}]};
const model=(s)=>damageIndex(s,{critBase:.30,critCap:.5,critRatingPerPoint:1000,critBonus:.5});
const groups=[
 [{id:'0',delta:{accuracy:98}},{id:'1',delta:{weaponBoost:.1}}],
 [{id:'0',delta:{attack:30}},{id:'1',delta:{accuracy:50}}],
 [{id:'0',delta:{crit:30}},{id:'1',delta:{critBonus:.1}}],
 [{id:'0',delta:{accuracy:60}},{id:'1',delta:{crit:50}}]
];
const base={attack:1000,accuracy:1000,crit:0,critBonus:0,weaponBoost:0};
test('all 16 factorial builds are evaluated; harder and easier optima differ',()=>{
 const hard=enumerateBuilds({base,groups,evaluate:model,minAccuracy:1100});
 const easy=enumerateBuilds({base,groups,evaluate:s=>damageIndex(s,{critBase:.45,critCap:.5,critRatingPerPoint:1000,critBonus:.5}),minAccuracy:1040});
 a.equal(hard.evaluated,16);a.equal(hard.exact,true);a.equal(hard.best.ids.join(''),'1110');a.equal(hard.best.score,1298);
 a.equal(easy.best.ids.join(''),'1010');a.ok(Math.abs(easy.best.score-1438.91)<1e-8);
});
test('equivalent aggregate stat assignments produce equivalent scores and caps',()=>{
 a.equal(model({...base,crit:40}),model({...base,crit:20+20}));
 a.equal(model({...base,crit:200}),model({...base,crit:900}));
});
test('bounded search reports incomplete, never claims optimum or infeasible',()=>{
 const r=enumerateBuilds({base,groups,evaluate:model,minAccuracy:1100,maxEvaluations:1});a.equal(r.exact,false);a.equal(r.evaluated,1);
});
test('replacement enumerator retains every legal distinct candidate and subtracts existing line',()=>{
 const r=statReplacements({lines:[{id:'one',stat:'crit',value:40},{id:'two',stat:'attack',value:10}],pool:[{stat:'crit',values:[35,45]},{stat:'accuracy',values:[40,47]},{stat:'attack',values:[10,12]}],base:{...base,crit:40},evaluate:model});
 a.equal(r.length,7);const x=r.find(v=>v.lineId==='one'&&v.stat==='accuracy'&&v.value===47);a.deepEqual(x.delta,{crit:-40,accuracy:47});a.ok(x.gain<0);a.ok(!r.some(v=>v.lineId==='one'&&v.stat==='attack'));
});
test('affordability distinguishes missing, bound, stale, real money and reserve',()=>{
 const resources={marketKina:{low:300,high:300,reserve:50,fresh:true},boundKina:{low:9000,high:9000,fresh:true}};
 a.equal(affordability({marketKina:250},resources),'affordable');a.equal(affordability({marketKina:251},resources),'unaffordable');
 a.equal(affordability({stone:1},resources),'unknown');a.equal(affordability({cash:1},resources),'unaffordable');
 a.equal(affordability({marketKina:1},{marketKina:{low:300,high:300,fresh:false}}),'unknown');a.equal(affordability({},{}),'affordable');a.equal(affordability(null,{}),'unknown');
 a.equal(affordability({marketKina:{low:100,high:400}},resources),'unknown');
});
test('rank preserves all options and preference changes only ranking',()=>{
 const rows=[{id:'a',category:'grind',gain:3,minutes:5,cost:{}},{id:'b',category:'skill',gain:2,minutes:5,cost:{}},{id:'c',category:'gear',gain:20,minutes:1,cost:{marketKina:1000}}];
 const money={marketKina:{low:300,high:300,fresh:true}};
 a.deepEqual(rankLedger(rows,money).map(x=>x.id),['a','b','c']);a.deepEqual(rankLedger(rows,money,{grind:'dislike'}).map(x=>x.id),['b','a','c']);a.equal(rankLedger(rows,money,{grind:'dislike'})[1].gain,3);
});
test('refresh depends on age and user actions, even if item ID unchanged',()=>{
 const now=1000000;const cached={key,checkedAt:now-1000,equipment:[{slotPos:1,detailCheckedAt:now-400000}],boards:[{id:1,detailCheckedAt:now-1000}]};
 a.deepEqual(planRefresh({trigger:'goal',visible:true,now,snapshot:cached,key}).details,[]);
 a.deepEqual(planRefresh({trigger:'open',visible:true,now,snapshot:cached,key}).details,[1]);
 a.deepEqual(planRefresh({trigger:'reroll',slotPos:1,visible:true,now,snapshot:cached,key}).details,[1]);
 a.equal(planRefresh({trigger:'open',visible:false,now,snapshot:cached,key}).summary,false);
});
test('search unwraps highlights and percent encoding, keeps region identity',()=>{
 const r=normalizeSearch({list:[{characterId:'abc%253D',name:'<strong>Fixture</strong>',serverId:1101,serverName:'Siel'},{characterId:'abc%3D',name:'Other',serverId:1101,region:'eu'}]},'nae');
 a.equal(r.length,1);a.deepEqual(r[0].key,key);a.equal(r[0].name,'Fixture');a.throws(()=>characterKey({...key,region:'kr'}));
});
test('armory normalizes observed data without fabricating private state and refuses wrong character',()=>{
 const s=normalizeArmory(key,info,equip,123);a.equal(s.itemLevel,2790);a.equal(s.combatPower,1234);a.equal(s.equipment[0].id,10);a.equal(s.resources,null);a.equal(s.quests,null);a.equal(s.specializations,null);
 a.throws(()=>normalizeArmory(key,{...info,profile:{...info.profile,characterId:'different='}},equip,123),/identity/i);
});
test('armory expands actual equipped item and board, shows hidden fields unknown, and caches',async()=>{
 const calls=[];const transport=async url=>{const u=new URL(url);calls.push(u);const p=u.pathname;return {status:200,body:p.endsWith('/info')?info:p.endsWith('/equipment')?equip:p.endsWith('/equipment/item')?item:p.endsWith('/daevanion/detail')?board:{list:[]}};};
 const c=new ArmoryClient({transport,clock:()=>1000000,minInterval:0});const s=await c.load(key);a.equal(calls.length,4);a.equal(s.equipment[0].detail.subStats[0].value,'+40');a.equal(s.boards[0].detail.nodeList.length,2);
 a.equal(calls[2].searchParams.get('characterId'),'abc=');a.equal(calls[2].searchParams.get('id'),'10');a.equal(calls[2].searchParams.get('slotPos'),'1');
 await c.load(key,{previous:s});a.equal(calls.length,4);
 const next=await c.load(key,{previous:s,trigger:'reroll',slotPos:1});a.equal(calls.length,7);a.equal(next.equipment[0].detail.subStats[0].value,'+40');
});
test('missing/denied detail is explicit, provider backoff is respected',async()=>{
 const calls=[];const c=new ArmoryClient({clock:()=>1000000,minInterval:0,transport:async url=>{const p=new URL(url).pathname;calls.push(p);return p.endsWith('/info')?{status:200,body:info}:p.endsWith('/equipment')?{status:200,body:equip}:{status:429,retryAfter:'60'};}});
 const s=await c.load(key);a.equal(s.equipment[0].detail,null);a.match(s.equipment[0].detailError,/429/);a.equal(calls.length,3);a.match(s.boards[0].detailError,/backoff/);
});
test('ledger uses observed incomplete nodes, keeps known alternatives and unknown balances',()=>{
 const s=normalizeArmory(key,info,equip,123);s.equipment[0].detail=item;s.boards[0].detail=board;
 const rows=buildLedger(s,{now:1000});a.ok(rows.some(x=>x.id==='board:1:2'));a.ok(!rows.some(x=>x.id==='board:1:1'));a.ok(rows.some(x=>x.id==='gear:1:enhance'));a.ok(rows.some(x=>x.id==='gear:1:line:0'));a.ok(rows.every(x=>x.status!=='affordable'||x.cost&&Object.keys(x.cost).length===0));
});
test('free but unconfirmed eligibility is conditional, not a verified recommendation',()=>{
 a.equal(rankLedger([{id:'claim',category:'event',cost:{},requiresVerification:true}])[0].status,'unknown');
});
test('denied provider is not retried for additional details',async()=>{
 let calls=0;const c=new ArmoryClient({clock:()=>1000000,minInterval:0,transport:async url=>{calls++;const p=new URL(url).pathname;return p.endsWith('/info')?{status:200,body:info}:p.endsWith('/equipment')?{status:200,body:equip}:{status:403};}});
 const s=await c.load(key);a.equal(calls,3);a.match(s.equipment[0].detailError,/403/);a.match(s.boards[0].detailError,/denied/);
});

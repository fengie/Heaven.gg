import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProgression, observedTotals, confirmWallet, walletResources, scenarioGain} from '../../apps/aion2-value-atlas/scripts/intelligence-context.mjs';
const now=Date.parse('2026-11-23T20:00:00Z'), key={region:'nae',serverId:'1101',characterId:'fixture='};
const gear=(slotPos,slotPosName,lines,level=102)=>({id:100+slotPos,slotPos,slotPosName,name:slotPosName,enchantLevel:5,detailCheckedAt:now,detail:{id:100+slotPos,level,subStats:lines,maxEnchantLevel:10}});
const line=(name,value)=>({name,value});
const stats=[{name:'Attack',value:1000},{name:'Accuracy',value:1100},{name:'Critical Hit',value:1400},{name:'Critical Damage Boost',value:'0%'},{name:'Weapon Damage Boost',value:'0%'}];
const snapshot={key,checkedAt:now,itemLevel:2790,stats,equipment:[gear(1,'MainHand',[line('Accuracy','98')]),gear(2,'Shoes',[line('Attack','27')])],skills:[],boards:[]};
test('observed aggregate stats require explicit percentage units and reject duplicate totals',()=>{
 assert.equal(observedTotals(stats).crit,1400);assert.equal(observedTotals(stats).critBonus,0);
 assert.equal(observedTotals([{name:'Critical Damage Boost',value:12}]).critBonus,undefined);
 assert.equal(observedTotals([...stats,{name:'Attack',value:1200}]).attack,undefined);
 assert.deepEqual(observedTotals([{name:'Might',value:300,statSecondList:['Attack increase +30%']}]),{});
});
test('observed gear produces conditional reference replacements, with wrong tiers excluded',()=>{
 const x=analyzeProgression({...snapshot,equipment:[...snapshot.equipment,gear(3,'Ring',[line('Attack','15')],108)]},{now,goal:'crit'});
 assert.ok(x.rows.some(r=>r.id.startsWith('reference:1:')&&r.title.includes('Critical Hit')));
 assert.ok(x.rows.some(r=>r.id.startsWith('reference:2:')&&r.title.includes('Accuracy')));
 assert.ok(!x.rows.some(r=>r.id.startsWith('reference:3:')));
 assert.ok(x.rows.filter(r=>r.id.startsWith('reference:')).every(r=>['unknown','blocked'].includes(r.status)));
 assert.ok(x.rows.some(r=>r.id.startsWith('reference:1:')&&r.status==='blocked'));
});
test('two distinct slots can cooperate while preserving accuracy, even when single change loses accuracy',()=>{
 const s={...snapshot,equipment:[gear(1,'Shoulder',[line('Accuracy','31')]),gear(2,'Shoes',[line('Critical Hit','26')])]};
 const x=analyzeProgression(s,{now,goal:'critBonus',preserveAccuracy:true});
 assert.ok(x.best&&x.best.delta.accuracy>=0);assert.equal(x.best.changes.length,2);
 assert.ok(Math.abs(x.best.gain-12.84)<1e-9);
 assert.ok(x.rows.some(r=>r.id.startsWith('reference:1:')&&r.delta.accuracy<0&&r.status==='blocked'));
 assert.equal(x.search.exact,true);
});
test('known numerical gain uses a relative conditional model; lost accuracy or missing factor is not scored',()=>{
 const t=observedTotals(stats);
 assert.ok(scenarioGain({crit:10},t,'transcendence')>0);
 assert.equal(scenarioGain({accuracy:-1,crit:40},t,'transcendence'),null);
 assert.equal(scenarioGain({crit:40},{crit:1400},'transcendence'),null);
 assert.equal(scenarioGain({might:-10,crit:40},t,'transcendence'),null);
 assert.equal(scenarioGain({crit:40},{...t,crit:1600},'transcendence'),0);
});
test('unknown old effects retain alternatives without making up a damage gain',()=>{
 const x=analyzeProgression({...snapshot,equipment:[gear(1,'MainHand',[line('Might','22')])]},{now,goal:'hit'});
 const rows=x.rows.filter(r=>r.id.startsWith('reference:'));
 assert.ok(rows.length>0);assert.ok(rows.every(r=>r.gain===null));
});
test('wallet requires explicit identity, expires, and never transfers bound funds to market',()=>{
 const w=confirmWallet({schema:'heaven-gg/aion2-profile/v1',boundKina:5000,tradableKina:200},key,now);
 assert.deepEqual(walletResources(w,key,now),{boundKina:{low:5000,high:5000,fresh:true},marketKina:{low:200,high:200,fresh:true}});
 assert.deepEqual(walletResources(w,{...key,characterId:'different='},now),{});
 assert.deepEqual(walletResources(w,key,now+30*60000),{});
 assert.throws(()=>confirmWallet({schema:'other',boundKina:1,tradableKina:2},key,now));
});
test('socket and breakthrough opportunities are discovered only from published fields',()=>{
 const g=gear(1,'MainHand',[]);g.exceedLevel=1;Object.assign(g.detail,{maxExceedEnchantLevel:3,magicStoneSlotCount:2,magicStoneStat:[{slotPos:1}]});
 const x=analyzeProgression({...snapshot,equipment:[g]},{now});
 assert.ok(x.rows.some(r=>r.id==='gear:1:socket'));assert.ok(x.rows.some(r=>r.id==='gear:1:exceed'));
 const y=analyzeProgression({...snapshot,equipment:[gear(1,'MainHand',[])]},{now});assert.ok(!y.rows.some(r=>r.id==='gear:1:socket'));
});
test('raw movement and speed goals work even when their rotation effect is unknown',()=>{
 const s={...snapshot,equipment:[gear(1,'Shoes',[line('HP','160')])]};
 const x=analyzeProgression(s,{now,goal:'moveSpeed'});assert.equal(x.best.changes.length,1);assert.ok(Math.abs(x.best.gain-10.28)<1e-9);assert.equal(x.best.delta.hp,-160);
 const hit=analyzeProgression(s,{now,goal:'hit'});assert.ok(hit.rows.filter(r=>r.id.startsWith('reference:')).every(r=>r.gain===null));
});
test('out-of-reference rolls and malformed duplicate types fail closed',()=>{
 for(const lines of [[line('Attack','999')],[line('Attack','38'),line('Critical Hit','bad')],[line('Attack','38'),line('Attack','39')]]){
  const x=analyzeProgression({...snapshot,equipment:[gear(1,'MainHand',lines)]},{now});assert.equal(x.matchingItems,0);assert.ok(!x.rows.some(r=>r.id.startsWith('reference:')));
 }
});
test('confirmed insufficient total Kina proves a recipe shortfall, but higher total is not proof of usable funds',()=>{
 const s={...snapshot,itemLevel:2800};
 const row=(b,t)=>analyzeProgression(s,{now,wallet:confirmWallet({schema:'heaven-gg/aion2-profile/v1',boundKina:b,tradableKina:t},key,now)}).rows.find(r=>r.id==='content:ludra:Easy');
 assert.equal(row(5000,200).status,'unaffordable');assert.equal(row(6000000,100).status,'unknown');
});
test('bounded multi-slot search never claims an exact optimum on a truncated domain',()=>{
 const x=analyzeProgression(snapshot,{now,goal:'crit',maxEvaluations:1});assert.equal(x.search.exact,false);assert.ok(x.best);
});

test('disliking the soul-binding category changes the preferred plan without erasing mathematical alternatives',()=>{
 const s={...snapshot,equipment:[gear(1,'Shoulder',[line('Accuracy','31')]),gear(2,'Shoes',[line('Critical Hit','26')])]};
 const unrestricted=analyzeProgression(s,{now,goal:'critBonus'});
 const preferred=analyzeProgression(s,{now,goal:'critBonus',preferences:{'soul-binding':'dislike'}});
 assert.deepEqual(preferred.best,unrestricted.best);
 assert.ok(preferred.preferredPlan,'preferences must influence the separately labeled feasible choice');
 assert.equal(preferred.preferredPlan.best.changes.length,0);
 assert.ok(preferred.preferredPlan.excluded>0);
 assert.equal(preferred.rows.length,unrestricted.rows.length);
});
test('one disliked action is excluded from the preferred plan but remains in the ledger',()=>{
 const s={...snapshot,equipment:[gear(1,'Shoulder',[line('Accuracy','31')]),gear(2,'Shoes',[line('Critical Hit','26')])]};
 const unrestricted=analyzeProgression(s,{now,goal:'critBonus'});
 const excluded=unrestricted.rows.find(r=>r.id===unrestricted.best.changes[0].id);
 assert.ok(excluded.preferenceKey,'every valid action has a stable preference identity');
 const ranked=analyzeProgression(s,{now,goal:'critBonus',actionPreferences:new Map([[excluded.preferenceKey,'dislike']])});
 assert.deepEqual(ranked.best,unrestricted.best);
 assert.ok(ranked.preferredPlan);
 assert.ok(ranked.preferredPlan.best.changes.every(r=>r.id!==excluded.id));
 const retained=ranked.rows.find(r=>r.id===excluded.id);
 assert.equal(retained.preference,'dislike');assert.equal(retained.gain,excluded.gain);
 assert.equal(retained.status,excluded.status);assert.equal(ranked.rows.length,unrestricted.rows.length);
});

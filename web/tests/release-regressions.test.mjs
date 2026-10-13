import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {compareBuilds,formatMetric} from '../decision.mjs';
import {cheapestQuna,wardrobeQuote} from '../wardrobe.mjs';

const build={characterClass:'Rogue',level:220,buildType:'Damage',snapshotDate:'2026-10-08',benchmarkDps:100,sourceUrl:'https://the-codex.ch/damagebuilder/test-fixture',scenarioFingerprint:'fixture-scenario',equipmentFingerprint:'fixture-equipment',modelVersion:'fixture-model'};
const packs=[{id:'small',quna:4,usd_cents:5,mileage:1},{id:'large',quna:7,usd_cents:8,mileage:2}];
const merchant={id:'vendor',name:'Merchant',category:'Earned in-game',usd_cents:0,quna:0,mileage:0};

test('comparison rejects malformed DPS rather than returning NaN or coerced deltas',()=>{
 for(const value of ['120',NaN,Infinity,-1,{},true]){
  const result=compareBuilds(build,{...build,benchmarkDps:value});
  assert.equal(result.comparable,false,`accepted ${String(value)}`);
  assert.equal(result.modeledDelta,null);
 }
});
test('matching missing metadata is not matching evidence',()=>{
 for(const key of ['characterClass','level','buildType','snapshotDate']){
  const a={...build},b={...build};delete a[key];delete b[key];
  assert.equal(compareBuilds(a,b).comparable,false,key);
 }
});
test('context evidence must be a nonblank string',()=>{
 for(const key of ['scenarioFingerprint','equipmentFingerprint','modelVersion'])
 for(const value of [' ',true,1])assert.equal(compareBuilds({...build,[key]:value},{...build,[key]:value}).comparable,false,key);
});
test('comparison requires canonical HTTPS provenance without credentials',()=>{
 for(const sourceUrl of [undefined,'javascript:alert(1)','https://the-codex.ch.evil.invalid/a','https://user@the-codex.ch/a'])
  assert.equal(compareBuilds(build,{...build,sourceUrl}).comparable,false,String(sourceUrl));
});
test('invalid calendar dates cannot establish snapshot agreement',()=>{
 for(const snapshotDate of ['2026-02-30','tomorrow',''])
 assert.equal(compareBuilds({...build,snapshotDate},{...build,snapshotDate}).comparable,false);
});
test('an unknown merchant cost alone blocks an affordable-budget claim',()=>{
 const quote=wardrobeQuote({packs,products:[merchant]},{wanted:['vendor'],budgetCents:0});
 assert.equal(quote.budgetStatus,'incomplete');
 assert.equal(quote.subtotalCents,0);
});
test('absent price fields remain unknown rather than silently becoming free',()=>{
 const quote=wardrobeQuote({packs,products:[{id:'unknown',name:'Unknown',category:'Cosmetics'}]},{wanted:['unknown'],budgetCents:0});
 assert.equal(quote.budgetStatus,'incomplete');
});
test('duplicate product identities cannot double-charge a wishlist',()=>{
 const item={id:'x',name:'X',category:'Cosmetics',usd_cents:100,quna:null,mileage:0};
 assert.throws(()=>wardrobeQuote({packs,products:[item,item]},{wanted:['x']}),/duplicate/i);
});
test('pack identifiers are unique, present, and prototype-safe',()=>{
 for(const catalog of [[packs[0],packs[0]],[{...packs[0],id:undefined}],[{...packs[0],id:'__proto__'}],[{...packs[0],id:'constructor'}]])
 assert.throws(()=>cheapestQuna(catalog,1),/pack/i);
});
test('wishlist and owned inputs must be arrays, not arbitrary iterables',()=>{
 for(const wanted of ['vendor',{},1])assert.throws(()=>wardrobeQuote({packs,products:[merchant]},{wanted}),/input|selection/i);
});
test('unknown Mileage does not invalidate a completely known cash budget',()=>{
 const item={id:'x',name:'X',category:'Cosmetics',usd_cents:100,quna:null,mileage:null};
 const quote=wardrobeQuote({packs,products:[item]},{wanted:['x'],budgetCents:100});
 assert.equal(quote.budgetStatus,'within');assert.equal(quote.mileageIncomplete,true);
});
test('zero-cost known and already-owned items retain legitimate zero totals',()=>{
 const item={id:'free',name:'Known free',category:'Cosmetics',usd_cents:0,quna:null,mileage:0};
 const a=wardrobeQuote({packs,products:[item]},{wanted:['free'],budgetCents:0});
 assert.equal(a.subtotalCents,0);assert.equal(a.budgetStatus,'within');
 const b=wardrobeQuote({packs,products:[merchant]},{wanted:['vendor'],owned:['vendor'],budgetCents:0});
 assert.equal(b.budgetStatus,'within');assert.deepEqual(b.remaining,[]);
});

// Independent exhaustive count enumeration: not the implementation's amount DP.
function oracle(ps,target){
 let best=null;
 function visit(i,cost,quna,transactions){
  if(i===ps.length){
   if(quna<target)return;
   const v={costCents:cost,quna,transactions};
   if(!best||cost<best.costCents||(cost===best.costCents&&(quna<best.quna||(quna===best.quna&&transactions<best.transactions))))best=v;
   return;
  }
  const p=ps[i];
  for(let count=0;count<=Math.ceil(target/p.quna);count++)visit(i+1,cost+count*p.usd_cents,quna+count*p.quna,transactions+count);
 }
 visit(0,0,0,0);return best;
}
test('exact top-up solver matches an independent exhaustive oracle in 120 seeded cases',()=>{
 let seed=20261013;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<120;i++){
  const ps=Array.from({length:3},(_,j)=>({id:'pack'+j,quna:1+rand(8),usd_cents:1+rand(13),mileage:rand(5)}));
  const target=1+rand(20),actual=cheapestQuna(ps,target),expected=oracle(ps,target);
  for(const key of ['costCents','quna','transactions'])assert.equal(actual[key],expected[key],JSON.stringify({i,key,ps,target,actual,expected}));
  const paid=ps.reduce((sum,p)=>sum+(actual.packs[p.id]||0)*p.usd_cents,0);
  assert.equal(paid,actual.costCents);
 }
});

test('missing metrics are unknown while numeric zero and negative raw fields remain numeric',()=>{
 for(const value of [null,undefined,'',false,true,[],{},'42',NaN,Infinity])assert.equal(formatMetric(value),'Unknown');
 assert.equal(formatMetric(0),'0');assert.equal(formatMetric(-1),'-1');assert.equal(formatMetric(1234.5),'1,234.5');
});
test('inherited property names cannot corrupt pack quantities',()=>{
 const x=cheapestQuna([{id:'toString',quna:1,usd_cents:1,mileage:0}],2);
 assert.equal(x.packs.toString,2);assert.equal(x.costCents,2);
});
test('maximum target is handled without copying every intermediate purchase history',()=>{
 const x=cheapestQuna([{id:'unit',quna:1,usd_cents:1,mileage:1}],100000);
 assert.equal(x.costCents,100000);assert.equal(x.transactions,100000);assert.equal(x.packs.unit,100000);
});

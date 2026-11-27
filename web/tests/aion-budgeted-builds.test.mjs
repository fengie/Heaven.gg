import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {enumerateBuilds} from '../../apps/aion2-value-atlas/scripts/intelligence-engine.mjs';

const base={attack:100,accuracy:80,crit:0};
const evaluate=s=>s.attack;
const opt=(id,delta,cost)=>({id,delta,cost});
const groups=[
 [opt('keep',{},{}),opt('accuracy',{accuracy:20},{boundKina:2}),opt('power',{attack:30},{marketKina:3})],
 [opt('keep',{},{}),opt('power',{attack:20},{marketKina:2}),opt('accuracy',{accuracy:20},{boundKina:3})]
];
const scenario=overrides=>({base,groups,evaluate,minAccuracy:100,budget:{marketKina:3,boundKina:3},topK:3,...overrides});

test('coordinated changes satisfy accuracy and separate resource budgets',()=>{
 const input=scenario(),snapshot=JSON.stringify(input);
 const result=enumerateBuilds(input);
 assert.equal(result.status,'optimal');
 assert.equal(result.exact,true);
 assert.deepEqual(result.best.ids,['power','accuracy']);
 assert.equal(result.best.score,130);
 assert.deepEqual(result.best.cost,{boundKina:3,marketKina:3});
 assert.deepEqual(result.alternatives.map(x=>x.ids),[['power','accuracy'],['accuracy','power'],['accuracy','keep']]);
 assert.ok(result.alternatives.every(x=>x.state.accuracy>=100));
 assert.equal(result.scenarioOnly,true);
 assert.equal(result.canPurchase,false);
 assert.equal(JSON.stringify(input),snapshot);
});

test('minimum constraints apply to the final effective state, not intermediate order',()=>{
 const result=enumerateBuilds({base,groups:[
  [opt('sacrifice',{accuracy:-10,attack:30},{})],
  [opt('restore',{accuracy:30,crit:5},{})]
 ],evaluate,minAccuracy:100,minStats:{crit:5},budget:{}});
 assert.equal(result.status,'optimal');
 assert.equal(result.best.score,130);
 assert.equal(result.best.state.accuracy,100);
 assert.equal(enumerateBuilds({...scenario(),minStats:{crit:1}}).status,'infeasible');
});

test('unknown acquisition costs or resource budgets cannot prove an attainable optimum',()=>{
 for(const candidate of [
  scenario({budget:{marketKina:3}}),
  scenario({groups:[[opt('unknown',{attack:10},null)]]}),
  scenario({groups:[[opt('missing',{attack:10},undefined)]]})
 ]){
  const result=enumerateBuilds(candidate);
  assert.equal(result.status,'unknown');
  assert.equal(result.exact,false);
  assert.equal(result.best,null);
  assert.deepEqual(result.alternatives,[]);
 }
});

test('provably unaffordable paths may be pruned; node bound never implies infeasibility',()=>{
 const none=enumerateBuilds(scenario({budget:{marketKina:0,boundKina:0}}));
 assert.equal(none.status,'infeasible');
 assert.ok(none.pruned>0);
 const limited=enumerateBuilds(scenario({maxVisited:1}));
 assert.equal(limited.status,'search-incomplete');
 assert.equal(limited.exact,false);
 assert.equal(limited.best,null);
 const bounded=enumerateBuilds(scenario({maxEvaluations:2}));
 assert.equal(bounded.exact,false);
 assert.ok(['search-incomplete','bounded-candidate'].includes(bounded.status));
});

test('top-K alternatives have a stable tie order; cost is never traded across resources',()=>{
 const equal=[[opt('z',{attack:1},{marketKina:1}),opt('a',{attack:1},{boundKina:1})]];
 const r=enumerateBuilds({base,groups:equal,evaluate,minAccuracy:0,budget:{boundKina:1,marketKina:1},topK:2});
 assert.deepEqual(r.alternatives.map(x=>x.ids),[['a'],['z']]);
 const r2=enumerateBuilds({base,groups:equal,evaluate,minAccuracy:0,budget:{boundKina:0,marketKina:100},topK:2});
 assert.deepEqual(r2.alternatives.map(x=>x.ids),[['z']]);
});

test('invalid options cannot hide behind a pruned branch or incomplete traversal',()=>{
 for(const overrides of [
  {topK:0},{maxVisited:0},{minStats:{unknown:1}},{budget:{marketKina:-1}},
  {groups:[[opt('same',{},{}),opt('same',{},{} )]]},
  {groups:[[opt('bad',{attack:NaN},{marketKina:999})]]},
  {groups:[[opt('bad',{},{marketKina:-1})]]},
  {groups:[[opt('bad',{},{cash:1})]]}
 ])assert.throws(()=>enumerateBuilds(scenario(overrides)),/invalid search domain|unsupported stat or unit/);
});

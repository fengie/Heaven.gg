import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {planFiniteReroll} from '../../apps/aion2-value-atlas/scripts/intelligence-engine.mjs';

const cost={marketKina:100,boundKina:1};
const action=(id,outcomes,extra={})=>({id,kind:'sync',cost,outcomes,...extra});
const outcome=(stateId,probability)=>({stateId,probability});
const scenario=(overrides={})=>({
 initialState:'current',budget:{marketKina:200,boundKina:2},maxAttempts:2,
 states:[
  {id:'current',utility:5,target:false,actions:[action('try',[outcome('good',.5),outcome('worse',.5)])]},
  {id:'worse',utility:0,target:false,actions:[action('repair',[outcome('good',1)])]},
  {id:'good',utility:10,target:true,actions:[]},
 ],...overrides
});

test('correlated outcomes and contingent repair beat a one-step greedy decision',()=>{
 const input=scenario(),before=JSON.stringify(input);
 const result=planFiniteReroll(input);
 assert.equal(result.status,'conditional');
 assert.equal(result.exact,true);
 assert.equal(result.firstAction,'try');
 assert.equal(result.expectedUtility,10);
 assert.equal(result.successProbability,1);
 assert.equal(result.expectedAttempts,1.5);
 assert.deepEqual(result.expectedCost,{boundKina:1.5,marketKina:150});
 assert.equal(result.alternatives.find(a=>a.firstAction==='stop').expectedUtility,5);
 assert.equal(result.calibrated,false);
 assert.equal(result.canPurchase,false);
 assert.equal(JSON.stringify(input),before);
});

test('stop is preferred to spending for equal or worse expected utility',()=>{
 const result=planFiniteReroll(scenario({maxAttempts:1}));
 assert.equal(result.firstAction,'stop');
 assert.equal(result.expectedUtility,5);
 assert.equal(result.expectedAttempts,0);
 assert.deepEqual(result.expectedCost,{boundKina:0,marketKina:0});
 const gamble=planFiniteReroll(scenario({maxAttempts:1,objective:'target-probability'}));
 assert.equal(gamble.firstAction,'try');
 assert.equal(gamble.successProbability,.5);
 assert.equal(gamble.expectedUtility,5);
});

test('resource constraints are independent and zero horizon retains the current state',()=>{
 const result=planFiniteReroll(scenario({budget:{marketKina:10000,boundKina:1}}));
 assert.equal(result.firstAction,'stop');
 const none=planFiniteReroll(scenario({maxAttempts:0}));
 assert.equal(none.firstAction,'stop');
 assert.equal(none.successProbability,0);
 const target=planFiniteReroll(scenario({initialState:'good'}));
 assert.equal(target.firstAction,'stop');
 assert.equal(target.successProbability,1);
});

test('missing kernels or budgets and bounded computation never claim an optimum',()=>{
 assert.equal(planFiniteReroll(scenario({states:null})).status,'unknown');
 const missing=planFiniteReroll(scenario({budget:{marketKina:200}}));
 assert.equal(missing.status,'unknown');
 assert.equal(missing.reason,'RESOURCE_BUDGET_UNAVAILABLE');
 const bounded=planFiniteReroll(scenario({maxStates:1}));
 assert.equal(bounded.status,'unknown');
 assert.equal(bounded.reason,'COMPUTATION_LIMIT');
 assert.equal(bounded.exact,false);
 assert.equal(bounded.firstAction,null);
});

test('invalid domains and non-conserving transitions fail closed',()=>{
 const s=scenario();
 for(const overrides of [
  {maxAttempts:21},{maxStates:0},{objective:'popularity'},{initialState:'missing'},
  {budget:{marketKina:-1,boundKina:2}},
  {states:[...s.states,s.states[0]]},
  {states:[{...s.states[0],actions:[action('bad',[outcome('good',.8)])]},...s.states.slice(1)]},
  {states:[{...s.states[0],actions:[action('bad',[outcome('unknown',1)])]},...s.states.slice(1)]},
  {states:[{...s.states[0],actions:[action('bad',[outcome('good',1)],{cost:{cash:1}})]},...s.states.slice(1)]},
 ])assert.throws(()=>planFiniteReroll(scenario(overrides)),/invalid finite reroll/i);
});

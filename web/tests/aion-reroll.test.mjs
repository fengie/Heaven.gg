import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {estimateStationaryReroll} from '../../apps/aion2-value-atlas/scripts/intelligence-engine.mjs';

const scenario=(overrides={})=>({
 action:'sync',probabilityKind:'conditional-single-line',probability:.25,
 stationaryIndependent:true,preservesCurrentOnFailure:true,
 costPerAttempt:{marketKina:100,boundKina:10},
 budget:{marketKina:350,boundKina:40},maxAttempts:10,targetProbability:.6,
 ...overrides
});
test('synthetic geometric retries stop at success and keep resource budgets separate',()=>{
 const input=scenario(),before=JSON.stringify(input),r=estimateStationaryReroll(input);
 assert.equal(r.status,'conditional');
 assert.equal(r.maxAffordableAttempts,3);
 assert.deepEqual(r.limitingResources,['marketKina']);
 assert.equal(r.successProbability,.578125);
 assert.equal(r.expectedAttempts,2.3125);
 assert.deepEqual(r.expectedCost,{boundKina:23.125,marketKina:231.25});
 assert.deepEqual(r.maxCost,{boundKina:30,marketKina:300});
 assert.equal(r.unboundedExpectedAttempts,4);
 assert.deepEqual(r.unboundedExpectedCost,{boundKina:40,marketKina:400});
 assert.equal(r.minAttemptsForTarget,4);
 assert.equal(r.targetWithinBudget,false);
 assert.equal(r.calibrated,false);
 assert.equal(r.canPurchase,false);
 assert.equal(JSON.stringify(input),before);
});
test('zero and certain probability, zero budget and a certainty target are explicit',()=>{
 const impossible=estimateStationaryReroll(scenario({probability:0}));
 assert.equal(impossible.successProbability,0);
 assert.equal(impossible.expectedAttempts,3);
 assert.equal(impossible.unboundedExpectedAttempts,null);
 assert.equal(impossible.minAttemptsForTarget,null);
 const certain=estimateStationaryReroll(scenario({probability:1,targetProbability:1}));
 assert.equal(certain.successProbability,1);
 assert.equal(certain.expectedAttempts,1);
 assert.equal(certain.minAttemptsForTarget,1);
 const none=estimateStationaryReroll(scenario({probability:1,budget:{marketKina:0,boundKina:100}}));
 assert.equal(none.maxAffordableAttempts,0);
 assert.equal(none.successProbability,0);
 assert.equal(none.expectedAttempts,0);
 assert.equal(none.targetWithinBudget,false);
 assert.equal(estimateStationaryReroll(scenario({targetProbability:1})).minAttemptsForTarget,null);
});
test('full-roll inclusion never masquerades as a conditional Sync probability',()=>{
 for(const overrides of [
  {probabilityKind:'full-roll-inclusion'},
  {action:'full-binding',probabilityKind:'conditional-single-line'},
  {action:'reset'},
  {stationaryIndependent:false},
  {preservesCurrentOnFailure:false},
  {probability:null},
  {budget:{marketKina:10000}},
 ]){
  const r=estimateStationaryReroll(scenario(overrides));
  assert.equal(r.status,'unknown');
  assert.equal(r.successProbability,null);
  assert.equal(r.expectedCost,null);
  assert.equal(r.canPurchase,false);
 }
 const full=estimateStationaryReroll(scenario({action:'full-binding',probabilityKind:'joint-acceptance'}));
 assert.equal(full.status,'conditional');
 assert.equal(full.calibrated,false);
});
test('invalid numeric, resource and attempt domains fail closed',()=>{
 for(const overrides of [
  {probability:-.1},{probability:1.1},{probability:NaN},{probability:'0.25'},
  {targetProbability:0},{maxAttempts:100001},{maxAttempts:1.5},
  {costPerAttempt:{marketKina:-1}},{costPerAttempt:{marketKina:.5}},
  {costPerAttempt:{cash:1}},{costPerAttempt:{constructor:1}},
  {budget:{marketKina:Infinity,boundKina:10}},
 ])assert.throws(()=>estimateStationaryReroll(scenario(overrides)),/invalid reroll/i);
});
test('small probabilities are numerically stable under a bounded attempt cap',()=>{
 const r=estimateStationaryReroll(scenario({
  probability:1e-12,costPerAttempt:{marketKina:0},budget:{},maxAttempts:100000,targetProbability:null,
 }));
 assert.equal(r.maxAffordableAttempts,100000);
 assert.ok(r.successProbability>0&&r.successProbability<1e-6);
 assert.ok(r.expectedAttempts>99999&&r.expectedAttempts<=100000);
 assert.equal(r.targetWithinBudget,null);
 assert.deepEqual(r.maxCost,{marketKina:0});
});

import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {parseNumericInput,validateWardrobePlan} from '../wardrobe.mjs';
const packs=[{id:'fixture',quna:4,usd_cents:5,mileage:1}];
const merchant={id:'vendor',name:'Fixture merchant',category:'Earned in-game',usd_cents:0,quna:0,mileage:0};

test('cent input uses decimal arithmetic, not floating-point integer equality',()=>{
 for(const [text,cents] of [['19.99',1999],['0.29',29],['.01',1],['1.2',120],['0',0]])assert.equal(parseNumericInput(text,100),cents);
 for(const text of ['1.005','-1','Infinity','1e2'])assert(Number.isNaN(parseNumericInput(text,100)));
 assert.equal(parseNumericInput('',100),null);assert(Number.isNaN(parseNumericInput('1.5',1)));
});
test('import binds snapshot and region, validates all fields and preserves explicit blank assumptions',()=>{
 const catalog={as_of:'2026-10-09',region:'fixture',packs,products:[merchant]};
 const plan={schema:1,snapshot:catalog.as_of,region:catalog.region,wanted:['vendor'],owned:[],parameters:{walletQuna:0,dyeChanges:0,budgetCents:null,dyeQunaEach:null}};
 const result=validateWardrobePlan(plan,catalog);assert.equal(result.parameters.budgetCents,null);
 for(const changes of [{snapshot:'old'},{region:'other'},{parameters:{budgetCents:-1}},{wanted:['missing']}])assert.throws(()=>validateWardrobePlan({...plan,...changes},catalog));
 assert.deepEqual(plan.parameters,{walletQuna:0,dyeChanges:0,budgetCents:null,dyeQunaEach:null});
});

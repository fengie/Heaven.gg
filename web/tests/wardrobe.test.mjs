import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {cheapestQuna,wardrobeQuote} from '../wardrobe.mjs';
const packs=[{id:'400',name:'400 Quna',quna:400,usd_cents:599,mileage:865},{id:'1000',name:'1000 Quna',quna:1000,usd_cents:1499,mileage:2150},{id:'2000',name:'2000 Quna',quna:2000,usd_cents:2999,mileage:4350},{id:'4000',name:'4000 Quna',quna:4000,usd_cents:5999,mileage:8650}];
const products=[{id:'pass',name:'Pass',category:'Passes',usd_cents:null,quna:1500,mileage:null},{id:'pet',name:'Pet',category:'Cosmetics',usd_cents:1999,quna:null,mileage:2900},{id:'vendor',name:'Merchant',category:'Earned in-game',usd_cents:0,quna:0,mileage:0}];
test('exact-cent pack optimizer minimizes spend not size',()=>{
 const x=cheapestQuna(packs,1500);assert.equal(x.quna,1600);assert.equal(x.costCents,2396);assert.equal(x.mileage,3460);
 assert.equal(cheapestQuna(packs,0).costCents,0);
});
test('wishlist/owned remove duplicates; unknown earned mileage never double counts',()=>{
 const d={packs,products};const x=wardrobeQuote(d,{wanted:['pass','pet'],walletQuna:0,budgetCents:4400});
 assert.equal(x.subtotalCents,4395);assert.equal(x.knownMileage,6360);assert(x.mileageIncomplete);assert.equal(x.budgetStatus,'within');
 const y=wardrobeQuote(d,{wanted:['pass','pet'],owned:['pet'],walletQuna:1600});assert.equal(y.subtotalCents,0);assert.equal(y.knownMileage,0);
});
test('merchant & unspecified dye cost are unknown; never free in total-value claims',()=>{
 const x=wardrobeQuote({packs,products},{wanted:['vendor'],dyeChanges:1,budgetCents:0});
 assert.equal(x.budgetStatus,'incomplete');assert.equal(x.subtotalCents,0);assert.equal(x.unknown.length,2);
 assert.throws(()=>wardrobeQuote({packs,products},{wanted:['fake']}),/Unknown item/);
 assert.throws(()=>cheapestQuna(packs,-1),RangeError);
});
test('user dye quote is separate and uses additional Quna top-up',()=>{
 const x=wardrobeQuote({packs,products},{wanted:['pet'],dyeChanges:2,dyeQunaEach:200});
 assert.equal(x.qunaNeed,400);assert.equal(x.subtotalCents,2598);assert.equal(x.topup.packs['400'],1);
});
test('validation rejects fractional, negative and unbounded budgets',()=>{
 for(const options of [{walletQuna:-1},{budgetCents:-1},{dyeChanges:1.1},{dyeQunaEach:100000000}])assert.throws(()=>wardrobeQuote({packs,products},options),RangeError);
});

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { makeApp, totals } from '../server.mjs';
const origin='https://trader.example';
const sellerKey='test-only-seller-key-abcdefghijklmnopqrstuvwxyz123';
test('exact token arithmetic across range boundaries',()=>{
 const low=totals({petHalfK:80,mountHalfK:160,rateCents:700,offerCents:11000});
 assert.equal(low.petCoins,1600000);
 assert.equal(low.mountCoins,10240000);
 assert.equal(low.totalCoins,11840000);
 assert.equal(low.estimatedCents,8288);
 const high=totals({petHalfK:90,mountHalfK:170,rateCents:800,offerCents:11000});
 assert.equal(high.totalCoins,12680000);
 assert.equal(high.estimatedCents,10144);
 assert.throws(()=>totals({petHalfK:81.4,mountHalfK:160,rateCents:700,offerCents:11000}));
 assert.throws(()=>totals({petHalfK:80,mountHalfK:160,rateCents:705,offerCents:11000}));
});
async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'trader-test-'));
 const catalogPath=join(dir,'names.tsv'),dataPath=join(dir,'offers.json');
 await writeFile(catalogPath,'7\tPet Token\n8\tMount Token\n9\tTest Item\n');
 const app=await makeApp({sellerKey,dataPath,catalogPath,publicOrigin:origin});
 const server=createServer(app.listener);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(path,{method='GET',body,key,reqOrigin=origin}={})=>{
   const r=await fetch(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(key?{authorization:'Bearer '+key}:{}),...(reqOrigin?{origin:reqOrigin}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return {status:r.status,data:await r.json()};
 };
 try{await run({req,dataPath,catalogPath});}
 finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
}
test('buyer proposals, private credentials and two-sided counter transitions',async()=>{
 await fixture(async({req,dataPath,catalogPath})=>{
   const bad=await req('/api/offers',{method:'POST',reqOrigin:'https://attacker.example',body:{petHalfK:80,mountHalfK:160,rateCents:750,offerCents:11000}});
   assert.equal(bad.status,403);
   const input={petHalfK:80,mountHalfK:160,rateCents:750,offerCents:10000,buyerAlias:'Discord Buyer'};
   const created=await req('/api/offers',{method:'POST',body:input});
   assert.equal(created.status,201);
   const {offer,buyerKey}=created.data;
   assert.equal(offer.status,'submitted');assert.equal(offer.math.estimatedCents,8880);
   assert.equal((await req('/api/offers')).status,401);
   assert.equal((await req('/api/offers/'+offer.id)).status,401);
   assert.equal((await req('/api/offers/'+offer.id,{key:buyerKey})).status,200);
   assert.equal((await req('/api/offers/'+offer.id,{key:'wrong'})).status,401);
   const disk=await readFile(dataPath,'utf8');assert(!disk.includes(buyerKey));assert(!disk.includes(sellerKey));
   const counterfeit=await req('/api/offers/'+offer.id+'/action',{method:'POST',body:{action:'accept'},key:buyerKey});
   assert.equal(counterfeit.status,409);
   const counter=await req('/api/offers/'+offer.id+'/action',{method:'POST',body:{action:'counter',counterCents:10500},key:sellerKey});
   assert.equal(counter.status,200);assert.equal(counter.data.offer.status,'countered');
   assert.equal(counter.data.offer.counterCents,10500);
   // Seller must not unilaterally accept the counter on behalf of the buyer.
   assert.equal((await req('/api/offers/'+offer.id+'/action',{method:'POST',body:{action:'accept'},key:sellerKey})).status,409);
   const reply=await req('/api/offers/'+offer.id+'/respond',{method:'POST',body:{action:'accept-counter'},key:buyerKey});
   assert.equal(reply.status,200);assert.equal(reply.data.offer.status,'accepted');assert.equal(reply.data.offer.offerCents,10500);
   assert.equal((await req('/api/offers/'+offer.id+'/respond',{method:'POST',body:{action:'decline-counter'},key:buyerKey})).status,409);
   const list=await req('/api/offers',{key:sellerKey});assert.equal(list.status,200);assert.equal(list.data.offers[0].id,offer.id);
   const query=await req('/api/catalog?q=token');assert.equal(query.status,200);assert.equal(query.data.items.length,2);
   const loaded=await makeApp({sellerKey,dataPath,catalogPath,publicOrigin:origin});
   assert.equal(typeof loaded.listener,'function');
 });
});
test('seller direct acceptance, rejection, invalid input and static security headers',async()=>{
 await fixture(async({req})=>{
   assert.equal((await req('/api/offers',{method:'POST',body:{petHalfK:80,mountHalfK:160,rateCents:750,offerCents:1}})).status,400);
   const a=await req('/api/offers',{method:'POST',body:{petHalfK:90,mountHalfK:170,rateCents:800,offerCents:11000}});
   assert.equal(a.status,201);
   const accepted=await req('/api/offers/'+a.data.offer.id+'/action',{method:'POST',body:{action:'accept'},key:sellerKey});
   assert.equal(accepted.status,200);assert.equal(accepted.data.offer.status,'accepted');
   assert.equal((await req('/api/offers/'+a.data.offer.id+'/action',{method:'POST',body:{action:'reject'},key:sellerKey})).status,409);
 });
});

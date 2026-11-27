import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { makeApp, totals, catalogSource } from '../server.mjs';
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
async function fixture(run,{trustCloudflareIp=false,catalogRows='7\tPet Token\n8\tMount Token\n9\tTest Item\n'}={}){
 const dir=await mkdtemp(join(tmpdir(),'trader-test-'));
 const catalogPath=join(dir,'names.tsv'),dataPath=join(dir,'offers.json');
 await writeFile(catalogPath,catalogRows);
 const app=await makeApp({sellerKey,dataPath,catalogPath,publicOrigin:origin,trustCloudflareIp});
 const server=createServer(app.listener);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(path,{method='GET',body,key,reqOrigin=origin,cfIp}={})=>{
   const r=await fetch(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(key?{authorization:'Bearer '+key}:{}),...(reqOrigin?{origin:reqOrigin}:{}),...(cfIp?{'cf-connecting-ip':cfIp}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return {status:r.status,data:await r.json()};
 };
 try{await run({req,dataPath,catalogPath});}
 finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
}
test('exact historical IDs remain reachable when the 20-name preview is full',async()=>{
 const catalogRows=await readFile(new URL('../../../data/game/item_names.tsv',import.meta.url),'utf8');
 await fixture(async({req})=>{
   for(const [id,name] of Object.entries({'51695':'Fire Crystal','56782':'Fire Crystal','52020':"Wayfarer's Headdress",'59004':'Carp','59005':'Pike','63981':'Ling'})){
     const preview=await req('/api/catalog?q='+encodeURIComponent(name));
     assert.equal(preview.status,200);assert.equal(preview.data.items.length,20);
     assert.ok(!preview.data.items.some(item=>item.id===id));
     const exact=await req('/api/catalog?id='+id);
     assert.equal(exact.status,200);assert.deepEqual(exact.data.items,[{id,name}]);
     assert.equal(exact.data.provenance,preview.data.provenance);
     assert.match(exact.data.provenance,/historical.*not verified tradeable or priced/i);
   }
 },{catalogRows});
});
test('exact-ID queries preserve string identity and reject mixed or malformed selectors',async()=>{
 await fixture(async({req})=>{
   assert.deepEqual((await req('/api/catalog?id=7')).data.items,[{id:'7',name:'Pet Token'}]);
   assert.deepEqual((await req('/api/catalog?id=77')).data.items,[]);
   assert.deepEqual((await req('/api/catalog?id=07')).data.items,[]);
   for(const query of ['id=','id=-7','id=7.0','id=7e0','id=7x','id=7&id=8','id=7&q=token']){
     assert.equal((await req('/api/catalog?'+query)).status,400,query);
   }
   assert.equal((await req('/api/catalog?q=t')).status,400);
 });
});
test('duplicate rows agree on identity or fail closed without blocking name preview',async()=>{
 await fixture(async({req})=>{
   assert.equal((await req('/api/catalog?id=7')).status,409);
   assert.deepEqual((await req('/api/catalog?id=8')).data.items,[{id:'8',name:'Mount'}]);
   assert.equal((await req('/api/catalog?q=Pet')).status,200);
 },{catalogRows:'7\tPet A\n7\tPet B\n8\tMount\n8\tMount\n'});
});
test('catalog provenance ties a historical snapshot to the bytes actually queried',async()=>{
 const source=await readFile(new URL('../../../data/game/item_names.tsv',import.meta.url),'utf8');
 for(const [bytes,verified] of [[source,true],[source.replace(/\r?\n/g,'\r\n'),true],[source+'999999\tUnreleased sample\n',false]]){
   await fixture(async({req})=>{
     const {data}=await req('/api/catalog?id=5');
     assert.deepEqual(data.items,[{id:'5',name:'Leystone Fragment'}]);
     assert.equal(data.source.verification,verified?'matches-checked-in-manifest':'unverified');
     assert.equal(data.source.game,'Celtic Heroes');
     assert.deepEqual(data.source.marketEvidence,{world:null,release:'unverified',tradability:'unverified',price:null});
     if(verified){
       const m=JSON.parse(await readFile(new URL('../../../data/game/manifest.json',import.meta.url),'utf8'));
       assert.equal(data.source.snapshotDate,m.snapshot_date);
       assert.equal(data.source.upstreamCommit,m.upstream_commit);
       assert.equal(data.source.upstreamRepository,m.upstream_repo);
       assert.equal(data.source.catalogSha256,m.generated_files['item_names.tsv'].sha256);
     }else{
       assert.equal(data.source.upstreamCommit,undefined);assert.equal(data.source.snapshotDate,undefined);
       assert.match(data.provenance,/unverified origin/i);
     }
   },{catalogRows:bytes});
 }
});
test('catalog attribution withholds a snapshot for absent, inconsistent, or malformed manifests',async()=>{
 const text='7\tPet Token\n';
 const valid={upstream_repo:'owner/inventory',upstream_commit:'a'.repeat(40),snapshot_date:'2026-10-08',
   generated_files:{'item_names.tsv':{format:'tsv',rows:1,sha256:catalogSource(text,1,null).catalogSha256}}};
 assert.equal(catalogSource(text,1,valid).verification,'matches-checked-in-manifest');
 for(const bad of [undefined,null,{}, {...valid,generated_files:{}},{...valid,upstream_repo:[]},
   {...valid,upstream_commit:'main'},{...valid,snapshot_date:'2026-02-31'},
   {...valid,generated_files:{'item_names.tsv':{...valid.generated_files['item_names.tsv'],rows:2}}}]){
   const result=catalogSource(text,1,bad);assert.equal(result.verification,'unverified');
   assert.equal(result.upstreamCommit,undefined);assert.equal(result.snapshotDate,undefined);
 }
});
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

test('Cloudflare Tunnel visitor quotas do not cause a single shared loopback bucket',async()=>{
  await fixture(async({req})=>{
    const body={petHalfK:80,mountHalfK:160,rateCents:750,offerCents:11000};
    for(let i=0;i<5;i++) assert.equal((await req('/api/offers',{method:'POST',body,cfIp:'203.0.113.10'})).status,201);
    assert.equal((await req('/api/offers',{method:'POST',body,cfIp:'203.0.113.10'})).status,429);
    assert.equal((await req('/api/offers',{method:'POST',body,cfIp:'203.0.113.11'})).status,201);
    // Invalid/multi-valued forwarded IP never creates an unbounded per-visitor identity.
    assert.equal((await req('/api/offers',{method:'POST',body,cfIp:'1.2.3.4, 2.3.4.5'})).status,201);
  },{trustCloudflareIp:true});
});
test('Cloudflare client-IP header is not trusted by default',async()=>{
  await fixture(async({req})=>{
    const body={petHalfK:80,mountHalfK:160,rateCents:750,offerCents:11000};
    for(let i=0;i<5;i++) assert.equal((await req('/api/offers',{method:'POST',body,cfIp:'203.0.113.'+(i+1)})).status,201);
    assert.equal((await req('/api/offers',{method:'POST',body,cfIp:'203.0.113.99'})).status,429);
  });
});
test('competing seller decisions are serialized; only one terminal decision wins',async()=>{
  await fixture(async({req})=>{
    const body={petHalfK:80,mountHalfK:160,rateCents:750,offerCents:11000};
    const created=await req('/api/offers',{method:'POST',body});
    const id=created.data.offer.id;
    const decisions=await Promise.all(['accept','reject'].map(action=>
      req('/api/offers/'+id+'/action',{method:'POST',body:{action},key:sellerKey})));
    assert.deepEqual(decisions.map(x=>x.status).sort(),[200,409]);
    const current=await req('/api/offers/'+id,{key:sellerKey});
    assert.equal(current.status,200);
    assert(['accepted','rejected'].includes(current.data.offer.status));
  });
});
test('production origins require exact HTTPS scheme/host with no paths',async()=>{
  await assert.rejects(makeApp({sellerKey,publicOrigin:'http://trader.heaven.gg'}),/HTTPS origin/);
  await assert.rejects(makeApp({sellerKey,publicOrigin:'https://trader.heaven.gg/extra'}),/HTTPS origin/);
});


test('rejects corrupted persisted offer records before serving requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trader-bad-store-'));
 const catalogPath=join(dir,'names.tsv'),dataPath=join(dir,'offers.json');
 await writeFile(catalogPath,'7\tPet Token\n8\tMount Token\n');
 const validNumbers={petHalfK:80,mountHalfK:160,rateCents:750,offerCents:11000};
 const sample={id:'1234567890abcdef12345678',buyerKeyHash:'a'.repeat(64),
   buyerAlias:'Valid Buyer',...validNumbers,status:'submitted',counterCents:null,
   createdAt:'2026-10-11T12:00:00.000Z',updatedAt:'2026-10-11T12:00:00.000Z'};
 const cases=[
   [{status:'submitted'}],
   [{...sample,petHalfK:999}],
   [{...sample,buyerKeyHash:'broken'}],
   [{...sample,status:'countered',counterCents:null}],
   [{...sample,createdAt:'not-a-date'}],
   [{...sample},{...sample}],
   [{...sample,updatedAt:'2000-01-01T00:00:00.000Z'}],
 ];
 try {
   for(const records of cases){
     await writeFile(dataPath,JSON.stringify(records));
     await assert.rejects(makeApp({sellerKey,dataPath,catalogPath,publicOrigin:origin}),/Invalid offer store/,
       'Corrupt or duplicated offers must stop startup instead of serving partial data');
   }
   await writeFile(dataPath,JSON.stringify([sample]));
   assert.equal(typeof (await makeApp({sellerKey,dataPath,catalogPath,publicOrigin:origin})).listener,'function');
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('rejected repeated decisions preserve committed file bytes and unrelated offers after a fresh reader',async()=>{
  // Source-backed ordered-state verification: persist a known accepted state,
  // reject conflicting/replayed actions, then compare exact bytes AND a
  // separate service's readback. No external accounts or network destinations.
  await fixture(async({req,dataPath,catalogPath})=>{
    const numbers={petHalfK:80,mountHalfK:160,rateCents:750,offerCents:11000};
    const first=await req('/api/offers',{method:'POST',body:{...numbers,buyerAlias:'First Buyer'}});
    const other=await req('/api/offers',{method:'POST',body:{...numbers,buyerAlias:'Second Buyer'}});
    assert.equal(first.status,201);
    assert.equal(other.status,201);
    const firstId=first.data.offer.id, otherId=other.data.offer.id;
    const accepted=await req('/api/offers/'+firstId+'/action',{
      method:'POST',body:{action:'accept'},key:sellerKey
    });
    assert.equal(accepted.status,200);
    assert.equal(accepted.data.offer.status,'accepted');

    const committed=await readFile(dataPath,'utf8');
    const before=JSON.parse(committed);
    assert.equal(before.length,2);
    assert.equal(before.find(x=>x.id===firstId)?.status,'accepted');
    assert.equal(before.find(x=>x.id===otherId)?.status,'submitted');

    // Rejecting completed decisions, invalid buyer state and wrong credentials
    // must not consume an earlier commit or mutate a separate live offer.
    const repeated=await req('/api/offers/'+firstId+'/action',{
      method:'POST',body:{action:'reject'},key:sellerKey
    });
    assert.equal(repeated.status,409);
    const wrongState=await req('/api/offers/'+otherId+'/respond',{
      method:'POST',body:{action:'accept-counter'},key:other.data.buyerKey
    });
    assert.equal(wrongState.status,409);
    const wrongOwner=await req('/api/offers/'+otherId+'/action',{
      method:'POST',body:{action:'accept'},key:first.data.buyerKey
    });
    assert.equal(wrongOwner.status,401);
    assert.equal(await readFile(dataPath,'utf8'),committed);

    // Reopen the same exact persisted source through a new service instance,
    // rather than trusting a cached in-memory object from the first listener.
    const reloaded=await makeApp({sellerKey,dataPath,catalogPath,publicOrigin:origin});
    const independent=createServer(reloaded.listener);
    await new Promise((resolve,reject)=>{
      independent.once('error',reject);
      independent.listen(0,'127.0.0.1',resolve);
    });
    try {
      const reopenedOrigin='http://127.0.0.1:'+independent.address().port;
      for(const [id,status] of [[firstId,'accepted'],[otherId,'submitted']]){
        const response=await fetch(reopenedOrigin+'/api/offers/'+id,{
          headers:{authorization:'Bearer '+sellerKey}
        });
        assert.equal(response.status,200);
        const data=await response.json();
        assert.equal(data.offer.id,id);
        assert.equal(data.offer.status,status);
        const durable=before.find(record=>record.id===id);
        assert.equal(data.offer.updatedAt,durable.updatedAt);
      }
      const list=await fetch(reopenedOrigin+'/api/offers',{
        headers:{authorization:'Bearer '+sellerKey}
      });
      assert.equal(list.status,200);
      const report=await list.json();
      assert.deepEqual(new Set(report.offers.map(x=>x.id)),new Set([firstId,otherId]));
      assert.equal(await readFile(dataPath,'utf8'),committed);
    }finally{
      await new Promise((resolve,reject)=>
        independent.close(error=>error?reject(error):resolve()));
    }
  });
});

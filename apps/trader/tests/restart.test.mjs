import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceFile=fileURLToPath(new URL('../server.mjs',import.meta.url));
const sellerKey='integration-only-unguessable-test-secret-1234567890';
const approvedSha='a'.repeat(40);
async function unusedPort() {
  const socket=createServer();
  await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}
async function untilHealthy(origin,child) {
  const deadline=Date.now()+9000;
  while(Date.now()<deadline) {
    if(child.exitCode!==null) throw Error('Trader process exited before becoming healthy: '+child.exitCode);
    try {
      const result=await fetch(origin+'/healthz',{signal:AbortSignal.timeout(450)});
      if(result.ok) {
        const data=await result.json();
        assert.equal(data.revision,approvedSha);
        assert.match(data.revisionProof,/independent deployment receipt required/);
        return;
      }
    } catch (error) {
      if(error?.name==='AssertionError') throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,90));
  }
  throw Error('Timed out starting trader process');
}
async function stop(child) {
  if(!child||child.exitCode!==null)return;
  const done=new Promise(resolve=>child.once('exit',resolve));
  child.kill();
  await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('Trader process failed to stop')),5000))]);
}
test('real Node server restarts preserve private offer, counteroffer and final agreement', {timeout:35000}, async()=>{
  const temp=await mkdtemp(join(tmpdir(),'heaven-trader-restart-'));
  const path=join(temp,'offers.json');
  const port=await unusedPort(),origin='http://127.0.0.1:'+port;
  let child=null;
  function start() {
    child=spawn(process.execPath,[serviceFile],{
      env:{...process.env,TRADER_PORT:String(port),TRADER_PUBLIC_ORIGIN:origin,
        TRADER_DATA_PATH:path,TRADER_SELLER_KEY:sellerKey,TRADER_RELEASE_SHA:approvedSha},
      stdio:'ignore',windowsHide:true
    });
    return untilHealthy(origin,child);
  }
  async function request(uri,{method='GET',body,key,requestOrigin=origin}={}) {
    const r=await fetch(origin+uri,{
      method,signal:AbortSignal.timeout(4000),
      headers:{...(body?{'content-type':'application/json'}:{}),
        ...(key?{authorization:'Bearer '+key}:{}),
        ...(requestOrigin?{origin:requestOrigin}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    return {status:r.status,json:await r.json()};
  }
  try {
    await start();
    const wrongOrigin=await request('/api/offers',{method:'POST',
      requestOrigin:'https://fake-origin.invalid',body:{}});
    assert.equal(wrongOrigin.status,403);
    const offer=await request('/api/offers',{method:'POST',body:{
      petHalfK:87,mountHalfK:165,rateCents:775,offerCents:9900,buyerAlias:'Restart buyer'
    }});
    assert.equal(offer.status,201);
    const id=offer.json.offer.id,token=offer.json.buyerKey;
    assert.equal(offer.json.offer.math.petCoins,1740000);
    assert.equal(offer.json.offer.math.mountCoins,10560000);
    assert.equal(offer.json.offer.math.totalCoins,12300000);
    assert.equal(offer.json.offer.math.estimatedCents,9533);
    const saved=await readFile(path,'utf8');
    assert(!saved.includes(token),'buyer bearer token must be hashed at rest');
    assert(!saved.includes(sellerKey),'seller secret must not be persisted');

    await stop(child);await start();
    assert.equal((await request('/api/offers')).status,401);
    assert.equal((await request('/api/offers/'+id)).status,401);
    assert.equal((await request('/api/offers/'+id,{key:token})).status,200);
    assert.equal((await request('/api/offers/'+id,{key:'not-an-authorized-token'})).status,401);
    const list=await request('/api/offers',{key:sellerKey});
    assert.equal(list.status,200);
    assert.equal(list.json.offers[0].id,id);
    const counter=await request('/api/offers/'+id+'/action',{method:'POST',
      key:sellerKey,body:{action:'counter',counterCents:10200}});
    assert.equal(counter.status,200);
    assert.equal(counter.json.offer.status,'countered');

    await stop(child);await start();
    const accepted=await request('/api/offers/'+id+'/respond',{method:'POST',
      key:token,body:{action:'accept-counter'}});
    assert.equal(accepted.status,200);
    assert.equal(accepted.json.offer.offerCents,10200);
    assert.equal(accepted.json.offer.status,'accepted');
    assert.equal((await request('/api/offers/'+id+'/respond',{method:'POST',
      key:token,body:{action:'accept-counter'}})).status,409);

    await stop(child);await start();
    const confirmed=await request('/api/offers/'+id,{key:sellerKey});
    assert.equal(confirmed.status,200);
    assert.equal(confirmed.json.offer.status,'accepted');
    assert.equal(confirmed.json.offer.offerCents,10200);
  } finally {
    if(child)await stop(child).catch(()=>{});
    await rm(temp,{recursive:true,force:true});
  }
});
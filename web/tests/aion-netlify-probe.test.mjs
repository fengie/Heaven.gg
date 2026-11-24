import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProbe,config} from '../../netlify/functions/armory-probe.mjs';

const token='test-only-token-with-at-least-32-chars';
const endpoint='https://example.netlify.app/api/aion2/armory-probe';
const request=(method='GET',headers={},suffix='')=>new Request(endpoint+suffix,{method,headers});
const auth={Authorization:'Bearer '+token};
const directory=()=>Response.json({serverList:[{serverId:1,raceId:1,serverName:'Fixture'}]});
const neverFetch=()=>{throw Error('Unexpected upstream request');};
const options={enabled:true,token};

test('public health proves function routing, not upstream access',async()=>{
 let calls=0;
 const handle=createProbe({fetchImpl:()=>{calls++;return directory();}});
 const res=await handle(request());
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{schema:'heaven.gg/armory-probe/v1',code:'function-ready',upstreamEnabled:false});
 assert.equal((await handle(request('POST',auth))).status,503);
 assert.equal(calls,0);
});

test('enabled probe still fails closed without a strong configured secret',async()=>{
 let calls=0;
 for(const bad of ['', 'short', 'a'.repeat(31)]){
  const handle=createProbe({enabled:true,token:bad,fetchImpl:()=>{calls++;return directory();}});
  assert.equal((await handle(request('POST',auth))).status,503);
 }
 assert.equal(calls,0);
});

test('only authenticated empty manual POST can trigger a fixed upstream read',async()=>{
 let calls=0;
 const handle=createProbe({...options,fetchImpl:()=>{calls++;return directory();}});
 for(const req of [request('POST'),request('POST',{Authorization:'Bearer wrong'}),request('POST',auth,'?url=https://example.org'),request('DELETE',auth),new Request(endpoint,{method:'POST',headers:auth,body:'anything'}),new Request(endpoint+'/extra',{method:'POST',headers:auth})]){
  assert.ok((await handle(req)).status>=400);
 }
 assert.equal(calls,0);
});

test('one successful permitted probe validates the official directory without returning provider data or forwarding credentials',async()=>{
 let calls=0;
 const handle=createProbe({...options,fetchImpl:async(url,init)=>{
  calls++;
  assert.equal(url,'https://aion2.plaync.com/en-us/api/gameinfo/servers?region=nae&lang=en-US');
  assert.equal(init.method,'GET');
  assert.equal(init.credentials,'omit');
  assert.equal(init.redirect,'error');
  assert.deepEqual(init.headers,{Accept:'application/json'});
  assert.ok(init.signal instanceof AbortSignal);
  return directory();
 }});
 const res=await handle(request('POST',{...auth,Cookie:'private-fixture',Referer:'https://example.org'}));
 assert.equal(res.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert.deepEqual(await res.json(),{schema:'heaven.gg/armory-probe/v1',code:'provider-ok',upstreamStatus:200,serverCount:1});
 assert.equal((await handle(request('POST',auth))).status,409);
 assert.equal(calls,1);
});

test('upstream denial is recorded without leaking content or retrying',async()=>{
 for(const status of [401,403,429,503]){
  let calls=0;
  const handle=createProbe({...options,fetchImpl:async()=>{calls++;return new Response('private provider detail',{status});}});
  const res=await handle(request('POST',auth));
  assert.equal(res.status,502);
  const payload=await res.json();
  assert.equal(payload.upstreamStatus,status);
  assert.equal(payload.code,status===401||status===403?'provider-denied':'provider-unavailable');
  assert.ok(!JSON.stringify(payload).includes('private provider detail'));
  assert.equal((await handle(request('POST',auth))).status,409);
  assert.equal(calls,1);
 }
});

test('invalid JSON, wrong schema, oversize and network errors never establish provider success',async()=>{
 for(const fetchImpl of [async()=>new Response('not json'),async()=>Response.json({serverList:[]}),async()=>new Response('x',{headers:{'content-length':'2000001'}}),async()=>{throw Error('private exception');}]){
  const handle=createProbe({...options,fetchImpl});
  const res=await handle(request('POST',auth));
  assert.equal(res.status,502);
  assert.equal((await res.json()).code,'provider-invalid-or-unreachable');
  assert.equal((await handle(request('POST',auth))).status,409);
 }
});

test('concurrent authenticated calls cannot duplicate the warm-instance probe',async()=>{
 let calls=0,finish;
 const handle=createProbe({...options,fetchImpl:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const first=handle(request('POST',auth));
 assert.equal((await handle(request('POST',auth))).status,409);
 finish(directory());
 assert.equal((await first).status,200);
 assert.equal(calls,1);
});

test('Netlify route uses free-plan-compatible per-domain-and-IP rate limiting',()=>{
 assert.equal(config.path,'/api/aion2/armory-probe');
 assert.deepEqual(config.rateLimit.aggregateBy,['ip','domain']);
 assert.equal(config.rateLimit.windowSize,60);
 assert.ok(config.rateLimit.windowLimit<=10);
});

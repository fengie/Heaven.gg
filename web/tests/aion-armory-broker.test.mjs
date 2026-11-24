import test from 'node:test';
import {EventEmitter} from 'node:events';
import assert from 'node:assert/strict';
import {resolveBrokerRequest, createArmoryHandler} from '../armory-broker.mjs';
import {normalizeItemDetail, normalizeBoardDetail, normalizeArmory, armoryRequestTarget, ArmoryClient} from '../../apps/aion2-value-atlas/scripts/armory-engine.mjs';

const base='/aion2/armory-api/';
const query='region=nae&lang=en-US&serverId=1101&characterId=fixture%3D';
const key={region:'nae',serverId:'1101',characterId:'fixture='};
const item={id:12,slotPos:2,enchantLevel:5,exceedLevel:0};
const board={id:3};
test('same-origin broker translates only approved read-only routes and exact query parameters',()=>{
 const u=resolveBrokerRequest(base+'equipment/item?'+query+'&id=12&slotPos=2&enchantLevel=5&exceedLevel=0');
 assert.equal(u.origin,'https://aion2.plaync.com');
 assert.equal(u.pathname,'/api/character/equipment/item');
 assert.equal(u.searchParams.get('characterId'),'fixture=');
 assert.equal(resolveBrokerRequest(base+'search?keyword=Fixture&region=nae&localeInfo=en-US&page=1&size=40').origin,'https://api-search.plaync.com');
 for(const invalid of [base+'info?'+query+'&url=https://example.com',base+'info?'+query+'&region=eu',base+'info?'+query.replace('nae','kr'),base+'equipment/item?'+query+'&id=12&slotPos=2&enchantLevel=-1',base+'arbitrary?'+query,'https://example.com'+base+'info?'+query,base+'info?'+query+'&token=x'])assert.throws(()=>resolveBrokerRequest(invalid));
});
function response(){
 return {status:null,headers:{},body:'',writeHead(s,h){this.status=s;this.headers=h;return this;},end(b=''){this.body=String(b);return this;}};
}
test('disabled and cross-origin broker requests never contact upstream',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not call');};
 const req={method:'GET',url:base+'info?'+query,headers:{host:'127.0.0.1:8787'}};
 const disabled=createArmoryHandler({fetchImpl,origin:'http://127.0.0.1:8787'});
 let res=response();await disabled(req,res);assert.equal(res.status,503);
 const active=createArmoryHandler({enabled:true,fetchImpl,origin:'http://127.0.0.1:8787',minInterval:0});
 res=response();await active({...req,headers:{...req.headers,origin:'https://other.example'}},res);assert.equal(res.status,403);
 res=response();await active({...req,method:'POST'},res);assert.equal(res.status,405);
 assert.equal(calls,0);
});
test('broker forwards no caller credentials, never follows redirects, and preserves denial/backoff',async()=>{
 let calls=0;const observed=[];
 const h=createArmoryHandler({enabled:true,origin:'http://127.0.0.1:8787',minInterval:0,clock:()=>100000,fetchImpl:async (u,opts)=>{observed.push([String(u),opts]);calls++;return new Response(JSON.stringify({profile:{characterName:'Fixture'}}),{status:calls===1?200:403});}});
 const req={method:'GET',url:base+'info?'+query,headers:{host:'127.0.0.1:8787',cookie:'fixture-secret',authorization:'fixture-secret'}};
 let res=response();await h(req,res);assert.equal(res.status,200);assert.match(res.body,/Fixture/);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(observed[0][1].redirect,'error');assert.equal(observed[0][1].credentials,'omit');assert.deepEqual(observed[0][1].headers,{Accept:'application/json'});
 res=response();await h(req,res);assert.equal(res.status,403);res=response();await h(req,res);assert.equal(res.status,403);assert.equal(calls,2);
});
test('broker rejects malformed and oversized responses; provider retry-after is honored',async()=>{
 const req={method:'GET',url:base+'info?'+query,headers:{host:'127.0.0.1:8787'}};
 for(const bad of ['[]','not JSON','x'.repeat(2000001)]){const h=createArmoryHandler({enabled:true,origin:'http://127.0.0.1:8787',minInterval:0,fetchImpl:async()=>new Response(bad)});const res=response();await h(req,res);assert.equal(res.status,502);}
 let calls=0;const h=createArmoryHandler({enabled:true,origin:'http://127.0.0.1:8787',minInterval:0,clock:()=>100000,fetchImpl:async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'120'}});}});
 let res=response();await h(req,res);assert.equal(res.status,429);assert.equal(res.headers['Retry-After'],'120');res=response();await h(req,res);assert.equal(res.status,429);assert.equal(calls,1);
});
test('item detail refuses mismatched identity and malformed collections instead of crashing the ledger',()=>{
 assert.equal(normalizeItemDetail(item,{id:12,name:'Fixture',subStats:[{name:'Attack',value:'20'}]}).subStats.length,1);
 for(const bad of [{id:13,name:'Other'},{id:12,slotPos:7,name:'Other slot'},{id:12,name:'Fixture',subStats:{}},{id:12,name:'Fixture',magicStoneStat:[null]},{id:12,name:'Fixture',subSkills:'bad'}])assert.throws(()=>normalizeItemDetail(item,bad));
});
test('board nodes must have unique usable identities and published board identity must agree',()=>{
 const nodes=[{nodeId:1,type:'Stat',open:false},{nodeId:2,type:'Stat',open:true}];
 assert.equal(normalizeBoardDetail(board,{nodeList:nodes}).nodeList.length,2);
 for(const bad of [{boardId:4,nodeList:nodes},{nodeList:[nodes[0],nodes[0]]},{nodeList:[null]},{nodeList:[{type:'Stat',open:false}]}])assert.throws(()=>normalizeBoardDetail(board,bad));
});
test('invalid or duplicate skill rows and malformed aggregate rows become explicitly unavailable',()=>{
 const info={profile:{characterId:'fixture=',characterName:'Fixture',serverId:1101},stat:{statList:[null]},daevanion:{boardList:[]}};
 const equip={equipment:{equipmentList:[]},skill:{skillList:[{id:2,name:'A'},{id:2,name:'B'}]}};
 const out=normalizeArmory(key,info,equip,123);
 assert.equal(out.skills,null);assert.equal(out.stats,null);assert.equal(out.summaryCoverage.skills,false);assert.equal(out.summaryCoverage.stats,false);
});

test('browser chooses only explicit same-origin route, preserving official query encoding',()=>{
 const original='https://aion2.plaync.com/api/character/info?'+query;
 const moduleUrl='http://127.0.0.1:8787/aion2/scripts/armory-engine.mjs';
 assert.equal(armoryRequestTarget(original),original);
 assert.equal(armoryRequestTarget(original,{mode:'same-origin',moduleUrl}),'http://127.0.0.1:8787/aion2/armory-api/info?'+query);
 assert.throws(()=>armoryRequestTarget('https://example.org/api/character/info?'+query,{mode:'same-origin',moduleUrl}));
});
test('a malformed equipped-item or board response becomes an isolated detail failure',async()=>{
 const client=new ArmoryClient({minInterval:0,clock:()=>100000,transport:async url=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/info'))return {status:200,body:{profile:{characterId:'fixture=',characterName:'Fixture',serverId:1101},stat:{statList:[]},daevanion:{boardList:[{id:3,name:'Board'}]}}};
  if(path.endsWith('/equipment'))return {status:200,body:{equipment:{equipmentList:[{id:12,slotPos:2,name:'Item',enchantLevel:5,exceedLevel:0},{id:13,slotPos:3,name:'Other',enchantLevel:1}]},skill:{skillList:[]}}};
  if(path.endsWith('/equipment/item'))return {status:200,body:new URL(url).searchParams.get('id')==='12'?{id:12,name:'Item',subStats:{bad:true}}:{id:13,name:'Other',subStats:[{name:'Critical Hit',value:'31'}]}};
  return {status:200,body:{nodeList:[{nodeId:1,type:'Stat',open:false},{nodeId:1,type:'Stat',open:false}]}};
 }});
 const result=await client.load(key);
 assert.equal(result.complete,false);
 assert.equal(result.equipment[0].detail,null);assert.match(result.equipment[0].detailError,/collection/);
 assert.equal(result.equipment[1].detail.subStats[0].value,'31');
 assert.equal(result.boards[0].detail,null);assert.match(result.boards[0].detailError,/duplicate/);
});

test('browser disconnect aborts the in-flight upstream read and releases the slot',async()=>{
 const req=()=>Object.assign(new EventEmitter(),{method:'GET',url:base+'info?'+query,headers:{host:'127.0.0.1:8787'}});
 const res=()=>Object.assign(new EventEmitter(),response());
 let calls=0,finish,markStarted;
 const started=new Promise(resolve=>{markStarted=resolve;});
 const handler=createArmoryHandler({enabled:true,minInterval:0,fetchImpl:async(url,{signal})=>{
  calls++;
  if(calls>1)return new Response(JSON.stringify({profile:{characterName:'Next'}}));
  return new Promise((resolve,reject)=>{
   finish=()=>resolve(new Response(JSON.stringify({profile:{characterName:'Previous'}})));
   signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
   markStarted(signal);
  });
 }});
 const firstReq=req(),firstRes=res();
 const first=handler(firstReq,firstRes);
 try{
  const signal=await started;
  firstRes.destroyed=true;
  firstRes.emit('close');
  assert.equal(signal.aborted,true,'disconnected browser must cancel the upstream read');
 }finally{
  finish?.();
  await first;
 }
 assert.equal(firstRes.status,null);
 assert.equal(firstReq.listenerCount('aborted'),0);
 assert.equal(firstRes.listenerCount('close'),0);
 const nextReq=req(),nextRes=res();
 await handler(nextReq,nextRes);
 assert.equal(nextRes.status,200);
 assert.equal(calls,2);
 assert.equal(nextReq.listenerCount('aborted'),0);
 assert.equal(nextRes.listenerCount('close'),0);
});

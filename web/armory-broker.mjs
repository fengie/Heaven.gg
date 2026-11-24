// Optional, disabled-by-default, loopback-only broker for permitted NCSOFT public reads.
// No credentials, arbitrary upstream URL, persistent cache, retries, or client instrumentation.
import {setTimeout as delay} from 'node:timers/promises';
import {characterKey} from '../apps/aion2-value-atlas/scripts/armory-engine.mjs';
const PREFIX='/aion2/armory-api/';
const GAME='https://aion2.plaync.com';
const SEARCH='https://api-search.plaync.com/aion2global/search/v2/character';
const REGIONS=new Set(['nae','naw','eu','la','as']);
const ROUTES=new Map([
 ['search',{url:SEARCH,required:['keyword','region','localeInfo','page','size'],optional:['serverId']}],
 ['servers',{url:GAME+'/en-us/api/gameinfo/servers',required:['region','lang'],optional:[]}],
 ['info',{url:GAME+'/api/character/info',required:['region','lang','serverId','characterId'],optional:[]}],
 ['equipment',{url:GAME+'/api/character/equipment',required:['region','lang','serverId','characterId'],optional:[]}],
 ['equipment/item',{url:GAME+'/api/character/equipment/item',required:['region','lang','serverId','characterId','id','slotPos','enchantLevel'],optional:['exceedLevel']}],
 ['daevanion/detail',{url:GAME+'/api/character/daevanion/detail',required:['region','lang','serverId','characterId','boardId'],optional:[]}]
]);
function int(s,min,max){
 if(typeof s!=='string'||!/^\d{1,10}$/.test(s)||!Number.isSafeInteger(Number(s))||Number(s)<min||Number(s)>max)throw Error('invalid numeric parameter');
 return String(Number(s));
}
export function resolveBrokerRequest(raw){
 if(typeof raw!=='string'||raw.length>2048||!raw.startsWith(PREFIX)||raw.includes('#')||raw.includes('\\'))throw Error('invalid armory request');
 const local=new URL(raw,'http://127.0.0.1');
 const route=local.pathname.slice(PREFIX.length),spec=ROUTES.get(route);
 if(!local.pathname.startsWith(PREFIX)||!spec)throw Error('unknown armory route');
 const p=local.searchParams,allowed=new Set([...spec.required,...spec.optional]);
 for(const k of p.keys())if(!allowed.has(k)||p.getAll(k).length!==1)throw Error('unexpected or repeated parameter');
 if(spec.required.some(k=>!p.has(k)))throw Error('missing required parameter');
 const region=p.get('region');if(!REGIONS.has(region))throw Error('invalid region');
 const out=new URL(spec.url);
 if(route==='search'){
  const keyword=p.get('keyword').trim();if(!keyword||keyword.length>100||/[\u0000-\u001f\u007f]/.test(keyword)||p.get('localeInfo')!=='en-US')throw Error('invalid character search');
  for(const [k,v] of Object.entries({keyword,region,localeInfo:'en-US',page:int(p.get('page'),1,10),size:int(p.get('size'),1,40)}))out.searchParams.set(k,v);
  if(p.has('serverId'))out.searchParams.set('serverId',int(p.get('serverId'),1,2147483647));
 }else if(route==='servers'){
  if(p.get('lang')!=='en-US')throw Error('invalid language');
  out.searchParams.set('region',region);out.searchParams.set('lang','en-US');
 }else{
  if(p.get('lang')!=='en-US')throw Error('invalid language');
  const key=characterKey({region,serverId:int(p.get('serverId'),1,2147483647),characterId:p.get('characterId')});
  for(const [k,v] of Object.entries({...key,lang:'en-US'}))out.searchParams.set(k,v);
  for(const k of ['id','boardId','slotPos','enchantLevel','exceedLevel'])if(p.has(k))out.searchParams.set(k,int(p.get(k),k==='id'||k==='boardId'?1:0,2147483647));
 }
 return out;
}
const MAX_BYTES=2_000_000;
async function boundedJSON(response){
 const len=response.headers.get('Content-Length');
 if(len!==null&&Number(len)>MAX_BYTES)throw Error('response too large');
 const reader=response.body?.getReader();if(!reader)throw Error('empty response');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw Error('response too large');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const body=Buffer.concat(chunks.map(x=>Buffer.from(x)),size).toString('utf8');
 const parsed=JSON.parse(body);if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed))throw Error('invalid response schema');
 return JSON.stringify(parsed);
}
function send(res,status,body,extra={}){
 if(res.destroyed)return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}).end(body);
}
const errorBody=message=>JSON.stringify({error:message});
function retrySeconds(value,now){
 const n=typeof value==='string'&&/^\d+$/.test(value)?Number(value):Math.ceil((Date.parse(value)-now)/1000);
 return Number.isSafeInteger(n)?Math.max(60,n):60;
}
export function createArmoryHandler({enabled=false,origin='http://127.0.0.1:8787',fetchImpl=fetch,clock=Date.now,minInterval=1000}={}){
 const local=new URL(origin);if(local.protocol!=='http:'||local.hostname!=='127.0.0.1'||local.username||local.password||local.pathname!=='/'||local.search||local.hash)throw Error('broker requires a loopback origin');
 if(!Number.isFinite(minInterval)||minInterval<0||minInterval>5000)throw Error('invalid pacing');
 const origins=new Map();
 return async(req,res)=>{
  if(req.method!=='GET')return send(res,405,errorBody('GET only'),{Allow:'GET'});
  if(req.headers?.host!==local.host||req.headers?.origin&&req.headers.origin!==local.origin||req.headers?.['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return send(res,403,errorBody('same-origin local requests only'));
  if(!enabled)return send(res,503,errorBody('public armory transport is disabled'));
  let upstream;try{upstream=resolveBrokerRequest(req.url);}catch{return send(res,400,errorBody('invalid armory request'));}
  const state=origins.get(upstream.origin)??{next:0,backoff:0,denied:false,busy:false};
  origins.set(upstream.origin,state);
  if(state.denied)return send(res,403,errorBody('upstream denied access'));
  if(clock()<state.backoff)return send(res,429,errorBody('provider backoff'),{'Retry-After':String(Math.max(1,Math.ceil((state.backoff-clock())/1000)))});
  if(state.busy)return send(res,429,errorBody('one request per origin at a time'),{'Retry-After':'1'});
  state.busy=true;
  try{
   const wait=state.next-clock();if(wait>0)await delay(wait);
   if(req.aborted||res.destroyed)return;
   state.next=clock()+minInterval;
   const response=await fetchImpl(upstream.href,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
   if(response.redirected)throw Error('redirected');
   if(response.status===401||response.status===403)state.denied=true;
   if(response.status===429||response.status===503){
    const seconds=retrySeconds(response.headers.get('Retry-After'),clock());
    state.backoff=clock()+seconds*1000;
    await response.body?.cancel().catch(()=>{});
    return send(res,response.status,errorBody('provider backoff'),{'Retry-After':String(seconds)});
   }
   if(response.status!==200){
    await response.body?.cancel().catch(()=>{});
    return send(res,response.status>=400&&response.status<500?response.status:502,errorBody('upstream response unavailable'));
   }
   const body=await boundedJSON(response);
   return send(res,200,body);
  }catch{return send(res,502,errorBody('upstream network or response error'));}
  finally{state.busy=false;}
 };
}

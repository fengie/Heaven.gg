import {planRefresh} from './intelligence-engine.mjs';
// NCSOFT web-app endpoints documented by axsddlr/aion2_api and nuriland/aion2-api.
// Provider permission, browser CORS and live schema remain independent release gates.
const regions=new Set(['nae','naw','eu','la','as']);
const game='https://aion2.plaync.com', search='https://api-search.plaync.com/aion2global/search/v2/character';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const id=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:null;
const text=v=>typeof v==='string'?v.slice(0,512):'';
function decoded(v){let s=text(v);for(let i=0;i<2&&/%[0-9a-f]{2}/i.test(s);i++){try{s=decodeURIComponent(s);}catch{throw Error('invalid character identity');}}if(!/^[A-Za-z0-9+/_=-]{1,256}$/.test(s))throw Error('invalid character identity');return s;}
export function characterKey(input){
 if(!record(input)||!regions.has(input.region)||!/^\d{1,10}$/.test(String(input.serverId))||Number(input.serverId)<=0)throw Error('invalid region/server identity');
 return {region:input.region,serverId:String(input.serverId),characterId:decoded(input.characterId)};
}
const keyId=k=>JSON.stringify(characterKey(k));
function same(a,b){try{return keyId(a)===keyId(b);}catch{return false;}}
function url(path,params){const u=new URL(path);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));return u.toString();}
function endpoint(name,key,extra={}){return url(`${game}/api/character/${name}`,{...characterKey(key),lang:'en-US',...extra});}
function array(value,limit){if(!Array.isArray(value)||value.length>limit)throw Error('provider schema or size mismatch');return value;}
const optional=(v,limit)=>v==null?null:array(v,limit);
export function normalizeSearch(data,region){
 if(!regions.has(region))throw Error('invalid region');
 const rows=[],seen=new Set();for(const c of array(data?.list,200)){
  if(!record(c)||c.region&&c.region!==region)continue;
  const name=text(c.name).replace(/<\/?strong>/gi,'');if(!name)continue;
  let k;try{k=characterKey({region,serverId:c.serverId,characterId:c.characterId});}catch{continue;}
  if(seen.has(keyId(k)))continue;seen.add(keyId(k));rows.push({key:k,name,serverName:text(c.serverName),level:number(c.level)});
 }return rows;
}
export function normalizeArmory(input,info,equip,now=Date.now()){
 const key=characterKey(input),p=info?.profile;
 if(!record(p)||!p.characterName||decoded(p.characterId)!==key.characterId||p.serverId!=null&&String(p.serverId)!==key.serverId)throw Error('character identity missing or mismatch');
 if(!record(equip?.equipment)||!record(info?.stat))throw Error('armory response schema mismatch');
 const stats=optional(info.stat.statList,500),skills=optional(equip.skill?.skillList,500),rawGear=optional(equip.equipment.equipmentList,100),rawBoards=optional(info.daevanion?.boardList,30);
 const slots=new Set(),boardIds=new Set();
 const equipment=(rawGear??[]).map(g=>{
  if(!record(g)||!id(g.id)||!Number.isSafeInteger(g.slotPos)||g.slotPos<0||slots.has(g.slotPos))throw Error('invalid/duplicate equipment slot');slots.add(g.slotPos);
  return {id:g.id,slotPos:g.slotPos,slotPosName:text(g.slotPosName),name:text(g.name),grade:text(g.grade),enchantLevel:number(g.enchantLevel),exceedLevel:number(g.exceedLevel),detail:null,detailCheckedAt:null};
 });
 const boards=(rawBoards??[]).map(b=>{if(!id(b.id)||boardIds.has(b.id))throw Error('invalid/duplicate board');boardIds.add(b.id);return {id:b.id,name:text(b.name),openNodeCount:number(b.openNodeCount),totalNodeCount:number(b.totalNodeCount),detail:null,detailCheckedAt:null};});
 return {schema:'heaven-gg/aion2-armory/v1',key,checkedAt:now,upstreamObservedAt:null,patch:null,name:text(p.characterName),className:text(p.className),serverName:text(p.serverName),characterLevel:number(p.characterLevel),combatPower:number(p.combatPower),itemLevel:number(stats?.find(x=>x.type==='ItemLevel')?.value),stats,skills:skills?.map(s=>({id:s.id,name:text(s.name),skillLevel:number(s.skillLevel),category:text(s.category),equip:s.equip??null,acquired:s.acquired??null}))??null,equipment,boards,title:info.title??null,petwing:equip.petwing??null,resources:null,quests:null,specializations:null,claims:null,summaryCoverage:{stats:stats!==null,skills:skills!==null,equipment:rawGear!==null,boards:rawBoards!==null}};
}
function wait(ms,signal){if(signal?.aborted)return Promise.reject(signal.reason??Error('aborted'));return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason??Error('aborted'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});}
export async function browserTransport(request,{signal}={}){
 const controller=AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])]);
 const response=await fetch(request,{method:'GET',credentials:'omit',redirect:'error',signal:controller,headers:{Accept:'application/json'},cache:'default',referrerPolicy:'no-referrer'});
 if(!response.ok)return {status:response.status,retryAfter:response.headers.get('Retry-After')};
 const reader=response.body?.getReader();if(!reader)throw Error('empty response');let total=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>2_000_000)throw Error('provider response too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return {status:response.status,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
}
export class ArmoryClient{
 constructor({transport=browserTransport,clock=Date.now,minInterval=1000,ttl=300000}={}){this.transport=transport;this.clock=clock;this.minInterval=minInterval;this.ttl=ttl;this.origins=new Map();this.queue=Promise.resolve();}
 async request(request,signal){
  // Serialized across origins, with one-second minimum spacing per origin and no speculative retries.
  const run=async()=>{
   signal?.throwIfAborted();const origin=new URL(request).origin;
   if(origin!==game&&origin!==new URL(search).origin)throw Error('unapproved source');
   const state=this.origins.get(origin)??{next:0,backoff:0};this.origins.set(origin,state);
   if(state.denied)throw Error('provider denied access; no retry in this session');
   if(this.clock()<state.backoff)throw Error('provider backoff; try again later');
   const delay=state.next-this.clock();if(delay>0)await wait(delay,signal);
   signal?.throwIfAborted();state.next=this.clock()+this.minInterval;
   let r;try{r=await this.transport(request,{signal});}catch(e){signal?.throwIfAborted();throw Error('Official data unavailable (network or browser CORS)');}
   signal?.throwIfAborted();if(r.status===429||r.status===503){const seconds=typeof r.retryAfter==='string'&&/^\d+$/.test(r.retryAfter)?Number(r.retryAfter)*1000:Math.max(0,Date.parse(r.retryAfter)-this.clock());state.backoff=this.clock()+Math.max(60000,Number.isFinite(seconds)?seconds:0);}
   if(r.status===401||r.status===403)state.denied=true;
   if(r.status!==200||!record(r.body))throw Error(`Official provider HTTP ${r.status}; no automatic retry`);return r.body;
  };
  const pending=this.queue.then(run,run);this.queue=pending.catch(()=>{});return pending;
 }
 async search(name,region,{signal,page=1}={}){
  const keyword=typeof name==='string'?name.trim():'';if(!keyword||keyword.length>100||!regions.has(region)||!Number.isSafeInteger(page)||page<1||page>10)throw Error('enter a name and Global region');
  const data=await this.request(url(search,{keyword,region,localeInfo:'en-US',page,size:40}),signal);
  return {rows:normalizeSearch(data,region),hasMore:Number(data.pagination?.endPage)>page};
 }
 async load(input,{previous=null,trigger='open',slotPos,visible=true,signal,onProgress=()=>{}}={}){
  const key=characterKey(input);if(previous&&!same(previous.key,key))previous=null;
  const plan=planRefresh({trigger,visible,now:this.clock(),snapshot:previous,key,slotPos,ttl:this.ttl});
  if(!visible||trigger==='goal')return previous;
  let s;
  if(plan.summary){onProgress('Checking character and equipment');const info=await this.request(endpoint('info',key),signal),equip=await this.request(endpoint('equipment',key),signal);s=normalizeArmory(key,info,equip,this.clock());
   // Carry only same equipped instance and board snapshots. TTL and reroll signals still revalidate.
   for(const g of s.equipment){const old=previous?.equipment.find(x=>x.slotPos===g.slotPos&&x.id===g.id&&x.enchantLevel===g.enchantLevel&&x.exceedLevel===g.exceedLevel);if(old){g.detail=old.detail;g.detailCheckedAt=old.detailCheckedAt;g.detailError=old.detailError;}}
   for(const b of s.boards){const old=previous?.boards.find(x=>x.id===b.id&&x.openNodeCount===b.openNodeCount&&x.totalNodeCount===b.totalNodeCount);if(old){b.detail=old.detail;b.detailCheckedAt=old.detailCheckedAt;b.detailError=old.detailError;}}
  }else{s=structuredClone(previous);if(!s)return null;}
  const expired=t=>!Number.isFinite(t)||t>this.clock()||this.clock()-t>=this.ttl;
  const work=[];
  for(const g of s.equipment)if(!g.detail||expired(g.detailCheckedAt)||trigger==='refresh'||trigger==='reroll'&&g.slotPos===slotPos)work.push({g,label:g.slotPosName||g.name,path:'equipment/item',params:{id:g.id,slotPos:g.slotPos,enchantLevel:g.enchantLevel??0,...(g.exceedLevel===null?{}:{exceedLevel:g.exceedLevel})},validate:r=>Number(r.id)===g.id&&(Array.isArray(r.subStats)||typeof r.name==='string')});
  for(const b of s.boards)if(!b.detail||expired(b.detailCheckedAt)||trigger==='refresh')work.push({g:b,label:b.name,path:'daevanion/detail',params:{boardId:b.id},validate:r=>Array.isArray(r.nodeList)&&r.nodeList.length<=400});
  for(let i=0;i<work.length;i++){
   const w=work[i];signal?.throwIfAborted();onProgress(`Checking ${w.label} (${i+1}/${work.length})`);
   try{const r=await this.request(endpoint(w.path,key,w.params),signal);if(!w.validate(r))throw Error('detail schema/identity mismatch');w.g.detail=r;w.g.detailCheckedAt=this.clock();w.g.detailError=null;}
   catch(e){signal?.throwIfAborted();w.g.detail=null;w.g.detailCheckedAt=null;w.g.detailError=e.message;}
  }
  signal?.throwIfAborted();s.complete=Object.values(s.summaryCoverage).every(Boolean)&&s.equipment.every(x=>x.detail!==null)&&s.boards.every(x=>x.detail!==null);return s;
 }
}

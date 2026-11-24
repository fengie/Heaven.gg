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
// A user-supplied official profile link is an identity, never an arbitrary fetch target.
export function parseOfficialCharacterLink(input){
 if(typeof input!=='string'||input.length>2048)throw Error('Invalid official character link');
 let u;try{u=new URL(input.trim());}catch{throw Error('Invalid official character link');}
 if(u.origin!=='https://aion2.plaync.com'||u.username||u.password||u.hash||
    !(u.pathname==='/api/character/info'||/^\/[a-z]{2}-[a-z]{2}\/characters\/[a-z0-9/_-]+$/i.test(u.pathname)))throw Error('Use an official AION 2 character link');
 const p=u.searchParams;
 for(const k of ['region','serverId','characterId'])if(p.getAll(k).length!==1)throw Error('Link must include exact region, server and character ID');
 return characterKey({region:p.get('region'),serverId:p.get('serverId'),characterId:p.get('characterId')});
}
const keyId=k=>JSON.stringify(characterKey(k));
function same(a,b){try{return keyId(a)===keyId(b);}catch{return false;}}
function url(path,params){const u=new URL(path);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));return u.toString();}
function endpoint(name,key,extra={}){return url(`${game}/api/character/${name}`,{...characterKey(key),lang:'en-US',...extra});}
function array(value,limit){if(!Array.isArray(value)||value.length>limit)throw Error('provider schema or size mismatch');return value;}
const optional=(v,limit)=>v==null?null:array(v,limit);
const optionalRows=(v,limit)=>Array.isArray(v)&&v.length<=limit&&v.every(record)?v:null;
function sameNumber(published,expected){
 return published==null||expected==null||
  (typeof published==='number'||typeof published==='string'&&/^\d+$/.test(published))&&Number.isSafeInteger(Number(published))&&Number(published)===expected;
}
export function normalizeItemDetail(item,data){
 if(!record(data)||data.id==null||!sameNumber(data.id,item.id)||!sameNumber(data.slotPos,item.slotPos)||!sameNumber(data.enchantLevel,item.enchantLevel)||!sameNumber(data.exceedLevel,item.exceedLevel)||!(typeof data.name==='string'&&data.name.trim()||Array.isArray(data.subStats)))throw Error('item detail identity/schema mismatch');
 for(const field of ['mainStats','subStats','subSkills','magicStoneStat','godStoneStat']){
  if(data[field]!=null&&!optionalRows(data[field],128))throw Error('invalid item detail collection: '+field);
 }
 return data;
}
export function normalizeBoardDetail(board,data){
 if(!record(data)||!sameNumber(data.boardId,board.id)||!optionalRows(data.nodeList,400))throw Error('invalid board detail');
 const identities=new Set(),coords=new Set();
 const nodeList=data.nodeList.map(n=>{
  const validCoord=Number.isSafeInteger(n.row)&&n.row>=0&&n.row<=100&&Number.isSafeInteger(n.col)&&n.col>=0&&n.col<=100;
  const coord=validCoord?n.row+':'+n.col:null;
  const nodeId=id(n.nodeId);
  if(typeof n.type!=='string'||!n.type||!nodeId&&!validCoord)throw Error('invalid board node identity');
  const identity=nodeId?'id:'+nodeId:'coord:'+coord;
  if(identities.has(identity)||coord!==null&&coords.has(coord))throw Error('duplicate board node');
  identities.add(identity);if(coord!==null)coords.add(coord);
  if(n.effectList!=null&&!optionalRows(n.effectList,128))throw Error('invalid board node effects');
  return {...n,nodeId:nodeId??undefined};
 });
 for(const field of ['openStatEffectList','openSkillEffectList'])if(data[field]!=null&&!optionalRows(data[field],500))throw Error('invalid board effect collection');
 return {...data,nodeList};
}
export function armoryRequestTarget(request,{mode='direct',moduleUrl=import.meta.url}={}){
 if(mode==='direct')return request;
 if(mode!=='same-origin')throw Error('invalid armory transport');
 const u=new URL(request);
 const routes=new Map([
  ['https://api-search.plaync.com/aion2global/search/v2/character','search'],
  ['https://aion2.plaync.com/api/character/info','info'],
  ['https://aion2.plaync.com/api/character/equipment','equipment'],
  ['https://aion2.plaync.com/api/character/equipment/item','equipment/item'],
  ['https://aion2.plaync.com/api/character/daevanion/detail','daevanion/detail']
 ]);
 const route=routes.get(u.origin+u.pathname);if(!route||u.username||u.password||u.hash)throw Error('unapproved armory route');
 const target=new URL('../armory-api/'+route+u.search,moduleUrl);
 if(target.origin!==new URL(moduleUrl).origin)throw Error('invalid local armory route');
 return target.href;
}
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
 if(!record(p)||typeof p.characterName!=='string'||!p.characterName.trim()||decoded(p.characterId)!==key.characterId||p.serverId!=null&&String(p.serverId)!==key.serverId)throw Error('character identity missing or mismatch');
 if(!record(equip?.equipment)||!record(info?.stat))throw Error('armory response schema mismatch');
 const stats=optionalRows(info.stat.statList,500),skillRows=optionalRows(equip.skill?.skillList,500),rawGear=optional(equip.equipment.equipmentList,100),rawBoards=optional(info.daevanion?.boardList,30);
 const skills=skillRows&&skillRows.every(s=>id(s.id))&&new Set(skillRows.map(s=>s.id)).size===skillRows.length?skillRows:null;
 const slots=new Set(),boardIds=new Set();
 const equipment=(rawGear??[]).map(g=>{
  if(!record(g)||!id(g.id)||!Number.isSafeInteger(g.slotPos)||g.slotPos<0||slots.has(g.slotPos))throw Error('invalid/duplicate equipment slot');slots.add(g.slotPos);
  return {id:g.id,slotPos:g.slotPos,slotPosName:text(g.slotPosName),name:text(g.name),grade:text(g.grade),enchantLevel:number(g.enchantLevel),exceedLevel:number(g.exceedLevel),detail:null,detailCheckedAt:null};
 });
 const boards=(rawBoards??[]).map(b=>{if(!id(b.id)||boardIds.has(b.id))throw Error('invalid/duplicate board');boardIds.add(b.id);return {id:b.id,name:text(b.name),openNodeCount:number(b.openNodeCount),totalNodeCount:number(b.totalNodeCount),detail:null,detailCheckedAt:null};});
 return {schema:'heaven-gg/aion2-armory/v1',key,checkedAt:now,upstreamObservedAt:null,patch:null,name:text(p.characterName),className:text(p.className),serverName:text(p.serverName),characterLevel:number(p.characterLevel),combatPower:number(p.combatPower),itemLevel:number(stats?.find(x=>x.type==='ItemLevel')?.value),stats,skills:skills?.map(s=>({id:s.id,name:text(s.name),skillLevel:number(s.skillLevel),category:text(s.category),equip:s.equip??null,acquired:s.acquired??null}))??null,equipment,boards,title:info.title??null,petwing:equip.petwing??null,resources:null,quests:null,specializations:null,claims:null,summaryCoverage:{stats:stats!==null,skills:skills!==null,equipment:rawGear!==null,boards:rawBoards!==null}};
}
// Portable observations are user-owned data. Validate and project only known fields;
// never accept an imported completeness flag, private state, or fresh timestamp by assertion.
const primitive=v=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=1024;
function fields(row,keys){
 if(!record(row))throw Error('Invalid observation row');
 const out={};
 for(const k of keys)if(Object.hasOwn(row,k)&&primitive(row[k]))out[k]=row[k];
 return out;
}
const lineFields=['id','name','type','value','minValue','extra','exceed','level','slotPos','grade','desc'];
function projectedRows(value,limit,keys=lineFields){
 if(value==null)return null;
 if(!optionalRows(value,limit))throw Error('Invalid observation collection');
 return value.map(row=>fields(row,keys));
}
function timestamp(value,now,optional=false){
 if(value==null&&optional)return null;
 if(!Number.isSafeInteger(value)||value<0||value>now)throw Error('Invalid observation timestamp');
 return value;
}
export function normalizeImportedSnapshot(input,now=Date.now()){
 if(input?.schema!=='heaven-gg/aion2-armory/v1'||!Number.isSafeInteger(now)||now<0)throw Error('Unsupported armory snapshot');
 const key=characterKey(input.key),checkedAt=timestamp(input.checkedAt,now);
 if(!Array.isArray(input.equipment)||input.equipment.length>100||!input.equipment.every(record)||
    !Array.isArray(input.boards)||input.boards.length>30||!input.boards.every(record))throw Error('Invalid observation manifest');
 const stats=projectedRows(input.stats,500);
 if(stats)for(let i=0;i<stats.length;i++){
  const second=input.stats[i].statSecondList;
  if(Array.isArray(second)&&second.length<=100&&second.every(x=>typeof x==='string'&&x.length<=512))stats[i].statSecondList=[...second];
 }
 const skills=projectedRows(input.skills,500,['id','name','skillLevel','category','equip','acquired']);
 const info={profile:{characterId:key.characterId,serverId:key.serverId,characterName:input.name,className:input.className,serverName:input.serverName,characterLevel:input.characterLevel,combatPower:input.combatPower},stat:{statList:stats},daevanion:{boardList:input.summaryCoverage?.boards===false?null:input.boards.map(b=>fields(b,['id','name','openNodeCount','totalNodeCount']))}};
 const equip={equipment:{equipmentList:input.summaryCoverage?.equipment===false?null:input.equipment.map(g=>fields(g,['id','slotPos','slotPosName','name','grade','enchantLevel','exceedLevel']))},skill:{skillList:skills}};
 const result=normalizeArmory(key,info,equip,checkedAt);
 if((skills!==null&&result.skills===null)||result.equipment.length!==input.equipment.length||result.boards.length!==input.boards.length)throw Error('Inconsistent observation manifest');
 result.upstreamObservedAt=timestamp(input.upstreamObservedAt,now,true);
 result.patch=typeof input.patch==='string'&&input.patch.length<=128?input.patch:null;
 for(let i=0;i<result.equipment.length;i++){
  const g=result.equipment[i],old=input.equipment[i];
  if(old.detail==null)continue;
  const detail=normalizeItemDetail(g,old.detail);
  const projected=fields(detail,['id','name','grade','gradeName','level','equipLevel','slotPos','enchantLevel','exceedLevel','maxEnchantLevel','maxExceedEnchantLevel','magicStoneSlotCount','godStoneSlotCount','subStatCount','subSkillCountMax','soulBindRate','subStatRandom']);
  for(const k of ['mainStats','subStats','subSkills','magicStoneStat','godStoneStat'])if(detail[k]!=null)projected[k]=projectedRows(detail[k],128);
  g.detail=normalizeItemDetail(g,projected);g.detailCheckedAt=timestamp(old.detailCheckedAt,now,true);
 }
 for(let i=0;i<result.boards.length;i++){
  const b=result.boards[i],old=input.boards[i];if(old.detail==null)continue;
  const raw=normalizeBoardDetail(b,old.detail),projected={boardId:b.id,nodeList:raw.nodeList.map(n=>{
   const row=fields(n,['nodeId','boardId','row','col','type','open','name','grade']);
   if(n.effectList!=null)row.effectList=projectedRows(n.effectList,128);
   return row;
  })};
  for(const k of ['openStatEffectList','openSkillEffectList'])if(raw[k]!=null)projected[k]=projectedRows(raw[k],500);
  b.detail=normalizeBoardDetail(b,projected);b.detailCheckedAt=timestamp(old.detailCheckedAt,now,true);
 }
 // Optional display-only public fields are deliberately reduced to known metadata.
 if(record(input.title)){
  result.title=fields(input.title,['totalCount','ownedCount']);
  if(Array.isArray(input.title.titleList)&&input.title.titleList.length<=2000&&input.title.titleList.every(record))result.title.titleList=input.title.titleList.map(t=>fields(t,['id','name','grade','equipCategory','totalCount','ownedCount','ownedPercent']));
 }
 if(record(input.petwing)){
  result.petwing={};for(const k of ['pet','wing','wingSkin'])if(record(input.petwing[k]))result.petwing[k]=fields(input.petwing[k],['id','name','level','grade','enchantLevel']);
 }
 result.complete=Object.values(result.summaryCoverage).every(Boolean)&&result.equipment.every(x=>x.detail!==null)&&result.boards.every(x=>x.detail!==null);
 return result;
}
function wait(ms,signal){if(signal?.aborted)return Promise.reject(signal.reason??Error('aborted'));return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason??Error('aborted'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});}
export async function browserTransport(request,{signal}={}){
 const controller=AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])]);
 const mode=globalThis.document?.querySelector('meta[name="heaven-gg-armory-transport"][content="same-origin"]')?'same-origin':'direct';
 const response=await fetch(armoryRequestTarget(request,{mode}),{method:'GET',credentials:'omit',redirect:'error',signal:controller,headers:{Accept:'application/json'},cache:'no-store',referrerPolicy:'no-referrer'});
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
  for(const g of s.equipment)if(!g.detail||expired(g.detailCheckedAt)||trigger==='refresh'||trigger==='reroll'&&g.slotPos===slotPos)work.push({g,label:g.slotPosName||g.name,path:'equipment/item',params:{id:g.id,slotPos:g.slotPos,enchantLevel:g.enchantLevel??0,...(g.exceedLevel===null?{}:{exceedLevel:g.exceedLevel})},normalize:r=>normalizeItemDetail(g,r)});
  for(const b of s.boards)if(!b.detail||expired(b.detailCheckedAt)||trigger==='refresh')work.push({g:b,label:b.name,path:'daevanion/detail',params:{boardId:b.id},normalize:r=>normalizeBoardDetail(b,r)});
  for(let i=0;i<work.length;i++){
   const w=work[i];signal?.throwIfAborted();onProgress(`Checking ${w.label} (${i+1}/${work.length})`);
   try{const r=await this.request(endpoint(w.path,key,w.params),signal);w.g.detail=w.normalize(r);w.g.detailCheckedAt=this.clock();w.g.detailError=null;}
   catch(e){signal?.throwIfAborted();w.g.detail=null;w.g.detailCheckedAt=null;w.g.detailError=e.message;}
  }
  signal?.throwIfAborted();s.complete=Object.values(s.summaryCoverage).every(Boolean)&&s.equipment.every(x=>x.detail!==null)&&s.boards.every(x=>x.detail!==null);return s;
 }
}

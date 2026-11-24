// Local interoperability with documented public armory bundles and a2log v1.
// No network, credentials, native-client inspection, or implicit character binding.
import {characterKey,normalizeArmory,normalizeBoardDetail,normalizeImportedSnapshot} from './armory-engine.mjs';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=200)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;
const bounded=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const count=(v,max=100000)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const same=(a,b)=>JSON.stringify(characterKey(a))===JSON.stringify(characterKey(b));
const flags=['crit','double','perfect','dot','back','front'];
const statKeys=['critical_hit','attack','accuracy','double_pct','perfect_pct','multihit_pct','combat_speed_pct','cooldown_pct'];
const historySchema='heaven-gg/aion2-combat-evidence/v1';

export function rawArmoryIdentity(data,region){
 const p=data?.info?.profile;
 if(!record(p)||p.serverId==null||!text(p.characterName,512))throw Error('Raw armory bundle lacks an exact profile identity');
 if(p.region&&p.region!==region||data.region&&data.region!==region)throw Error('Raw armory region mismatch');
 return characterKey({region,serverId:p.serverId,characterId:p.characterId});
}
export function normalizeRawArmoryBundle(data,input,now=Date.now()){
 if(!record(data)||!record(data.info)||!record(data.equipment)||!record(data.daevanion))throw Error('Expected raw info/equipment/daevanion bundle');
 const key=characterKey(input);
 if(!same(rawArmoryIdentity(data,key.region),key))throw Error('Raw armory character mismatch');
 // Original provider check time is absent in this format. Zero is the existing
 // snapshot schema sentinel for unknown time, not the date of import.
 const snapshot=normalizeArmory(key,data.info,data.equipment,0);
 const boards=new Map(snapshot.boards.map(b=>[String(b.id),b]));
 for(const [id,raw] of Object.entries(data.daevanion)){
  const b=boards.get(id);
  if(!b)throw Error('Unexpected raw board identity');
  const detail=normalizeBoardDetail(b,raw);
  if(detail.nodeList.some(n=>n.boardId!=null&&String(n.boardId)!==id))throw Error('Raw board node identity mismatch');
  const meaningful=detail.nodeList.filter(n=>n.type!=='Start'&&n.type!=='None');
  if(meaningful.some(n=>![0,1,false,true].includes(n.open)))throw Error('Raw board open state missing');
  const opened=meaningful.filter(n=>n.open===1||n.open===true).length;
  if(b.totalNodeCount!==null&&meaningful.length!==b.totalNodeCount||b.openNodeCount!==null&&opened!==b.openNodeCount)throw Error('Raw board counts do not reconcile');
  b.detail=detail;b.detailCheckedAt=null;
 }
 return normalizeImportedSnapshot(snapshot,now);
}

export function inspectA2Log(data){
 if(!record(data)||data.format!=='a2log'||data.version!==1)throw Error('Expected a2log v1 JSON; native Combat Analysis files are not yet supported');
 if(!Array.isArray(data.players)||!data.players.length||data.players.length>128||!Array.isArray(data.segments)||!data.segments.length||data.segments.length>100)throw Error('Combat roster or segment count exceeds supported limits');
 const ids=new Set(),players=data.players.map(p=>{
  if(!record(p)||!text(p.id)||!text(p.name)||ids.has(p.id)||p.id!==p.id.trim())throw Error('Invalid or duplicate combat actor');
  ids.add(p.id);return {id:p.id,name:p.name};
 });
 let total=0;
 const segments=data.segments.map((s,i)=>{
  if(!record(s)||!bounded(s.duration,0.001,86400)||!Array.isArray(s.hits)||(total+=s.hits.length)>100000)throw Error('Invalid or oversized combat segments');
  return {index:i,label:text(s.boss)||text(s.label)||'Encounter '+(i+1),duration:s.duration};
 });
 return {players,segments};
}
function originalDate(value,now){
 if(value==null)return null;
 if(typeof value!=='string'||value.length>64||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value))throw Error('Invalid original combat timestamp');
 const t=Date.parse(value);
 if(!Number.isFinite(t)||t<0||t>now)throw Error('Invalid original combat timestamp');
 return t;
}
function playerStats(input){
 const stats={};
 if(record(input))for(const key of statKeys)if(bounded(input[key]))stats[key]=input[key];
 return stats;
}
function normalizeFight(f,now){
 if(!record(f)||!bounded(f.duration,0.001,86400)||!bounded(f.damage)||!count(f.hits)||!f.hits||!['flagged partial','unknown','reported not partial'].includes(f.completeness))throw Error('Invalid retained combat summary');
 if(f.recordedAt!==null&&(!Number.isSafeInteger(f.recordedAt)||f.recordedAt<0||f.recordedAt>now))throw Error('Invalid retained combat timestamp');
 const counters={};
 for(const k of flags){
  const row=f.flags?.[k];
  if(!record(row)||!count(row.known,f.hits)||!count(row.positive,row.known))throw Error('Invalid combat annotation denominator');
  counters[k]={positive:row.positive,known:row.known};
 }
 if(!record(f.multi)||!count(f.multi.known,f.hits)||!count(f.multi.extraHits,Number.MAX_SAFE_INTEGER))throw Error('Invalid multi-hit summary');
 if(!Array.isArray(f.skills)||!f.skills.length||f.skills.length>1000)throw Error('Invalid combat skill summary');
 const skills=f.skills.map(s=>{
  if(!record(s)||!text(s.name)||!bounded(s.damage)||!count(s.hits,f.hits)||!s.hits)throw Error('Invalid combat skill summary');
  return {name:s.name,damage:s.damage,hits:s.hits};
 });
 const sum=skills.reduce((n,s)=>n+s.damage,0);
 if(skills.reduce((n,s)=>n+s.hits,0)!==f.hits||Math.abs(sum-f.damage)>Math.max(1e-8,f.damage*1e-10))throw Error('Combat summary totals do not reconcile');
 return {recordedAt:f.recordedAt,source:text(f.source),patch:text(f.patch),encounter:text(f.encounter),difficulty:text(f.difficulty),target:text(f.target),duration:f.duration,damage:f.damage,dps:f.damage/f.duration,hits:f.hits,completeness:f.completeness,combatPower:bounded(f.combatPower)?f.combatPower:null,stats:playerStats(f.stats),flags:counters,multi:{extraHits:f.multi.extraHits,known:f.multi.known},skills};
}
export function summarizeA2Log(data,{key,playerId,segmentIndex,confirmed=false,now=Date.now()}={}){
 characterKey(key);
 if(confirmed!==true)throw Error('Confirm the recorded actor belongs to the selected character');
 const overview=inspectA2Log(data),actor=data.players.find(p=>p.id===playerId);
 if(!actor||!Number.isInteger(segmentIndex)||segmentIndex<0||segmentIndex>=data.segments.length)throw Error('Choose the recorded actor and segment explicitly');
 const segment=data.segments[segmentIndex],meta=record(data.meta)?data.meta:{},ids=new Set(overview.players.map(p=>p.id));
 let damage=0,hits=0;const counters=Object.fromEntries(flags.map(k=>[k,{positive:0,known:0}])),multi={extraHits:0,known:0},skills=new Map();
 for(const h of segment.hits){
  if(!record(h)||!ids.has(h.player)||!bounded(h.t,0,segment.duration)||!bounded(h.damage))throw Error('Invalid combat hit');
  if(flags.some(k=>h[k]!=null&&typeof h[k]!=='boolean')||h.multi!=null&&!count(h.multi,100000))throw Error('Invalid combat hit annotations');
  if(h.player!==playerId)continue;
  damage+=h.damage;hits++;
  for(const k of flags)if(typeof h[k]==='boolean'){counters[k].known++;if(h[k])counters[k].positive++;}
  if(h.multi!=null){multi.known++;multi.extraHits+=h.multi;}
  const name=text(h.skill)||'Unknown skill',id=Number.isSafeInteger(h.skill_id)&&h.skill_id>0?'id:'+h.skill_id:'name:'+name;
  const s=skills.get(id)??{name,damage:0,hits:0};s.damage+=h.damage;s.hits++;skills.set(id,s);
  if(skills.size>1000)throw Error('Too many distinct combat skills');
 }
 if(!hits||!bounded(damage))throw Error('Selected actor has no usable damage records');
 const partial=segment.partial_capture===true||meta.capture_active===true||record(meta.reconstruction);
 return normalizeFight({recordedAt:originalDate(segment.start??meta.recorded_at,now),source:meta.source,patch:segment.game_patch??meta.game_patch,encounter:segment.encounter_type??meta.encounter_type,difficulty:segment.difficulty??meta.difficulty,target:segment.boss??segment.label,duration:segment.duration,damage,hits,completeness:partial?'flagged partial':segment.partial_capture===false&&meta.capture_active===false?'reported not partial':'unknown',combatPower:actor.combat_power,stats:actor.stats,flags:counters,multi,skills:[...skills.values()].sort((a,b)=>b.damage-a.damage)},now);
}
export function normalizeCombatEvidence(data,key,now=Date.now()){
 const normalized=characterKey(key);
 if(data?.schema!==historySchema||!same(data.key,normalized)||!Array.isArray(data.fights)||data.fights.length>20)throw Error('Invalid or mismatched combat evidence history');
 return {schema:historySchema,key:normalized,fights:data.fights.map(f=>normalizeFight(f,now))};
}
export function appendCombatEvidence(history,fight,key,now=Date.now()){
 const normalized=characterKey(key),current=history?normalizeCombatEvidence(history,normalized,now):{schema:historySchema,key:normalized,fights:[]};
 const next=normalizeFight(fight,now),fingerprint=JSON.stringify(next);
 if(!current.fights.some(f=>JSON.stringify(f)===fingerprint))current.fights=[...current.fights,next].slice(-20);
 return current;
}
export function compareRecordedFights(a,b){
 if(!a||!b||a.completeness==='flagged partial'||b.completeness==='flagged partial'||a.recordedAt==null||b.recordedAt==null||b.recordedAt<=a.recordedAt||!(a.dps>0)||!bounded(b.dps))return null;
 if(!['source','patch','encounter','difficulty','target'].every(k=>a[k]&&a[k]===b[k]))return null;
 if(Math.abs(b.duration-a.duration)/a.duration>0.1)return null;
 return {changePct:(b.dps/a.dps-1)*100,priorDps:a.dps,nextDps:b.dps,qualification:'Recorded comparison only; gear, rotation, party, buffs and capture completeness may differ.'};
}

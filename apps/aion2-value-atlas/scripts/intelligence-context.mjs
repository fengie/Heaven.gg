// Conditional comparisons, not a calibrated game simulator or an authoritative roll catalog.
import {buildLedger, rankLedger, enumerateBuilds} from './intelligence-engine.mjs';
import {characterKey,normalizeImportedSnapshot} from './armory-engine.mjs';
const finite=Number.isFinite;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x,k)=>Object.hasOwn(x,k);
export const REFERENCE_VERSION='EU/NA client 2.0.10.0 (Nov 5, 2026), reference tier 102';
const ROOT='https://aion2.gg/tools/soul-imprint/';
const MECHANICS='https://aion2maps.com/guides/how-damage-works/';
// Narrow, manually selected factual examples. No copied database, odds, or runtime scraping.
// Each tuple is [Attack, Accuracy, Critical Hit] bounds; extra rows are selected offensive alternatives.
const pools={
 weapon:{common:[[38,51],[79,98],[59,75]],extra:{weaponBoost:[.0832,.0964],damageBoost:[.0629,.073],combatSpeed:[.1123,.1298],multiHit:[.0832,.0964],might:[22,32],precision:[22,32]}},
 subhand:{common:[[31,43],[63,79],[47,61]],extra:{weaponBoost:[.0666,.0773],damageBoost:[.0503,.0585],combatSpeed:[.0874,.1012],multiHit:[.0666,.0773],might:[17,27],precision:[17,27]}},
 helmet:{common:[[19,29],[39,52],[29,40]],extra:{attackIncrease:[.0185,.022],doubleChance:[.0185,.022]}},
 shoulder:{common:[[15,24],[31,43],[23,33]],extra:{critBonus:[.111,.1284],doubleChance:[.0148,.0177]}},
 torso:{common:[[23,33],[47,61],[35,47]],extra:{damageBoost:[.0566,.0658],perfectChance:[.0499,.0581]}},
 pants:{common:[[21,31],[43,56],[32,44]],extra:{attackIncrease:[.0203,.024],perfectChance:[.0457,.0533]}},
 gloves:{common:[[13,22],[27,38],[20,30]],extra:{combatSpeed:[.0624,.0725],perfectChance:[.0291,.0342]}},
 boots:{common:[[17,27],[35,47],[26,37]],extra:{moveSpeed:[.0888,.1028],perfectChance:[.0374,.0437]}},
 cape:{common:[[15,24],[31,43],[23,33]],extra:{attackIncrease:[.0148,.0177],doubleChance:[.0148,.0177]}},
 necklace:{common:[[27,38],[55,70],[41,54]],extra:{combatSpeed:[.0374,.0437],might:[11,20]}},
 earring:{common:[[23,33],[47,61],[35,47]],extra:{moveSpeed:[.0555,.0645],might:[8,16],precision:[8,16]}},
 ring:{common:[[19,29],[39,52],[29,40]],extra:{might:[6,14],precision:[6,14]}}
};
const slots=new Map(Object.entries({mainhand:'weapon',weapon:'weapon',subhand:'subhand',guard:'subhand',offhand:'subhand',head:'helmet',helm:'helmet',helmet:'helmet',shoulder:'shoulder',pauldrons:'shoulder',torso:'torso',top:'torso',chest:'torso',pants:'pants',legs:'pants',gloves:'gloves',hands:'gloves',shoes:'boots',boots:'boots',feet:'boots',cape:'cape',cloak:'cape',necklace:'necklace',earring:'earring',earring1:'earring',earring2:'earring',ring:'ring',ring1:'ring',ring2:'ring'}));
const labels={attack:'Attack',accuracy:'Accuracy',crit:'Critical Hit',critBonus:'Critical Damage Boost',weaponBoost:'Weapon Damage Boost',damageBoost:'Damage Boost',pveBoost:'PvE Damage Boost',bossBoost:'Boss Damage Boost',attackIncrease:'Attack increase',doubleChance:'Double Chance',might:'Might',precision:'Precision',combatSpeed:'Combat Speed',multiHit:'Multi-hit Chance',perfectChance:'Perfect Chance',moveSpeed:'Move Speed',hp:'HP',mp:'MP',defense:'Defense',block:'Block',evasion:'Evasion',criticalAttack:'Critical Attack',criticalResist:'Critical Hit Resist',constitution:'Constitution',dexterity:'Dexterity',willpower:'Willpower',intelligence:'Intelligence',backAttack:'Back Attack',frontAttack:'Front Attack',damageTolerance:'Damage Tolerance',criticalDamageTolerance:'Critical Damage Tolerance',regen:'Regeneration',naturalHpRegen:'Natural HP Regen',naturalMpRegen:'Natural MP Regen',statusResist:'Status Effect Resist',statusChance:'Status Effect Chance',doubleResist:'Double Resist',perfectResist:'Perfect Resist',multiHitResist:'Multi-hit Resist',defenseIncrease:'Defense increase',weaponTolerance:'Weapon Damage Tolerance',endurance:'Endurance',endurancePenetration:'Endurance Penetration',incomingHeal:'Incoming Heal',flightPower:'Flight Power'};
const percent=new Set(['critBonus','weaponBoost','damageBoost','pveBoost','bossBoost','attackIncrease','doubleChance','combatSpeed','multiHit','perfectChance','moveSpeed','damageTolerance','criticalDamageTolerance','regen','statusResist','statusChance','doubleResist','perfectResist','multiHitResist','defenseIncrease','weaponTolerance','endurance','endurancePenetration','incomingHeal']);
const names=new Map(Object.entries(labels).map(([k,v])=>[v.toLowerCase(),k]));
const ids=new Map(Object.entries({WeaponFixingDamage:'attack',WeaponAccuracy:'accuracy',Critical:'crit',AmplifyWeaponDamage:'weaponBoost',AmplifyAllDamage:'damageBoost',PvEAmplifyDamage:'pveBoost',STR:'might',AGI:'precision',CombatSpeed:'combatSpeed',AdditionalHitRate:'multiHit'}));
const modeled=new Set(['attack','accuracy','crit','critBonus','weaponBoost','damageBoost','attackIncrease','doubleChance']);
export const GOALS=Object.freeze({hit:'Conditional hit index',attack:'Raw Attack',accuracy:'Raw Accuracy',crit:'Raw Critical Hit',critBonus:'Raw Critical Damage Boost',weaponBoost:'Raw Weapon Damage Boost',damageBoost:'Raw Damage Boost',attackIncrease:'Raw Attack increase',doubleChance:'Raw Double Chance',might:'Raw Might',precision:'Raw Precision',combatSpeed:'Raw Combat Speed',multiHit:'Raw Multi-hit Chance',perfectChance:'Raw Perfect Chance',moveSpeed:'Raw Move Speed'});
const encounters={transcendence:{critResist:920,tolerance:.68,critTolerance:0,doubleResist:0},conquest:{critResist:1055,tolerance:.67,critTolerance:.05,doubleResist:.05}};
function statKey(line,aggregate=false){
 if(!record(line))return null;
 const byName=typeof line.name==='string'?names.get(line.name.trim().toLowerCase()):undefined;
 const byId=aggregate?undefined:ids.get(line.id);if(byId&&byName&&byId!==byName)return null;
 return byName??byId??null;
}
function stat(line,aggregate=false){
 const key=statKey(line,aggregate);if(!key)return null;
 const raw=line.value;let value;
 if(percent.has(key)){if(typeof raw!=='string'||!/^\+?\d+(?:\.\d+)?%$/.test(raw.trim()))return null;value=Number(raw.trim().slice(0,-1))/100;}
 else{if(typeof raw==='number')value=raw;else if(typeof raw==='string'&&/^\+?\d+(?:\.\d+)?$/.test(raw.trim()))value=Number(raw.trim());else return null;}
 return finite(value)&&value>=0&&value<=1e8?{key,value}:null;
}
export function observedTotals(rows){
 const out={},seen=new Set();for(const line of Array.isArray(rows)?rows:[]){const key=statKey(line,true);if(!key||!modeled.has(key)&&key!=='pveBoost'&&key!=='bossBoost')continue;
  if(seen.has(key))delete out[key];else{const x=stat(line,true);if(x)out[key]=x.value;seen.add(key);}}
 return out;
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const plus=(a,b)=>{const out={...a};for(const [k,v] of Object.entries(b))out[k]=(out[k]??0)+v;return out;};
function present(t,k){return own(t,k)&&finite(t[k])&&t[k]>=0;}
// Relative expected hit index under the selected published community hypothesis. No accuracy-loss
// assumption, animation, skill, summon, forced-crit, proc or defense calibration is implied.
export function scenarioGain(delta,totals,encounter='transcendence'){
 const e=own(encounters,encounter)?encounters[encounter]:null;if(!e||!record(delta)||!record(totals))return null;
 if(Object.entries(delta).some(([k,v])=>!finite(v)||v!==0&&!modeled.has(k))||(delta.accuracy??0)<-1e-9)return null;
 let ratio=1;
 const factor=(key,offset=1)=>{const d=delta[key]??0;if(!d)return true;if(!present(totals,key)||totals[key]+d<0)return false;const old=offset+totals[key],next=old+d;if(old<=0||next<=0)return false;ratio*=next/old;return true;};
 if(!factor('attack',0)||!factor('weaponBoost')||!factor('attackIncrease'))return null;
 if(delta.crit||delta.critBonus){if(!present(totals,'crit')||!present(totals,'critBonus'))return null;
  const c=totals.crit+(delta.crit??0),b=totals.critBonus+(delta.critBonus??0);if(c<0||b<0)return null;
  const m=(r,z)=>1+clamp((r-e.critResist)/1000,0,.5)*(.5+z-e.critTolerance);ratio*=m(c,b)/m(totals.crit,totals.critBonus);}
 if(delta.damageBoost){if(!['damageBoost','pveBoost','bossBoost'].every(k=>present(totals,k))||totals.damageBoost+delta.damageBoost<0)return null;
  const old=1+totals.damageBoost+totals.pveBoost+totals.bossBoost-e.tolerance;if(old<=0||old+delta.damageBoost<=0)return null;ratio*=(old+delta.damageBoost)/old;}
 if(delta.doubleChance){if(!present(totals,'doubleChance')||totals.doubleChance+delta.doubleChance<0)return null;
  const m=v=>1+clamp(v-e.doubleResist,0,1);ratio*=m(totals.doubleChance+delta.doubleChance)/m(totals.doubleChance);}
 const gain=(ratio-1)*100;return finite(gain)?gain:null;
}
function same(a,b){try{return JSON.stringify(characterKey(a))===JSON.stringify(characterKey(b));}catch{return false;}}
export function confirmWallet(profile,key,now=Date.now()){
 if(profile?.schema!=='heaven-gg/aion2-profile/v1'||![profile.boundKina,profile.tradableKina].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=1e12)||!finite(now))throw Error('No valid offline planner balances.');
 return {schema:'heaven-gg/aion2-wallet-observation/v1',key:characterKey(key),observedAt:now,boundKina:profile.boundKina,tradableKina:profile.tradableKina};
}
const materialNames=new Set(['ludraEasyVoucher','ludraNormalVoucher','ludraHardVoucher','odyle','abyssPoints','quna','soulCodex','soulCodexReset','syncStone','enhancementStone','wisdomStone','stigmaShard']);
const balance=x=>Number.isSafeInteger(x)&&x>=0&&x<=1e12;
export function normalizeWalletObservation(wallet,key,now=Date.now()){
 if(wallet?.schema!=='heaven-gg/aion2-wallet-observation/v1'||!same(wallet.key,key)||!Number.isSafeInteger(wallet.observedAt)||wallet.observedAt<0||wallet.observedAt>now)throw Error('Invalid character-scoped resource observation');
 const result={schema:wallet.schema,key:characterKey(key),observedAt:wallet.observedAt};
 for(const k of ['boundKina','tradableKina'])if(wallet[k]!=null){
  if(!balance(wallet[k]))throw Error('Invalid Kina balance');result[k]=wallet[k];
 }
 if(wallet.materials!=null){
  if(!record(wallet.materials)||Object.keys(wallet.materials).length>256)throw Error('Invalid material observation');
  result.materials={};
  for(const [k,v] of Object.entries(wallet.materials)){
   if(!(materialNames.has(k)||/^item:[1-9]\d{0,9}:(bound|tradable)$/.test(k))||!balance(v))throw Error('Invalid material balance');
   result.materials[k]=v;
  }
 }
 return result;
}
export function walletResources(wallet,key,now=Date.now()){
 let w;try{w=normalizeWalletObservation(wallet,key,now);}catch{return {};}
 if(now-w.observedAt>=30*60000)return {};
 const value=x=>({low:x,high:x,fresh:true}),result={};
 if(balance(w.boundKina))result.boundKina=value(w.boundKina);
 if(balance(w.tradableKina))result.marketKina=value(w.tradableKina);
 for(const [k,v] of Object.entries(w.materials??{}))result[k]=value(v);
 return result;
}
const referenceRegions=new Set(['nae','naw','eu','la','as']);
const slotFamilies=new Set(slots.values());
export function normalizeReferenceCatalog(data,region,now=Date.now()){
 if(data?.schema!=='heaven-gg/aion2-item-reference/v1'||data.region!==region||!referenceRegions.has(region)||
  typeof data.version!=='string'||!data.version.trim()||data.version.length>128||
  !Number.isSafeInteger(data.observedAt)||data.observedAt<0||data.observedAt>now||
  typeof data.sourceUrl!=='string'||data.sourceUrl.length>1024||!Array.isArray(data.items)||data.items.length>1000)throw Error('Invalid versioned item reference');
 let u;try{u=new URL(data.sourceUrl);}catch{throw Error('Invalid reference source');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('Reference source must be HTTPS without credentials');
 const seen=new Set(),items=[];
 for(const item of data.items){
  if(!record(item)||!Number.isSafeInteger(item.id)||item.id<=0||seen.has(item.id)||!Number.isSafeInteger(item.level)||item.level<=0||
    typeof item.grade!=='string'||!item.grade.trim()||item.grade.length>64||!slotFamilies.has(item.slot)||!Array.isArray(item.subStats)||item.subStats.length>128)throw Error('Invalid or duplicate item reference');
  seen.add(item.id);
  const known=new Set(),rawKeys=new Set(),subStats=[];
  for(const line of item.subStats){
   if(!record(line)||typeof line.name!=='string'||!line.name.trim()||line.name.length>128||
    (line.id!=null&&(typeof line.id!=='string'||line.id.length>128))||
    !['string','number'].includes(typeof line.minValue)||!['string','number'].includes(typeof line.value)||
    String(line.minValue).length>64||String(line.value).length>64)throw Error('Invalid roll reference');
   const rawKey=line.id||line.name.trim().toLowerCase();
   if(rawKeys.has(rawKey))throw Error('Duplicate roll reference');rawKeys.add(rawKey);
   const key=statKey(line);
   if(!key&&(ids.has(line.id)||names.has(line.name.trim().toLowerCase())))throw Error('Ambiguous stat identity');
   if(key){
    const lo=stat({...line,value:line.minValue}),hi=stat(line);
    if(!lo||!hi||lo.value>hi.value||known.has(key))throw Error('Invalid or duplicate stat range');
    known.add(key);
   }
   subStats.push({...(line.id!=null?{id:line.id}:{}),name:line.name,minValue:line.minValue,value:line.value});
  }
  items.push({id:item.id,level:item.level,grade:item.grade,slot:item.slot,subStats});
 }
 return {schema:data.schema,region,version:data.version,observedAt:data.observedAt,sourceUrl:u.href,items};
}
export function normalizeObservationPack(data,now=Date.now()){
 if(data?.schema!=='heaven-gg/aion2-observation-pack/v1'||JSON.stringify(data).length>2_000_000)throw Error('Unsupported or oversized local observation pack');
 const snapshot=normalizeImportedSnapshot(data.snapshot,now);
 const wallet=data.wallet==null?null:normalizeWalletObservation(data.wallet,snapshot.key,now);
 const catalog=data.catalog==null?null:normalizeReferenceCatalog(data.catalog,snapshot.key.region,now);
 return {schema:data.schema,snapshot,wallet,catalog};
}
export function createObservationPack(snapshot,{wallet=null,catalog=null,now=Date.now()}={}){
 return normalizeObservationPack({schema:'heaven-gg/aion2-observation-pack/v1',snapshot,wallet,catalog},now);
}
function fmt(k,v){return percent.has(k)?(v*100).toFixed(2).replace(/\.?0+$/,'')+'%':String(v);}
function rawGain(delta,goal){return (delta[goal]??0)*(percent.has(goal)?100:1);}
function poolFor(g,region,catalog){
 const slot=slots.get(String(g.slotPosName??'').toLowerCase().replace(/[ _-]/g,''));
 if(!slot||!g.detail)return null;
 const imported=catalog?.region===region?catalog.items.find(x=>x.id===g.id):null;
 let ranges,source,description;
 if(imported){
  if(imported.slot!==slot||imported.level!==g.detail.level||imported.grade!==(g.detail.grade||g.grade)||g.grade&&g.detail.grade&&g.grade!==g.detail.grade)return null;
  ranges={};
  for(const line of imported.subStats){
   const lo=stat({...line,value:line.minValue}),hi=stat(line);
   if(lo&&hi&&lo.key===hi.key)ranges[hi.key]=[lo.value,hi.value];
  }
  source=catalog.sourceUrl;description='Imported exact-item reference '+catalog.version+'; not verified for current game patch or legality';
 }else{
  if(!['nae','naw','eu'].includes(region)||g.detail.level!==102)return null;
  const p=pools[slot];if(!p)return null;
  ranges=Object.fromEntries(['attack','accuracy','crit'].map((k,i)=>[k,p.common[i]]));Object.assign(ranges,p.extra);
  source=ROOT+slot;description='Dated tier-102 reference, not verified for this exact item/current patch';
 }
 const lines=g.detail.subStats;if(!Array.isArray(lines)||lines.length>64||!Object.keys(ranges).length)return null;
 const observed=lines.map(x=>stat(x));
 const known=lines.map(x=>statKey(x)).filter(Boolean);
 if(new Set(known).size!==known.length||lines.some((x,i)=>own(ranges,statKey(x))&&!observed[i]))return null;
 if(observed.some(x=>x&&own(ranges,x.key)&&(x.value<ranges[x.key][0]-1e-9||x.value>ranges[x.key][1]+1e-9)))return null;
 return {slot,ranges,source,description,imported:!!imported};
}
function candidates(snapshot,catalog){
 const rows=[];let matchingItems=0,importedMatchingItems=0;
 for(const g of snapshot.equipment??[]){
  const ref=poolFor(g,snapshot.key?.region,catalog);if(!ref)continue;
  matchingItems++;if(ref.imported)importedMatchingItems++;
  const lines=Array.isArray(g.detail.subStats)?g.detail.subStats:[],parsed=lines.map(x=>stat(x));
  for(let i=0;i<lines.length;i++){
   const old=parsed[i];if(!old)continue;
   for(const [k,range] of Object.entries(ref.ranges)){
    if(parsed.some((x,j)=>j!==i&&x?.key===k))continue;
    const target=range[1];if(old.key===k&&target<=old.value+1e-9)continue;
    const delta=plus({[old.key]:-old.value},{[k]:target});
    rows.push({id:'reference:'+g.slotPos+':'+i+':'+k,category:'soul-binding',slotPos:g.slotPos,title:g.slotPosName+': '+labels[old.key]+' '+fmt(old.key,old.value)+' → '+labels[k]+' '+fmt(k,target),delta,source:ref.source,cost:null,minutes:null,requiresVerification:true,
     reason:ref.description+'. Target range '+fmt(k,range[0])+'–'+fmt(k,target)+'; '+(old.key===k?'improve existing roll':'replace line if legal')+'. Cost and conditional odds unknown.'});
   }
  }
 }
 return {rows,matchingItems,importedMatchingItems};
}
const baseline=()=>({attack:0,accuracy:0,crit:0,critBonus:0,weaponBoost:0,damageBoost:0,attackIncrease:0,doubleChance:0});
// One target per equipped slot, with every visible single-line reference row retained.
// The exact reference oracle is bounded; pair search supplies a useful incumbent before DFS.
function optimize(rows,totals,goal,encounter,preserveAccuracy,maxEvaluations){
 const evaluate=d=>goal==='hit'?scenarioGain(d,totals,encounter):rawGain(d,goal);
 const project=d=>Object.fromEntries(Object.entries(d).filter(([k])=>goal==='hit'?modeled.has(k):k==='accuracy'||k===goal));
 const options=rows.filter(r=>goal!=='hit'||Object.entries(r.delta).every(([k,v])=>!v||modeled.has(k))&&scenarioGain({...r.delta,accuracy:0},totals,encounter)!==null);
 const byId=new Map(options.map(r=>[r.id,r]));const groups=new Map();
 for(const r of options){if(!groups.has(r.slotPos))groups.set(r.slotPos,[]);groups.get(r.slotPos).push({id:r.id,delta:project(r.delta)});}
 let best={changes:[],delta:{},gain:0};let pairEvaluated=0,pairComplete=true;
 function consider(changes,delta){if((preserveAccuracy||goal==='hit')&&(delta.accuracy??0)<-1e-9)return;const gain=evaluate(delta);if(gain===null)return;
  if(gain>best.gain+1e-9||Math.abs(gain-best.gain)<=1e-9&&changes.length<best.changes.length)best={changes,delta,gain};}
 for(const r of options)consider([r],r.delta);
 outer:for(let i=0;i<options.length;i++)for(let j=i+1;j<options.length;j++){if(options[i].slotPos===options[j].slotPos)continue;if(pairEvaluated>=maxEvaluations){pairComplete=false;break outer;}pairEvaluated++;consider([options[i],options[j]],plus(options[i].delta,options[j].delta));}
 const domain=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([slot,opts])=>[{id:`keep:${slot}`,delta:{}},...opts.sort((a,b)=>a.id.localeCompare(b.id))]);
 // Offset only the search-state accuracy constraint when the user explicitly permits raw accuracy loss.
 const offset=preserveAccuracy||goal==='hit'?0:1e8;
 const base={...baseline(),accuracy:offset};const score=d=>evaluate({...d,accuracy:d.accuracy-offset})??-Number.MAX_SAFE_INTEGER;
 const result=domain.length>64?{evaluated:0,exact:false,best:null}:domain.length?enumerateBuilds({base,groups:domain,evaluate:score,minAccuracy:0,maxEvaluations}):{evaluated:0,exact:true,best:null};
 if(result.best){const changes=result.best.ids.map(id=>byId.get(id)).filter(Boolean);const delta=changes.reduce((d,r)=>plus(d,r.delta),{});consider(changes,delta);}
 return {best,search:{exact:result.exact,pairComplete,evaluated:result.evaluated,pairEvaluated,slots:groups.size,modeledOptions:options.length}};
}
export function analyzeProgression(snapshot,{wallet=null,catalog=null,preferences={},sort='recommended',goal='hit',encounter='transcendence',preserveAccuracy=true,now=Date.now(),maxEvaluations=20000}={}){
 if(!own(GOALS,goal)||!own(encounters,encounter)||!Number.isSafeInteger(maxEvaluations)||maxEvaluations<1||maxEvaluations>100000)throw Error('Invalid comparison settings');
 const totals=observedTotals(snapshot?.stats),resources=walletResources(wallet,snapshot?.key,now);
 if(!snapshot)return {rows:[],best:null,search:null,totals,resources,matchingItems:0,importedMatchingItems:0};
 let verifiedCatalog=null;if(catalog?.region===snapshot.key?.region){try{verifiedCatalog=normalizeReferenceCatalog(catalog,snapshot.key.region,now);}catch{/* incompatible or malformed references are unavailable */}}
 const current=buildLedger(snapshot,{resources,preferences,sort,now});const refs=candidates(snapshot,verifiedCatalog);
 const referenceRows=refs.rows.map(r=>{const accuracyLoss=(r.delta.accuracy??0)<-1e-9;
  const gain=goal==='hit'?scenarioGain(r.delta,totals,encounter):rawGain(r.delta,goal);
  return {...r,gain,blocked:preserveAccuracy&&accuracyLoss,reason:r.reason+(accuracyLoss?' Loses raw Accuracy; may require a coordinated swap.':'')+(gain===null?' Hit-index effect is unmodeled or aggregate inputs are missing.':'')};});
 const extra=[];
 for(const g of snapshot.equipment??[]){const d=g.detail;if(!record(d))continue;const label=g.slotPosName||`Slot ${g.slotPos}`;
  if(finite(g.exceedLevel)&&finite(d.maxExceedEnchantLevel)&&g.exceedLevel<d.maxExceedEnchantLevel)extra.push({id:`gear:${g.slotPos}:exceed`,category:'enhancement',title:`${label}: breakthrough +${g.exceedLevel} → +${g.exceedLevel+1}`,reason:'Observed level below published maximum; requirements, gain and costs unknown.'});
  if(Number.isSafeInteger(d.magicStoneSlotCount)&&d.magicStoneSlotCount>0&&Array.isArray(d.magicStoneStat)&&d.magicStoneStat.every(x=>Number.isSafeInteger(x?.slotPos))&&new Set(d.magicStoneStat.map(x=>x.slotPos)).size<d.magicStoneSlotCount)extra.push({id:`gear:${g.slotPos}:socket`,category:'gear',title:`${label}: review unused manastone sockets`,reason:'Published slot count exceeds listed stones; confirm slots unlocked and usable.'});
  for(const [i,s] of (Array.isArray(d.subSkills)?d.subSkills:[]).entries())extra.push({id:`gear:${g.slotPos}:skill:${i}`,category:'skills',title:`${label}: ${s.name??'Skill'} +${s.level??'?'}`,reason:'Observed skill bonus; alternative skills and breakpoints require a compatible skill catalog.'});
 }
 if(finite(snapshot.itemLevel)&&snapshot.itemLevel>=2800){
  // Nov 18 recipe; currency acceptance is not published, so confirmed total only proves a shortfall.
  const bound=resources.boundKina?.high,market=resources.marketKina?.high;
  if(finite(bound)&&finite(market))resources.recipeKina={low:0,high:bound+market,fresh:true};
  for(const [difficulty,vouchers] of [['Easy',4],['Normal',2],['Hard',1]])extra.push({id:`content:ludra:${difficulty}`,category:'content',title:`Ludra weapon selection: ${difficulty} voucher path`,cost:{recipeKina:5000000,[`ludra${difficulty}Voucher`]:vouchers},requiresVerification:true,source:'https://store.steampowered.com/news/app/3393110/view/675137971401261063',reason:'Nov 18 Global recipe observation; verify current rule, claim eligibility, voucher balance and usable Kina. Bound and tradable are not interchangeable.'});
 }
 const all=[...current,...referenceRows,...extra.map(r=>({gain:null,minutes:null,cost:null,...r}))];
 const result=optimize(refs.rows,totals,goal,encounter,preserveAccuracy,maxEvaluations);
 return {rows:rankLedger(all,resources,preferences,sort),...result,totals,resources,matchingItems:refs.matchingItems,importedMatchingItems:refs.importedMatchingItems,referenceVersion:REFERENCE_VERSION,modelSource:MECHANICS};
}

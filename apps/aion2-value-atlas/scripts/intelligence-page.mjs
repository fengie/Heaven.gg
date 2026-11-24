import {ArmoryClient,characterKey,parseOfficialCharacterLink} from './armory-engine.mjs';
import {rankLedger,MAX_ACTION_PREFERENCES} from './intelligence-engine.mjs';
import {rawArmoryIdentity,normalizeRawArmoryBundle,normalizeOfficialArmoryCapture,inspectA2Log,summarizeA2Log,appendCombatEvidence,normalizeCombatEvidence,compareRecordedFights} from './evidence-import.mjs';
import {analyzeProgression, confirmWallet, walletResources, GOALS, REFERENCE_VERSION,normalizeObservationPack,createObservationPack,normalizeReferenceCatalog,normalizeWalletObservation,appendProgressHistory,normalizeProgressHistory,normalizeActionPreferences} from './intelligence-context.mjs';
const byId=id=>document.getElementById(id), node=(tag,content)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);return n;};
const bindingKey='heaven-gg:aion2:intelligence-binding-v1', preferenceKey='heaven-gg:aion2:intelligence-preferences-v1';
const client=new ArmoryClient();
const walletKey='heaven-gg:aion2:intelligence-wallet-v1', offlineKey='heaven-gg:aion2:character-v1';
const observationKey='heaven-gg:aion2:intelligence-observation-v1',historyKey='heaven-gg:aion2:intelligence-history-v1';
const combatKey='heaven-gg:aion2:intelligence-combat-v1',actionPreferenceStorage='heaven-gg:aion2:intelligence-action-preferences-v1';
let actionPrefs=new Map(),focusActionKey=null;
let combatHistory=null,combatDraft=null,combatReadVersion=0;
let history=null,directory=null,directoryPending=null;
let wallet=null,catalog=null,snapshotMode='live',analysisCache=null,lastError='',walletTimer=null;
for(const [value,label] of Object.entries(GOALS)){const o=node('option',label);o.value=value;byId('objective').append(o);}
let selected=null,snapshot=null,pending=null,generation=0,searchPage=1,searchTerm=null;
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function store(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}catch{/* browser storage can be disabled */}}
let prefs=read(preferenceKey);if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))prefs={};
const say=(message,kind='info')=>{byId('status').textContent=message;byId('status').dataset.kind=kind;};
function showArmoryFailure(e){
 if(e.code==='ARMORY_DENIED'){byId('official-import-help').open=true;say('Official provider denied direct access (HTTP '+e.status+'). Use the official armory and import its successful public responses below. No further request to the denied origin was sent.','error');}
 else say(e.message,'error');
}
function start(){pending?.abort();const controller=new AbortController(),id=++generation;pending=controller;return {id,signal:controller.signal};}
function isCurrent(task){return task.id===generation&&!task.signal.aborted;}
function finish(task){if(task.id===generation){pending=null;byId('refresh').disabled=!selected;}}
const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString():'Unknown';
const statText=x=>typeof x==='string'&&x.trim()&&x.length<=100?x:fmt(x);
function clearWallet(){wallet=null;store(walletKey,null);analysisCache=null;}
function clearHistory(){history=null;store(historyKey,null);}
function resetCombatDraft(){
 combatReadVersion++;combatDraft=null;
 for(const id of ['combat-actor','combat-segment']){const o=node('option','Choose…');o.value='';byId(id).replaceChildren(o);}
 byId('import-combat').value='';byId('save-combat').disabled=true;
 byId('combat-draft-status').textContent='No pending combat file.';
}
function clearCombat(){combatHistory=null;store(combatKey,null);resetCombatDraft();}
function updateCombatSelection(){byId('save-combat').disabled=!(selected&&combatDraft&&byId('combat-actor').value&&byId('combat-segment').value!=='');byId('clear-combat').disabled=!combatHistory?.fights?.length&&!combatDraft;}
async function importCombat(file){
 resetCombatDraft();if(!file)return;
 const version=combatReadVersion,identity=selected?.key;
 try{
  if(!identity)throw Error('Select a character first');
  if(file.size>8_000_000)throw Error('Combat file exceeds 8 MB');
  const data=JSON.parse(await file.text()),overview=inspectA2Log(data);
  if(version!==combatReadVersion||!sameCharacter(identity,selected?.key))return;
  combatDraft=data;
  for(const p of overview.players){const o=node('option',p.name+' ('+p.id+')');o.value=p.id;byId('combat-actor').append(o);}
  for(const s of overview.segments){const o=node('option',s.label+' · '+fmt(s.duration)+' s');o.value=String(s.index);byId('combat-segment').append(o);}
  byId('combat-draft-status').textContent='Choose the recorded actor and encounter, then confirm that actor belongs to '+selected.name+'.';
  updateCombatSelection();
 }catch(e){if(version===combatReadVersion)byId('combat-draft-status').textContent='Combat import failed: '+e.message;}
}
function saveCombat(){
 if(!selected||!combatDraft||!byId('combat-actor').value||byId('combat-segment').value==='')return;
 try{
  const fight=summarizeA2Log(combatDraft,{key:selected.key,playerId:byId('combat-actor').value,segmentIndex:Number(byId('combat-segment').value),confirmed:true});
  combatHistory=appendCombatEvidence(combatHistory,fight,selected.key);store(combatKey,combatHistory);resetCombatDraft();renderCombat();
  byId('combat-draft-status').textContent='Recorded combat summary retained locally.';
 }catch(e){byId('combat-draft-status').textContent='Combat import failed: '+e.message;}
}
function renderCombat(){
 const fights=combatHistory?.fights??[],list=node('ul');
 byId('import-combat').disabled=!selected;byId('clear-combat').disabled=!fights.length&&!combatDraft;
 byId('combat-summary').textContent=fights.length+' local recorded encounters. These are observations, not predicted DPS or verified encounter-time gear.';
 const number=n=>n.toLocaleString(undefined,{maximumFractionDigits:2});
 for(const f of [...fights].reverse()){
  const li=node('li',(f.target??'Unknown encounter')+' · Recorded DPS '+number(f.dps)+' · '+number(f.damage)+' damage / '+number(f.duration)+' s');
  li.append(node('small',' — '+(f.recordedAt===null?'Original time unknown':new Date(f.recordedAt).toLocaleString())+' · '+(f.patch??'Patch unknown')+' · '+f.completeness));
  const evidence=node('p','Annotated crit records: '+(f.flags.crit.known?number(100*f.flags.crit.positive/f.flags.crit.known)+'% ('+f.flags.crit.positive+'/'+f.flags.crit.known+')':'Unknown')+' · Multi-hit extra hits: '+(f.multi.known?fmt(f.multi.extraHits)+' ('+f.multi.known+' annotated records)':'Unknown'));
  li.append(evidence);
  const skills=node('ul');for(const s of f.skills.slice(0,8))skills.append(node('li',s.name+': '+number(s.damage)+' damage · '+fmt(s.hits)+' records'));li.append(skills);list.append(li);
 }
 const sorted=fights.filter(f=>f.recordedAt!==null).sort((a,b)=>a.recordedAt-b.recordedAt),pair=compareRecordedFights(sorted.at(-2),sorted.at(-1));
 byId('combat-comparison').textContent=pair?'Context-matched recorded DPS change: '+(pair.changePct>0?'+':'')+number(pair.changePct)+'%. '+pair.qualification:'No comparable pair with matching reported context and similar duration.';
 byId('combat-evidence').replaceChildren(list);updateCombatSelection();
}

function recordHistory(before,after){
 try{const next=appendProgressHistory(history,before,after);if(next.changes.length){history=next;store(historyKey,history);}}catch{/* unusable comparison never prevents refresh */}
}
function renderHistory(){
 const changes=history?.changes??[],list=node('ul');
 byId('history-summary').textContent=changes.length+' observed changes. Local-only comparisons, not causal DPS or calibrated CP predictions.';
 const delta=p=>p===null?'Unknown':(p.after-p.before>0?'+':'')+fmt(p.after-p.before);
 for(const row of [...changes].reverse()){
  const li=node('li',new Date(row.to).toLocaleString()+': CP '+delta(row.combatPower)+' · IL '+delta(row.itemLevel)+' · '+row.changedSlots.length+' gear slots changed');
  const details=[...row.contextChanges,row.patchMatch===true?'same reported patch':row.patchMatch===false?'different reported patches':'patch unknown'];
  li.append(node('small',' — '+details.join(', ')));list.append(li);
 }
 byId('progress-history').replaceChildren(list);
 byId('clear-history').disabled=!changes.length;byId('export-history').disabled=!changes.length;
}
function exportHistory(){
 if(!history?.changes.length)return;
 const href=URL.createObjectURL(new Blob([JSON.stringify(history,null,2)+'\n'],{type:'application/json'})),a=node('a');a.href=href;a.download='heaven-gg-aion2-progression-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),0);
}
function resetDirectory(){
 directoryPending?.abort();directoryPending=null;directory=null;
 const first=node('option','Any server in region');first.value='';
 byId('server-filter').replaceChildren(first);byId('directory-status').textContent='Official server names and IDs can be loaded on demand.';byId('load-servers').disabled=false;
}
function showDirectory(value){
 if(value.region!==byId('region').value)return;
 directory=value;
 const first=node('option','Any server in region');first.value='';
 const options=[first];for(const row of value.rows){const option=node('option',row.name+' · '+row.serverId);option.value=row.serverId;options.push(option);}
 const previous=byId('server-filter').value;byId('server-filter').replaceChildren(...options);
 if(options.some(o=>o.value===previous))byId('server-filter').value=previous;
 byId('directory-status').textContent=value.rows.length+' official server identities checked '+new Date(value.checkedAt).toLocaleTimeString()+'. Not a population or availability check.';
}
async function loadDirectory(){
 const region=byId('region').value;directoryPending?.abort();
 const controller=new AbortController();directoryPending=controller;byId('load-servers').disabled=true;
 byId('directory-status').textContent='Checking official server directory…';
 try{const value=await client.servers(region,{signal:controller.signal});if(directoryPending===controller&&!controller.signal.aborted)showDirectory(value);}
 catch(e){if(directoryPending===controller&&!controller.signal.aborted){directory=null;const first=node('option','Any server in region');first.value='';byId('server-filter').replaceChildren(first);byId('directory-status').textContent='Server directory unavailable; region-only search remains available. '+e.message;}}
 finally{if(directoryPending===controller){directoryPending=null;byId('load-servers').disabled=false;}}
}
function saveObservation(){
 if(!snapshot){store(observationKey,null);return;}
 try{store(observationKey,{mode:snapshotMode,pack:createObservationPack(snapshot,{catalog})});}
 catch{/* an oversized or inconsistent snapshot is not persisted */}
}
function sameCharacter(a,b){try{return JSON.stringify(characterKey(a))===JSON.stringify(characterKey(b));}catch{return false;}}
function clearActionPreferences(){actionPrefs=new Map();store(actionPreferenceStorage,null);focusActionKey=null;}
function setActionPreference(row,value){
 if(!selected||!row.preferenceKey)return;
 const next=new Map(actionPrefs),key=row.preferenceKey;
 if(value==='category')next.delete(key);
 else if(['prefer','neutral','dislike'].includes(value)){
  if(!next.has(key)&&next.size>=MAX_ACTION_PREFERENCES){say('Saved action preference limit reached. Reset an existing action preference first.','error');focusActionKey=key;render();return;}
  next.set(key,value);
 }else return;
 actionPrefs=next;
 store(actionPreferenceStorage,next.size?{schema:'heaven-gg/aion2-action-preferences/v1',key:characterKey(selected.key),entries:[...next]}:null);
 focusActionKey=key;render();
}
function applyObservation(pack){
 pending?.abort();generation++;pending=null;
 if(!sameCharacter(selected?.key,pack.snapshot.key)){clearHistory();clearCombat();clearActionPreferences();}
 snapshot=pack.snapshot;snapshotMode='imported';catalog=pack.catalog;wallet=pack.wallet;
 selected={key:snapshot.key,name:snapshot.name,serverName:snapshot.serverName};
 analysisCache=null;lastError='';
 store(bindingKey,selected);store(walletKey,wallet);saveObservation();
 if(byId('region').value!==selected.key.region)resetDirectory();byId('region').value=selected.key.region;byId('character-name').value=selected.name;byId('results').replaceChildren();
 say('Imported local observation. No live request was made.');render();
}
async function importObservation(file){
 if(!file)return;
 const started=generation;
 try{
  if(file.size>(file.name.toLowerCase().endsWith('.har')?12_000_000:2_000_000))throw Error('File exceeds the local import size limit (12 MB for HAR; 2 MB for JSON)');
  const data=JSON.parse(await file.text());if(generation!==started)return;
  if(data?.schema==='heaven-gg/aion2-item-reference/v1'){
   if(!snapshot)throw Error('Load a character before importing item references');
   const next=normalizeReferenceCatalog(data,snapshot.key.region);
   catalog=next;analysisCache=null;saveObservation();say('Imported dated item reference; current legality is unverified.');render();
  }else if(data?.schema==='heaven-gg/aion2-wallet-observation/v1'){
   if(!selected)throw Error('Select the character before importing resource observations');
   const next=normalizeWalletObservation(data,selected.key);
   wallet=next;store(walletKey,wallet);analysisCache=null;say('Imported local resource observation at its original timestamp.');render();
  }else if(data?.log?.version==='1.2'){
   const imported=normalizeOfficialArmoryCapture(data,{key:selected?.key??null});
   if(!selected&&!window.confirm('Import '+imported.name+' on server '+imported.key.serverId+' in '+imported.key.region+' from this local capture?'))return;
   applyObservation(createObservationPack(imported,{catalog:sameCharacter(selected?.key,imported.key)?catalog:null}));
   say('Imported official browser observations. The archive was not stored or sent anywhere. Missing detail remains unknown.');
  }else if(data?.info&&data?.equipment&&data?.daevanion){
   const key=selected?.key??rawArmoryIdentity(data,byId('region').value),imported=normalizeRawArmoryBundle(data,key);
   if(!selected&&!window.confirm('Import '+imported.name+' on server '+key.serverId+' in '+key.region+'? Confirm this is your selected character and region.'))return;
   applyObservation(createObservationPack(imported,{catalog:sameCharacter(selected?.key,key)?catalog:null}));
  }else applyObservation(normalizeObservationPack(data));
 }catch(e){if(generation===started)say('Import failed: '+String(e.message),'error');}
}
function exportObservation(){
 if(!snapshot)return;
 try{
  const pack=createObservationPack(snapshot,{wallet,catalog});
  const blob=new Blob([JSON.stringify(pack,null,2)+'\n'],{type:'application/json'});
  const href=URL.createObjectURL(blob),a=node('a');a.href=href;a.download='heaven-gg-aion2-observation.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(href),0);
  say('Local observation export prepared. It contains your character observations and any saved resource values.');
 }catch(e){say('Export failed: '+String(e.message),'error');}
}
function scheduleWalletExpiry(){
 clearTimeout(walletTimer);walletTimer=null;
 if(document.hidden||!wallet||!Number.isFinite(wallet.observedAt))return;
 const remaining=wallet.observedAt+30*60000-Date.now();
 if(remaining>0&&remaining<=30*60000)walletTimer=setTimeout(render,remaining+25);
}
function progressFingerprint(s){
 if(!s)return null;
 const gear=(s.equipment??[]).map(g=>[g.slotPos,g.id,g.enchantLevel,g.exceedLevel,g.detail?.subStats??null,g.detail?.subSkills??null,g.detail?.magicStoneStat??null]).sort((a,b)=>a[0]-b[0]);
 const boards=(s.boards??[]).map(b=>[b.id,b.openNodeCount,b.detail?.nodeList??null]).sort((a,b)=>a[0]-b[0]);
 return JSON.stringify([s.itemLevel,s.combatPower,gear,boards,s.skills??null]);
}

function gainText(gain){if(gain===null||!Number.isFinite(gain))return 'Not modeled';const goal=byId('objective').value;const unit=goal==='hit'?'% hit index':['critBonus','weaponBoost','damageBoost','attackIncrease','doubleChance','combatSpeed','multiHit','perfectChance','moveSpeed'].includes(goal)?' pp':' points';return (gain>0?'+':'')+gain.toLocaleString(undefined,{maximumFractionDigits:3})+unit;}
function costText(cost){if(!cost||typeof cost!=='object'||Array.isArray(cost))return 'Unknown';if(!Object.keys(cost).length)return 'No resource cost';return Object.entries(cost).map(([k,v])=>{const value=Number.isFinite(v)&&v>=0?fmt(v):Number.isFinite(v?.low)&&Number.isFinite(v?.high)&&v.low>=0&&v.high>=v.low?(v.low===v.high?fmt(v.low):fmt(v.low)+'–'+fmt(v.high)):'Unknown';return value+' '+(k==='recipeKina'?'Kina (usable scope unknown)':k);}).join(' + ');}
function analysis(){const now=Date.now(),goal=byId('objective').value,encounter=byId('encounter').value,minute=Math.floor(now/60000),walletFresh=Object.keys(walletResources(wallet,snapshot?.key,now)).length>0;const c=analysisCache;if(c&&c.snapshot===snapshot&&c.wallet===wallet&&c.catalog===catalog&&c.goal===goal&&c.encounter===encounter&&c.minute===minute&&c.walletFresh===walletFresh&&c.prefs===prefs&&c.actionPrefs===actionPrefs)return c.value;
 const value=analyzeProgression(snapshot,{wallet,catalog,goal,encounter,now,preferences:prefs,actionPreferences:actionPrefs});analysisCache={snapshot,wallet,catalog,goal,encounter,minute,walletFresh,prefs,actionPrefs,value};return value;}

function render(){
 byId('refresh').disabled=!selected||!!pending;byId('forget').disabled=!selected;renderHistory();renderCombat();
 byId('name').textContent=snapshot?.name??selected?.name??'—';byId('il').textContent=fmt(snapshot?.itemLevel);byId('cp').textContent=fmt(snapshot?.combatPower);
 const resources=walletResources(wallet,selected?.key),known=Object.hasOwn(resources,'boundKina')&&Object.hasOwn(resources,'marketKina');
 const materialCount=Object.keys(resources).filter(k=>k!=='boundKina'&&k!=='marketKina').length;
 const hasLocal=Object.keys(resources).length>0;
 byId('wallet').textContent=known?fmt(resources.boundKina.high+resources.marketKina.high)+' Kina':'Unknown';
 byId('wallet-detail').textContent=hasLocal?'Local resource observation: '+fmt(resources.boundKina?.high)+' bound / '+fmt(resources.marketKina?.high)+' tradable; '+materialCount+' additional observed resource balances. Original timestamp; expires after 30 minutes. Not a live wallet.':'Private wallet and materials unavailable. Optionally import a local observation or confirm existing offline planner balances for this character.';
 byId('use-wallet').disabled=!selected||!read(offlineKey);byId('clear-wallet').disabled=!wallet;byId('export-observation').disabled=!snapshot;byId('clear-catalog').disabled=!catalog;scheduleWalletExpiry();

 if(!snapshot){byId('coverage').textContent='No character snapshot loaded. Live combat, private resources and legal-roll eligibility are not verified.';}
 else{const detail=snapshot.equipment.filter(x=>x.detail).length,boards=snapshot.boards.filter(x=>x.detail).length;
 const age=Math.max(0,Math.floor((Date.now()-snapshot.checkedAt)/60000));
 byId('coverage').textContent=`${snapshotMode==='imported'?'Imported historical observation':'Armory observation'} · ${snapshot.checkedAt===0?'Original observation time unknown':'Last summary check '+age+' min ago'} · item details ${detail}/${snapshot.equipment.length} · boards ${boards}/${snapshot.boards.length}. Upstream update time unknown. Live wallet, inventory, full quest history, exact legal roll definitions and calibrated DPS remain unavailable.${snapshot.complete?' Published snapshot sections loaded.':' Partial snapshot; missing details are not assumed zero.'}${lastError?' Refresh failed; showing previous observations.':''}`;}
 const data=analysis();const rows=rankLedger(data.rows,data.resources,prefs,byId('sort').value,actionPrefs);
 byId('source-context').textContent=snapshot?`${data.matchingItems} equipped items matched a reference (${data.importedMatchingItems} exact-item imported; remaining matches use ${REFERENCE_VERSION}). ${catalog?'Imported source version '+catalog.version+'; current legality unverified. ':''}Aggregate inputs available: ${Object.keys(data.totals).join(', ')||'none'}. Hit index assumes unchanged rotation/defense, no forced crit, and no raw accuracy loss. Raw objectives compare explicit line values, not actual DPS. Derived attribute contributions below are not complete aggregate combat stats.`:'Reference model activates after character import.';
 const plan=byId('best-plan');plan.replaceChildren();
 if(data.best?.changes.length){plan.append(node('strong',`Best conditional ${GOALS[byId('objective').value]} combination: ${gainText(data.best.gain)}`));const ul=node('ul');for(const r of data.best.changes)ul.append(node('li',r.title));plan.append(ul,node('small',`${data.search.exact?'Exact within searched reference domain':'Bounded search; not proven optimal'} · ${data.search.evaluated.toLocaleString()} combinations; one line per item, selected reference stats only. Net raw Accuracy ${(data.best.delta.accuracy??0)>=0?'+':''}${data.best.delta.accuracy??0}. Legality, cost and actual performance unverified.`));}
 else plan.append(node('strong',snapshot?'No supported positive change in this reference domain.':'Select a character to compare coordinated changes.'),node('small',snapshot?'Try a raw stat objective if aggregate inputs are missing. This is not evidence that your current build is optimal.':''));
 const preferred=byId('preferred-plan');preferred.replaceChildren();preferred.hidden=!data.preferredPlan;
 if(data.preferredPlan){
  const choice=data.preferredPlan;
  if(choice.best.changes.length){preferred.append(node('strong',`Preference-aware conditional combination: ${gainText(choice.best.gain)}`));const ul=node('ul');for(const r of choice.best.changes)ul.append(node('li',r.title));preferred.append(ul);}
  else preferred.append(node('strong','No positive conditional plan without disliked actions in the searched domain.'));
  preferred.append(node('small',`${choice.excluded} disliked reference actions excluded from this alternative only. ${choice.search.exact?'Exact within searched reference domain':'Bounded search; not proven optimal'}. Costs, legality and actual performance remain unverified.`));
 }
 byId('row-count').textContent=`${rows.length.toLocaleString()} discovered opportunities · ${rows.filter(r=>r.status==='affordable').length} verified affordable · ${rows.filter(r=>r.status==='unknown').length} conditional`;
 const table=document.createDocumentFragment();let restoreFocus=null;for(const [i,r] of rows.entries()){
  const tr=node('tr');tr.dataset.actionId=r.id;tr.append(node('td',i+1));const action=node('td'),name=node('strong',r.title);action.append(name,node('small',`${r.category} · ${r.reason}`));
  if(r.source){const a=node('a','Source');a.href=r.source;a.rel='noreferrer';a.target='_blank';action.append(a);}if(r.preferenceKey&&selected){const choice=node('select');choice.setAttribute('aria-label','Activity preference: '+r.title);
   for(const [value,label] of [['category','Use category ('+r.preference+')'],['prefer','Prefer'],['neutral','Neutral'],['dislike','Dislike']]){const opt=node('option',label);opt.value=value;choice.append(opt);}
   choice.options[0].textContent='Use category';choice.value=r.preferenceOverride??'category';
   choice.addEventListener('change',()=>setActionPreference(r,choice.value));action.append(node('small','Activity preference: '+r.preference),choice);if(focusActionKey===r.preferenceKey)restoreFocus=choice;
  }
  const costs=node('td',costText(r.cost));costs.append(node('small','Time: '+(Number.isFinite(r.minutes)&&r.minutes>=0?fmt(r.minutes)+' min':'Unknown')));
  tr.append(action,node('td',gainText(r.gain)),costs);
  const status=node('td',r.status==='unknown'?'Conditional / unknown':r.status==='blocked'&&r.delta?'Needs coordinated swap':r.status);status.className=r.status;tr.append(status);table.append(tr);
 }if(!rows.length){const tr=node('tr'),td=node('td',snapshot?'No verified candidates for the loaded data.':'Choose a character to begin.');td.colSpan=5;tr.append(td);table.append(tr);}byId('ledger').replaceChildren(table);focusActionKey=null;restoreFocus?.focus({preventScroll:true});
 const gear=document.createDocumentFragment();for(const g of snapshot?.equipment??[]){const card=node('article');card.append(node('h3',g.slotPosName||`Slot ${g.slotPos}`),node('p',`${g.name} · ${g.grade||'unknown grade'} · +${fmt(g.enchantLevel)}`));const lines=node('ul');for(const line of g.detail?.subStats??[])lines.append(node('li',`${line.name||line.id}: ${line.value??'unknown'}`));for(const stone of g.detail?.magicStoneStat??[])lines.append(node('li',`Stone: ${stone.name||stone.id} ${stone.value??''}`));if(!lines.children.length)lines.append(node('li',g.detail?'No published stat lines in this response':g.detailError||'Detail not loaded'));card.append(lines);const refresh=node('button','Refresh this item');refresh.type='button';refresh.disabled=!!pending;refresh.addEventListener('click',()=>load('reroll',g.slotPos));card.append(refresh);gear.append(card);}byId('gear').replaceChildren(gear);
 const facts=document.createDocumentFragment();for(const s of snapshot?.stats??[]){facts.append(node('p',`${s.name||s.type}: ${statText(s.value)}`));if(Array.isArray(s.statSecondList))for(const line of s.statSecondList.slice(0,100))if(typeof line==='string'&&line.length<=512)facts.append(node('small','Published contribution (not total): '+line));}for(const s of snapshot?.skills??[])facts.append(node('p',`${s.name}: level ${fmt(s.skillLevel)}`));for(const b of snapshot?.boards??[])facts.append(node('p',`${b.name}: ${fmt(b.openNodeCount)} / ${fmt(b.totalNodeCount)} nodes`));byId('facts').replaceChildren(facts);
}
async function load(trigger='open',slotPos){
 if(!selected||document.hidden)return;
 const task=start();if(trigger==='reroll'||trigger==='refresh')clearWallet();byId('refresh').disabled=true;render();say('Checking selected character…');
 try{const next=await client.load(selected.key,{previous:snapshotMode==='imported'?null:snapshot,trigger,slotPos,visible:!document.hidden,signal:task.signal,onProgress:message=>{if(isCurrent(task))say(message);}});
  if(!isCurrent(task))return;if(snapshotMode==='live'&&snapshot)recordHistory(snapshot,next);if(wallet&&snapshot&&progressFingerprint(snapshot)!==progressFingerprint(next))clearWallet();snapshot=next;snapshotMode='live';lastError='';selected={key:next.key,name:next.name,serverName:next.serverName};store(bindingKey,selected);saveObservation();say(next.complete?'Published character data checked.':'Character loaded; some published details are unavailable.');
 }catch(e){if(isCurrent(task)){showArmoryFailure(e);lastError=e.message;}}
 finally{if(isCurrent(task)){finish(task);render();}}
}
function choose(row){
 pending?.abort();generation++;pending=null;
 if(!sameCharacter(selected?.key,row.key)){clearWallet();clearHistory();clearCombat();clearActionPreferences();catalog=null;snapshot=null;store(observationKey,null);}
 const wasImported=snapshotMode==='imported'&&!!snapshot;
 if(!snapshot)snapshotMode='live';
 lastError='';selected={key:characterKey(row.key),name:row.name,serverName:row.serverName};store(bindingKey,selected);
 byId('results').replaceChildren();render();void load(wasImported?'refresh':'open');
}
async function search(page=1){
 const name=byId('character-name').value.trim(),region=byId('region').value;
 if(/^https?:\/\//i.test(name)){
  const task=start();
  try{
   let key;
   try{key=parseOfficialCharacterLink(name,{directory:directory?.rows});}
   catch(e){
    if(e.message!=='Link must include a region or match the official server directory'||new URL(name).searchParams.has('region'))throw e;
    const roster=await client.servers(region,{signal:task.signal});
    if(!isCurrent(task))return;
    showDirectory(roster);key=parseOfficialCharacterLink(name,{directory:roster.rows});
   }
   if(!isCurrent(task))return;
   if(byId('region').value!==key.region)resetDirectory();
   byId('region').value=key.region;choose({key,name:'Official character link',serverName:''});
  }catch(e){if(isCurrent(task))showArmoryFailure(e);}
  finally{if(isCurrent(task)){finish(task);render();}}
  return;
 }
 const serverId=byId('server-filter').value||null;
 searchTerm={name,region,serverId};searchPage=page;const task=start();byId('results').replaceChildren();say('Searching the selected region…');
 try{const result=await client.search(name,region,{page,serverId,signal:task.signal});if(!isCurrent(task)||byId('region').value!==region||(byId('server-filter').value||null)!==serverId)return;
  const f=document.createDocumentFragment();for(const row of result.rows){const b=node('button',`${row.name} · ${row.serverName||row.key.serverId} · ${row.key.region} · level ${fmt(row.level)}`);b.type='button';b.addEventListener('click',()=>choose(row));f.append(b);}if(result.hasMore&&page<10){const more=node('button','Next search page');more.type='button';more.addEventListener('click',()=>{if(byId('character-name').value.trim()===searchTerm?.name&&byId('region').value===searchTerm.region&&(byId('server-filter').value||null)===searchTerm.serverId)void search(searchPage+1);});f.append(more);}byId('results').replaceChildren(f);say(result.rows.length?'Select the matching character and server.':'No matches on this page.');
 }catch(e){if(isCurrent(task))showArmoryFailure(e);}finally{if(isCurrent(task)){finish(task);render();}}
}
byId('search-form').addEventListener('submit',event=>{event.preventDefault();void search();});
byId('region').addEventListener('change',()=>{byId('official-armory-link').href='https://aion2.plaync.com/en-us/characters/index?region='+encodeURIComponent(byId('region').value);});
byId('official-armory-link').addEventListener('click',()=>{byId('official-import-help').open=true;});
byId('load-servers').addEventListener('click',()=>void loadDirectory());
byId('region').addEventListener('change',()=>{pending?.abort();generation++;pending=null;byId('results').replaceChildren();resetDirectory();render();void loadDirectory();});
byId('server-filter').addEventListener('change',()=>{byId('results').replaceChildren();});
byId('clear-history').addEventListener('click',()=>{clearHistory();renderHistory();});
byId('export-history').addEventListener('click',exportHistory);
byId('import-combat').addEventListener('change',e=>void importCombat(e.target.files?.[0]));
byId('combat-actor').addEventListener('change',updateCombatSelection);
byId('combat-segment').addEventListener('change',updateCombatSelection);
byId('save-combat').addEventListener('click',saveCombat);
byId('clear-combat').addEventListener('click',()=>{clearCombat();renderCombat();});
byId('refresh').addEventListener('click',()=>load('refresh'));
byId('forget').addEventListener('click',()=>{pending?.abort();generation++;pending=null;snapshot=null;selected=null;store(bindingKey,null);store(preferenceKey,null);store(walletKey,null);store(observationKey,null);clearHistory();clearCombat();clearActionPreferences();resetDirectory();wallet=null;catalog=null;snapshotMode='live';analysisCache=null;lastError='';prefs={};byId('preference').value='neutral';byId('results').replaceChildren();say('Saved character and preferences removed.');render();});
byId('sort').addEventListener('change',render);
byId('objective').addEventListener('change',render);byId('encounter').addEventListener('change',render);
byId('use-wallet').addEventListener('click',()=>{if(!selected)return;try{const next=confirmWallet(read(offlineKey),selected.key);if(!window.confirm(`Confirm these current balances belong to ${selected.name}: ${fmt(next.boundKina)} bound Kina and ${fmt(next.tradableKina)} tradable Kina?`))return;wallet=next;store(walletKey,wallet);render();}catch(e){say(e.message,'error');}});
byId('clear-wallet').addEventListener('click',()=>{clearWallet();render();});
byId('import-observation').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';void importObservation(file);});
byId('export-observation').addEventListener('click',exportObservation);
byId('clear-catalog').addEventListener('click',()=>{catalog=null;analysisCache=null;saveObservation();render();});
byId('category').addEventListener('change',()=>{byId('preference').value=prefs[byId('category').value]??'neutral';});
byId('preference').addEventListener('change',()=>{prefs={...prefs,[byId('category').value]:byId('preference').value};store(preferenceKey,prefs);render();});
function resume(){if(!document.hidden&&selected&&!pending&&snapshotMode!=='imported')void load('open');}
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(walletTimer);walletTimer=null;directoryPending?.abort();directoryPending=null;byId('load-servers').disabled=false;pending?.abort();generation++;pending=null;}else{render();resume();}});
window.addEventListener('focus',resume);window.addEventListener('pagehide',()=>{clearTimeout(walletTimer);directoryPending?.abort();pending?.abort();});
try{const saved=read(bindingKey);if(saved?.key)selected={key:characterKey(saved.key),name:typeof saved.name==='string'?saved.name:'',serverName:typeof saved.serverName==='string'?saved.serverName:''};}catch{store(bindingKey,null);}
wallet=read(walletKey);
try{if(selected)actionPrefs=normalizeActionPreferences(read(actionPreferenceStorage),selected.key);else clearActionPreferences();}catch{clearActionPreferences();}
resetCombatDraft();try{if(selected&&read(combatKey))combatHistory=normalizeCombatEvidence(read(combatKey),selected.key);else store(combatKey,null);}catch{clearCombat();}
try{if(selected&&read(historyKey))history=normalizeProgressHistory(read(historyKey),selected.key);}catch{clearHistory();}
try{const saved=read(observationKey);if(saved?.pack&&selected){const pack=normalizeObservationPack(saved.pack);if(sameCharacter(pack.snapshot.key,selected.key)){snapshot=pack.snapshot;catalog=pack.catalog;snapshotMode=saved.mode==='imported'?'imported':'live';}}}catch{store(observationKey,null);}
if(document.querySelector('meta[name="heaven-gg-armory-transport"][content="same-origin"]'))byId('transport-detail').textContent='Using the explicitly enabled local same-origin armory transport. No account login or private inventory access. All character data stays local to this preview.';
if(selected){byId('region').value=selected.key.region;byId('character-name').value=selected.name;}
byId('preference').value=prefs[byId('category').value]??'neutral';render();if(selected)resume();

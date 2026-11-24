import {ArmoryClient,characterKey} from './armory-engine.mjs';
import {buildLedger} from './intelligence-engine.mjs';
const byId=id=>document.getElementById(id), node=(tag,content)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);return n;};
const bindingKey='heaven-gg:aion2:intelligence-binding-v1', preferenceKey='heaven-gg:aion2:intelligence-preferences-v1';
const client=new ArmoryClient();
let selected=null,snapshot=null,pending=null,generation=0,searchPage=1,searchTerm=null;
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function store(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}catch{/* browser storage can be disabled */}}
let prefs=read(preferenceKey);if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))prefs={};
const say=(message,kind='info')=>{byId('status').textContent=message;byId('status').dataset.kind=kind;};
function start(){pending?.abort();const controller=new AbortController(),id=++generation;pending=controller;return {id,signal:controller.signal};}
function isCurrent(task){return task.id===generation&&!task.signal.aborted;}
function finish(task){if(task.id===generation){pending=null;byId('refresh').disabled=!selected;}}
const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString():'Unknown';
function render(){
 byId('refresh').disabled=!selected||!!pending;byId('forget').disabled=!selected;
 byId('name').textContent=snapshot?.name??selected?.name??'—';byId('il').textContent=fmt(snapshot?.itemLevel);byId('cp').textContent=fmt(snapshot?.combatPower);
 byId('wallet').textContent='Unknown';
 if(!snapshot){byId('coverage').textContent='No character snapshot loaded. Live combat, private resources and legal-roll eligibility are not verified.';}
 else{const detail=snapshot.equipment.filter(x=>x.detail).length,boards=snapshot.boards.filter(x=>x.detail).length;
 const age=Math.max(0,Math.floor((Date.now()-snapshot.checkedAt)/60000));
 byId('coverage').textContent=`Last summary check ${age} min ago · item details ${detail}/${snapshot.equipment.length} · boards ${boards}/${snapshot.boards.length}. Upstream update time unknown. Wallet, inventory, full quest history, exact legal alternative rolls and calibrated DPS remain unavailable.${snapshot.complete?' Published snapshot sections loaded.':' Partial snapshot; missing details are not assumed zero.'}`;}
 const rows=buildLedger(snapshot,{sort:byId('sort').value,preferences:prefs});byId('row-count').textContent=`${rows.length.toLocaleString()} discovered opportunities · ${rows.filter(r=>r.status==='affordable').length} verified affordable · ${rows.filter(r=>r.status==='unknown').length} conditional`;
 const table=document.createDocumentFragment();for(const [i,r] of rows.entries()){
  const tr=node('tr');tr.append(node('td',i+1));const action=node('td'),name=node('strong',r.title);action.append(name,node('small',`${r.category} · ${r.reason}`));
  if(r.source){const a=node('a','Source');a.href=r.source;a.rel='noreferrer';a.target='_blank';action.append(a);}tr.append(action,node('td',r.gain===null?'Not modeled':fmt(r.gain)),node('td',r.cost===null?'Unknown':Object.keys(r.cost).length===0?'No resource cost':JSON.stringify(r.cost)));
  const status=node('td',r.status==='unknown'?'Conditional / unknown':r.status);status.className=r.status;tr.append(status);table.append(tr);
 }if(!rows.length){const tr=node('tr'),td=node('td',snapshot?'No verified candidates for the loaded data.':'Choose a character to begin.');td.colSpan=5;tr.append(td);table.append(tr);}byId('ledger').replaceChildren(table);
 const gear=document.createDocumentFragment();for(const g of snapshot?.equipment??[]){const card=node('article');card.append(node('h3',g.slotPosName||`Slot ${g.slotPos}`),node('p',`${g.name} · ${g.grade||'unknown grade'} · +${fmt(g.enchantLevel)}`));const lines=node('ul');for(const line of g.detail?.subStats??[])lines.append(node('li',`${line.name||line.id}: ${line.value??'unknown'}`));for(const stone of g.detail?.magicStoneStat??[])lines.append(node('li',`Stone: ${stone.name||stone.id} ${stone.value??''}`));if(!lines.children.length)lines.append(node('li',g.detail?'No published stat lines in this response':g.detailError||'Detail not loaded'));card.append(lines);const refresh=node('button','Refresh this item');refresh.type='button';refresh.disabled=!!pending;refresh.addEventListener('click',()=>load('reroll',g.slotPos));card.append(refresh);gear.append(card);}byId('gear').replaceChildren(gear);
 const facts=document.createDocumentFragment();for(const s of snapshot?.stats??[])facts.append(node('p',`${s.name||s.type}: ${fmt(s.value)}`));for(const s of snapshot?.skills??[])facts.append(node('p',`${s.name}: level ${fmt(s.skillLevel)}`));for(const b of snapshot?.boards??[])facts.append(node('p',`${b.name}: ${fmt(b.openNodeCount)} / ${fmt(b.totalNodeCount)} nodes`));byId('facts').replaceChildren(facts);
}
async function load(trigger='open',slotPos){
 if(!selected||document.hidden)return;
 const task=start();byId('refresh').disabled=true;render();say('Checking selected character…');
 try{const next=await client.load(selected.key,{previous:snapshot,trigger,slotPos,visible:!document.hidden,signal:task.signal,onProgress:message=>{if(isCurrent(task))say(message);}});
  if(!isCurrent(task))return;snapshot=next;selected={key:next.key,name:next.name,serverName:next.serverName};store(bindingKey,selected);say(next.complete?'Published character data checked.':'Character loaded; some published details are unavailable.');
 }catch(e){if(isCurrent(task)){say(`${e.message}. No live data was fabricated.`, 'error');if(snapshot)byId('coverage').textContent='Showing previously checked data; refresh failed.';}}
 finally{if(isCurrent(task)){finish(task);render();}}
}
function choose(row){pending?.abort();snapshot=null;selected={key:characterKey(row.key),name:row.name,serverName:row.serverName};store(bindingKey,selected);byId('results').replaceChildren();render();void load();}
async function search(page=1){
 const name=byId('character-name').value.trim(),region=byId('region').value;searchTerm={name,region};searchPage=page;const task=start();byId('results').replaceChildren();say('Searching the selected region…');
 try{const result=await client.search(name,region,{page,signal:task.signal});if(!isCurrent(task))return;
  const f=document.createDocumentFragment();for(const row of result.rows){const b=node('button',`${row.name} · ${row.serverName||row.key.serverId} · ${row.key.region} · level ${fmt(row.level)}`);b.type='button';b.addEventListener('click',()=>choose(row));f.append(b);}if(result.hasMore&&page<10){const more=node('button','Next search page');more.type='button';more.addEventListener('click',()=>{if(byId('character-name').value.trim()===searchTerm?.name&&byId('region').value===searchTerm.region)void search(searchPage+1);});f.append(more);}byId('results').replaceChildren(f);say(result.rows.length?'Select the matching character and server.':'No matches on this page.');
 }catch(e){if(isCurrent(task))say(e.message,'error');}finally{if(isCurrent(task)){finish(task);render();}}
}
byId('search-form').addEventListener('submit',event=>{event.preventDefault();void search();});
byId('refresh').addEventListener('click',()=>load('refresh'));
byId('forget').addEventListener('click',()=>{pending?.abort();generation++;pending=null;snapshot=null;selected=null;store(bindingKey,null);store(preferenceKey,null);prefs={};byId('preference').value='neutral';byId('results').replaceChildren();say('Saved character and preferences removed.');render();});
byId('sort').addEventListener('change',render);
byId('category').addEventListener('change',()=>{byId('preference').value=prefs[byId('category').value]??'neutral';});
byId('preference').addEventListener('change',()=>{prefs={...prefs,[byId('category').value]:byId('preference').value};store(preferenceKey,prefs);render();});
function resume(){if(!document.hidden&&selected&&!pending)void load('open');}
document.addEventListener('visibilitychange',()=>{if(document.hidden){pending?.abort();generation++;pending=null;}else resume();});
window.addEventListener('focus',resume);window.addEventListener('pagehide',()=>pending?.abort());
try{const saved=read(bindingKey);if(saved?.key)selected={key:characterKey(saved.key),name:typeof saved.name==='string'?saved.name:'',serverName:typeof saved.serverName==='string'?saved.serverName:''};}catch{store(bindingKey,null);}
if(selected){byId('region').value=selected.key.region;byId('character-name').value=selected.name;}
byId('preference').value=prefs[byId('category').value]??'neutral';render();if(selected)resume();

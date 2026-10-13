import {wardrobeQuote,parseNumericInput,validateWardrobePlan} from '../wardrobe.mjs';
const $=s=>document.querySelector(s);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dollar=c=>'$'+(c/100).toFixed(2);
const num=v=>Number(v).toLocaleString('en-US');
let data=null;
const key='heaven.gg:aion2:wardrobe:v1';
let picks={wanted:[],owned:[]};
try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Array.isArray(saved.wanted)&&Array.isArray(saved.owned))picks=saved;}catch{}
const inputs=['budget','wallet','dye-changes','dye-price'];
function persist(){try{localStorage.setItem(key,JSON.stringify(picks));}catch{}}
function value(id,scale=1,blank=null){return parseNumericInput($('#'+id).value,scale,blank);}
function options(){return {...picks,walletQuna:value('wallet'),dyeChanges:value('dye-changes'),dyeQunaEach:value('dye-price',1,null),budgetCents:value('budget',100,null)};}
function render(){
 if(!data)return;
 const sources=Object.fromEntries(data.sources.map(s=>[s.id,s]));
 const term=$('#search-items').value.trim().toLowerCase();
 $('#products').innerHTML=data.products.filter(p=>(p.name+' '+p.category).toLowerCase().includes(term)).map(p=>{
 const wanted=picks.wanted.includes(p.id),owned=picks.owned.includes(p.id);
 const price=p.category==='Earned in-game'?'Kina / effort: unknown':p.usd_cents!=null?dollar(p.usd_cents):p.quna!=null?num(p.quna)+' Quna':'Price unknown';
 const link=sources[p.source_ids?.[0]],href=link&&typeof link.url==='string'&&link.url.startsWith('https://')?link.url:null;
 return '<article class="product"><div class="chips"><span class="class-tag">'+safe(p.category)+'</span><span class="status-tag '+(p.confidence==='high'?'ok':'warn')+'">'+safe(p.confidence)+' evidence</span></div>'+
 '<h3>'+safe(p.name)+'</h3><strong>'+safe(price)+'</strong><small>'+safe(p.availability)+' · '+safe(p.limit)+'</small>'+
 '<p>'+safe(p.notes)+'</p>'+(href?'<a class="source-link" href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">Primary/community evidence ↗</a>':'<small>Source: client screenshot / incomplete</small>')+
 '<div class="action"><button aria-pressed="'+wanted+'" class="'+(wanted?'on':'')+'" data-kind="wanted" data-id="'+safe(p.id)+'">♡ '+(wanted?'Wanted':'Want')+'</button>'+
 '<button aria-pressed="'+owned+'" class="'+(owned?'on':'')+'" data-kind="owned" data-id="'+safe(p.id)+'">✓ '+(owned?'Owned':'Own')+'</button></div></article>';
 }).join('')||'<p>No catalog items match.</p>';
 try{
  const q=wardrobeQuote(data,options());
  $('#subtotal').textContent=dollar(q.subtotalCents);
  $('#budget-result').textContent=({within:'Within entered cash budget',over:'Exceeds entered cash budget',incomplete:'Incomplete: enter missing costs','not-set':'No budget entered'})[q.budgetStatus]+' · before tax';
  $('#usd-direct').textContent=dollar(q.cashDirect);
  $('#quna-needed').textContent=num(q.qunaNeed);
  $('#quna-topup').textContent=num(q.topup.quna)+' Quna · '+dollar(q.topup.costCents);
  $('#mileage-earned').textContent=num(q.knownMileage)+(q.mileageIncomplete?' (partial / unknown extras)':' (known listed rewards)');
  $('#quna-left').textContent=num(q.balanceQuna);
  $('#pack-breakdown').textContent='Quna packs: '+(Object.entries(q.topup.packs).map(([id,n])=>n+'× '+data.packs.find(p=>p.id===id)?.name).join(', ')||'No top-up required')+'.';
  $('#warnings').innerHTML=[...q.unknown,...data.products.filter(p=>q.remaining.includes(p.id)).map(p=>p.name+': '+p.availability+'; '+p.limit), 'Top-up assumes packs can repeat: confirm purchase limits in the shop.', 'No automatic proof that spending already bought Quna earns additional Mileage.'].map(s=>'<li>'+safe(s)+'</li>').join('');
 }catch(e){for(const id of ['usd-direct','quna-needed','quna-topup','mileage-earned','quna-left','pack-breakdown'])$('#'+id).textContent='—';$('#subtotal').textContent='—';$('#budget-result').textContent='Review numeric inputs: '+safe(e.message);$('#warnings').textContent='Cannot quote invalid inputs.';}
}
$('#products').addEventListener('click',e=>{const b=e.target.closest('[data-kind][data-id]');if(!b)return;const id=b.dataset.id;if(!data.products.some(p=>p.id===id))return;const key=b.dataset.kind;if(!['wanted','owned'].includes(key))return;const arr=new Set(picks[key]);if(arr.has(id))arr.delete(id);else arr.add(id);picks[key]=[...arr];persist();render();[...document.querySelectorAll('[data-kind][data-id]')].find(x=>x.dataset.kind===key&&x.dataset.id===id)?.focus({preventScroll:true});});
for(const id of inputs)$('#'+id).addEventListener('input',render);
$('#search-items').addEventListener('input',render);
$('#export').addEventListener('click',()=>{
 if(!data)return;try{wardrobeQuote(data,options());}catch(error){$('#budget-result').textContent='Cannot export invalid inputs: '+error.message;return;}
 const blob=new Blob([JSON.stringify({schema:1,snapshot:data?.as_of,region:data?.region,...picks,parameters:options()},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='heaven-gg-wardrobe.json';a.click();URL.revokeObjectURL(url);
});
$('#import').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',async e=>{
 const f=e.target.files?.[0];if(!f)return;if(f.size>64000){alert('Plan file too large');return;}
 try{const parsed=validateWardrobePlan(JSON.parse(await f.text()),data);
 picks={wanted:parsed.wanted,owned:parsed.owned};
 for(const [name,k] of [['wallet','walletQuna'],['budget','budgetCents'],['dye-changes','dyeChanges'],['dye-price','dyeQunaEach']]){const v=parsed.parameters[k];$('#'+name).value=v===null?'':name==='budget'?String(v/100):String(v);}
 persist();render();
 }catch(err){alert('Unable to import plan: '+err.message);}e.target.value='';
});
fetch('./catalog.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Catalog unavailable');return r.json();}).then(d=>{
 if(!Array.isArray(d.products)||!Array.isArray(d.packs)||!Array.isArray(d.sources))throw Error('Invalid catalog');
 data=d;const allowed=new Set(d.products.map(p=>p.id));picks={wanted:picks.wanted.filter(id=>allowed.has(id)),owned:picks.owned.filter(id=>allowed.has(id))};$('#source-note').textContent='Research snapshot '+d.as_of+' · '+d.region+' · '+d.coverage+'. Unknowns are shown rather than assumed.';render();
}).catch(err=>{$('#source-note').textContent='Could not load catalog: '+err.message;});

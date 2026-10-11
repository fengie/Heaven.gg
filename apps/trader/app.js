'use strict';
const el=id=>document.getElementById(id);
const money=cents=>'$'+(cents/100).toFixed(2);
const gold=value=>(value/1000000).toFixed(2)+'m';
const toast=msg=>{el('toast').textContent=msg;el('toast').classList.add('visible');};
let activeDeal=null;
let buyerKey=null;
let sellerKey=null;
const fields=()=>({petHalfK:+el('pet').value,mountHalfK:+el('mount').value,rateCents:+el('rate').value,offerCents:+el('offer').value,buyerAlias:el('alias').value.trim()||'Buyer'});
function compute(x){
 const petCoins=40*x.petHalfK*500, mountCoins=128*x.mountHalfK*500,totalCoins=petCoins+mountCoins;
 const estimatedCents=Math.round(totalCoins*x.rateCents/1000000);
 return {petCoins,mountCoins,totalCoins,estimatedCents,effectiveRateCents:Math.round(x.offerCents*1000000/totalCoins)};
}
function showMath(){
 const x=fields(),m=compute(x);
 el('petOut').textContent=(x.petHalfK/2).toFixed(1)+'k';
 el('mountOut').textContent=(x.mountHalfK/2).toFixed(1)+'k';
 el('rateOut').textContent=money(x.rateCents);
 el('offerOut').textContent=money(x.offerCents);
 el('petMath').textContent='40 × '+(x.petHalfK/2).toFixed(1)+'k = '+gold(m.petCoins);
 el('mountMath').textContent='128 × '+(x.mountHalfK/2).toFixed(1)+'k = '+gold(m.mountCoins);
 el('totalGold').textContent=gold(m.petCoins)+' + '+gold(m.mountCoins)+' = '+gold(m.totalCoins);
 el('formula').textContent='('+m.totalCoins.toLocaleString()+' gold ÷ 1,000,000) × '+money(x.rateCents)+' = '+money(m.estimatedCents);
 el('estimated').textContent=money(m.estimatedCents);
 el('offerMath').textContent=money(x.offerCents);
 const diff=x.offerCents-m.estimatedCents;
 el('delta').textContent=(diff>=0?'+':'−')+money(Math.abs(diff));
 el('effective').textContent=money(m.effectiveRateCents);
}
for(const id of ['pet','mount','rate','offer']) el(id).addEventListener('input',showMath);
showMath();
async function api(path,method='GET',body=null,key=''){
 const response=await fetch(path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(key?{'authorization':'Bearer '+key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok) throw Error(data.error||'Request failed');
 return data;
}
function setDeal(offer){
 activeDeal=offer;
 el('dealSection').hidden=false;
 el('statusBadge').textContent=offer.status.replaceAll('_',' ').toUpperCase();
 el('dealTitle').textContent=offer.status==='accepted'?'Deal accepted':offer.status==='countered'?'Seller counteroffer':'Offer '+offer.status.replaceAll('_',' ');
 const pieces=[
   offer.buyerAlias+': '+money(offer.offerCents)+' for 128 Mount + 40 Pet Tokens.',
   'Token basis: 40 × '+(offer.petHalfK/2).toFixed(1)+'k + 128 × '+(offer.mountHalfK/2).toFixed(1)+'k = '+gold(offer.math.totalCoins)+'.',
   'Equivalent at '+money(offer.rateCents)+'/million: '+money(offer.math.estimatedCents)+'.'
 ];
 if(offer.counterCents!==null) pieces.push('Seller counter: '+money(offer.counterCents)+'.');
 pieces.push('Status: '+offer.status+'.');
 el('dealCopy').textContent=pieces.join(' ');
 el('acceptCounter').hidden=offer.status!=='countered'||!buyerKey;
 el('rejectCounter').hidden=offer.status!=='countered'||!buyerKey;
}
function dealLink(id,key){return location.origin+location.pathname+'#offer='+id+'.'+key;}
el('send').addEventListener('click',async()=>{
 const btn=el('send');btn.disabled=true;
 try{
   const data=await api('/api/offers','POST',fields());
   buyerKey=data.buyerKey;
   location.hash='offer='+data.offer.id+'.'+buyerKey;
   setDeal(data.offer);toast('Offer submitted. Copy your private deal link.');
 }catch(e){toast(e.message);}finally{btn.disabled=false;}
});
async function loadDeal(){
 const match=location.hash.match(/^#offer=([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/);
 if(!match)return;
 buyerKey=match[2];
 try{const data=await api('/api/offers/'+match[1],'GET',null,buyerKey);setDeal(data.offer);}
 catch(e){toast(e.message);}
}
window.addEventListener('hashchange',loadDeal);
loadDeal();
el('copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(dealLink(activeDeal.id,buyerKey));toast('Private deal link copied — anyone with it can respond as buyer.');}
 catch{toast('Clipboard denied; use your browser address bar.');}
});
el('refresh').addEventListener('click',async()=>{
 if(!activeDeal)return;
 try{setDeal((await api('/api/offers/'+activeDeal.id,'GET',null,buyerKey||sellerKey)).offer);}
 catch(e){toast(e.message);}
});
for(const [button,action] of [['acceptCounter','accept-counter'],['rejectCounter','decline-counter']]){
 el(button).addEventListener('click',async()=>{
   if(!activeDeal||!buyerKey)return;
   try{setDeal((await api('/api/offers/'+activeDeal.id+'/respond','POST',{action},buyerKey)).offer);toast('Response recorded.');}
   catch(e){toast(e.message);}
 });
}
el('catalogSearch').addEventListener('click',async()=>{
 const list=el('catalogResults');list.replaceChildren();
 try{
   const d=await api('/api/catalog?q='+encodeURIComponent(el('catalogQuery').value));
   for(const item of d.items){
     const li=document.createElement('li');li.textContent=item.name+' ';
     const span=document.createElement('span');span.textContent='ID '+item.id;
     li.append(span);list.append(li);
   }
   if(!d.items.length){const li=document.createElement('li');li.textContent='No matching historical items.';list.append(li);}
 }catch(e){toast(e.message);}
});
el('catalogQuery').addEventListener('keydown',e=>{if(e.key==='Enter')el('catalogSearch').click();});
el('loadOffers').addEventListener('click',refreshSeller);
async function refreshSeller(){
 sellerKey=el('sellerKey').value.trim();
 if(!sellerKey){toast('Enter seller secret');return;}
 try{
   const offers=(await api('/api/offers','GET',null,sellerKey)).offers;
   const target=el('sellerOffers');target.replaceChildren();
   if(!offers.length){target.textContent='No offers yet.';return;}
   for(const offer of offers){
     const card=document.createElement('article');card.className='seller-entry';
     const h=document.createElement('h3');h.textContent=offer.buyerAlias+' • '+money(offer.offerCents)+' • '+offer.status;
     const p=document.createElement('p');p.textContent='40 × '+(offer.petHalfK/2).toFixed(1)+'k + 128 × '+(offer.mountHalfK/2).toFixed(1)+'k = '+gold(offer.math.totalCoins)+' → '+money(offer.math.estimatedCents)+' at '+money(offer.rateCents)+'/m';
     card.append(h,p);
     if(['submitted','countered'].includes(offer.status)){
       const actions=document.createElement('div');actions.className='actions';
       const act=(name,action)=>{
         const btn=document.createElement('button');btn.className='secondary';btn.type='button';btn.textContent=name;
         btn.addEventListener('click',async()=>{
           let counterCents;
           if(action==='counter'){
             const raw=prompt('Seller counter in USD (50–200)',(offer.offerCents/100).toFixed(2));
             if(raw===null)return;
             const amount=Number(raw);counterCents=Math.round(amount*100);
             if(!Number.isFinite(amount)||amount<50||amount>200||Math.abs(amount*100-counterCents)>.00001){toast('Invalid USD amount');return;}
           }
           try{await api('/api/offers/'+offer.id+'/action','POST',{action,...(counterCents===undefined?{}:{counterCents})},sellerKey);toast('Seller decision recorded.');await refreshSeller();}
           catch(e){toast(e.message);}
         });actions.append(btn);
       };
       act('Accept','accept');act('Counter','counter');act('Reject','reject');card.append(actions);
     }
     target.append(card);
   }
 }catch(e){toast(e.message);}
}

// Pure, versioned, offline calculations plus an optional browser UI; no game-client access.
export const PROFILE_SCHEMA = 'heaven-gg/aion2-profile/v1';
export const STORAGE_KEY = 'heaven-gg:aion2:character-v1';
const MONEY_LIMIT = 1_000_000_000_000;
const SLOT_LIMIT = 40;
const allowedFunds = new Set(['market','all']);
const number = (value, label, max = MONEY_LIMIT) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(label + ' must be an integer from 0 to ' + max);
  return n;
};
const boundedText = (value, label, max = 120) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000e-\u001f]/.test(value))
    throw new Error(label + ' must be a short text value');
  return value.trim();
};
const bool = (value, label) => {
  if (typeof value !== 'boolean') throw new Error(label + ' must be true or false');
  return value;
};
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
  return value;
};
function slotIds(catalog) {
  return new Set(catalog.gearSlots.map(x=>x.id));
}
export function emptyProfile() {
  return {
    schema:PROFILE_SCHEMA, className:'', characterLevel:0, itemLevel:0,
    boundKina:0, tradableKina:0, quna:0, odyle:0, membership:false,
    vendorBought:0, vendorConfirmed:false, mainQuestDone:false,
    regionalQuestsDone:false, feathersDone:false,
    gear:{}, runs:{}, upgrades:[], exchangeAsks:{}, exchangeObservedDate:''
  };
}
function normalizeGear(input, catalog) {
  const allowed=slotIds(catalog);
  const raw=object(input,'gear');
  if (Object.keys(raw).length > SLOT_LIMIT) throw new Error('too many gear slots');
  const out={};
  for(const [slot,item] of Object.entries(raw)){
    if (!allowed.has(slot)) throw new Error('unknown gear slot: '+slot);
    const g=object(item,'gear item');
    const name=boundedText(g.name ?? '',slot+' name');
    if (!name) continue;
    out[slot]={
      name, grade:boundedText(g.grade ?? '',slot+' grade',40),
      itemTier:number(g.itemTier ?? 0,slot+' itemTier',500),
      enchant:number(g.enchant ?? 0,slot+' enchant',50),
      soulBinding:number(g.soulBinding ?? 0,slot+' soulBinding',50),
      stones:number(g.stones ?? 0,slot+' stones',12),
      notes:boundedText(g.notes ?? '',slot+' notes',250)
    };
  }
  return out;
}
export function normalizeProfile(input, catalog) {
  const src=object(input,'profile');
  if (src.schema !== PROFILE_SCHEMA) throw new Error('unsupported profile schema; import Heaven.gg profile v1 JSON or a gear CSV');
  const p=emptyProfile();
  p.className=boundedText(src.className ?? '', 'className', 64);
  p.characterLevel=number(src.characterLevel ?? 0,'characterLevel',100);
  p.itemLevel=number(src.itemLevel ?? 0,'itemLevel',10_000);
  for(const key of ['boundKina','tradableKina','quna','odyle']) p[key]=number(src[key] ?? 0,key);
  p.membership=bool(src.membership ?? false,'membership');
  p.vendorBought=number(src.vendorBought ?? 0,'vendorBought',100);
  p.vendorConfirmed=bool(src.vendorConfirmed ?? false,'vendorConfirmed');
  for(const key of ['mainQuestDone','regionalQuestsDone','feathersDone']) p[key]=bool(src[key] ?? false,key);
  p.gear=normalizeGear(src.gear ?? {},catalog);
  const validActivityIds=new Set(catalog.activities.map(x=>x.id));
  for(const [id,run] of Object.entries(object(src.runs ?? {},'runs'))){
    if(!validActivityIds.has(id)) throw new Error('unknown activity: '+id);
    const row=object(run,'run '+id);
    p.runs[id]={
      minutes:number(row.minutes ?? 0,id+' minutes',1440),
      rewardKina:number(row.rewardKina ?? 0,id+' rewardKina'),
      variableCostKina:number(row.variableCostKina ?? 0,id+' variableCostKina'),
      successPct:number(row.successPct ?? 100,id+' successPct',100)
    };
  }
  if(!Array.isArray(src.upgrades)||src.upgrades.length>20) throw new Error('upgrades must contain at most 20 rows');
  const ids=new Set();
  p.upgrades=src.upgrades.map((item,i)=>{
    const row=object(item,'upgrade');
    const id=boundedText(row.id ?? '', 'upgrade id',32);
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error('invalid upgrade id');
    if(ids.has(id)) throw new Error('duplicate upgrade id'); ids.add(id);
    const slot=boundedText(row.slot ?? '', 'upgrade slot',40);
    if(slot && !slotIds(catalog).has(slot)) throw new Error('unknown upgrade slot: '+slot);
    const funds=boundedText(row.funds ?? 'all','upgrade funds',20);
    if(!allowedFunds.has(funds)) throw new Error('invalid upgrade funds');
    return {
      id, name:boundedText(row.name ?? '', 'upgrade name',120),
      slot, costKina:number(row.costKina ?? 0,'upgrade costKina'),
      targetItemLevel:number(row.targetItemLevel ?? 0,'upgrade targetItemLevel',10_000),
      funds
    };
  });
  for (const [size,quote] of Object.entries(object(src.exchangeAsks ?? {},'exchangeAsks'))) {
    if(!/^\d+$/.test(size)|| ![400000,2000000,10000000].includes(Number(size))) throw new Error('invalid exchange chest denomination');
    p.exchangeAsks[size]=number(quote,'exchange ask',1_000_000);
  }
  p.exchangeObservedDate=boundedText(src.exchangeObservedDate ?? '','exchangeObservedDate',10);
  if(p.exchangeObservedDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.exchangeObservedDate)) throw new Error('exchangeObservedDate must be YYYY-MM-DD');
  return p;
}
function splitCsv(text) {
  if(typeof text !== 'string'|| text.length>65536) throw new Error('CSV is too large (64 KB limit)');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"' && text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"'){quoted=false;closed=true;}
      else cell+=ch;
    } else if(ch==='"' && cell==='' && !closed){quoted=true;}
    else if(ch==='"'){throw new Error('invalid CSV quoting');}
    else if(ch===','){row.push(cell);cell='';closed=false;}
    else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';closed=false;}
    else if(closed && ch!=='\r'){throw new Error('invalid CSV text after closing quote');}
    else if(ch!=='\r')cell+=ch;
  }
  if(quoted) throw new Error('unclosed CSV quote');
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(c=>c.trim()));
}
export function parseGearCsv(csv, catalog) {
  const rows=splitCsv(csv.replace(/^\ufeff/,''));
  if(rows.length<2||rows.length>100) throw new Error('CSV needs header and 1-98 item rows');
  const header=rows.shift().map(x=>x.trim());
  if(new Set(header).size!==header.length || !['slot','name'].every(x=>header.includes(x)))throw new Error('CSV requires unique slot,name headers');
  if(header.some(x=>!['slot','name','grade','itemTier','enchant','soulBinding','stones','notes'].includes(x)))throw new Error('unsupported CSV header');
  const out={};
  for (const raw of rows){
    if(raw.length!==header.length)throw new Error('CSV column count mismatch');
    const item=Object.fromEntries(header.map((field,i)=>[field,raw[i].trim()]));
    if(!slotIds(catalog).has(item.slot))throw new Error('unknown gear slot: '+item.slot);
    if(Object.hasOwn(out,item.slot))throw new Error('duplicate gear slot: '+item.slot);
    if(!item.name) throw new Error('gear item name required');
    const obj={
      name:item.name, grade:item.grade || '',
      itemTier:item.itemTier || 0, enchant:item.enchant || 0,
      soulBinding:item.soulBinding || 0, stones:item.stones || 0,notes:item.notes || ''
    };
    out[item.slot]=normalizeGear({[item.slot]:obj},catalog)[item.slot];
  }
  return out;
}
export function sourceFreshness(observedDate, today, maximumAgeDays=7) {
  const before=Date.parse(String(observedDate)+'T00:00:00Z');
  const after=Date.parse(String(today)+'T00:00:00Z');
  if(!Number.isFinite(before)||!Number.isFinite(after)) return {stale:true,days:null};
  const days=Math.floor((after-before)/86400000);
  return {stale:days>maximumAgeDays||days<0,days};
}
function activeVendor(catalog, today){
  return today >= catalog.vendorEnergy.temporaryFrom && today <= catalog.vendorEnergy.temporaryThrough;
}
function projectedPayout(activity,run) {
  const reward=run?.rewardKina>0?run.rewardKina:activity.referenceRewardKina;
  const costs=run?.variableCostKina??0, chance=(run?.successPct??100)/100;
  return Math.max(0, reward*chance-costs);
}
export function evaluateProfile(input,catalog,snapshot,today) {
  const p=normalizeProfile(input,catalog), warnings=[],actions=[];
  const ready=p.characterLevel>=45 && p.itemLevel>0;
  if(!ready) actions.push({id:'need-level',priority:0,title:'Enter character level and item level; finish core progression',detail:'No dungeon eligibility can be inferred until level 45 and total item level are known.'});
  for(const [key,id,title] of [
    ['mainQuestDone','main-quest','Finish your main storyline for initial Unique gear'],
    ['regionalQuestsDone','regional-quests','Complete regional quests / Daevanion rewards'],
    ['feathersDone','feathers','Collect Empyrean Trace feathers and resonance']
  ]) if(!p[key]) actions.push({id,priority:2,title,detail:'Low-cost progression to check in client; exact item-level gain is not modeled.'});
  if(Object.keys(p.gear).length<8) actions.push({id:'record-gear',priority:1,title:'Record equipment, enchants, stones and Soul Binding',detail:'Player gear rolls are not in public item catalogs; enter your actual equipment before comparing upgrades.'});
  const eligibleActivities = ready ? catalog.activities.filter(x=>p.itemLevel>=x.requiredItemLevel).map(a=>{
    const run=p.runs[a.id];
    const minutes=run?.minutes>0?run.minutes:null;
    const netPerClaim=projectedPayout(a,run);
    return {
      id:a.id,name:a.name,requiredItemLevel:a.requiredItemLevel,
      referenceRewardKina:a.referenceRewardKina,
      effectiveRewardKina:run?.rewardKina>0?run.rewardKina:a.referenceRewardKina,
      netPerClaim, minutes, netKinaPerHour:minutes===null?null:Math.round(netPerClaim*60/minutes),
      measurement:run?.rewardKina>0?'user-entered':'community-model'
    };
  }):[];
  const measured=eligibleActivities.filter(x=>x.minutes!==null);
  measured.sort((a,b)=>b.netKinaPerHour-a.netKinaPerHour||b.netPerClaim-a.netPerClaim||a.id.localeCompare(b.id));
  const bestFarm=measured[0]||null;
  if(measured.length===0)actions.push({id:'measure-runs',priority:0,title:'Measure at least three successful dungeon clears',detail:'Enter clear minutes, cube Kina, cost and success rate to rank real net Kina/hour. Community payout tables alone cannot establish your best run.'});
  const insideVendor=activeVendor(catalog,today);
  const vendorOffersRemaining=insideVendor?Math.max(0,catalog.vendorEnergy.offersPerCharacter-p.vendorBought):0;
  const vendorExtraClaims=insideVendor&&p.membership&&p.vendorConfirmed?vendorOffersRemaining:0;
  if(!insideVendor) warnings.push('Temporary Odyle purchase-limit window has expired; verify current patch before buying.');
  else if(!p.vendorConfirmed) warnings.push('Confirm current vendor price, account eligibility and limits in-game before planning extra Odyle purchases.');
  if(p.odyle<40)actions.push({id:'odyle',priority:3,title:'Check Odyle regeneration / vendor eligibility',detail:'Do not leave regeneration capped; purchased energy is worthwhile only when incremental net reward beats the verified purchase cost.'});
  const currentMaxReward=ready?Math.max(0,...eligibleActivities.map(a=>a.referenceRewardKina)):0;
  const upgrades=p.upgrades.map(u=>{
    const reachable=ready?catalog.activities.filter(x=>u.targetItemLevel>=x.requiredItemLevel):[];
    const proposedMax=Math.max(0,...reachable.map(x=>x.referenceRewardKina));
    const gain=Math.max(0,proposedMax-currentMaxReward);
    const paybackClaims= u.targetItemLevel>p.itemLevel && gain>0
      ?Math.ceil(u.costKina/gain):null;
    const affordable=(u.funds==='market'?p.tradableKina:p.tradableKina+p.boundKina)>=u.costKina;
    return {...u,affordable,modelGainKinaPerClaim:gain,paybackClaims,confidence:'modeled'};
  }).sort((a,b)=>(a.paybackClaims??Infinity)-(b.paybackClaims??Infinity)||a.costKina-b.costKina);
  for(const item of upgrades)if(item.name&&item.paybackClaims!==null)actions.push({
    id:'upgrade-'+item.id, priority:item.affordable?1:4,
    title:(item.affordable?'Evaluate ':'Save for ')+item.name,
    detail:'Modeled +' + Math.round(item.modelGainKinaPerClaim).toLocaleString('en-US')+
      ' Kina/claim and '+item.paybackClaims+' claims to repay; ignores queue time, failure and fees. '+(item.affordable?'Budget available.':'Insufficient eligible Kina for this funding type.')
  });
  const offers=(snapshot.offers||[]).map(x=>({...x,quna:p.exchangeAsks[String(x.kina)]??x.quna}));
  const stamp=p.exchangeObservedDate||snapshot.observed_date;
  const fresh=sourceFreshness(stamp,today);
  let exchangeAdvice={kind:'unverified',observedDate:stamp,stale:fresh.stale,bestNominalSellerChestKina:null,qunaNet:null};
  if(fresh.stale)exchangeAdvice.kind='stale';
  else if(p.tradableKina>0){
    const tax=snapshot.displayed_tax_basis_points/10000;
    const morph=snapshot.morph_fee_basis_points_assumed/10000;
    const affordable=offers.filter(o=>p.tradableKina>=Math.ceil(o.kina*(1+morph)));
    if(affordable.length) {
      const best=affordable.sort((a,b)=>(b.quna*(1-tax)/(b.kina*(1+morph)))-(a.quna*(1-tax)/(a.kina*(1+morph))))[0];
      exchangeAdvice={kind:'snapshot-only',observedDate:stamp,stale:false,
        bestNominalSellerChestKina:best.kina,qunaNet:Math.floor(best.quna*(1-tax))};
    }
  }
  warnings.push('Exchange quotes are manual asking prices, not completed sales; fees and settlement rounding must be confirmed.');
  const weeklyEstimate=bestFarm?
    Math.round(bestFarm.netPerClaim*(catalog.naturalClaimsPerWeekEstimate+vendorExtraClaims)-vendorExtraClaims*catalog.vendorEnergy.priceKinaPerClaimEstimate):null;
  return {eligibleActivities,bestFarm,upgrades,
    actions:actions.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)),
    warnings,gearCoverage:Object.keys(p.gear).length,
    vendorOffersRemaining,vendorExtraClaims,
    weeklyEstimate,exchangeAdvice};
}

// Browser-only local character editor; module is inlined into the offline HTML.
if(typeof document!=='undefined') {
  function installProfileEditor(){
    const el=id=>document.getElementById(id);
    if(!el('profile-editor'))return;
    const catalog=JSON.parse(el('progression-data').textContent);
    const snapshot=JSON.parse(el('exchange-data').textContent);
    const $=s=>document.querySelector(s);
    const asToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
    const printable=n=>Number(n).toLocaleString('en-US');
    let memory=emptyProfile(), storageAvailable=true;
    function notice(message,kind='ok'){el('profile-status').textContent=message;el('profile-status').dataset.kind=kind;}
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw && raw.length<=65536)memory=normalizeProfile(JSON.parse(raw),catalog);
    } catch {
      storageAvailable=false;
      notice('Browser storage unavailable; use Export JSON to keep progress.','warn');
    }
    function persist(){
      try {
        memory=normalizeProfile(memory,catalog);
        localStorage.setItem(STORAGE_KEY,JSON.stringify(memory));
        if(!storageAvailable){storageAvailable=true;notice('Local browser save restored.');}
      }catch(error){storageAvailable=false;notice('Local save is unavailable: '+String(error.message).slice(0,170)+'. Export a JSON backup.','warn');}
    }
    function create(tag,cls,text){
      const node=document.createElement(tag);
      if(cls)node.className=cls;
      if(text!==undefined)node.textContent=String(text);
      return node;
    }
    function field(type,slot,key,value,opts={}){
      const input=create('input','profile-control');
      input.type=type;
      input.dataset.gearSlot=slot;
      input.dataset.gearField=key;
      input.setAttribute('aria-label',slot+' '+key);
      if(type==='number'){input.min='0';input.max=String(opts.max??1000000);input.step='1';}
      input.value=String(value??'');
      return input;
    }
    function gearRows(){
      const container=el('gear-tracker');container.replaceChildren();
      for(const slot of catalog.gearSlots){
        const row=create('div','gear-row');const item=memory.gear[slot.id]||{};
        const title=create('div','gear-slot',slot.label);
        title.appendChild(create('small','gear-hint',slot.property));
        row.appendChild(title);
        const name=field('text',slot.id,'name',item.name||'');
        name.placeholder='Name / item ID';
        const suggestions=catalog.gearExamples.filter(x=>x.slot===slot.id||((slot.id.startsWith('ring')&&x.slot.startsWith('ring'))||(slot.id.startsWith('earring')&&x.slot.startsWith('earring'))||(slot.id.startsWith('arcana')&&x.slot.startsWith('arcana'))));
        if(suggestions.length){
          const list=create('datalist');
          list.id='sample-'+slot.id;
          for(const example of suggestions){const option=create('option');option.value=example.name;list.append(option);}
          name.setAttribute('list',list.id);
          row.append(name,list);
        }else row.append(name);
        const grade=create('select','profile-control');
        grade.dataset.gearSlot=slot.id;grade.dataset.gearField='grade';grade.setAttribute('aria-label',slot.label+' grade');
        for(const variant of ['','Common','Rare','Epic','Unique','Legend','Special','Other']){
          const option=create('option',null,variant||'Grade?');option.value=variant;grade.append(option);
        }
        grade.value=item.grade||'';
        row.append(grade,field('number',slot.id,'itemTier',item.itemTier??0,{max:500}),field('number',slot.id,'enchant',item.enchant??0,{max:50}),field('number',slot.id,'soulBinding',item.soulBinding??0,{max:50}),field('number',slot.id,'stones',item.stones??0,{max:12}));
        container.append(row);
      }
    }
    function runRows(){
      const container=el('run-tracker');container.replaceChildren();
      for(const activity of catalog.activities){
        const row=create('div','run-row');
        row.append(create('div','gear-slot',activity.name+' (IL '+printable(activity.requiredItemLevel)+')'));
        for(const [key,label,max] of [['minutes','Minutes',1440],['rewardKina','Cube Kina',MONEY_LIMIT],['variableCostKina','Variable cost',MONEY_LIMIT],['successPct','Success %',100]]){
          const input=create('input','profile-control');input.type='number';input.min='0';input.max=String(max);input.placeholder=label;
          input.dataset.runId=activity.id;input.dataset.runField=key;
          input.setAttribute('aria-label',activity.name+' '+label);
          input.value=String(memory.runs[activity.id]?.[key]??(key==='rewardKina'?0:key==='successPct'?100:0));
          row.append(input);
        }
        container.append(row);
      }
    }
    function upgradeRows(){
      const container=el('upgrade-tracker');container.replaceChildren();
      for(const upgrade of memory.upgrades){
        const row=create('div','upgrade-row');
        for(const [key,label,max] of [['name','Upgrade description',null],['costKina','Cost in Kina',MONEY_LIMIT],['targetItemLevel','Projected total IL',10000]]){
          const node=create('input','profile-control');node.type=max?'number':'text';node.placeholder=label;node.value=String(upgrade[key]??'');
          node.dataset.upgradeId=upgrade.id;node.dataset.upgradeField=key;
          node.setAttribute('aria-label',label);
          if(max){node.min='0';node.max=String(max);}
          row.append(node);
        }
        const funds=create('select','profile-control');
        for(const [value,label] of [['all','Any eligible Kina'],['market','Market / tradable only']]){
          const option=create('option',null,label);option.value=value;funds.append(option);
        }
        funds.value=upgrade.funds;funds.dataset.upgradeId=upgrade.id;funds.dataset.upgradeField='funds';funds.setAttribute('aria-label','Upgrade funding type');
        row.append(funds);
        const remove=create('button','mini-button','Remove');remove.type='button';remove.dataset.removeUpgrade=upgrade.id;
        row.append(remove);container.append(row);
      }
    }
    function fields(){
      for(const node of document.querySelectorAll('[data-profile-field]')){
        const value=memory[node.dataset.profileField];
        if(node.type==='checkbox')node.checked=Boolean(value);
        else node.value=String(value??'');
      }
      for(const chest of snapshot.offers){
        const node=el('ask-'+chest.kina);if(node)node.value=String(memory.exchangeAsks[String(chest.kina)]??chest.quna);
      }
      el('market-date').value=memory.exchangeObservedDate||snapshot.observed_date;
      gearRows();runRows();upgradeRows();render();
    }
    function appendAction(parent,title,detail,badge){
      const card=create('div','recommend-row');
      card.append(create('strong',null,title));
      if(badge)card.append(create('span','strategy-badge',badge));
      card.append(create('p','help',detail));
      parent.append(card);
    }
    function render(){
      let result;
      try {result=evaluateProfile(memory,catalog,snapshot,asToday());}
      catch(error){notice('Check the latest field: '+String(error.message).slice(0,200),'warn');return;}
      el('summary-il').textContent=printable(memory.itemLevel);
      el('summary-trade').textContent=printable(memory.tradableKina);
      el('summary-gear').textContent=result.gearCoverage+' / '+catalog.gearSlots.length;
      el('summary-farm').textContent=result.bestFarm?printable(result.bestFarm.netKinaPerHour)+' / hr':'Not measured';
      el('summary-farm-info').textContent=result.bestFarm?
        result.bestFarm.name+' · '+result.bestFarm.measurement+' reward · '+result.bestFarm.minutes+' min / claim':
        'Add your clear time and reward to compare actual routes';
      el('vendor-estimate').textContent=result.vendorExtraClaims?
        result.vendorExtraClaims+' confirmed eligible vendor claims remain (estimated)':
        'No verified extra vendor claims; check current membership/patch';
      el('weekly-estimate').textContent=result.weeklyEstimate===null?'Not measured':
        printable(result.weeklyEstimate)+' modeled Kina/week before weekly reward caps and downtime';
      el('exchange-result').textContent=result.exchangeAdvice.kind==='snapshot-only'?
        'Best nominal seller chest: '+printable(result.exchangeAdvice.bestNominalSellerChestKina)+' Kina; up to '+printable(result.exchangeAdvice.qunaNet)+' Quna after assumed tax, before unknown rounding or fill':
        result.exchangeAdvice.kind==='stale'?
        'Quotes expired. Re-enter current server asking prices and observation date.':
        'Not enough tradable Kina for a supported chest analysis.';
      el('recalc-date').textContent='Calculated '+asToday()+' from locally saved inputs; no live game access';
      const actions=el('strategy-list');actions.replaceChildren();
      for(const action of result.actions.slice(0,8))appendAction(actions,action.title,action.detail,action.priority<2?'NEXT':'FOLLOW-UP');
      const upgrades=el('upgrade-rankings');upgrades.replaceChildren();
      for(const item of result.upgrades){
        appendAction(upgrades,item.name||'Unnamed upgrade',
          item.paybackClaims===null?'No confirmed profitable gate; enter a higher projected IL and actual quote.':
            printable(item.costKina)+' Kina cost · +'+printable(item.modelGainKinaPerClaim)+' modeled Kina/claim · '+item.paybackClaims+' claims to repay. '+
            (item.affordable?'Eligible budget available.':'Not enough eligible '+(item.funds==='market'?'tradable':'total')+' Kina.'),
          item.affordable?'BUDGET OK':'NEEDS CAPITAL');
      }
      if(!result.upgrades.length)appendAction(upgrades,'No upgrade candidates yet','Add an actual item/stone/quest option, its total cost and projected character item level, then compare payback.','NEED INPUT');
      const warn=el('warnings');warn.replaceChildren();
      for(const warning of result.warnings)warn.append(create('li',null,warning));
      if(!storageAvailable)warn.append(create('li',null,'Browser saving unavailable: export JSON to keep your profile.'));
    }
    const boolFields=new Set(['membership','vendorConfirmed','mainQuestDone','regionalQuestsDone','feathersDone']);
    const textFields=new Set(['className']);
    function changeField(event){
      const node=event.target;let changed=false;
      if(node.dataset.profileField){
        const key=node.dataset.profileField;
        memory[key]=boolFields.has(key)?node.checked:textFields.has(key)?node.value:Number(node.value||0);
        changed=true;
      }else if(node.dataset.gearSlot){
        const slot=node.dataset.gearSlot,key=node.dataset.gearField;
        const existing=memory.gear[slot]||{name:'',grade:'',itemTier:0,enchant:0,soulBinding:0,stones:0,notes:''};
        existing[key]=['name','grade','notes'].includes(key)?node.value:Number(node.value||0);
        if(!existing.name.trim())delete memory.gear[slot];else memory.gear[slot]=existing;
        changed=true;
      }else if(node.dataset.runId){
        const id=node.dataset.runId;
        const existing=memory.runs[id]||{minutes:0,rewardKina:0,variableCostKina:0,successPct:100};
        existing[node.dataset.runField]=Number(node.value||0);
        memory.runs[id]=existing;changed=true;
      }else if(node.dataset.upgradeId){
        const item=memory.upgrades.find(x=>x.id===node.dataset.upgradeId);
        if(item){const key=node.dataset.upgradeField;item[key]=['name','funds','slot'].includes(key)?node.value:Number(node.value||0);changed=true;}
      }
      if(changed){persist();render();}
    }
    el('profile-editor').addEventListener('input',changeField);
    el('profile-editor').addEventListener('change',changeField);
    el('upgrade-add').addEventListener('click',()=>{
      if(memory.upgrades.length>=20)return notice('Maximum 20 upgrade options.','warn');
      let n=1;while(memory.upgrades.some(x=>x.id==='upgrade'+n))n++;
      memory.upgrades.push({id:'upgrade'+n,name:'',slot:'',costKina:0,targetItemLevel:0,funds:'all'});
      persist();upgradeRows();render();
    });
    el('upgrade-tracker').addEventListener('click',event=>{
      const id=event.target.dataset.removeUpgrade;
      if(!id)return;
      memory.upgrades=memory.upgrades.filter(x=>x.id!==id);persist();upgradeRows();render();
    });
    for(const chest of snapshot.offers)el('ask-'+chest.kina).addEventListener('change',event=>{
      const next=Number(event.target.value);
      const candidate={...memory,exchangeAsks:{...memory.exchangeAsks,[String(chest.kina)]:next},exchangeObservedDate:asToday()};
      try{memory=normalizeProfile(candidate,catalog);persist();fields();notice('Manually observed quote saved. Not a completed-sale price.');}
      catch(error){notice(String(error.message),'warn');}
    });
    el('market-date').addEventListener('change',event=>{
      try{memory=normalizeProfile({...memory,exchangeObservedDate:event.target.value},catalog);persist();render();}
      catch(error){notice(String(error.message),'warn');}
    });
    const download=(name,contents,type)=>{
      const url=URL.createObjectURL(new Blob([contents],{type}));
      const anchor=create('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    };
    el('profile-export').addEventListener('click',()=>download('heaven-gg-aion2-profile.json',JSON.stringify(normalizeProfile(memory,catalog),null,2)+'\n','application/json'));
    el('gear-template').addEventListener('click',()=>download('heaven-gg-gear-template.csv','slot,name,grade,itemTier,enchant,soulBinding,stones\nweapon,Spiritforged Orb,Unique,45,10,0,0\n','text/csv'));
    el('profile-upload').addEventListener('change',async event=>{
      const file=event.target.files?.[0];event.target.value='';
      if(!file)return;
      if(file.size>65536)return notice('Import exceeds the 64 KB limit.','warn');
      try{
        const text=await file.text();
        let next;
        if(file.name.toLowerCase().endsWith('.csv')){
          const gear=parseGearCsv(text,catalog);
          next=normalizeProfile({...memory,gear:{...memory.gear,...gear}},catalog);
        }else if(file.name.toLowerCase().endsWith('.json')){
          next=normalizeProfile(JSON.parse(text),catalog);
        }else throw new Error('Only .json Heaven.gg profiles and .csv gear tables are supported');
        if(!window.confirm('Apply this '+(file.name.endsWith('.csv')?'gear update':'complete profile')+' to your locally saved profile?'))return;
        memory=next;persist();fields();notice('Import validated and applied locally.');
      } catch(error){notice('Import rejected: '+String(error.message).slice(0,160),'warn');}
    });
    el('profile-reset').addEventListener('click',()=>{
      if(!window.confirm('Reset all locally saved character progress? Export a backup first.'))return;
      memory=emptyProfile();persist();fields();notice('Profile reset locally.');
    });
    fields();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installProfileEditor,{once:true});
  else installProfileEditor();
}

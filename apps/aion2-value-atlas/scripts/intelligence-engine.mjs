// AION 2 opportunity ledger: pure, bounded calculations. No client or wallet access.
// A damage index is conditional on a caller-supplied model, never measured DPS or CP.
const own=(o,k)=>Object.hasOwn(o,k);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const compare=(a,b)=>a<b?-1:a>b?1:0;
const statKeys=new Set(['attack','accuracy','crit','critBonus','weaponBoost','damageBoost','attackIncrease','doubleChance','might','precision','combatSpeed','multiHit','perfectChance','moveSpeed']);
function add(base,delta){
 const next={...base};
 for(const [key,val] of Object.entries(delta||{})){
  if(!statKeys.has(key)||!finite(val)||!finite(next[key]??0))throw Error('unsupported stat or unit');
  next[key]=(next[key]??0)+val;
 }
 return next;
}
export function damageIndex(stats, model){
 const {attack,accuracy,crit=0,critBonus=0,weaponBoost=0}=stats;
 const {critBase,critCap,critRatingPerPoint,critBonus:baseBonus}=model;
 if(![attack,accuracy,crit,critBonus,weaponBoost,critBase,critCap,critRatingPerPoint,baseBonus].every(finite)||attack<0||accuracy<0||crit<0||critCap<0||critCap>1||critRatingPerPoint<=0||baseBonus+critBonus<0||weaponBoost<=-1)throw Error('invalid damage model input');
 const q=Math.min(critCap,Math.max(0,critBase+crit/critRatingPerPoint));
 return attack*(1+weaponBoost)*(1+q*(baseBonus+critBonus));
}
// Resource vectors are explicit, deterministic and non-interchangeable.
// Unknown acquisition costs are not zero; real-money purchases are excluded.
function searchResourceEntries(value,invalid){
 if(!validRecord(value))invalid();
 const entries=Object.entries(value);
 if(entries.length>16)invalid();
 for(const [key,n] of entries)
  if(!/^[a-z][A-Za-z0-9]{0,63}$/.test(key)||['constructor','prototype','cash','recipeKina'].includes(key)||
     !Number.isSafeInteger(n)||n<0||n>1_000_000_000_000)invalid();
 return entries;
}
// The caller supplies a complete legal domain of mutually exclusive option
// groups and a conditional evaluator. A budget constrains declared deterministic
// acquisition costs, not uncertain reroll prices. No budget means theoretical.
export function enumerateBuilds({base,groups,evaluate,minAccuracy=0,minStats={},budget,maxEvaluations=100000,maxVisited=1000000,topK=1}){
 const invalid=()=>{throw Error('invalid search domain');};
 if(!validRecord(base)||Object.entries(base).some(([key,n])=>statKeys.has(key)&&!finite(n))||
    !Array.isArray(groups)||groups.length>64||
    groups.some(g=>!Array.isArray(g)||g.length===0||g.length>4096)||
    groups.reduce((n,g)=>n+g.length,0)>16384||
    !Number.isSafeInteger(maxEvaluations)||maxEvaluations<1||
    !Number.isSafeInteger(maxVisited)||maxVisited<1||maxVisited>1000000||
    !Number.isSafeInteger(topK)||topK<1||topK>50||
    !finite(minAccuracy)||minAccuracy<0||typeof evaluate!=='function'||!validRecord(minStats))invalid();
 const constraints=new Map([['accuracy',minAccuracy]]);
 for(const [key,n] of Object.entries(minStats)){
  if(!statKeys.has(key)||!finite(n)||n<0)invalid();
  constraints.set(key,Math.max(constraints.get(key)??0,n));
 }
 const budgeted=budget!==undefined,unknown=reason=>({
  best:null,alternatives:[],evaluated:0,visited:0,pruned:0,exact:false,status:'unknown',
  reason,scenarioOnly:true,canPurchase:false,acquisitionBudgeted:budgeted
 });
 const balances=new Map(budgeted&&budget!==null?searchResourceEntries(budget,invalid):[]);
 const resources=new Set(balances.keys());
 let missing=budgeted&&budget===null?'RESOURCE_BUDGET_UNAVAILABLE':null;
 // Validate the entire declared domain before pruning or stopping early.
 const domain=groups.map(group=>{
  const seen=new Set();
  return group.map(opt=>{
   if(!validRecord(opt)||typeof opt.id!=='string'||opt.id.length===0||opt.id.length>128||
      seen.has(opt.id)||(opt.delta!=null&&!validRecord(opt.delta)))invalid();
   seen.add(opt.id);
   const delta=opt.delta??{};
   for(const [key,n] of Object.entries(delta))
    if(!statKeys.has(key)||!finite(n))throw Error('unsupported stat or unit');
   const cost=new Map();
   if(budgeted){
    if(opt.cost==null)missing=missing??'ACQUISITION_COST_UNAVAILABLE';
    else for(const [key,n] of searchResourceEntries(opt.cost,invalid)){
     cost.set(key,n);
     resources.add(key);
     if(n>0&&!balances.has(key))missing=missing??'RESOURCE_BUDGET_UNAVAILABLE';
    }
   }
   return {id:opt.id,delta,cost};
  });
 });
 if(resources.size>16)invalid();
 if(missing)return unknown(missing);
 const keys=[...resources].sort(compare),initial=keys.map(key=>balances.get(key)??0);
 for(const group of domain)for(const opt of group)opt.cost=keys.map(key=>opt.cost.get(key)??0);
 let evaluated=0,visited=0,pruned=0,exact=true;
 const ids=[],alternatives=[];
 function remember(state,available){
  const score=evaluate(state);
  if(!finite(score))throw Error('nonfinite score');
  const candidate={ids:[...ids],score,state};
  if(budgeted)candidate.cost=Object.fromEntries(keys.map((key,i)=>[key,initial[i]-available[i]]));
  const order=(a,b)=>compare(b.score,a.score)||compare(JSON.stringify(a.ids),JSON.stringify(b.ids));
  if(alternatives.length===topK&&order(candidate,alternatives[topK-1])>=0)return;
  alternatives.push(candidate);
  alternatives.sort(order);
  if(alternatives.length>topK)alternatives.pop();
 }
 function visit(i,state,available){
  if(visited>=maxVisited){exact=false;return false;}
  visited++;
  if(i===domain.length){
   if(evaluated>=maxEvaluations){exact=false;return false;}
   evaluated++;
   if([...constraints].every(([key,n])=>own(state,key)&&finite(state[key])&&state[key]>=n))remember(state,available);
   return true;
  }
  for(const opt of domain[i]){
   if(opt.cost.some((n,j)=>n>available[j])){pruned++;continue;}
   const next=add(state,opt.delta);
   if(Object.entries(next).some(([key,n])=>statKeys.has(key)&&!finite(n)))throw Error('unsupported stat or unit');
   ids.push(opt.id);
   const done=visit(i+1,next,available.map((n,j)=>n-opt.cost[j]));
   ids.pop();
   if(!done)return false;
  }
  return true;
 }
 visit(0,{...base},initial);
 const best=alternatives[0]??null;
 return {best,alternatives,evaluated,visited,pruned,exact,
  status:exact?(best?'optimal':'infeasible'):(best?'bounded-candidate':'search-incomplete'),
  scenarioOnly:true,canPurchase:false,acquisitionBudgeted:budgeted};
}
export function statReplacements({lines,pool,base,evaluate}){
 if(!Array.isArray(lines)||!Array.isArray(pool)||lines.length>64||pool.length>128||new Set(lines.map(x=>x.id)).size!==lines.length||new Set(lines.map(x=>x.stat)).size!==lines.length)throw Error('invalid line pool');
 const current=evaluate(base);if(!finite(current))throw Error('nonfinite baseline');
 const rows=[];
 for(const line of lines){
  if(!statKeys.has(line.stat)||!finite(line.value))throw Error('unsupported current line');
  if(line.locked===true)continue;
  const used=new Set(lines.filter(x=>x!==line).map(x=>x.stat));
  const seen=new Set();
  for(const entry of pool){
   if(used.has(entry.stat))continue;
   if(!statKeys.has(entry.stat)||!Array.isArray(entry.values)||entry.values.length>1000)throw Error('unsupported candidate pool');
   for(const value of entry.values){
    if(!finite(value)||value<0)throw Error('invalid roll');
    const signature=JSON.stringify([entry.stat,value]);
    if(seen.has(signature)||entry.stat===line.stat&&value===line.value)continue;seen.add(signature);
    const delta={[line.stat]:-line.value};delta[entry.stat]=(delta[entry.stat]??0)+value;
    const score=evaluate(add(base,delta));if(!finite(score))throw Error('nonfinite replacement');
    rows.push({lineId:line.id,stat:entry.stat,value,delta,score,gain:score-current});
   }
  }
 }
 return rows;
}
function interval(v){
 const out=finite(v)?{low:v,high:v}:v;
 return validRecord(out)&&finite(out.low)&&finite(out.high)&&out.low>=0&&out.high>=out.low?out:null;
}
export function affordability(cost,resources={}){
 if(!validRecord(cost))return 'unknown';let unknown=false;
 for(const [resource,raw] of Object.entries(cost)){
  const c=interval(raw);if(!c){unknown=true;continue;}if(c.high===0)continue;
  const balance=own(resources,resource)?resources[resource]:resource==='cash'?{low:0,high:0,fresh:true}:null;
  const b=interval(balance);if(!b||balance.fresh!==true){unknown=true;continue;}
  const reserve=balance.reserve??0;if(!finite(reserve)||reserve<0){unknown=true;continue;}
  if(c.low>Math.max(0,b.high-reserve))return 'unaffordable';
  if(c.high>Math.max(0,b.low-reserve))unknown=true;
 }
 return unknown?'unknown':'affordable';
}
// Restricted stationary retry scenario only. A caller's conditional odds and
// costs are not calibrated game evidence; real rerolls can change the state.
export function estimateStationaryReroll(input={}){
 const invalid=()=>{throw Error('invalid reroll scenario');};
 if(!validRecord(input))invalid();
 const {action,probabilityKind,probability:p,stationaryIndependent,preservesCurrentOnFailure,
   costPerAttempt,budget,maxAttempts,targetProbability:target=null}=input;
 const unknown=reason=>({status:'unknown',reason,successProbability:null,expectedCost:null,
   calibrated:false,canPurchase:false,scenarioOnly:true});
 if(p!==undefined&&p!==null&&(!finite(p)||p<0||p>1))invalid();
 if(target!==null&&(!finite(target)||target<=0||target>1))invalid();
 if(!Number.isSafeInteger(maxAttempts)||maxAttempts<0||maxAttempts>100000)invalid();
 const vector=(value,required)=>{
  if(!validRecord(value))invalid();
  const rows=Object.entries(value);
  if(rows.length>16||(required&&rows.length===0))invalid();
  for(const [key,n] of rows)
   if(!/^[a-z][A-Za-z0-9]{0,63}$/.test(key)||['constructor','prototype','cash','recipeKina'].includes(key)||
      !Number.isSafeInteger(n)||n<0||n>1_000_000_000_000)invalid();
  return rows.sort(([a],[b])=>compare(a,b));
 };
 const costs=costPerAttempt==null?null:vector(costPerAttempt,true);
 if(budget!=null)vector(budget,false);
 if(!['sync','full-binding'].includes(action))return unknown('ACTION_MODEL_UNAVAILABLE');
 const kind=action==='sync'?'conditional-single-line':'joint-acceptance';
 if(probabilityKind!==kind)return unknown('CONDITIONAL_PROBABILITY_REQUIRED');
 if(p==null)return unknown('PROBABILITY_UNAVAILABLE');
 if(stationaryIndependent!==true||preservesCurrentOnFailure!==true)
  return unknown('STATE_TRANSITION_MODEL_REQUIRED');
 if(costs===null||budget==null)return unknown('COST_OR_BUDGET_UNAVAILABLE');
 if(costs.some(([key,c])=>c>0&&!own(budget,key)))return unknown('RESOURCE_BUDGET_UNAVAILABLE');
 const caps=costs.filter(([,c])=>c>0).map(([key,c])=>[key,Math.floor(budget[key]/c)]);
 const n=Math.min(maxAttempts,...caps.map(([,cap])=>cap));
 const limitingResources=caps.filter(([,cap])=>cap===n).map(([key])=>key);
 // Avoid cancellation for very small p, and preserve exact simple binary
 // fractions in ordinary scenarios (e.g. three quarter-probability trials).
 const chanceAt=k=>k===0||p===0?0:p===1?1:p<1e-5
  ?-Math.expm1(k*Math.log1p(-p)):1-Math.pow(1-p,k);
 const successProbability=chanceAt(n);
 const expectedAttempts=p===0?n:Math.min(n,successProbability/p);
 const unbounded=p>0&&finite(1/p)?1/p:null;
 const maxCost=Object.fromEntries(costs.map(([key,c])=>[key,c*n]));
 const expectedCost=Object.fromEntries(costs.map(([key,c])=>[key,c*expectedAttempts]));
 const unboundedExpectedCost=unbounded!==null&&costs.every(([,c])=>finite(c*unbounded))
  ?Object.fromEntries(costs.map(([key,c])=>[key,c*unbounded])):null;
 let minAttemptsForTarget=null;
 if(target!==null&&p===1)minAttemptsForTarget=1;
 else if(target!==null&&target<1&&p>0){
  let candidate=Math.ceil(Math.log1p(-target)/Math.log1p(-p));
  if(Number.isSafeInteger(candidate)&&candidate>0){
   // Correct an adjacent floating-point rounding error without unbounded search.
   if(candidate>1&&chanceAt(candidate-1)>=target)candidate--;
   else if(chanceAt(candidate)<target)candidate++;
   if(Number.isSafeInteger(candidate)&&chanceAt(candidate)>=target)minAttemptsForTarget=candidate;
  }
 }
 return {status:'conditional',action,probabilityKind,probability:p,
  maxAffordableAttempts:n,limitingResources,successProbability,expectedAttempts,
  maxCost,expectedCost,unboundedExpectedAttempts:unbounded,unboundedExpectedCost,
  targetProbability:target,minAttemptsForTarget,targetWithinBudget:target===null?null:
   minAttemptsForTarget!==null&&n>=minAttemptsForTarget,
  probabilityProvenance:'CALLER_DECLARED',scenarioOnly:true,calibrated:false,canPurchase:false};
}
// Finite-horizon, state-conditional reroll scenario. The caller must supply
// the complete legal action domain, utilities and transition distributions;
// this engine neither infers odds nor authorizes any in-game action.
// Success probability means target attainment in the terminal state.
// Exact denotes exhaustive DP over the declared bounded scenario only.
export function planFiniteReroll(input={}){
 const invalid=()=>{throw Error('invalid finite reroll scenario');};
 const unknown=reason=>({status:'unknown',reason,exact:false,firstAction:null,
  expectedUtility:null,successProbability:null,expectedCost:null,expectedAttempts:null,
  alternatives:[],scenarioOnly:true,calibrated:false,canPurchase:false});
 if(!validRecord(input))invalid();
 const {states,initialState,budget,maxAttempts,objective='expected-utility',maxStates=20000}=input;
 if(!['expected-utility','target-probability'].includes(objective)||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<0||maxAttempts>20||
    !Number.isSafeInteger(maxStates)||maxStates<1||maxStates>100000)invalid();
 if(states==null||budget==null)return unknown('STATE_OR_BUDGET_UNAVAILABLE');
 const id=x=>typeof x==='string'&&x.length>0&&x.length<=128&&/^[A-Za-z0-9._:-]+$/.test(x);
 const vector=value=>{
  if(!validRecord(value))invalid();
  const rows=Object.entries(value);
  if(rows.length>16)invalid();
  for(const [key,n] of rows)
   if(!/^[a-z][A-Za-z0-9]{0,63}$/.test(key)||
      ['constructor','prototype','cash','recipeKina'].includes(key)||
      !Number.isSafeInteger(n)||n<0||n>1_000_000_000_000)invalid();
  return rows;
 };
 const balances=new Map(vector(budget));
 if(!Array.isArray(states)||states.length===0||states.length>64||!id(initialState))invalid();
 const graph=new Map();
 for(const state of states){
  if(!validRecord(state)||!id(state.id)||graph.has(state.id)||
     !finite(state.utility)||Math.abs(state.utility)>1e12||typeof state.target!=='boolean')invalid();
  if(state.actions==null)return unknown('ACTION_DOMAIN_UNAVAILABLE');
  if(!Array.isArray(state.actions)||state.actions.length>8)invalid();
  graph.set(state.id,{utility:state.utility,target:state.target,actions:[]});
 }
 if(!graph.has(initialState))invalid();
 const resources=new Set(balances.keys());
 for(const state of states){
  const seen=new Set();
  for(const action of state.actions){
   if(!validRecord(action)||!id(action.id)||action.id==='stop'||seen.has(action.id)||
      !['sync','full-binding','reset','bind'].includes(action.kind))invalid();
   seen.add(action.id);
   if(action.cost==null||action.outcomes==null)return unknown('TRANSITION_OR_COST_UNAVAILABLE');
   const cost=new Map(vector(action.cost));
   for(const [key,n] of cost){
    resources.add(key);
    if(n>0&&!balances.has(key))return unknown('RESOURCE_BUDGET_UNAVAILABLE');
   }
   if(resources.size>16||!Array.isArray(action.outcomes)||
      action.outcomes.length===0||action.outcomes.length>64)invalid();
   const destinations=new Set();
   let sum=0;
   for(const outcome of action.outcomes){
    if(!validRecord(outcome)||!graph.has(outcome.stateId)||destinations.has(outcome.stateId)||
       !finite(outcome.probability)||outcome.probability<0||outcome.probability>1)invalid();
    destinations.add(outcome.stateId);
    sum+=outcome.probability;
   }
   if(Math.abs(sum-1)>1e-9)invalid();
   const outcomes=action.outcomes.filter(o=>o.probability>0)
    .map(o=>({stateId:o.stateId,probability:o.probability/sum}))
    .sort((a,b)=>compare(a.stateId,b.stateId));
   graph.get(state.id).actions.push({id:action.id,cost,outcomes});
  }
  graph.get(state.id).actions.sort((a,b)=>compare(a.id,b.id));
 }
 const keys=[...resources].sort(compare);
 const initialBudget=keys.map(key=>balances.get(key)??0);
 for(const state of graph.values())for(const action of state.actions)
  action.cost=keys.map(key=>action.cost.get(key)??0);
 const memo=new Map();
 const limit=Symbol('computation limit');
 let visited=0,transitions=0;
 let rootAlternatives=[];
 const primary=result=>objective==='target-probability'?result.successProbability:result.expectedUtility;
 function solve(stateId,remaining,available,root=false){
  const key=JSON.stringify([stateId,remaining,available]);
  if(memo.has(key))return memo.get(key);
  if(++visited>maxStates)throw limit;
  const state=graph.get(stateId);
  let best={firstAction:'stop',expectedUtility:state.utility,
   successProbability:Number(state.target),expectedAttempts:0,expectedCost:keys.map(()=>0)};
  if(root)rootAlternatives=[best];
  if(remaining>0)for(const action of state.actions){
   if(action.cost.some((n,i)=>n>available[i]))continue;
   const nextBudget=available.map((n,i)=>n-action.cost[i]);
   const candidate={firstAction:action.id,expectedUtility:0,successProbability:0,
    expectedAttempts:1,expectedCost:[...action.cost]};
   for(const outcome of action.outcomes){
    if(++transitions>250000)throw limit;
    const p=outcome.probability,next=solve(outcome.stateId,remaining-1,nextBudget);
    candidate.expectedUtility+=p*next.expectedUtility;
    candidate.successProbability+=p*next.successProbability;
    candidate.expectedAttempts+=p*next.expectedAttempts;
    for(let i=0;i<keys.length;i++)candidate.expectedCost[i]+=p*next.expectedCost[i];
   }
   candidate.successProbability=Math.max(0,Math.min(1,candidate.successProbability));
   if(root)rootAlternatives.push(candidate);
   // Prefer keeping the current state on an exact tie; among actions the
   // stable ID order is deterministic. Never spend solely to break a tie.
   if(primary(candidate)>primary(best))best=candidate;
  }
  memo.set(key,best);
  return best;
 }
 const present=result=>({...result,expectedCost:Object.fromEntries(keys.map((key,i)=>[key,result.expectedCost[i]]))});
 try{
  const best=solve(initialState,maxAttempts,initialBudget,true);
  return {status:'conditional',exact:true,objective,...present(best),
   alternatives:rootAlternatives.map(present),evaluatedStates:visited,evaluatedTransitions:transitions,
   probabilityProvenance:'CALLER_DECLARED',scenarioOnly:true,calibrated:false,canPurchase:false};
 }catch(error){
  if(error===limit)return unknown('COMPUTATION_LIMIT');
  throw error;
 }
}
// Preferences express willingness, not a change in eligibility, cost or modeled gain.
export const MAX_ACTION_PREFERENCES=256;
const preferenceValues=new Set(['prefer','neutral','dislike']);
export function actionPreferenceKey(row){
 if(!validRecord(row)||![[row.id,512],[row.category,64],[row.title,512]].every(([v,n])=>typeof v==='string'&&v.length>0&&v.length<=n))return null;
 const subject=row.subjectId??null,source=row.source??null;
 if(subject!==null&&!(Number.isSafeInteger(subject)||typeof subject==='string'&&subject.length<=128))return null;
 if(source!==null&&!(typeof source==='string'&&source.length<=2048))return null;
 const key=JSON.stringify([row.id,row.category,row.title,subject,source]);
 return key.length<=4096?key:null;
}
export function resolveActionPreference(row,preferences={},actionPreferences=new Map()){
 const key=actionPreferenceKey(row);
 const chosen=key!==null&&actionPreferences instanceof Map?actionPreferences.get(key):null;
 const override=preferenceValues.has(chosen)?chosen:null;
 const category=validRecord(preferences)&&own(preferences,row.category)?preferences[row.category]:null;
 return {preferenceKey:key,preferenceOverride:override,preference:override??(preferenceValues.has(category)?category:'neutral')};
}
export function rankLedger(rows,resources={},preferences={},sort='recommended',actionPreferences=new Map()){
 if(!Array.isArray(rows)||new Set(rows.map(x=>x.id)).size!==rows.length)throw Error('duplicate action id');
 const rank={affordable:0,unknown:1,unaffordable:2,blocked:3,complete:4};
 const result=rows.map(row=>({...row,status:row.complete?'complete':row.blocked?'blocked':row.requiresVerification===true&&affordability(row.cost,resources)==='affordable'?'unknown':affordability(row.cost,resources),...resolveActionPreference(row,preferences,actionPreferences)}));
 const prefs={prefer:0,neutral:1,dislike:2};
 const descending=(a,b)=>(finite(b)?b:-Infinity)-(finite(a)?a:-Infinity);
 const ascending=(a,b)=>(finite(a)?a:Infinity)-(finite(b)?b:Infinity);
 const costNumber=row=>{if(!validRecord(row.cost))return null;const keys=Object.keys(row.cost);return !keys.length?0:keys.length===1&&keys[0]==='marketKina'?interval(row.cost.marketKina)?.high??null:null;};
 return result.sort((a,b)=>{
  let order=0;
  if(sort==='power')order=descending(a.gain,b.gain);
  else if(sort==='time')order=ascending(a.minutes,b.minutes);
  else if(sort==='cost')order=ascending(costNumber(a),costNumber(b));
  else order=rank[a.status]-rank[b.status]||(prefs[a.preference]??1)-(prefs[b.preference]??1)||descending(a.gain,b.gain)||ascending(a.minutes,b.minutes);
  return order||compare(a.id,b.id);
 });
}
const sameKey=(a,b)=>a&&b&&a.region===b.region&&String(a.serverId)===String(b.serverId)&&a.characterId===b.characterId;
const expired=(t,now,ttl)=>!finite(t)||t>now||now-t>=ttl;
export function planRefresh({trigger='open',visible=true,now=Date.now(),snapshot,key,slotPos,ttl=300000}){
 if(!visible||trigger==='goal')return {summary:false,details:[],boards:[]};
 if(!snapshot||!sameKey(snapshot.key,key))return {summary:true,details:null,boards:null};
 const forced=trigger==='refresh',reroll=trigger==='reroll';
 return {summary:forced||reroll||expired(snapshot.checkedAt,now,ttl),details:(snapshot.equipment??[]).filter(x=>forced||reroll&&x.slotPos===slotPos||expired(x.detailCheckedAt,now,ttl)).map(x=>x.slotPos),boards:(snapshot.boards??[]).filter(x=>forced||expired(x.detailCheckedAt,now,ttl)).map(x=>x.id)};
}
const opened=x=>x===true||x===1||x==='Y'||x==='true';
const closed=x=>x===false||x===0||x==='N'||x==='false';
export function buildLedger(snapshot,{resources={},preferences={},sort='recommended',now=Date.now(),catalog=null,model=null,base=null}={}){
 const rows=[];
 const push=(row)=>rows.push({gain:null,minutes:null,cost:null,...row});
 if(!snapshot)return [];
 for(const g of snapshot.equipment??[]){
  const label=g.slotPosName||`Slot ${g.slotPos}`;const detail=g.detail;
  if(!detail){push({id:`gear:${g.slotPos}:detail`,category:'gear',title:`Check ${label} item detail`,reason:'Item detail is unavailable; no roll recommendation can be verified.',cost:null});continue;}
  if(finite(g.enchantLevel)&&finite(detail.maxEnchantLevel)&&g.enchantLevel<detail.maxEnchantLevel)push({id:`gear:${g.slotPos}:enhance`,category:'enhancement',title:`${label}: enhance +${g.enchantLevel} → +${g.enchantLevel+1}`,reason:'Observed item is below its published maximum; costs, odds and gain require compatible data.'});
  const lines=Array.isArray(detail.subStats)?detail.subStats:[];
  const verified=catalog?.region===snapshot.key.region&&catalog?.patch&&catalog.patch===snapshot.patch&&catalog?.verified===true?catalog.slots?.[g.slotPos]:null;
  // Do not infer roll legality from the current item. A supplied version-matched catalog is required.
  const canEvaluate=verified?.itemId===g.id&&Array.isArray(verified?.lines)&&Array.isArray(verified?.pool)&&typeof model==='function'&&base;
  if(canEvaluate){
   for(const r of statReplacements({lines:verified.lines,pool:verified.pool,base,evaluate:model}))push({id:`gear:${g.slotPos}:candidate:${JSON.stringify([r.lineId,r.stat,r.value])}`,category:'soul-binding',title:`${label}: ${r.lineId} → ${r.stat} ${r.value}`,gain:r.gain,reason:'Conditional damage-index delta; acquisition odds/cost not verified.'});
  }else for(const [i,line] of lines.entries())push({id:`gear:${g.slotPos}:line:${i}`,category:'soul-binding',title:`${label}: review ${line.name||line.id||'unidentified line'} ${line.value??''}`.trim(),reason:'Observed line; replacement pool and combat gain are not verified for this item/patch.'});
 }
 for(const b of snapshot.boards??[]){
  if(!Array.isArray(b.detail?.nodeList)){push({id:`board:${b.id}:detail`,category:'daevanion',title:`Inspect ${b.name||b.id} board`,reason:'Node detail unavailable.'});continue;}
  for(const n of b.detail.nodeList){if(n.type==='None'||n.type==='Start'||opened(n.open))continue;if(!closed(n.open))continue;
   push({id:`board:${b.id}:${n.nodeId??`${n.row}:${n.col}`}`,category:'daevanion',title:`${b.name||b.id}: ${n.name||`node ${n.row},${n.col}`}`,reason:'Observed unopened node; connection prerequisites, resource cost and value unverified.'});}
 }
 for(const skill of snapshot.skills??[]){if(finite(skill.skillLevel)&&skill.skillLevel<20)push({id:`skill:${skill.id}`,category:'skills',title:`Review ${skill.name} (level ${skill.skillLevel})`,reason:'Current skill level observed; available points, specialization and benefit unknown.'});}
 // A current gate is a candidate, not proof of clear capability or reward eligibility.
 if(snapshot.itemLevel!==null&&snapshot.itemLevel<2800)push({id:'gate:ludra-easy',category:'content',title:`Reach item level 2800 (${2800-snapshot.itemLevel} remaining)`,reason:'November 18 Global patch; verify current patch and other entry requirements.',source:'https://store.steampowered.com/news/app/3393110/view/675137971401261063'});
 if(now>=Date.parse('2026-11-18T09:00:00Z')&&now<=Date.parse('2027-03-03T07:00:00Z'))push({id:'event:thanksfromaion2',category:'event',title:'Check unclaimed THANKSFROMAION2 coupon',cost:{},requiresVerification:true,reason:'Official reward, once/account. Redemption state is not exposed; not confirmed unclaimed.',source:'https://store.steampowered.com/news/app/3393110/view/675137971401261150',blocked:false});
 return rankLedger(rows,resources,preferences,sort);
}

// Operator-only, single-attempt connectivity pilot. No character lookup or public relay.
// A successful health response proves routing only, never provider permission/availability.
import {timingSafeEqual} from 'node:crypto';
import {resolveBrokerRequest,boundedJSON} from '../../web/armory-broker.mjs';
import {normalizeServerDirectory} from '../../apps/aion2-value-atlas/scripts/armory-engine.mjs';

const path='/api/aion2/armory-probe';
const schema='heaven.gg/armory-probe/v1';
const region='nae';
const upstream=resolveBrokerRequest('/aion2/armory-api/servers?region=nae&lang=en-US').href;
export const config={
 path:'/api/aion2/armory-probe',
 rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:10}
};

function reply(status,code,details={},extra={}){
 return Response.json({schema,code,...details},{status,headers:{
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra
 }});
}
function validToken(token){return typeof token==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(token);}
function authorized(request,token){
 const actual=Buffer.from(request.headers.get('authorization')??'');
 const expected=Buffer.from('Bearer '+token);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export function createProbe({enabled=false,token='',fetchImpl=fetch}={}){
 const upstreamEnabled=enabled===true&&validToken(token);
 // Instance-local safety latch. It is NOT a distributed quota or durable denial record.
 // Operator runs one manual probe, then disables it; do not automate/retry after denial.
 let attempted=false;
 return async request=>{
  const url=new URL(request.url);
  if(url.pathname!==path||url.search||url.hash||request.body!==null)
   return reply(400,'invalid-probe-request');
  if(request.method==='GET')
   return reply(200,'function-ready',{upstreamEnabled});
  if(request.method!=='POST')
   return reply(405,'method-not-allowed',{}, {Allow:'GET, POST'});
  if(!upstreamEnabled)return reply(503,'probe-disabled');
  if(!authorized(request,token))return reply(401,'unauthorized');
  if(attempted)return reply(409,'probe-already-attempted');
  attempted=true;
  let response;
  try{
   response=await fetchImpl(upstream,{
    method:'GET',credentials:'omit',redirect:'error',cache:'no-store',
    referrerPolicy:'no-referrer',headers:{Accept:'application/json'},
    signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)])
   });
   if(response.redirected)throw Error('unexpected redirect');
   if(response.status!==200){
    const denied=response.status===401||response.status===403;
    return reply(502,denied?'provider-denied':'provider-unavailable',{upstreamStatus:response.status});
   }
   const data=JSON.parse(await boundedJSON(response));
   const rows=normalizeServerDirectory(data,region);
   return reply(200,'provider-ok',{upstreamStatus:200,serverCount:rows.length});
  }catch{
   return reply(502,'provider-invalid-or-unreachable');
  }finally{
   await response?.body?.cancel().catch(()=>{});
  }
 };
}

let handler;
export default function armoryProbe(request){
 if(!handler)handler=createProbe({
  enabled:globalThis.Netlify?.env?.get('AION2_ARMORY_PROBE_ENABLED')==='true',
  token:globalThis.Netlify?.env?.get('AION2_ARMORY_PROBE_TOKEN')??''
 });
 return handler(request);
}

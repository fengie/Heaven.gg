// Read-only, credential-free, remotely callable origin smoke. Does not submit real offers.
import { strict as assert } from 'node:assert';
const configured=process.env.TRADER_SMOKE_BASE_URL;
if(!configured) throw Error('Set TRADER_SMOKE_BASE_URL to the exact deployed HTTPS origin');
const base=new URL(configured);
const loopback=['127.0.0.1','localhost','[::1]'].includes(base.hostname);
if(base.origin!==configured || (base.protocol!=='https:' && !(base.protocol==='http:' && loopback)))
  throw Error('TRADER_SMOKE_BASE_URL must be a strict HTTPS origin (localhost HTTP only)');
const expected=process.env.TRADER_EXPECT_RELEASE_SHA;
if(expected && !/^[a-f0-9]{40}$/.test(expected))
  throw Error('TRADER_EXPECT_RELEASE_SHA must be the approved 40-character SHA');
const probes=[];
async function check(path,options={}) {
  const response=await fetch(new URL(path,base),{
    redirect:'error',signal:AbortSignal.timeout(8000),...options
  });
  probes.push({path,method:options.method||'GET',status:response.status});
  return response;
}
const home=await check('/');
assert.equal(home.status,200);
assert.match(home.headers.get('content-type')||'',/text\/html/);
assert.match(home.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
assert.equal(home.headers.get('x-frame-options'),'DENY');
assert.equal(home.headers.get('access-control-allow-origin'),null);
assert.match(await home.text(),/Every number explained/);
const script=await check('/app.js');
assert.equal(script.status,200);
assert.match(await script.text(),/showMath/);
const health=await check('/healthz');
assert.equal(health.status,200);
assert.match(health.headers.get('cache-control')||'',/no-store/);
const meta=await health.json();
assert.equal(meta.ok,true);
assert.equal(meta.service,'heaven-trader');
assert.equal(meta.revisionProof,'operator-claimed; independent deployment receipt required');
if(expected) assert.equal(meta.revision,expected,'Running revision claim differs from admitted release');
const catalog=await check('/api/catalog?q=token');
assert.equal(catalog.status,200);
const lookup=await catalog.json();
assert(Array.isArray(lookup.items));
assert.match(lookup.provenance,/historical/);
const privateList=await check('/api/offers');
assert.equal(privateList.status,401,'Seller data must not be accessible anonymously');
const denied=await check('/api/offers',{method:'POST',
  headers:{origin:'https://cross-origin.invalid','content-type':'application/json'},
  body:'{}'});
assert.equal(denied.status,403,'Cross-origin submissions must be rejected before mutation');
console.log(JSON.stringify({
  result:'ORIGIN_SMOKE_ONLY_NOT_INSTALLATION_PROOF',
  timestamp:new Date().toISOString(),origin:base.origin,
  revisionClaim:meta.revision,expectedRevision:expected||null,
  tests:probes
},null,2));

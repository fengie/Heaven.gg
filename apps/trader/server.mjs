import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const staticFiles = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/app.js', ['app.js','text/javascript; charset=utf-8']],
  ['/style.css', ['style.css','text/css; charset=utf-8']]
]);
const jsonHeaders = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const securityHeaders = {
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'x-frame-options':'DENY',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'cross-origin-resource-policy':'same-origin'
};
const hash = value => createHash('sha256').update(value).digest('hex');
const safeEqual = (a,b) => {
  const left = Buffer.from(String(a ?? '')), right = Buffer.from(String(b ?? ''));
  return left.length === right.length && timingSafeEqual(left,right);
};
const fail = (status,error) => ({status,body:{error}});
const VALID_STATES = new Set(['submitted','countered','accepted','rejected','counter_rejected']);
function boundedInt(value,min,max,step=1) {
  return Number.isSafeInteger(value) && value>=min && value<=max && (value-min)%step===0;
}
export function totals(input) {
  const {petHalfK,mountHalfK,rateCents,offerCents} = input || {};
  if (!boundedInt(petHalfK,80,90) || !boundedInt(mountHalfK,160,170) ||
      !boundedInt(rateCents,700,800,25) || !boundedInt(offerCents,5000,20000))
    throw new RangeError('Values outside allowed negotiation ranges');
  const petCoins=40*petHalfK*500, mountCoins=128*mountHalfK*500;
  const gold=petCoins+mountCoins;
  return {petCoins,mountCoins,totalCoins:gold,estimatedCents:Math.round(gold*rateCents/1000000),
    effectiveRateCents:Math.round(offerCents*1000000/gold)};
}
function validStoredRecord(record) {
  if(!record || typeof record!=='object' || Array.isArray(record)) return false;
  if(typeof record.id!=='string' || !/^[a-f0-9]{24}$/.test(record.id)
    || typeof record.buyerKeyHash!=='string' || !/^[a-f0-9]{64}$/.test(record.buyerKeyHash)
    || typeof record.buyerAlias!=='string' || record.buyerAlias.length<1
    || record.buyerAlias.length>32 || !/^[\\p{L}\\p{N} ._-]+$/u.test(record.buyerAlias)
    || !VALID_STATES.has(record.status)) return false;
  const isoTimestamp=value=>typeof value==='string' && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString()===value;
  if(!isoTimestamp(record.createdAt) || !isoTimestamp(record.updatedAt)
    || Date.parse(record.updatedAt)<Date.parse(record.createdAt)) return false;
  try { totals(record); } catch { return false; }
  const hasCounter=['countered','counter_rejected'].includes(record.status);
  return hasCounter ? boundedInt(record.counterCents,5000,20000) : record.counterCents===null;
}
function validStore(saved) {
  if(!Array.isArray(saved) || saved.length>1000 || !saved.every(validStoredRecord)) return false;
  const ids=new Set(), keys=new Set();
  for(const record of saved) {
    if(ids.has(record.id) || keys.has(record.buyerKeyHash)) return false;
    ids.add(record.id);keys.add(record.buyerKeyHash);
  }
  return true;
}
function publicOffer(record) {
  const {id,createdAt,status,buyerAlias,petHalfK,mountHalfK,rateCents,offerCents,counterCents,updatedAt} = record;
  return {id,createdAt,status,buyerAlias,petHalfK,mountHalfK,rateCents,offerCents,counterCents,updatedAt,math:totals(record)};
}
async function parseBody(req) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if(type!=='application/json') throw fail(415,'JSON required');
  const chunks=[];let size=0;
  for await(const part of req) {
    size += part.length;
    if(size>4096) throw fail(413,'Request too large');
    chunks.push(part);
  }
  try {
    const out=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!out || typeof out!=='object' || Array.isArray(out)) throw Error('object');
    return out;
  } catch { throw fail(400,'Invalid JSON object'); }
}
function respond(res,status,data,headers={}) {
  res.writeHead(status,{...securityHeaders,...jsonHeaders,...headers});
  res.end(JSON.stringify(data));
}
export async function makeApp(options={}) {
  const sellerKey=options.sellerKey ?? process.env.TRADER_SELLER_KEY;
  if (typeof sellerKey!=='string' || Buffer.byteLength(sellerKey)<32)
    throw Error('TRADER_SELLER_KEY must contain at least 32 bytes (use a random secret)');
  const dataPath=resolve(options.dataPath || process.env.TRADER_DATA_PATH || join(process.env.LOCALAPPDATA || process.env.HOME || root,'HeavenTrader','offers.json'));
  const catalogPath=resolve(options.catalogPath || join(root,'data/game/item_names.tsv'));
  const allowedOrigin = options.publicOrigin || process.env.TRADER_PUBLIC_ORIGIN || 'http://127.0.0.1:8787';
  const configuredOrigin = new URL(allowedOrigin);
  if (configuredOrigin.origin !== allowedOrigin || !['https:', 'http:'].includes(configuredOrigin.protocol) ||
      (configuredOrigin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(configuredOrigin.hostname)))
    throw Error('TRADER_PUBLIC_ORIGIN must be an exact HTTPS origin (HTTP permitted only for localhost)');
  const origin = configuredOrigin.origin;
  // Only trust Cloudflare's client address when a local cloudflared instance is the sole origin ingress.
  const trustCloudflareIp = options.trustCloudflareIp ?? process.env.TRADER_TRUST_CF_CONNECTING_IP === '1';
  const names=(await readFile(catalogPath,'utf8')).split(/\r?\n/).map(line=>{
    const tab=line.indexOf('\t');
    return tab>0 ? {id:line.slice(0,tab),name:line.slice(tab+1).trim()} : null;
  }).filter(x=>x && /^\d+$/.test(x.id) && x.name);
  let records=[];
  try {
    const saved=JSON.parse(await readFile(dataPath,'utf8'));
    if(!validStore(saved)) throw Error('Invalid offer store');
    records=saved;
  } catch(e) {
    if(e.code!=='ENOENT') throw e; // corrupt data never silently overwritten
  }
  let writeQueue=Promise.resolve();
  const serialize = fn => {
    const result=writeQueue.then(async()=>{
      const snapshot=structuredClone(records);
      try { return await fn(); } catch(e) { records=snapshot; throw e; }
    });
    writeQueue=result.catch(()=>{});
    return result;
  };
  async function persist() {
    await mkdir(dirname(dataPath),{recursive:true,mode:0o700});
    const temp=dataPath+'.'+randomBytes(8).toString('hex')+'.tmp';
    await writeFile(temp,JSON.stringify(records,null,2)+'\n',{mode:0o600,flag:'wx'});
    await rename(temp,dataPath);
  }
  const limits=new Map();
  function rateCheck(req) {
    const now=Date.now();
    const peer=req.socket.remoteAddress || 'unknown';
    const cfIp=req.headers['cf-connecting-ip'];
    const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
    const client=trustCloudflareIp && loopback && typeof cfIp==='string' && isIP(cfIp) ? cfIp : peer;
    // Separate visitor quotas; still bound aggregate load even if the tunnel header is spoofed locally.
    function recent(key) {
      return (limits.get(key) || []).filter(t=>now-t<60000);
    }
    const own=recent('client:'+client), all=recent('global');
    if(own.length>=5 || all.length>=100) return false;
    own.push(now);all.push(now);
    limits.set('client:'+client,own);limits.set('global',all);
    if(limits.size>1000) for(const [key,times] of limits)
      if(!times.length || times[times.length-1]<now-60000) limits.delete(key);
    return true;
  }
  const auth=req=>String(req.headers.authorization||'').replace(/^Bearer /i,'');
  const isSeller=req=>safeEqual(auth(req),sellerKey);
  const matchesBuyer=(req,record)=>safeEqual(hash(auth(req)),record.buyerKeyHash);
  async function listener(req,res) {
    try {
      const url=new URL(req.url || '/','http://localhost');
      const pathname=url.pathname;
      const method=req.method || 'GET';
      if (pathname.startsWith('/api/') && method!=='GET' && req.headers.origin!==origin)
        throw fail(403,'Invalid request origin');
      if(method==='GET' && staticFiles.has(pathname)) {
        const [file,type]=staticFiles.get(pathname);
        const body=await readFile(join(here,file));
        res.writeHead(200,{...securityHeaders,'content-type':type,'cache-control':'no-cache'});
        res.end(body);return;
      }
      if(method==='GET' && pathname==='/healthz') {
        respond(res,200,{ok:true,service:'heaven-trader',revision:process.env.TRADER_RELEASE_SHA || 'unverified',revisionProof:'operator-claimed; independent deployment receipt required'});
        return;
      }
      if(method==='GET' && pathname==='/api/catalog') {
        const q=(url.searchParams.get('q')||'').trim().toLocaleLowerCase('en-US');
        if(q.length<2 || q.length>60) throw fail(400,'Search needs 2-60 characters');
        const matches=names.filter(x=>x.name.toLocaleLowerCase('en-US').includes(q)).slice(0,20);
        respond(res,200,{items:matches,provenance:'Heaven.gg pinned historical game-data inventory; not verified tradeable or priced'});
        return;
      }
      if(method==='POST' && pathname==='/api/offers') {
        if(!rateCheck(req)) throw fail(429,'Too many offers; retry later');
        const input=await parseBody(req);
        const numbers={petHalfK:input.petHalfK,mountHalfK:input.mountHalfK,rateCents:input.rateCents,offerCents:input.offerCents};
        totals(numbers); // authoritative server-side validation and recomputation
        const alias=String(input.buyerAlias||'Buyer').trim();
        if(alias.length<1 || alias.length>32 || !/^[\p{L}\p{N} ._-]+$/u.test(alias))
          throw fail(400,'Buyer name must be 1-32 normal characters');
        const buyerKey=randomBytes(32).toString('base64url');
        const record={id:randomBytes(12).toString('hex'),buyerKeyHash:hash(buyerKey),buyerAlias:alias,
          ...numbers,status:'submitted',counterCents:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await serialize(async()=>{
          records=records.filter(r=>Date.now()-Date.parse(r.createdAt)<30*86400000).slice(-999);
          records.push(record);
          await persist();
        });
        respond(res,201,{offer:publicOffer(record),buyerKey});
        return;
      }
      if(method==='GET' && pathname==='/api/offers') {
        if(!isSeller(req)) throw fail(401,'Seller authorization required');
        respond(res,200,{offers:records.slice(-100).reverse().map(publicOffer)});return;
      }
      const match=pathname.match(/^\/api\/offers\/([a-f0-9]{24})(?:\/(action|respond))?$/);
      if(match) {
        if(method==='POST' && match[2]) {
          const data=await parseBody(req);
          // Re-select record and authenticate inside the mutation queue; no stale object survives a rollback.
          const updated=await serialize(async()=>{
            const record=records.find(r=>r.id===match[1]);
            if(!record) throw fail(404,'Offer not found or expired');
            const admin=isSeller(req), buyer=matchesBuyer(req,record);
            if(!admin && !buyer) throw fail(401,'Offer access key required');
            if(match[2]==='action' && admin && record.status==='submitted') {
              if(data.action==='accept') {record.status='accepted';record.counterCents=null;}
              else if(data.action==='reject') {record.status='rejected';}
              else if(data.action==='counter' && boundedInt(data.counterCents,5000,20000)) {
                record.status='countered';record.counterCents=data.counterCents;
              } else throw fail(409,'Invalid seller action or counter');
            } else if(match[2]==='respond' && buyer && record.status==='countered') {
              if(data.action==='accept-counter') {record.offerCents=record.counterCents;record.counterCents=null;record.status='accepted';}
              else if(data.action==='decline-counter') record.status='counter_rejected';
              else throw fail(409,'Invalid buyer response');
            } else throw fail(409,'Action not permitted in this state');
            record.updatedAt=new Date().toISOString();
            await persist();
            return publicOffer(record);
          });
          respond(res,200,{offer:updated});return;
        }
        if(method==='GET' && !match[2]) {
          const record=records.find(r=>r.id===match[1]);
          if(!record) throw fail(404,'Offer not found or expired');
          if(!isSeller(req) && !matchesBuyer(req,record)) throw fail(401,'Offer access key required');
          respond(res,200,{offer:publicOffer(record)});return;
        }
      }
      throw fail(404,'Not found');
    } catch(e) {
      if(e?.status) {respond(res,e.status,e.body);return;}
      if(e instanceof RangeError) {respond(res,400,{error:e.message});return;}
      console.error('Trader request failed:',e);
      respond(res,500,{error:'Internal error'});
    }
  }
  return {listener,totals,publicOffer};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await makeApp();
  const port=Number(process.env.TRADER_PORT||8787);
  if(!boundedInt(port,1,65535)) throw Error('Invalid TRADER_PORT');
  createServer(app.listener).listen(port,'127.0.0.1',()=>{
    console.log('Heaven trader listening on 127.0.0.1:'+port+' (loopback only)');
  });
}

// Exact served-site observation for the existing Heaven.gg GitHub Pages release.
// This verifies remote bytes after provider publication, never deploys or self-attests judiciary approval.
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PATHS = Object.freeze(['version.json','index.html','aion2/index.html','aion2/profile.html','ch/catalog.json']);
const SITE_HOST = 'fengie.github.io';
const SITE_PATH = '/Heaven.gg/';
const EXPECTED_REPO = 'fengie/Heaven.gg';
const SHA = /^[a-f0-9]{40}$/;

function assertOrigin(baseUrl, expectedSha) {
  if (!SHA.test(expectedSha ?? '')) throw new Error('INVALID_SOURCE_SHA');
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error('INVALID_SITE_ORIGIN'); }
  if (url.protocol !== 'https:' || url.hostname !== SITE_HOST || url.pathname !== SITE_PATH ||
      url.username || url.password || url.port || url.search || url.hash) throw new Error('INVALID_SITE_ORIGIN');
  return url;
}

async function download(path, site, fetchImpl, maxBytes = 2_000_000) {
  const url = new URL(path, site);
  if (url.origin !== site.origin || !url.pathname.startsWith(SITE_PATH)) throw new Error('INVALID_SITE_ORIGIN');
  let response;
  try {
    response = await fetchImpl(url.href, {
      cache:'no-store', redirect:'error', headers:{'Cache-Control':'no-cache'},
      signal:AbortSignal.timeout(5000)
    });
  } catch (cause) { throw new Error('SERVED_ROUTE_UNAVAILABLE: '+path, {cause}); }
  if (response?.status !== 200 || response.redirected) throw new Error('SERVED_ROUTE_UNAVAILABLE: '+path);
  const declared = response.headers?.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) throw new Error('SERVED_RESPONSE_TOO_LARGE: '+path);
  if (!response.body?.getReader) {
    const fallback = await response.text();
    if (new TextEncoder().encode(fallback).byteLength > maxBytes) throw new Error('SERVED_RESPONSE_TOO_LARGE: '+path);
    return fallback;
  }
  const reader = response.body.getReader(),chunks=[];
  let size=0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error('SERVED_RESPONSE_TOO_LARGE: '+path);
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(()=>{});
    throw error;
  }
  const merged = new Uint8Array(size);
  let offset=0;
  for (const part of chunks) { merged.set(part, offset); offset += part.byteLength; }
  return new TextDecoder('utf-8', {fatal:true}).decode(merged);
}

export async function verifyServedRelease({baseUrl,expectedSha,fetchImpl=fetch}) {
  const site=assertOrigin(baseUrl,expectedSha);
  if (typeof fetchImpl!=='function') throw new TypeError('fetchImpl is required');
  const content = new Map();
  for(const path of PATHS) content.set(path,await download(path,site,fetchImpl));
  let version, catalog;
  try { version=JSON.parse(content.get('version.json')); }
  catch { throw new Error('SERVED_VERSION_INVALID'); }
  if (version?.repository !== EXPECTED_REPO) throw new Error('SERVED_REPOSITORY_MISMATCH');
  if (version?.revision !== expectedSha) throw new Error('SERVED_REVISION_MISMATCH');
  const portal=content.get('index.html');
  if (!portal.includes('data-game="ch"') || !portal.includes('data-game="aion"')) throw new Error('SERVED_PORTAL_INCOMPLETE');
  const atlas=content.get('aion2/index.html');
  if (!atlas.includes('ATREIA ATLAS') || !atlas.includes('./profile.html')) throw new Error('SERVED_ATLAS_INCOMPLETE');
  const profile=content.get('aion2/profile.html');
  if (!profile.includes('data-engine="PROFILE_EDITOR"') || !profile.includes('id="profile-upload"')) throw new Error('SERVED_PROFILE_INCOMPLETE');
  try {catalog=JSON.parse(content.get('ch/catalog.json'));} catch {throw new Error('SERVED_CATALOG_INVALID');}
  if (!Array.isArray(catalog?.builds) || catalog.builds.length!==327 ||
      !Array.isArray(catalog.gear) || catalog.gear.length<200 ||
      !Array.isArray(catalog.bosses) || catalog.bosses.length<5) throw new Error('SERVED_CATALOG_INCOMPLETE');
  return {
    schema:'heaven-gg/served-release-observation/v1',
    repository:EXPECTED_REPO,sourceSha:expectedSha,status:'SERVED_OBSERVED',
    environmentUrl:site.href,paths:[...PATHS],method:'read-only HTTPS GET',
    observedAt:new Date().toISOString(),authoritative:false,
    caveat:'Production HTTP and route presence only; interactive browser behavior and independent signed judiciary admission not tested.'
  };
}

export async function retryServedRelease({baseUrl,expectedSha,fetchImpl=fetch,retries=6,sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if (!Number.isSafeInteger(retries) || retries<1 || retries>8) throw new Error('INVALID_RETRY_BOUND');
  assertOrigin(baseUrl,expectedSha);
  for(let attempt=1;attempt<=retries;attempt++) {
    try { return await verifyServedRelease({baseUrl,expectedSha,fetchImpl}); }
    catch(error) {
      // A CDN may still be serving the prior deploy. Retry only bounded, non-auth transport / propagation cases.
      const retryable=/^(SERVED_REVISION_MISMATCH|SERVED_ROUTE_UNAVAILABLE)/.test(String(error.message));
      if(!retryable || attempt===retries) throw error;
      await sleep(5000);
    }
  }
  throw new Error('SERVED_PROOF_UNAVAILABLE');
}

async function main(){
  const {SITE_URL,EXPECTED_SHA,GITHUB_STEP_SUMMARY}=process.env;
  const result=await retryServedRelease({baseUrl:SITE_URL,expectedSha:EXPECTED_SHA});
  const summary='### Independently fetched served Heaven.gg release\n'+
    '- Repository: '+result.repository+'\n- Exact served revision: '+result.sourceSha+'\n'+
    '- Routes: '+result.paths.join(', ')+'\n'+
    '- Result: SERVED_OBSERVED (not an interactive browser test)\n';
  console.log('HEAVEN_GG_SERVED_RELEASE_OBSERVED '+JSON.stringify(result));
  if(GITHUB_STEP_SUMMARY) await appendFile(GITHUB_STEP_SUMMARY,summary,'utf8');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(String(error?.message ?? error));process.exitCode=1;});
}

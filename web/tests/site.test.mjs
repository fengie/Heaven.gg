import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from '../build.mjs';
const root = process.cwd();
test('build produces both game tabs, copied AION dashboard and source-pinned CH catalog', async () => {
  const tmp=await mkdtemp(join(tmpdir(),'heaven-gg-test-'));
  try {
    const result=await build(tmp);
    assert.equal(result.buildCount,327);
    assert(result.gearCount >= 200);
    assert(result.bossCount >= 5);
    const page=await readFile(join(tmp,'index.html'),'utf8');
    assert.match(page,/data-game="ch"/);
    assert.match(page,/data-game="aion"/);
    assert.match(page,/aria-selected="true"/);
    const aion=await readFile(join(tmp,'aion2','index.html'),'utf8');
    assert.equal(aion,await readFile(join(root,'apps/aion2-value-atlas/index.html'),'utf8'));
    assert.match(aion,/Quna/i);
    const profilePage=await readFile(join(tmp,'aion2','profile.html'),'utf8');
    assert.match(profilePage,/data-engine="PROFILE_EDITOR"/);
    assert.match(profilePage,/id="profile-upload"/);
    assert.match(page,/Plan my character/);
    assert.match(page,/Frame Generation lab/);
    assert.match(page,/game-tools\.html/);
    const performance=await readFile(join(tmp,'aion2','performance.html'),'utf8');
    assert.match(performance,/id="performance-result"/);
    assert.match(performance,/performance-engine\.mjs/);
    const js=await readFile(join(tmp,'aion2','performance-engine.mjs'),'utf8');
    assert.match(js,/analyzeFrameOutput/);
    const hub=await readFile(join(tmp,'game-tools.html'),'utf8');
    assert.match(hub,/Frame Generation/);
    const catalog=JSON.parse(await readFile(join(tmp,'ch','catalog.json'),'utf8'));
    assert.equal(catalog.builds.length,327);
    assert(catalog.builds.every((x)=>x.sourceUrl.startsWith('https://the-codex.ch/')));
    assert(catalog.gear.every((x)=>typeof x.releaseStatus === 'string'));
    assert(catalog.bosses.every((x)=>Number.isInteger(x.id)));
    assert.equal(catalog.researchOnly,true);
  } finally { await rm(tmp,{recursive:true,force:true}); }
});
test('copy/rebuild is deterministic for fixed inputs',async()=>{
  const a=await mkdtemp(join(tmpdir(),'heaven-a-'));
  const b=await mkdtemp(join(tmpdir(),'heaven-b-'));
  try {
    await build(a);await build(b);
    for(const path of ['index.html','site.css','site.js','game-tools.html','ch/catalog.json','aion2/index.html','aion2/performance.html','aion2/performance-engine.mjs','version.json'])
      assert.equal(await readFile(join(a,path),'utf8'),await readFile(join(b,path),'utf8'),'Divergence: '+path);
  } finally {await rm(a,{recursive:true,force:true});await rm(b,{recursive:true,force:true});}
});
test('final shipped JavaScript passes the actual Node parser',()=>{
  execFileSync(process.execPath,['--check','web/site.js'],{cwd:root,stdio:'pipe'});
  execFileSync(process.execPath,['--check','web/build.mjs'],{cwd:root,stdio:'pipe'});
  execFileSync(process.execPath,['--check','apps/aion2-value-atlas/scripts/performance-engine.mjs'],{cwd:root,stdio:'pipe'});
});
test('browser catalog includes explicit uncertainty and source-identity metadata',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'heaven-provenance-'));
  try {
    await build(tmp);
    const d=JSON.parse(await readFile(join(tmp,'ch/catalog.json'),'utf8'));
    assert.match(d.provenance.builds.warning,/not measured/i);
    assert.match(d.provenance.bosses.note,/not a live/i);
    assert.match(d.provenance.gear.method,/not_BIS/i);
    const src=await readFile(join(tmp,'site.js'),'utf8');
    assert.match(src,/esc\(build.name\)/);
    assert.match(src,/makeLink\(build.sourceUrl\)/);
    assert.match(src,/aria-selected/);
  } finally {await rm(tmp,{recursive:true,force:true});}
});

import { verifyServedRelease, retryServedRelease } from '../verify-deployment.mjs';

const liveSha = 'a'.repeat(40);
const baseUrl = 'https://fengie.github.io/Heaven.gg/';
function goodPages(sha = liveSha) {
  return new Map([
    ['version.json', { repository:'fengie/Heaven.gg',revision:sha,games:['celtic-heroes','aion2'] }],
    ['index.html', '<button data-game="ch"></button><button data-game="aion"></button>'],
    ['aion2/index.html', '<title>ATREIA ATLAS</title><a href="./profile.html">My character</a>'],
    ['aion2/profile.html', '<main data-engine="PROFILE_EDITOR"><input id="profile-upload"></main>'],
    ['aion2/performance.html', '<main id="performance-result">Frame Generation<script src="./performance-engine.mjs"></script></main>'],
    ['aion2/performance-engine.mjs', 'export function analyzeFrameOutput(){}'],
    ['game-tools.html', '<main>Frame Generation lab</main>'],
    ['ch/catalog.json', {builds:Array(327).fill({id:'demo'}),gear:Array(259).fill({id:1}),bosses:Array(8).fill({id:1})}]
  ]);
}
function responseFor(pages) {
  return async url => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://fengie.github.io');
    const path = parsed.pathname.replace('/Heaven.gg/','');
    const value = pages.get(path);
    if (value === undefined) return new Response('absent', { status:404 });
    return new Response(typeof value === 'string' ? value : JSON.stringify(value), {
      status:200,
      headers: { 'content-type': path.endsWith('.json') ? 'application/json' : 'text/html' }
    });
  };
}
test('served release verifies exact source SHA and every public product route',async()=>{
  const receipt=await verifyServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:responseFor(goodPages())});
  assert.equal(receipt.status,'SERVED_OBSERVED');
  assert.equal(receipt.sourceSha,liveSha);
  assert.equal(receipt.repository,'fengie/Heaven.gg');
  assert.equal(receipt.paths.length,8);
  assert.equal(receipt.authoritative,false);
});
test('served release rejects stale SHA even when every HTML route responds',async()=>{
  await assert.rejects(
    ()=>verifyServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:responseFor(goodPages('b'.repeat(40)))}),
    /SERVED_REVISION_MISMATCH/
  );
});
test('served release rejects wrong repository, stale or missing page and external redirect',async()=>{
  const wrong=goodPages();wrong.set('version.json',{repository:'other/site',revision:liveSha});
  await assert.rejects(()=>verifyServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:responseFor(wrong)}),/SERVED_REPOSITORY_MISMATCH/);
  const absent=goodPages();absent.delete('aion2/profile.html');
  await assert.rejects(()=>verifyServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:responseFor(absent)}),/SERVED_ROUTE_UNAVAILABLE/);
  const broken=goodPages();broken.set('aion2/profile.html','<main>missing import controls</main>');
  await assert.rejects(()=>verifyServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:responseFor(broken)}),/SERVED_PROFILE_INCOMPLETE/);
  await assert.rejects(()=>verifyServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://evil.example/'}})}),/SERVED_ROUTE_UNAVAILABLE/);
});
test('served release does not allow an arbitrary host or invalid commit identity',async()=>{
  await assert.rejects(()=>verifyServedRelease({baseUrl:'http://127.0.0.1/',expectedSha:liveSha,fetchImpl:responseFor(goodPages())}),/INVALID_SITE_ORIGIN/);
  await assert.rejects(()=>verifyServedRelease({baseUrl:'https://example.org/app/',expectedSha:liveSha,fetchImpl:responseFor(goodPages())}),/INVALID_SITE_ORIGIN/);
  await assert.rejects(()=>verifyServedRelease({baseUrl,expectedSha:'latest',fetchImpl:responseFor(goodPages())}),/INVALID_SOURCE_SHA/);
});
test('bounded retries handle Pages propagation and preserve final failure',async()=>{
  let tries=0;
  const change=async url=>{tries++;return responseFor(tries===1?goodPages('b'.repeat(40)):goodPages())(url)};
  const res=await retryServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:change,retries:2,sleep:async()=>{}});
  assert.equal(res.status,'SERVED_OBSERVED');
  let no=0;
  await assert.rejects(()=>retryServedRelease({baseUrl,expectedSha:liveSha,fetchImpl:async url=>{no++;return responseFor(goodPages('c'.repeat(40)))(url)},retries:2,sleep:async()=>{}}),/SERVED_REVISION_MISMATCH/);
  assert.equal(no,2);
});
test('release workflow emits a separate main-only HTTP observation after Pages publication',async()=>{
  const yml=await readFile(join(root,'.github/workflows/site.yml'),'utf8');
  assert.match(yml,/\n  verify-served:\n/);
  assert.match(yml,/needs:\s*deploy/);
  assert.match(yml,/node web\/verify-deployment\.mjs/);
  assert.match(yml,/EXPECTED_SHA/);
  assert.match(yml,/SITE_URL/);
});

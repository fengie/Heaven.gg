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
    for(const path of ['index.html','site.css','site.js','ch/catalog.json','aion2/index.html','version.json'])
      assert.equal(await readFile(join(a,path),'utf8'),await readFile(join(b,path),'utf8'),'Divergence: '+path);
  } finally {await rm(a,{recursive:true,force:true});await rm(b,{recursive:true,force:true});}
});
test('final shipped JavaScript passes the actual Node parser',()=>{
  execFileSync(process.execPath,['--check','web/site.js'],{cwd:root,stdio:'pipe'});
  execFileSync(process.execPath,['--check','web/build.mjs'],{cwd:root,stdio:'pipe'});
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

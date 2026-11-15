import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { loadGameRegistry, renderCompanionPortal, renderCompanionToolCard } from './game-registry.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const get = (name) => readFile(join(root,name),'utf8');
const allowedTypes = new Set(['Damage','Tank']);
async function build(outputDir) {
  const [buildCatalog, gearCatalog, bossCatalog, games] = await Promise.all([
    get('data/reference/codex_published_build_catalog.json').then(JSON.parse),
    get('data/catalog/priority_gear_lookup.json').then(JSON.parse),
    get('data/reference/raid_boss_resistances_2026_10_08.json').then(JSON.parse),
    loadGameRegistry()
  ]);
  assert.equal(buildCatalog.records?.length,buildCatalog.extracted_total,'Build source count mismatch');
  assert.equal(buildCatalog.records.length,327,'Review expected catalog coverage change before publishing');
  const builds = buildCatalog.records.map((entry,index) => {
    assert(allowedTypes.has(entry.build_type),'Unexpected build type');
    assert(/^https:\/\/the-codex\.ch\//.test(entry.source_url),'Untrusted saved-build source URL');
    const dps = entry.benchmark_dps;
    assert(dps === null || (Number.isFinite(dps) && dps >= 0),'Invalid modeled DPS');
    return {id:String(index),name:entry.name,characterClass:entry.character_class,level:entry.level,buildType:entry.build_type,benchmarkDps:dps,sourceUrl:entry.source_url,snapshotDate:buildCatalog.snapshot_date};
  });
  const gear = [];
  for (const [category,group] of Object.entries(gearCatalog.categories)) {
    for (const entry of (group.entries || [])) {
      gear.push({id:entry.id,name:entry.name,category,level:entry.level,slot:entry.slot,stats:entry.stats,releaseStatus:entry.release_status ?? 'unverified'});
    }
  }
  assert(gear.length >= 200,'Unexpected gear coverage regression');
  assert(Array.isArray(bossCatalog.bosses) && bossCatalog.bosses.length >= 5,'Boss source missing');
  const bosses = bossCatalog.bosses.map((entry)=>({id:entry.id,name:entry.name,level:entry.level,health:entry.health,defence:entry.defence,resist:entry.resist || {}}));
  const catalog = {schemaVersion:1,generatedFrom:'fengie/Heaven.gg@main',researchOnly:true,provenance:{builds:{date:buildCatalog.snapshot_date,source:buildCatalog.source_url,type:buildCatalog.source_type,warning:buildCatalog.warning},gear:{source:'data/catalog/priority_gear_lookup.json',method:gearCatalog.method},bosses:{date:bossCatalog.as_of,source:bossCatalog.source_url,note:bossCatalog.note}},builds,gear,bosses};
  await mkdir(join(outputDir,'ch'),{recursive:true});
  await mkdir(join(outputDir,'aion2'),{recursive:true});
  for (const file of ['site.css','site.js']) await copyFile(join(root,'web',file),join(outputDir,file));
  // All downloadable desktop links derive from one reviewed registry, not
  // duplicated potentially stale HTML links or runtime cross-origin API calls.
  const templates = [
    ['index.html', '<!-- HEAVEN_GAMING_MOD_MANAGER -->', renderCompanionPortal(games)],
    ['game-tools.html', '<!-- HEAVEN_GAMING_MOD_MANAGER_TOOLS -->', renderCompanionToolCard(games)]
  ];
  for (const [name, marker, card] of templates) {
    const source = await get('web/' + name);
    assert.equal(source.split(marker).length, 2, 'Missing or duplicate gaming hub marker: ' + name);
    await writeFile(join(outputDir,name),source.replace(marker,card),'utf8');
  }
  await writeFile(join(outputDir,'games.json'),JSON.stringify(games,null,2)+'\n','utf8');
  await copyFile(join(root,'apps/aion2-value-atlas/index.html'),join(outputDir,'aion2/index.html'));
  await copyFile(join(root,'apps/aion2-value-atlas/profile.html'),join(outputDir,'aion2/profile.html'));
  // Preserve the sourced WEB-002 planner modules in the current Pages build.
  for (const file of ['wardrobe.mjs','decision.mjs'])
    await copyFile(join(root,'web',file),join(outputDir,file));
  for (const file of ['wardrobe.html','wardrobe.js'])
    await copyFile(join(root,'web',file),join(outputDir,'aion2',file));
  await copyFile(join(root,'apps/aion2-value-atlas/performance.html'),join(outputDir,'aion2/performance.html'));
  await copyFile(join(root,'apps/aion2-value-atlas/scripts/performance-engine.mjs'),join(outputDir,'aion2/performance-engine.mjs'));
  await writeFile(join(outputDir,'ch/catalog.json'),JSON.stringify(catalog,null,2)+'\n','utf8');
  const sha=process.env.GITHUB_SHA;
  const revision=/^[a-f0-9]{40}$/.test(sha || '') ? sha : 'local-unverified';
  await writeFile(join(outputDir,'version.json'),JSON.stringify({repository:'fengie/Heaven.gg',revision,games:games.games.map(game => game.id),catalogSnapshot:{ch:buildCatalog.snapshot_date,aion2:'2026-10-09'}},null,2)+'\n','utf8');
  return {buildCount:builds.length,gearCount:gear.length,bossCount:bosses.length,revision};
}
const output = resolve(root,'dist');
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  build(output).then((r)=>console.log('HEAVEN_GG_BUILD_OK',JSON.stringify(r))).catch((e)=>{console.error(e);process.exitCode=1;});
}
export {build};

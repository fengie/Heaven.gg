import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../build.mjs';
import { loadGameRegistry, validateGameRegistry, renderCompanionPortal, renderCompanionToolCard } from '../game-registry.mjs';

test('one public game identity registry includes the canonical MHW desktop profile without treating other games as supported mod targets', async () => {
  const registry = await loadGameRegistry();
  assert.equal(registry.schema, 'heaven-gaming/game-registry/v1');
  assert.deepEqual(registry.games.map(game => game.id), ['celtic-heroes','aion2','monster-hunter-world']);
  assert.equal(registry.games[2].companion.repository, 'fengie/Heaven-Mod_Manager');
  assert.equal(registry.games[2].companion.integration, 'download-link-only');
  assert.equal(registry.games[2].companion.releasePage, 'https://github.com/fengie/Heaven-Mod_Manager/releases/latest');
  assert.equal(registry.games[2].companion.platform, 'windows-x64');
  assert.equal(registry.games[0].companion, undefined);
  assert.equal(registry.games[1].companion, undefined);
});

test('the published registry rejects legacy repositories, malicious release origins, duplicate games and unreviewed capabilities', async () => {
  const original = await loadGameRegistry();
  const bad = mutate => { const value = structuredClone(original); mutate(value); assert.throws(() => validateGameRegistry(value), /GAME_REGISTRY_/); };
  bad(value => value.games[2].companion.releasePage = 'https://example.net/download.exe');
  bad(value => value.games[2].companion.releasePage = 'javascript:alert(1)');
  bad(value => value.games[2].companion.repository = 'fengie/mhw-mods');
  bad(value => value.games[2].companion.integration = 'remote-install');
  bad(value => value.games[1].id = 'celtic-heroes');
  bad(value => value.games[0].companion = { releasePage:'https://github.com/example/release' });
  bad(value => value.games[2].name = '<img src=x onerror=alert(1)>');
  bad(value => value.games.push(structuredClone(value.games[2])));
  bad(value => value.games[2].companion.token = 'no');
  bad(value => value.repository = 'fengie/heaven-toolbox');
});

test('static site renders one release destination on the hub and tools page without third-party execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'heaven-gaming-hub-'));
  try {
    await build(directory);
    const registry = JSON.parse(await readFile(join(directory,'games.json'),'utf8'));
    validateGameRegistry(registry);
    const [portal, tools, version] = await Promise.all([
      readFile(join(directory,'index.html'),'utf8'),
      readFile(join(directory,'game-tools.html'),'utf8'),
      readFile(join(directory,'version.json'),'utf8').then(JSON.parse)
    ]);
    const release = registry.games[2].companion.releasePage;
    assert(portal.includes('id="mod-manager"'));
    assert(portal.includes('id="mod-manager-title"'));
    assert(portal.includes('href="./#mod-manager"'));
    assert(portal.includes('href="' + release + '"'));
    assert(tools.includes('data-game-id="monster-hunter-world"'));
    assert(tools.includes('href="' + release + '"'));
    assert(tools.includes('rel="noopener noreferrer"'));
    assert(!portal.includes('HEAVEN_GAMING_MOD_MANAGER'));
    assert(!tools.includes('HEAVEN_GAMING_MOD_MANAGER'));
    assert.deepEqual(version.games, registry.games.map(game => game.id));
    assert.equal((portal.match(/href="https:\/\/github\.com\/fengie\/Heaven-Mod_Manager\/releases\/latest"/g) || []).length,1);
    assert.equal((tools.match(/href="https:\/\/github\.com\/fengie\/Heaven-Mod_Manager\/releases\/latest"/g) || []).length,1);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('renderer requires the validated canonical registry and keeps all desktop operations outside the website', async () => {
  const registry = await loadGameRegistry();
  const portal = renderCompanionPortal(registry);
  const card = renderCompanionToolCard(registry);
  assert.match(portal,/Windows x64/);
  assert.match(portal,/website never scans your PC/i);
  assert.match(card,/No website-based file access or silent installation/);
  assert.match(portal,/noopener noreferrer/);
  const invalid = structuredClone(registry);
  invalid.games[2].companion.releasePage = 'https://example.net/unsafe';
  assert.throws(() => renderCompanionPortal(invalid), /GAME_REGISTRY_COMPANION_ORIGIN_MISMATCH/);
  assert.throws(() => renderCompanionToolCard(invalid), /GAME_REGISTRY_COMPANION_ORIGIN_MISMATCH/);
});

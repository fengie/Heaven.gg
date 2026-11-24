// Public, source-controlled game identity contract for the Heaven.gg hub.
// Static build/verification only. This file is not a plugin, native-game
// profile importer, remote installation endpoint, or authorization source.
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GAME_REGISTRY_SCHEMA = 'heaven-gaming/game-registry/v1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_IDS = Object.freeze(['celtic-heroes','aion2','monster-hunter-world']);
const ROUTES = Object.freeze(['./#celtic-heroes','./#aion2','./#mod-manager']);
const COMPANION_REPO = 'fengie/Heaven-Mod_Manager';
const COMPANION_RELEASE = 'https://github.com/fengie/Heaven-Mod_Manager/releases/latest';
const COMPANION_SOURCE = 'https://github.com/fengie/Heaven-Mod_Manager';
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key)) && allowed.every(key => Object.hasOwn(value,key));
const reject = reason => { throw new Error('GAME_REGISTRY_' + reason); };
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[character]));

export function validateGameRegistry(value) {
  if (!keys(value,['schema','repository','games']) ||
      value.schema !== GAME_REGISTRY_SCHEMA || value.repository !== 'fengie/Heaven.gg' ||
      !Array.isArray(value.games) || value.games.length !== GAME_IDS.length) reject('INVALID');
  for (let i = 0; i < value.games.length; i++) {
    const game = value.games[i];
    if (!game || game.id !== GAME_IDS[i] || game.siteRoute !== ROUTES[i] ||
        typeof game.name !== 'string' || !/^[A-Za-z0-9: ]{2,60}$/.test(game.name) ||
        game.name !== ['Celtic Heroes','AION 2','Monster Hunter: World'][i]) reject('IDENTITY_MISMATCH');
    if (i < 2) {
      if (!keys(game,['id','name','experience','siteRoute']) || game.experience !== 'research')
        reject('RESEARCH_CONTRACT_INVALID');
      continue;
    }
    if (!keys(game,['id','name','experience','siteRoute','companion']) ||
        game.experience !== 'windows-companion' ||
        !keys(game.companion,['repository','releasePage','sourcePage','platform','integration']))
      reject('COMPANION_CONTRACT_INVALID');
    const companion = game.companion;
    // Exact endpoints prevent a changed public metadata file from redirecting
    // users to an unreviewed binary origin, release channel or credential flow.
    if (companion.repository !== COMPANION_REPO || companion.releasePage !== COMPANION_RELEASE ||
        companion.sourcePage !== COMPANION_SOURCE || companion.platform !== 'windows-x64' ||
        companion.integration !== 'download-link-only') reject('COMPANION_ORIGIN_MISMATCH');
  }
  return value;
}

export async function loadGameRegistry() {
  return validateGameRegistry(JSON.parse(await readFile(join(ROOT,'data','gaming','game-registry.json'),'utf8')));
}

function companion(registry) {
  return validateGameRegistry(registry).games[2];
}

export function renderCompanionPortal(registry) {
  const game = companion(registry);
  return `<div class="companion-layout"><div class="companion-copy">
    <span class="overline">WINDOWS DESKTOP · ${escapeHtml(game.name.toUpperCase())}</span>
    <h2 id="mod-manager-title">Manage your mods. Stay in control.</h2>
    <p>Heaven Mod Manager is the separate Windows companion for organizing game profiles,
    importing mods and applying changes through its own guarded desktop workflow.</p>
    <p class="companion-note">This website never scans your PC, handles mod archives or
    installs anything. The Windows app and its release checks remain independent.</p>
    </div><div class="companion-action-panel">
    <a class="primary-button" href="${escapeHtml(game.companion.releasePage)}" target="_blank" rel="noopener noreferrer">Get the Windows release ↗</a>
    <a class="secondary-button" href="${escapeHtml(game.companion.sourcePage)}" target="_blank" rel="noopener noreferrer">Source, documentation and issues ↗</a>
    <span class="companion-meta">Windows x64 · external GitHub download · locally managed files</span>
    </div></div>`;
}

export function renderCompanionToolCard(registry) {
  const game = companion(registry);
  return `<article data-game-id="${escapeHtml(game.id)}">
    <p class="eyebrow">MONSTER HUNTER: WORLD · DESKTOP COMPANION</p>
    <h2>Heaven Mod Manager</h2>
    <p>Organize and manage game mods in the independently released Windows app.
    No website-based file access or silent installation.</p>
    <a class="action" href="${escapeHtml(game.companion.releasePage)}" target="_blank" rel="noopener noreferrer">Windows release ↗</a> 
    <a class="action" href="${escapeHtml(game.companion.sourcePage)}" target="_blank" rel="noopener noreferrer">Source and docs ↗</a>
    </article>`;
}

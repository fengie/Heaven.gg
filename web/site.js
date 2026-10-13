import {compareBuilds,formatMetric} from './decision.mjs';
'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const whole = formatMetric;
const makeLink = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? esc(url.href) : '#';
  } catch {
    return '#';
  }
};
const classColors = {Mage:'#87abfa',Rogue:'#ade8bf',Warrior:'#f3bb8c',Druid:'#9dc7ef',Ranger:'#d7acd6'};
const state = {game:'ch', section:'builds', query:'', gearQuery:'', classFilter:'All', gearStatus:'all', sort:'recent', shown:18, gearShown:18, compared:[]};
let catalog = null;

function selectGame(game, updateHash = true) {
  state.game = game === 'aion' ? 'aion' : 'ch';
  $$('#view-ch, #view-aion').forEach((el) => { el.hidden = el.id !== (state.game === 'ch' ? 'view-ch' : 'view-aion'); });
  $$('.game-tab').forEach((el) => { const selected = el.dataset.game === state.game; el.classList.toggle('active', selected); el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1; });
  if (updateHash) history.replaceState(null, '', state.game === 'ch' ? '#celtic-heroes' : '#aion2');
  document.title = state.game === 'ch' ? 'Heaven.gg · Celtic Heroes' : 'Heaven.gg · AION 2';
}

function selectSection(name) {
  state.section = ['builds','gear','bosses'].includes(name) ? name : 'builds';
  $$('.section-tab[data-section]').forEach((el) => { const selected = el.dataset.section === state.section; el.classList.toggle('active', selected); el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1; });
  $$('.research-panel').forEach((el) => { el.hidden = el.id !== 'research-' + state.section; });
}

function setNodeHtml(selector, html) {
  const node = $(selector);
  if (node) node.innerHTML = html;
}

function renderClassFilters() {
  const classes = ['All', 'Mage', 'Rogue', 'Warrior', 'Druid', 'Ranger'];
  setNodeHtml('#class-filters', classes.map((name) =>
    '<button class="chip' + (state.classFilter === name ? ' active' : '') + '" data-class="' + name + '" aria-pressed="' + (state.classFilter === name) + '">' + name + '</button>'
  ).join(''));
  const counts = catalog.builds.reduce((map, build) => { map[build.characterClass] = (map[build.characterClass] || 0) + 1; return map; }, {});
  setNodeHtml('#class-chart', Object.entries(classColors).map(([name,color]) =>
    '<div class="class-segment" title="' + esc(name + ': ' + (counts[name] || 0)) + '" style="background:' + color + ';flex:' + (counts[name] || 0) + '"></div>'
  ).join(''));
}

function buildCard(build) {
  const metric = Number.isFinite(build.benchmarkDps) ? whole(build.benchmarkDps) + '<small>modeled DPS</small>' : '<span style="font-size:18px">' + (build.buildType === 'Tank' ? 'Tank build' : 'DPS unavailable') + '</span>';
  const inList = state.compared.includes(build.id);
  return '<article class="build-card">' +
    '<div class="card-top"><span class="class-tag">' + esc(build.characterClass) + '</span><span class="small-meta">LVL ' + esc(build.level) + ' · ' + esc(build.buildType) + '</span></div>' +
    '<h4>' + esc(build.name) + '</h4><div class="metric">' + metric + '</div><div class="gear-note">CODEX MODEL · ' + esc(build.snapshotDate) + '</div>' +
    '<div class="card-foot"><a href="' + makeLink(build.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Original ↗</a><button type="button" data-pick="' + esc(build.id) + '" aria-pressed="' + inList + '">' + (inList ? '✓ Selected' : '+ Compare') + '</button></div></article>';
}
function renderBuilds() {
  if (!catalog) return;
  renderClassFilters();
  const term = state.query.trim().toLowerCase();
  let rows = catalog.builds.filter((b) =>
    (state.classFilter === 'All' || b.characterClass === state.classFilter) &&
    (!term || (b.name + ' ' + b.characterClass + ' ' + b.buildType).toLowerCase().includes(term))
  );
  if (state.sort === 'dps') rows.sort((a,b) => (b.benchmarkDps ?? -1) - (a.benchmarkDps ?? -1));
  if (state.sort === 'level') rows.sort((a,b) => b.level - a.level);
  if (state.sort === 'name') rows.sort((a,b) => a.name.localeCompare(b.name));
  $('#result-count').textContent = whole(rows.length) + ' matching builds · showing ' + whole(Math.min(rows.length,state.shown));
  setNodeHtml('#build-cards', rows.slice(0,state.shown).map(buildCard).join('') || '<div class="empty-state">No builds match your filters.</div>');
  $('#show-more').hidden = rows.length <= state.shown;
  renderComparison();
}
function toggleCompare(id) {
  const exists = state.compared.indexOf(id);
  if (exists >= 0) state.compared.splice(exists,1);
  else {
    if (state.compared.length === 2) state.compared.shift();
    state.compared.push(id);
  }
  renderBuilds();
}
function comparisonCard(build, index) {
  if (!build) return '<div class="empty-state">Choose build ' + (index + 1) + ' from the catalog above.</div>';
  return '<div class="compare-card"><span class="overline subtle">BUILD ' + (index+1) + '</span><strong>' + esc(build.name) + '</strong>' +
    '<div class="detail-line"><span>Class</span><b>' + esc(build.characterClass) + '</b></div>' +
    '<div class="detail-line"><span>Level</span><b>' + esc(build.level) + '</b></div>' +
    '<div class="detail-line"><span>Type</span><b>' + esc(build.buildType) + '</b></div>' +
    '<div class="detail-line"><span>Modeled DPS</span><b>' + (build.benchmarkDps == null ? 'Not provided' : whole(build.benchmarkDps)) + '</b></div>' +
    '<div class="detail-line"><span>Measured DPS?</span><b>No</b></div>' +
    '<div class="detail-line"><span>Context</span><b>Target/equipment not verified</b></div>' +
    '<div class="detail-line"><span>Original</span><b><a href="' + makeLink(build.sourceUrl) + '" target="_blank" rel="noopener noreferrer">View ↗</a></b></div></div>';
}
function renderComparison() {
  const chosen = state.compared.map((id) => catalog.builds.find((b) => b.id === id)).filter(Boolean);
  const evidence=compareBuilds(chosen[0],chosen[1]);
  setNodeHtml('#comparison-evidence','<strong>'+ (evidence.comparable?'Controlled model comparison — not live-game DPS':'No validated DPS winner')+'</strong><p>Public, self-selected Codex builds contain calculator results; true boss, gear and rotation equivalence is not established by a date or class match.</p><ul>'+evidence.reasons.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>');
  setNodeHtml('#comparison', comparisonCard(chosen[0],0) + comparisonCard(chosen[1],1));
}

function gearSummary(gear) {
  const attrs = Array.isArray(gear.stats?.attributes) ? gear.stats.attributes.slice(0,2).map((pair) => Array.isArray(pair) ? pair.join(' +') : '').filter(Boolean).join(' · ') : '';
  const abilities = Array.isArray(gear.stats?.abilities) ? gear.stats.abilities.slice(0,2).map((pair) => Array.isArray(pair) ? pair.join(' +') : '').filter(Boolean).join(' · ') : '';
  return esc([attrs,abilities].filter(Boolean).join(' · ') || 'Consult raw item schema');
}
function renderGear() {
  if (!catalog) return;
  const term = state.gearQuery.toLowerCase().trim();
  const rows = catalog.gear.filter((g) => (!term || (g.name+' '+g.category+' '+g.slot).toLowerCase().includes(term)) &&
    (state.gearStatus === 'all' || (state.gearStatus === 'released_documented' ? g.releaseStatus === 'released_documented' : g.releaseStatus !== 'released_documented')));
  setNodeHtml('#gear-cards', rows.slice(0,state.gearShown).map((g) => '<article class="gear-card"><div class="card-top"><span class="class-tag">' + esc(g.category.replaceAll('_',' ')) + '</span><span class="small-meta">LVL ' + esc(g.level ?? '?') + '</span></div><h4>' + esc(g.name) + '</h4><span class="status-tag ' + (g.releaseStatus === 'released_documented' ? 'ok' : 'warn') + '">' + esc(g.releaseStatus === 'released_documented' ? 'Documented released' : 'Release unverified') + '</span><p class="gear-note">' + gearSummary(g) + '</p><div class="card-foot"><span class="small-meta">ID: ' + esc(g.id) + '</span><span class="small-meta">' + esc(g.slot ?? 'Unspecified') + '</span></div></article>').join('') || '<div class="empty-state">No gear matches those filters.</div>');
  $('#gear-result-count').textContent = whole(rows.length) + ' matching cataloged items';
  $('#gear-more').hidden = rows.length <= state.gearShown;
  $$('#gear-filters button').forEach((button) => { button.classList.toggle('active',button.dataset.gearStatus === state.gearStatus);button.setAttribute('aria-pressed',String(button.dataset.gearStatus === state.gearStatus)); });
}
function renderBosses() {
  if (!catalog) return;
  setNodeHtml('#boss-cards', catalog.bosses.map((b) => '<article class="boss-card"><div class="card-top"><span class="class-tag">BOSS SNAPSHOT</span><span class="small-meta">LVL ' + esc(b.level) + '</span></div><h4>' + esc(b.name) + '</h4>' +
    '<div class="boss-stat"><span>Historical HP</span><b>' + whole(b.health) + '</b></div><div class="boss-stat"><span>Raw defence</span><b>' + whole(b.defence) + '</b></div><div class="boss-stat"><span>Raw heat resist</span><b>' + (b.resist.heat == null ? 'Unknown' : whole(b.resist.heat)) + '</b></div><div class="boss-stat"><span>Raw magic resist</span><b>' + (b.resist.magic == null ? 'Unknown' : whole(b.resist.magic)) + '</b></div><div class="card-foot"><span class="small-meta">Record #' + esc(b.id) + '</span><span class="status-tag warn">Unverified live</span></div></article>').join(''));
}
function applyCatalog(data) {
  if (!data || !Array.isArray(data.builds) || !Array.isArray(data.gear) || !Array.isArray(data.bosses)) throw new Error('Invalid CH research data');
  catalog = data;
  $('#build-count').textContent = whole(data.builds.length);
  $('#class-count').textContent = whole(new Set(data.builds.map((b) => b.characterClass)).size);
  $('#boss-count').textContent = whole(data.bosses.length);
  $('#gear-count').textContent = whole(data.gear.length);
  renderBuilds(); renderGear(); renderBosses();
}
// WAI-ARIA horizontal tabs: one tab stop, arrow keys, Home and End.
function configureTabLists() {
  $$('[role="tablist"]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    tabs.forEach((tab, index) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
      if (!tab.id) tab.id = 'tab-' + (tab.dataset.section || 'aion-' + tab.dataset.aionTool);
      let panel = null;
      if (tab.dataset.section) panel = $('#research-' + tab.dataset.section);
      else if (tab.dataset.aionTool) {
        const frame = $(tab.dataset.aionTool === 'shop' ? '#aion-frame' : '#wardrobe-frame');
        panel = document.createElement('div');
        panel.id = 'aion-panel-' + tab.dataset.aionTool;
        panel.hidden = tab.getAttribute('aria-selected') !== 'true';
        frame.before(panel); panel.append(frame);
        tab.addEventListener('click', () => {
          tabs.forEach(other => { $('#aion-panel-' + other.dataset.aionTool).hidden = other !== tab; });
        });
      } else panel = $('#' + tab.getAttribute('aria-controls'));
      if (panel) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        tab.setAttribute('aria-controls', panel.id);
      }
    });
    list.addEventListener('keydown', event => {
      const current = tabs.indexOf(event.target.closest('[role="tab"]'));
      if (current < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click(); tabs[next].focus();
    });
  });
}

function attachEvents() {
  document.querySelectorAll('[data-aion-tool]').forEach(button=>button.addEventListener('click',()=>{
    const shop=button.dataset.aionTool==='shop';
    document.querySelector('#aion-frame').hidden=!shop;
    document.querySelector('#wardrobe-frame').hidden=shop;
    document.querySelectorAll('[data-aion-tool]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
  }));
  $$('.game-tab').forEach((button) => button.addEventListener('click', () => selectGame(button.dataset.game)));
  $$('.section-tab[data-section]').forEach((button) => button.addEventListener('click', () => selectSection(button.dataset.section)));
  $$('[data-ch-goto]').forEach((button) => button.addEventListener('click', () => {selectSection(button.dataset.chGoto);document.querySelector('.section-heading')?.scrollIntoView({behavior:'smooth'});}));
  $('#class-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-class]');
    if (!button) return;
    state.classFilter = button.dataset.class;state.shown = 18;renderBuilds();
    $$('#class-filters [data-class]').find(b=>b.dataset.class===state.classFilter)?.focus({preventScroll:true});
  });
  $('#build-query').addEventListener('input',(event)=>{state.query=event.target.value;state.shown=18;renderBuilds();});
  $('#build-sort').addEventListener('change',(event)=>{state.sort=event.target.value;state.shown=18;renderBuilds();});
  $('#show-more').addEventListener('click',()=>{state.shown+=18;renderBuilds();});
  $('#build-cards').addEventListener('click',(event)=>{const button=event.target.closest('[data-pick]');if(button){const id=button.dataset.pick;toggleCompare(id);$$('#build-cards [data-pick]').find(b=>b.dataset.pick===id)?.focus({preventScroll:true});}});
  $('#clear-compare').addEventListener('click',()=>{state.compared=[];renderBuilds();});
  $('#gear-query').addEventListener('input',(event)=>{state.gearQuery=event.target.value;state.gearShown=18;renderGear();});
  $('#gear-filters').addEventListener('click',(event)=>{const button=event.target.closest('[data-gear-status]');if(button){state.gearStatus=button.dataset.gearStatus;state.gearShown=18;renderGear();}});
  $('#gear-more').addEventListener('click',()=>{state.gearShown+=18;renderGear();});
  window.addEventListener('hashchange',()=>selectGame(location.hash === '#aion2' ? 'aion' : 'ch',false));
}
attachEvents();
configureTabLists();
selectGame(location.hash === '#aion2' ? 'aion' : 'ch',false);
fetch('./ch/catalog.json',{cache:'no-cache'}).then((r)=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(applyCatalog).catch((error)=>{
  $('#result-count').textContent='Data could not be loaded';
  setNodeHtml('#build-cards','<div class="empty-state status-error">Unable to load the versioned catalog. Please reload. Check GitHub deployment status.</div>');
  console.error('Heaven.gg catalog failed:',error.message);
});

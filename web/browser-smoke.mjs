// Real Google Chrome interaction acceptance for the exact built or served
// Heaven.gg website. No privileged account, external download or OS controls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { checkIntelligence } from './intelligence-browser-smoke.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(project, 'dist');
const ORIGIN = 'https://fengie.github.io/Heaven.gg/';
const RELEASE = 'https://github.com/fengie/Heaven-Mod_Manager/releases/latest';

async function localSite() {
  const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1/');
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[A-Za-z0-9._/-]+$/.test(rel) || rel.split('/').some(x => x === '..')) {
        res.writeHead(400).end();
        return;
      }
      const file = resolve(output, rel);
      if (!file.startsWith(output + sep)) {
        res.writeHead(400).end();
        return;
      }
      const bytes = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream',
        'cache-control':'no-store', 'x-content-type-options':'nosniff' });
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen(0, '127.0.0.1', yes);
  });
  const address = server.address();
  return { url:'http://127.0.0.1:' + address.port + '/',
    close:() => new Promise((yes,no) => server.close(e => e ? no(e) : yes())) };
}

function verifyLink(link) {
  assert.equal(link.href, RELEASE, 'desktop release must stay on canonical public GitHub page');
  assert.equal(link.target, '_blank');
  assert(link.rel.split(/\s+/).includes('noopener'));
  assert(link.rel.split(/\s+/).includes('noreferrer'));
}

async function checkDesktop(browser, baseUrl, expectedSha) {
  const context = await browser.newContext({ viewport:{width:1440,height:900} });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('#build-cards .build-card').first().waitFor({state:'visible'});
    assert.equal(await page.locator('#tab-ch').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#view-aion').isHidden(), true);
    await page.locator('#tab-aion').click();
    assert.equal(await page.locator('#tab-aion').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#view-aion').isVisible(), true);
    await page.locator('#tab-ch').click();
    assert.equal(await page.locator('#view-ch').isVisible(), true);
    await page.locator('[data-section="gear"]').click();
    assert.equal(await page.locator('#research-gear').isVisible(), true);
    await page.locator('[data-section="builds"]').click();
    await page.locator('#build-query').fill('___no_such_heaven_game_build___');
    await page.locator('#build-cards .empty-state').waitFor({state:'visible'});
    await page.locator('#build-query').fill('');
    await page.locator('#build-cards .build-card').first().waitFor({state:'visible'});
    const catalogResponse = await page.request.get(new URL('ch/catalog.json', baseUrl).href);
    assert(catalogResponse.ok(), 'Build catalog request failed');
    const {builds} = await catalogResponse.json();
    const more = page.locator('#show-more');
    const cards = page.locator('#build-cards .build-card');
    while (await cards.count() < builds.length) {
      const before = await cards.count();
      await more.click();
      assert(await cards.count() > before, 'Show more must reveal additional builds');
    }
    const metrics = await cards.evaluateAll(nodes => nodes.map(node => [
      node.querySelector('[data-pick]').dataset.pick, node.querySelector('.metric').textContent
    ]));
    const byId = new Map(metrics);
    assert.equal(byId.size, builds.length);
    for (const build of builds) {
      const expected = build.benchmarkDps === null
        ? (build.buildType === 'Tank' ? 'Tank build' : 'DPS not provided')
        : build.benchmarkDps.toLocaleString('en-US') + 'modeled DPS';
      assert.equal(byId.get(build.id), expected, 'Incorrect metric for ' + build.name);
    }
    assert(await more.isHidden(), 'Show more must disappear after the last build');

    await page.locator('.ecosystem-link').click();
    assert.equal(new URL(page.url()).hash, '#mod-manager');
    assert.equal(await page.locator('#mod-manager').isVisible(), true);
    verifyLink(await page.locator('#mod-manager .primary-button').evaluate(node => ({
      href:node.href,target:node.target,rel:node.rel
    })));
    await page.goto(new URL('game-tools.html', baseUrl).href, {waitUntil:'domcontentloaded'});
    const card = page.locator('[data-game-id="monster-hunter-world"]');
    await card.waitFor({state:'visible'});
    verifyLink(await card.locator('a').first().evaluate(node => ({
      href:node.href,target:node.target,rel:node.rel
    })));
    const registryResponse = await page.request.get(new URL('games.json',baseUrl).href, {timeout:15000});
    assert.equal(registryResponse.status(),200);
    const registry = await registryResponse.json();
    assert.deepEqual(registry.games.map(game => game.id),
      ['celtic-heroes','aion2','monster-hunter-world']);
    assert.equal(registry.games[2].companion.integration,'download-link-only');
    const wardrobeResponse=await page.goto(new URL('aion2/wardrobe.html',baseUrl).href,{waitUntil:'domcontentloaded'});
    assert.equal(wardrobeResponse?.status(),200,'Wardrobe route was not served');
    try {
      await page.locator('#products .product').first().waitFor({state:'visible',timeout:12000});
    } catch(error) {
      throw new Error('WARDROBE_PRODUCTS_UNAVAILABLE: '+await page.locator('#source-note').textContent(),{cause:error});
    }
    assert.match(await page.locator('#source-note').textContent(),/Research snapshot/);
    await page.locator('#budget').fill('85.50');
    const want=page.locator('#products .product button[data-kind="wanted"]').first();
    await want.click();
    assert.equal(await want.getAttribute('aria-pressed'),'true');
    assert.notEqual(await page.locator('#subtotal').textContent(),'—');

    if (expectedSha) {
      const versionResponse = await page.request.get(new URL('version.json',baseUrl).href, {timeout:15000});
      assert.equal(versionResponse.status(),200);
      const version = await versionResponse.json();
      assert.equal(version.repository,'fengie/Heaven.gg');
      assert.equal(version.revision,expectedSha,'served browser must use exact published revision');
    }
  } finally {
    await context.close();
  }
}

async function checkMobile(browser, baseUrl) {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, {waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#build-cards .build-card').first().waitFor({state:'visible'});
    await page.locator('#tab-aion').tap();
    assert.equal(await page.locator('#view-aion').isVisible(),true);
    await page.locator('#tab-ch').tap();
    assert.equal(await page.locator('#view-ch').isVisible(),true);
    await page.locator('.ecosystem-link').tap();
    assert.equal(new URL(page.url()).hash,'#mod-manager');
    const release = page.locator('#mod-manager .primary-button');
    await release.waitFor({state:'visible'});
    verifyLink(await release.evaluate(node => ({
      href:node.href,target:node.target,rel:node.rel
    })));
    const viewport = await page.evaluate(() => ({
      width:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth
    }));
    assert(viewport.scroll <= viewport.width + 2,
      'mobile gaming hub overflows horizontally: '+JSON.stringify(viewport));
    await page.goto(new URL('aion2/wardrobe.html',baseUrl).href,{waitUntil:'domcontentloaded'});
    await page.locator('#products .product').first().waitFor({state:'visible',timeout:20000});
    const wardrobeViewport=await page.evaluate(()=>({
      width:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth
    }));
    assert(wardrobeViewport.scroll <= wardrobeViewport.width+2,
      'mobile wardrobe overflows horizontally: '+JSON.stringify(wardrobeViewport));
  } finally {
    await context.close();
  }
}

async function checkQuoteEditor(browser, baseUrl) {
  const context = await browser.newContext({viewport:{width:1440,height:900},timezoneId:'UTC'});
  const storageKey = 'heaven-gg:aion2:character-v1';
  const staleDate = '2000-01-01';
  try {
    const page = await context.newPage();
    await page.addInitScript(({key,stale}) => {
      // Only this new disposable browser context receives synthetic inputs.
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key,JSON.stringify({
          schema:'heaven-gg/aion2-profile/v1',tradableKina:11000000,upgrades:[],
          exchangeAsks:{400000:50,2000000:500,10000000:900000},
          exchangeObservedDate:new Date().toISOString().slice(0,10),
          exchangeAskDates:{2000000:stale}
        }));
      }
    },{key:storageKey,stale:staleDate});
    const response = await page.goto(new URL('aion2/profile.html',baseUrl).href,{waitUntil:'domcontentloaded'});
    assert.equal(response?.status(),200,'Profile route was not served');
    const today = await page.evaluate(() => new Date().toISOString().slice(0,10));
    const result = page.locator('#exchange-result');
    const ask = size => page.locator('#ask-'+size);
    const date = size => page.locator('#market-date-'+size);
    const waitForText = text => page.waitForFunction(expected =>
      document.getElementById('exchange-result')?.textContent.includes(expected),text);
    const edit = async (locator,value) => {
      await locator.fill(value);
      await locator.blur();
    };
    await waitForText('No recent positive dated asks');
    assert.equal(await ask(10000000).inputValue(),'900000','Legacy ask must be preserved');
    assert.equal(await date(10000000).inputValue(),'','Legacy shared date must not certify an ask');
    assert.equal(await date(2000000).inputValue(),staleDate);
    await edit(date(400000),today);
    await waitForText('400,000 Kina; observed '+today+'; up to 45 Quna');
    assert.equal(await date(2000000).inputValue(),staleDate,'Editing one date must not refresh another quote');
    assert.equal(await date(10000000).inputValue(),'');
    await edit(ask(400000),'60');
    await waitForText('No recent positive dated asks');
    assert.equal(await date(400000).inputValue(),'','Changing the price must invalidate its date');
    await edit(date(2000000),today);
    await waitForText('2,000,000 Kina; observed '+today+'; up to 450 Quna');
    await page.reload({waitUntil:'domcontentloaded'});
    await waitForText('2,000,000 Kina; observed '+today+'; up to 450 Quna');
    assert.equal(await ask(400000).inputValue(),'60');
    assert.equal(await date(400000).inputValue(),'');
    assert.equal(await ask(10000000).inputValue(),'900000');
    assert.equal(await date(10000000).inputValue(),'');
    assert.equal(await date(2000000).inputValue(),today);
    const saved = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
    assert.deepEqual(saved.exchangeAskDates,{'2000000':today});
    assert.deepEqual(saved.exchangeAsks,{'400000':60,'2000000':500,'10000000':900000});
    assert.match(await result.textContent(),/not|assumed tax|unknown rounding/i);
    console.log('AION2_QUOTE_EDITOR_BROWSER_PASS');
  } finally {
    await context.close();
  }
}

async function main() {
  const requested = process.env.BROWSER_SMOKE_SITE_URL;
  const expectedSha = process.env.EXPECTED_SHA;
  if (expectedSha && !/^[a-f0-9]{40}$/.test(expectedSha)) throw Error('BROWSER_EXPECTED_SHA_INVALID');
  if (requested && requested !== ORIGIN) throw Error('BROWSER_SITE_ORIGIN_NOT_ALLOWED');
  const local = requested ? null : await localSite();
  let browser;
  try {
    browser = await chromium.launch({channel:'chrome',headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
    const site = requested || local.url;
    await checkDesktop(browser,site,requested ? expectedSha : undefined);
    await checkMobile(browser,site);
    await checkIntelligence(browser,site);
    await checkQuoteEditor(browser,site);
    console.log('HEAVEN_GG_BROWSER_INTERACTIONS_PASS ' + JSON.stringify({
      mode:requested ? 'served' : 'built', browser:'Google Chrome',
      observedRevision:requested ? expectedSha : 'local-pr-build',
      checks:['tabs','catalog-filter','research-panels','desktop-companion',
        'game-tools','game-registry','wardrobe-scenario','mobile-touch','mobile-overflow','mobile-wardrobe','character-intelligence-fixture','quote-editor-provenance']
    }));
  } finally {
    if(browser) await browser.close();
    if(local) await local.close();
  }
}
main().catch(error => {
  console.error('HEAVEN_GG_BROWSER_INTERACTIONS_FAIL '+String(error?.message||error));
  process.exitCode=1;
});

// Real Google Chrome interaction acceptance for the exact built or served
// Heaven.gg website. No privileged account, external download or OS controls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

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
    console.log('HEAVEN_GG_BROWSER_INTERACTIONS_PASS ' + JSON.stringify({
      mode:requested ? 'served' : 'built', browser:'Google Chrome',
      observedRevision:requested ? expectedSha : 'local-pr-build',
      checks:['tabs','catalog-filter','research-panels','desktop-companion',
        'game-tools','game-registry','wardrobe-scenario','mobile-touch','mobile-overflow','mobile-wardrobe']
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

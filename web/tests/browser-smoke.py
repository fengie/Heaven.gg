"""Exercise the actual portable artifact in Chromium without network navigation.
Requires optional playwright and Chromium. Not proof of a public deployment.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser=argparse.ArgumentParser()
parser.add_argument('--artifact',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--browser-executable',default=shutil.which('chromium'))
parser.add_argument('--no-sandbox',action='store_true',help='Only for an isolated test container that requires it')
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
content=args.artifact.read_bytes()
report={'artifactSha256':hashlib.sha256(content).hexdigest(),'execution':'Chromium set_content of complete offline artifact; no HTTP navigation','passed':[],'errors':[],'networkRequests':[]}
def passed(name):report['passed'].append(name)
try:
 with sync_playwright() as pw:
  launch={'chromium_sandbox':not args.no_sandbox}
  if args.browser_executable:launch['executable_path']=args.browser_executable
  browser=pw.chromium.launch(**launch)
  report['browserVersion']=browser.version
  context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
  context.on('request',lambda req:report['networkRequests'].append(req.url) if req.url.startswith(('http://','https://')) else None)
  page=context.new_page();page.set_default_timeout(5000)
  page.on('pageerror',lambda error:report['errors'].append(str(error)))
  page.set_content(content.decode(),wait_until='domcontentloaded')
  expect(page.locator('.build-card')).to_have_count(18)
  manifest=json.loads(page.locator('#heaven-offline-manifest').inner_text());report['manifest']=manifest
  for selector,key in [('#build-count','builds'),('#gear-count','gear'),('#boss-count','bosses')]:
   expect(page.locator(selector)).to_have_text(str(manifest['counts'][key]))
  passed('all catalog counts and first page load')
  page.screenshot(path=str(args.output/'desktop.png'))
  page.locator('[data-class="Rogue"]').click()
  assert all(x=='Rogue' for x in page.locator('.build-card .class-tag').all_inner_texts())
  assert page.evaluate('document.activeElement.dataset.class')=='Rogue'
  passed('class filter and retained keyboard focus')
  page.locator('#build-query').fill('NO_SUCH_FIXTURE_BUILD_20261013')
  expect(page.locator('.build-card')).to_have_count(0);expect(page.locator('#show-more')).to_be_hidden()
  page.locator('#build-query').fill('');page.locator('[data-class="All"]').click()
  passed('empty search and reset')
  page.locator('#build-sort').select_option('dps')
  values=page.locator('.build-card .metric').all_inner_texts()
  nums=[float(x.split('modeled')[0].strip().replace(',','')) for x in values]
  assert nums==sorted(nums,reverse=True)
  page.locator('#show-more').click();expect(page.locator('.build-card')).to_have_count(36)
  passed('DPS sort and pagination')
  page.locator('[data-pick]').nth(0).click();page.locator('[data-pick]').nth(1).click()
  expect(page.locator('.compare-card')).to_have_count(2)
  expect(page.locator('#comparison-evidence')).to_contain_text('No validated DPS winner')
  assert page.evaluate('document.activeElement.hasAttribute("data-pick")')
  page.locator('#clear-compare').click();expect(page.locator('[data-pick][aria-pressed="true"]')).to_have_count(0)
  passed('comparison evidence guard, selection clearing and focus')
  page.locator('#tab-ch').focus();page.keyboard.press('ArrowRight');expect(page.locator('#view-aion')).to_be_visible()
  page.keyboard.press('ArrowLeft');expect(page.locator('#view-ch')).to_be_visible()
  page.locator('#tab-builds').focus();page.keyboard.press('ArrowRight');expect(page.locator('#research-gear')).to_be_visible()
  passed('game and research arrow-key navigation')
  page.locator('#gear-query').fill('NO_SUCH_FIXTURE_GEAR');expect(page.locator('.gear-card')).to_have_count(0)
  page.locator('#gear-query').fill('');page.locator('[data-gear-status="released_documented"]').click()
  assert all(x=='Documented released' for x in page.locator('.gear-card .status-tag').all_inner_texts())
  page.locator('[data-gear-status="all"]').click();expect(page.locator('.gear-card')).to_have_count(18)
  passed('gear search and release-status filter')
  page.locator('#tab-gear').focus();page.keyboard.press('End');expect(page.locator('.boss-card')).to_have_count(manifest['counts']['bosses'])
  expect(page.locator('#research-bosses')).to_be_visible();page.keyboard.press('Home');expect(page.locator('#research-builds')).to_be_visible()
  passed('boss catalog and Home/End navigation')
  page.locator('#tab-aion').click();expect(page.locator('[data-aion-tool="shop"]')).to_have_attribute('aria-selected','true')
  atlas=page.frame_locator('#aion-frame');expect(atlas.locator('body')).to_contain_text('Quna')
  page.locator('[data-aion-tool="shop"]').focus();page.keyboard.press('End')
  expect(page.locator('#aion-panel-wardrobe')).to_be_visible()
  frame=page.frame_locator('#wardrobe-frame');expect(frame.locator('.product')).to_have_count(12)
  passed('independent AION tab state, embedded atlas and wardrobe keyboard navigation')
  frame.locator('#budget').fill('19.99');frame.locator('[data-id="hamster"][data-kind="wanted"]').click()
  expect(frame.locator('#subtotal')).to_have_text('$19.99');expect(frame.locator('#budget-result')).to_contain_text('Within')
  frame.locator('#budget').fill('19.98');expect(frame.locator('#budget-result')).to_contain_text('Exceeds')
  passed('exact decimal-cent budget boundary')
  frame.locator('[data-id="hamster"][data-kind="owned"]').click();expect(frame.locator('#subtotal')).to_have_text('$0.00')
  frame.locator('[data-id="black-cloud"][data-kind="wanted"]').click();expect(frame.locator('#budget-result')).to_contain_text('Incomplete')
  passed('owned-item exclusion and unknown merchant costs')
  frame.locator('#wallet').fill('-1');expect(frame.locator('#subtotal')).to_have_text('—')
  for id in ['usd-direct','quna-needed','quna-topup','mileage-earned','quna-left','pack-breakdown']:expect(frame.locator('#'+id)).to_have_text('—')
  frame.locator('#wallet').fill('0')
  passed('invalid input clears every derived quote value')
  dialogs=[]
  def dialog_handler(dialog):dialogs.append(dialog.message);dialog.accept()
  page.on('dialog',dialog_handler)
  plan={'schema':1,'snapshot':manifest['catalogSnapshot']['aion2'],'region':manifest['aionRegion'],'wanted':[],'owned':[],'parameters':{'walletQuna':0,'dyeChanges':0,'dyeQunaEach':None,'budgetCents':None}}
  bad={**plan,'region':'WRONG-REGION'}
  with page.expect_event('dialog'):
   frame.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
  expect(frame.locator('#budget')).to_have_value('19.98');assert dialogs and 'region' in dialogs[-1]
  passed('foreign-region plan is rejected without partial control changes')
  frame.locator('#import-file').set_input_files({'name':'good.json','mimeType':'application/json','buffer':json.dumps(plan).encode()})
  expect(frame.locator('#budget')).to_have_value('');expect(frame.locator('#budget-result')).to_contain_text('No budget entered')
  expect(frame.locator('[data-kind="wanted"][aria-pressed="true"]')).to_have_count(0)
  passed('valid import replaces blank assumptions rather than retaining old values')
  with page.expect_download() as downloaded:frame.locator('#export').click()
  exported=downloaded.value;exported.save_as(args.output/'roundtrip-plan.json')
  parsed=json.loads((args.output/'roundtrip-plan.json').read_text());assert parsed['parameters']['budgetCents'] is None and parsed['region']==plan['region']
  passed('plan export/import round trip')
  for width,height in [(390,844),(768,1024),(1440,1000)]:
   page.set_viewport_size({'width':width,'height':height})
   page.locator('#tab-ch').click()
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'CH overflow {width}'
   if width==390:page.screenshot(path=str(args.output/'mobile.png'))
   page.locator('#tab-aion').click();page.locator('[data-aion-tool="wardrobe"]').click()
   assert frame.locator('html').evaluate('el=>el.scrollWidth<=window.innerWidth'),f'Wardrobe overflow {width}'
  passed('phone, tablet and desktop layouts have no horizontal overflow')
  assert not report['errors'],report['errors']
  assert not report['networkRequests'],report['networkRequests']
  passed('no JavaScript errors and no network requests')
  browser.close()
except Exception as error:
 report['failure']=str(error)
 raise
finally:
 (args.output/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'passed':len(report['passed']),'failure':report.get('failure'),'artifactSha256':report['artifactSha256']}))

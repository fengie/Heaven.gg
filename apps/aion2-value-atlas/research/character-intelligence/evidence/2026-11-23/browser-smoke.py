from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path('/mnt/data/heaven-gg-intelligence-candidate/apps/aion2-value-atlas')
html=(root/'intelligence.html').read_text().replace('<script type="module" src="./scripts/intelligence-page.mjs"></script>','')
engine=(root/'scripts/intelligence-engine.mjs').read_text()
armory=(root/'scripts/armory-engine.mjs').read_text()
page_code=(root/'scripts/intelligence-page.mjs').read_text()
fixtures={
'search/v2/character':{'list':[{'characterId':'abc%3D','name':'<strong>Fixture</strong>','serverId':1101,'serverName':'Siel','level':45}]},
'/character/info':{'profile':{'characterId':'abc=','characterName':'Fixture','characterLevel':45,'combatPower':1234,'className':'Spiritmaster','serverName':'Siel'},'stat':{'statList':[{'type':'ItemLevel','name':'Item Level','value':2790}]},'daevanion':{'boardList':[{'id':1,'name':'Board','openNodeCount':1,'totalNodeCount':3}]}},
'/character/equipment':{'equipment':{'equipmentList':[{'slotPos':1,'slotPosName':'Weapon','id':10,'name':'Orb','grade':'Unique','enchantLevel':5,'exceedLevel':0}]},'skill':{'skillList':[{'id':2,'name':'Skill','skillLevel':15,'equip':True}]}},
'/character/equipment/item':{'id':10,'name':'Orb','subStats':[{'id':'Crit','name':'Critical Hit','value':'+40'}],'maxEnchantLevel':10},
'/character/daevanion/detail':{'nodeList':[{'nodeId':1,'type':'Stat','open':True,'name':'Owned'},{'nodeId':2,'type':'Stat','open':False,'name':'New'}]}
}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':850});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 # All provider responses are synthetic; no website navigation, external requests or actual identity.
 page.set_content(html)
 page.evaluate('''fixtures=>{const saved=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)},configurable:true});window.fixtureCalls=[];window.fetch=async (url,opts)=>{opts?.signal?.throwIfAborted();const path=new URL(url).pathname;window.fixtureCalls.push(path);const k=Object.keys(fixtures).find(k=>path.endsWith(k));return new Response(JSON.stringify(fixtures[k]??{}),{status:k?200:404,headers:{'Content-Type':'application/json'}});};}''', fixtures)
 def inject():
  # Use browser ES modules and real application code; only rewrite module specifiers
  # to test-local Blob URLs because sandbox navigation is blocked by policy.
  page.evaluate('''async ({engine,armory,pageCode})=>{const asModule=code=>URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const e=asModule(engine);const a=asModule(armory.replace("'./intelligence-engine.mjs'",JSON.stringify(e)));const m=asModule(pageCode.replace("'./intelligence-engine.mjs'",JSON.stringify(e)).replace("'./armory-engine.mjs'",JSON.stringify(a)));await import(m);}''',{'engine':engine,'armory':armory,'pageCode':page_code})
 inject();assert page.evaluate('fixtureCalls.length')==0
 page.locator('#character-name').fill('Fixture');page.get_by_role('button',name='Find character').click();page.get_by_role('button',name='Fixture · Siel · nae · level 45').click()
 page.wait_for_function("document.querySelector('#status').textContent.includes('Published character data checked')",timeout=15000)
 assert page.locator('#il').inner_text()=='2,790';assert page.locator('#cp').inner_text()=='1,234';assert page.locator('#wallet').inner_text()=='Unknown'
 assert 'Critical Hit: +40' in page.locator('#gear').inner_text();assert 'Board: New' in page.locator('#ledger').inner_text();assert 'Board: Owned' not in page.locator('#ledger').inner_text()
 rows=page.locator('#ledger tr').count();assert rows>=4
 page.locator('#category').select_option('daevanion');page.locator('#preference').select_option('dislike');assert page.locator('#ledger tr').count()==rows
 count=page.evaluate('fixtureCalls.length');page.locator('#sort').select_option('cost');assert page.evaluate('fixtureCalls.length')==count
 assert page.evaluate("JSON.parse(localStorage.getItem('heaven-gg:aion2:intelligence-binding-v1')).key.characterId")=='abc='
 page.screenshot(path='/mnt/data/heaven-gg-intelligence-preview.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.get_by_role('button',name='Forget character').click();assert page.locator('#name').inner_text()=='—';assert not errors,errors
 browser.close()
 print(f'BROWSER_SMOKE_PASS: {rows} fixture opportunities, {count} intercepted requests; search/confirm, stored identity, preference retention, local sort, unknown wallet, equipment/board details, responsive layout, forget; no uncaught JS errors. Browser module imports resolved to test-local Blob URLs; provider responses and storage simulated; real navigation and live connectivity unverified.')

// Exercise the actual built/served page and module imports with synthetic provider responses.
// This is not a live NCSOFT transport, CORS, character ownership or wallet-access test.
import assert from 'node:assert/strict';
export async function checkIntelligence(browser,baseUrl){
 const context=await browser.newContext({viewport:{width:1280,height:850},locale:'en-US'});
 try{
  const page=await context.newPage(),errors=[],requests=[],searchServers=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
  const fixtures={
   '/en-us/api/gameinfo/servers':{serverList:[{raceId:1,serverId:1101,serverName:'Siel',serverShortName:'SIE'},{raceId:2,serverId:2101,serverName:'Israphel',serverShortName:'ISR'}]},
   '/aion2global/search/v2/character':{list:[{characterId:'fixture%3D',name:'Fixture',serverId:1101,serverName:'Siel',level:45}]},
   '/api/character/info':{profile:{characterId:'fixture=',characterName:'Fixture',characterLevel:45,combatPower:1234,className:'Spiritmaster',serverName:'Siel'},stat:{statList:[{type:'ItemLevel',name:'Item Level',value:2800},{name:'Attack',value:1000},{name:'Accuracy',value:1100},{name:'Critical Hit',value:1400},{name:'Critical Damage Boost',value:'0%'},{name:'Weapon Damage Boost',value:'0%'}]},daevanion:{boardList:[{id:1,name:'Board',openNodeCount:1,totalNodeCount:3}]}},
   '/api/character/equipment':{equipment:{equipmentList:[{slotPos:1,slotPosName:'Shoulder',id:101,name:'Shoulder',grade:'Unique',enchantLevel:5,exceedLevel:0},{slotPos:2,slotPosName:'Shoes',id:102,name:'Shoes',grade:'Unique',enchantLevel:5,exceedLevel:0}]},skill:{skillList:[{id:2,name:'Skill',skillLevel:15,equip:true}]}},
   '/api/character/daevanion/detail':{nodeList:[{nodeId:1,type:'Stat',open:true,name:'Owned'},{nodeId:2,type:'Stat',open:false,name:'New'}]},
   item101:{id:101,name:'Shoulder',level:102,subStats:[{id:'WeaponAccuracy',name:'Accuracy',value:'31'}],maxEnchantLevel:10},
   item102:{id:102,name:'Shoes',level:102,subStats:[{id:'Critical',name:'Critical Hit',value:'26'}],maxEnchantLevel:10}
  };
  await context.route(/^https:\/\/(?:aion2\.plaync\.com|api-search\.plaync\.com)\//,async route=>{
   const u=new URL(route.request().url());requests.push(u.pathname);if(u.pathname.endsWith('/search/v2/character'))searchServers.push(u.searchParams.get('serverId'));
   const key=u.pathname==='/api/character/equipment/item'?'item'+u.searchParams.get('id'):u.pathname;
   const found=Object.hasOwn(fixtures,key);
   await route.fulfill({status:found?200:404,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(found?fixtures[key]:{})});
  });
  const response=await page.goto(new URL('aion2/intelligence.html',baseUrl).href,{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200);await page.locator('#objective option').first().waitFor({state:'attached'});
  assert.equal(requests.length,0,'initial blank view must not request a player');
  await page.locator('#load-servers').click();
  await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('2 official server identities'));
  await page.locator('#server-filter').selectOption('1101');
  assert.equal(requests.length,1,'loading the directory must not fetch a player');
  await page.evaluate(()=>localStorage.setItem('heaven-gg:aion2:character-v1',JSON.stringify({schema:'heaven-gg/aion2-profile/v1',boundKina:5000,tradableKina:200})));
  await page.locator('#character-name').fill('Fixture');await page.getByRole('button',{name:'Find character'}).click();
  await page.getByRole('button',{name:'Fixture · Siel · nae · level 45'}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
  assert.equal(await page.locator('#il').innerText(),'2,800');assert.equal(await page.locator('#wallet').innerText(),'Unknown');assert.equal(searchServers[0],'1101');
  assert.match(await page.locator('#facts').textContent(),/Critical Damage Boost: 0%/);
  await page.locator('#objective').selectOption('critBonus');const plan=await page.locator('#best-plan').innerText();
  assert.match(plan,/12\.84 pp/);assert.match(plan,/Shoulder: Accuracy 31/);assert.match(plan,/Shoes: Critical Hit 26/);assert.match(plan,/Net raw Accuracy \+16/);
  const count=requests.length,rows=await page.locator('#ledger tr').count();await page.locator('#sort').selectOption('power');
  assert.equal(await page.locator('#ledger tr').count(),rows);assert.equal(requests.length,count);
  await page.locator('#use-wallet').click();assert.equal(await page.locator('#wallet').innerText(),'5,200 Kina');
  assert.equal(await page.getByRole('row').filter({hasText:'Ludra weapon selection'}).filter({hasText:'unaffordable'}).count(),3);
  await page.locator('#refresh').click();assert.equal(await page.locator('#wallet').innerText(),'Unknown');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
  await page.locator('#use-wallet').click();assert.equal(await page.locator('#wallet').innerText(),'5,200 Kina');
  await page.locator('#clear-wallet').click();assert.equal(await page.locator('#wallet').innerText(),'Unknown');
  assert.equal(await page.getByRole('row').filter({hasText:'Ludra weapon selection'}).filter({hasText:'unaffordable'}).count(),0);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
  assert.equal(await page.locator('#name').innerText(),'Fixture','saved identity must load without a second search');
  assert.equal(requests.filter(x=>x.endsWith('/search/v2/character')).length,1);
  assert.match(await page.locator('#history-summary').textContent(),/0 observed changes/);
  fixtures['/api/character/info'].profile.combatPower=1250;
  await page.locator('#refresh').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked')&&document.querySelector('#cp').textContent==='1,250',{},{timeout:25000});
  assert.match(await page.locator('#progress-history').textContent(),/CP \+16/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
  assert.match(await page.locator('#progress-history').textContent(),/CP \+16/);
  fixtures['/api/character/info'].profile.combatPower=1234;
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'intelligence page mobile overflow');
  await page.locator('#forget').click();assert.equal(await page.locator('#name').innerText(),'—');
  assert.match(await page.locator('#history-summary').textContent(),/0 observed changes/);
  // A region-less official link resolves through the official directory and skips name search.
  const searchesBeforeLink=requests.filter(x=>x.endsWith('/search/v2/character')).length;
  await page.locator('#character-name').fill('https://aion2.plaync.com/en-us/characters/view?characterId=fixture%253D&serverId=1101');
  await page.getByRole('button',{name:'Find character'}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
  assert.equal(await page.locator('#name').innerText(),'Fixture');
  assert.equal(requests.filter(x=>x.endsWith('/search/v2/character')).length,searchesBeforeLink);
  // Export is local; round-trip through an actual file upload and verify offline reopening.
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export-observation').click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'heaven-gg-aion2-observation.json');
  const localFile=await download.path();assert.ok(localFile);
  await page.locator('#forget').click();
  const beforeImport=requests.length;
  await page.locator('#import-observation').setInputFiles(localFile);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Imported local observation'));
  assert.equal(await page.locator('#il').innerText(),'2,800');
  assert.match(await page.locator('#coverage').textContent(),/Imported historical observation/);
  await page.locator('#objective').selectOption('critBonus');
  assert.match(await page.locator('#best-plan').innerText(),/12\.84 pp/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#coverage').textContent.includes('Imported historical observation'));
  assert.equal(await page.locator('#name').innerText(),'Fixture');
  assert.equal(requests.length,beforeImport);
  await page.locator('#forget').click();
  // Companion-shaped armory bundle and explicit actor/encounter selection, all offline.
  const raw={info:{profile:{characterId:'fixture=',serverId:1101,characterName:'Fixture'},stat:{statList:[{type:'ItemLevel',value:2800},{name:'Might',value:100,statSecondList:['Attack increase +1.4%']}]},daevanion:{boardList:[{id:1,openNodeCount:1,totalNodeCount:2}]}},equipment:{equipment:{equipmentList:[{id:101,slotPos:1,name:'Shoulder'}]},skill:{skillList:[]}},daevanion:{1:{nodeList:[{boardId:1,nodeId:1,type:'Stat',open:1},{boardId:1,nodeId:2,type:'Stat',open:0}]}}};
  const interopBefore=requests.length;
  await page.locator('#import-observation').setInputFiles({name:'raw.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});
  await page.waitForFunction(()=>document.querySelector('#coverage').textContent.includes('Original observation time unknown'));
  assert.match(await page.locator('#facts').textContent(),/Published contribution \(not total\): Attack increase \+1\.4%/);
  const combat={format:'a2log',version:1,meta:{source:'fixture'},players:[{id:'self',name:'Fixture'},{id:'party',name:'Other party member'}],segments:[{duration:10,boss:'Fixture boss',hits:[{t:1,player:'self',damage:100,crit:true},{t:2,player:'self',damage:200},{t:3,player:'party',damage:99000}]}]};
  await page.locator('#import-combat').setInputFiles({name:'fight.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(combat))});
  await page.waitForFunction(()=>document.querySelector('#combat-actor').options.length===3);
  assert.equal(await page.locator('#save-combat').isDisabled(),true);
  await page.locator('#combat-actor').selectOption('self');await page.locator('#combat-segment').selectOption('0');
  await page.locator('#save-combat').click();
  assert.match(await page.locator('#combat-evidence').textContent(),/Recorded DPS 30/);
  assert.match(await page.locator('#combat-evidence').textContent(),/100% \(1\/1\)/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#combat-evidence').textContent.includes('Recorded DPS 30'));
  assert.equal(requests.length,interopBefore);
  await page.locator('#forget').click();
  assert.match(await page.locator('#combat-summary').textContent(),/^0 local recorded encounters/);
  // Exercise the optional same-origin transport in a synthetic built-site browser fixture.
  // The broker is not available on static Pages; do not pretend this fixture is a live test.
  if(new URL(baseUrl).hostname==='127.0.0.1'){
   const beforeDirect=requests.length,localRequests=[];
   const pageUrl=new URL('aion2/intelligence.html',baseUrl).href;
   await page.route(pageUrl,async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace('</head>','<meta name="heaven-gg-armory-transport" content="same-origin"></head>')});
   });
   await context.route('**/aion2/armory-api/**',async route=>{
    const u=new URL(route.request().url()),name=u.pathname.split('/aion2/armory-api/')[1];localRequests.push(name);
    const key=name==='servers'?'/en-us/api/gameinfo/servers':name==='search'?'/aion2global/search/v2/character':name==='equipment/item'?'item'+u.searchParams.get('id'):'/api/character/'+name;
    const found=Object.hasOwn(fixtures,key);
    await route.fulfill({status:found?200:404,contentType:'application/json',body:JSON.stringify(found?fixtures[key]:{})});
   });
   await page.goto(pageUrl,{waitUntil:'domcontentloaded'});
   await page.locator('#objective option').first().waitFor({state:'attached'});
   await page.locator('#load-servers').click();
   await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('2 official server identities'));
   await page.locator('#server-filter').selectOption('1101');
   await page.locator('#character-name').fill('Fixture');
   await page.getByRole('button',{name:'Find character'}).click();
   await page.getByRole('button',{name:'Fixture · Siel · nae · level 45'}).click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
   assert.match(await page.locator('#transport-detail').textContent(),/explicitly enabled local same-origin/);
   assert.equal(await page.locator('#il').innerText(),'2,800');assert.equal(localRequests.length,7);assert.equal(requests.length,beforeDirect);
   await page.locator('#forget').click();
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
}

// Exercise the actual built/served page and module imports with synthetic provider responses.
// This is not a live NCSOFT transport, CORS, character ownership or wallet-access test.
import assert from 'node:assert/strict';
export async function checkIntelligence(browser,baseUrl){
 const context=await browser.newContext({viewport:{width:1280,height:850},locale:'en-US'});
 try{
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
  const fixtures={
   '/aion2global/search/v2/character':{list:[{characterId:'fixture%3D',name:'Fixture',serverId:1101,serverName:'Siel',level:45}]},
   '/api/character/info':{profile:{characterId:'fixture=',characterName:'Fixture',characterLevel:45,combatPower:1234,className:'Spiritmaster',serverName:'Siel'},stat:{statList:[{type:'ItemLevel',name:'Item Level',value:2800},{name:'Attack',value:1000},{name:'Accuracy',value:1100},{name:'Critical Hit',value:1400},{name:'Critical Damage Boost',value:'0%'},{name:'Weapon Damage Boost',value:'0%'}]},daevanion:{boardList:[{id:1,name:'Board',openNodeCount:1,totalNodeCount:3}]}},
   '/api/character/equipment':{equipment:{equipmentList:[{slotPos:1,slotPosName:'Shoulder',id:101,name:'Shoulder',grade:'Unique',enchantLevel:5,exceedLevel:0},{slotPos:2,slotPosName:'Shoes',id:102,name:'Shoes',grade:'Unique',enchantLevel:5,exceedLevel:0}]},skill:{skillList:[{id:2,name:'Skill',skillLevel:15,equip:true}]}},
   '/api/character/daevanion/detail':{nodeList:[{nodeId:1,type:'Stat',open:true,name:'Owned'},{nodeId:2,type:'Stat',open:false,name:'New'}]},
   item101:{id:101,name:'Shoulder',level:102,subStats:[{id:'WeaponAccuracy',name:'Accuracy',value:'31'}],maxEnchantLevel:10},
   item102:{id:102,name:'Shoes',level:102,subStats:[{id:'Critical',name:'Critical Hit',value:'26'}],maxEnchantLevel:10}
  };
  await context.route(/^https:\/\/(?:aion2\.plaync\.com|api-search\.plaync\.com)\//,async route=>{
   const u=new URL(route.request().url());requests.push(u.pathname);
   const key=u.pathname==='/api/character/equipment/item'?'item'+u.searchParams.get('id'):u.pathname;
   const found=Object.hasOwn(fixtures,key);
   await route.fulfill({status:found?200:404,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(found?fixtures[key]:{})});
  });
  const response=await page.goto(new URL('aion2/intelligence.html',baseUrl).href,{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200);await page.locator('#objective option').first().waitFor({state:'attached'});
  assert.equal(requests.length,0,'initial blank view must not request a player');
  await page.evaluate(()=>localStorage.setItem('heaven-gg:aion2:character-v1',JSON.stringify({schema:'heaven-gg/aion2-profile/v1',boundKina:5000,tradableKina:200})));
  await page.locator('#character-name').fill('Fixture');await page.getByRole('button',{name:'Find character'}).click();
  await page.getByRole('button',{name:'Fixture · Siel · nae · level 45'}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
  assert.equal(await page.locator('#il').innerText(),'2,800');assert.equal(await page.locator('#wallet').innerText(),'Unknown');
  await page.locator('#objective').selectOption('critBonus');const plan=await page.locator('#best-plan').innerText();
  assert.match(plan,/12\.84 pp/);assert.match(plan,/Shoulder: Accuracy 31/);assert.match(plan,/Shoes: Critical Hit 26/);assert.match(plan,/Net raw Accuracy \+16/);
  const count=requests.length,rows=await page.locator('#ledger tr').count();await page.locator('#sort').selectOption('power');
  assert.equal(await page.locator('#ledger tr').count(),rows);assert.equal(requests.length,count);
  await page.locator('#use-wallet').click();assert.equal(await page.locator('#wallet').innerText(),'5,200 Kina');
  assert.equal(await page.getByRole('row').filter({hasText:'Ludra weapon selection'}).filter({hasText:'unaffordable'}).count(),3);
  await page.locator('#clear-wallet').click();assert.equal(await page.locator('#wallet').innerText(),'Unknown');
  assert.equal(await page.getByRole('row').filter({hasText:'Ludra weapon selection'}).filter({hasText:'unaffordable'}).count(),0);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Published character data checked'),{},{timeout:25000});
  assert.equal(await page.locator('#name').innerText(),'Fixture','saved identity must load without a second search');
  assert.equal(requests.filter(x=>x.endsWith('/search/v2/character')).length,1);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'intelligence page mobile overflow');
  await page.locator('#forget').click();assert.equal(await page.locator('#name').innerText(),'—');assert.deepEqual(errors,[]);
 }finally{await context.close();}
}

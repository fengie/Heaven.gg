import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficialCharacterLink, normalizeArmory, normalizeImportedSnapshot} from '../../apps/aion2-value-atlas/scripts/armory-engine.mjs';
import {normalizeObservationPack, createObservationPack, analyzeProgression, walletResources} from '../../apps/aion2-value-atlas/scripts/intelligence-context.mjs';
const now=Date.parse('2026-11-23T23:00:00Z');
const key={region:'nae',serverId:'1101',characterId:'fixture='};
const make=()=>{
 const s=normalizeArmory(key,{profile:{characterId:'fixture=',characterName:'Fixture',serverId:1101,characterLevel:45,combatPower:1000},stat:{statList:[{type:'ItemLevel',value:2800}]},daevanion:{boardList:[{id:5,name:'Board',openNodeCount:1}]}},{equipment:{equipmentList:[{id:100,slotPos:1,slotPosName:'MainHand',name:'Orb',grade:'Epic',enchantLevel:5,exceedLevel:0}]},skill:{skillList:[{id:2,name:'Skill',skillLevel:10}]}},now-60000);
 s.equipment[0].detail={id:100,level:108,name:'Orb',grade:'Epic',subStats:[{id:'Critical',name:'Critical Hit',value:'35'}],maxEnchantLevel:10};s.equipment[0].detailCheckedAt=now-30000;
 s.boards[0].detail={boardId:5,nodeList:[{nodeId:1,type:'Stat',open:false,name:'New node'}]};s.boards[0].detailCheckedAt=now-30000;
 return s;
};
const catalog=()=>({schema:'heaven-gg/aion2-item-reference/v1',region:'nae',version:'fixture-build',observedAt:now-60000,sourceUrl:'https://example.org/authorized-fixture',items:[{id:100,level:108,grade:'Epic',slot:'weapon',subStats:[{id:'Critical',name:'Critical Hit',minValue:'30',value:'50'},{id:'WeaponAccuracy',name:'Accuracy',minValue:'60',value:'80'}]}]});
const wallet=()=>({schema:'heaven-gg/aion2-wallet-observation/v1',key,observedAt:now-30000,boundKina:100,tradableKina:200,materials:{ludraEasyVoucher:0,ludraNormalVoucher:3}});
test('direct official link extracts only one exact identity and rejects other hosts, routes and duplicate keys',()=>{
 assert.deepEqual(parseOfficialCharacterLink('https://aion2.plaync.com/en-us/characters/view?characterId=fixture%253D&serverId=1101&region=nae'),key);
 assert.deepEqual(parseOfficialCharacterLink('https://aion2.plaync.com/api/character/info?characterId=fixture%3D&serverId=1101&region=nae&lang=en-US'),key);
 for(const bad of ['https://evil.example/en-us/characters/view?characterId=fixture%3D&serverId=1101&region=nae','https://aion2.plaync.com.evil.example/en-us/characters/view?characterId=fixture%3D&serverId=1101&region=nae','http://aion2.plaync.com/en-us/characters/view?characterId=fixture%3D&serverId=1101&region=nae','https://aion2.plaync.com/api/character/equipment?characterId=fixture%3D&serverId=1101&region=nae','https://aion2.plaync.com/en-us/characters/view?characterId=fixture%3D&serverId=1101&region=nae&region=eu','https://aion2.plaync.com/en-us/characters/view?characterId=fixture%3D&serverId=1101'])assert.throws(()=>parseOfficialCharacterLink(bad));
});
test('local observation round trip preserves original timestamps, exact character, and private data scope',()=>{
 const s=make();s.resources={secret:'do not import opaque resource data'};s.equipment[0].detail.token='do not export';
 const pack=createObservationPack(s,{wallet:wallet(),catalog:catalog(),now});
 const restored=normalizeObservationPack(JSON.parse(JSON.stringify(pack)),now);
 assert.deepEqual(restored.snapshot.key,key);assert.equal(restored.snapshot.checkedAt,s.checkedAt);
 assert.equal(restored.snapshot.equipment[0].detailCheckedAt,s.equipment[0].detailCheckedAt);
 assert.equal(restored.snapshot.equipment[0].detail.subStats[0].value,'35');
 assert.equal(restored.snapshot.equipment[0].detail.token,undefined);
 assert.equal(restored.snapshot.resources,null);
 assert.equal(restored.wallet.observedAt,now-30000);assert.equal(restored.catalog.version,'fixture-build');
 assert.equal(restored.snapshot.complete,true);
});
test('malformed imported observations fail atomically, not as a fabricated current profile',()=>{
 for(const change of [s=>s.checkedAt=now+1,s=>s.equipment[0].detail.id=999,s=>s.equipment[0].detail.subStats={},s=>s.boards[0].detail.nodeList.push(s.boards[0].detail.nodeList[0]),s=>s.equipment.push(s.equipment[0]),s=>s.equipment[0].detailCheckedAt=now+1]){
  const s=make();change(s);assert.throws(()=>normalizeImportedSnapshot(s,now));
 }
 const s=make(),p=createObservationPack(s,{wallet:wallet(),catalog:catalog(),now});
 p.wallet.key={...key,characterId:'other='};assert.throws(()=>normalizeObservationPack(p,now));
});
test('exact-item imported reference extends coverage beyond tier 102 without claiming legality',()=>{
 const s=make();const p=createObservationPack(s,{catalog:catalog(),now});
 assert.equal(analyzeProgression(s,{now,goal:'crit'}).matchingItems,0);
 const x=analyzeProgression(p.snapshot,{catalog:p.catalog,now,goal:'crit'});
 assert.equal(x.importedMatchingItems,1);assert.equal(x.best.gain,15);
 const row=x.rows.find(r=>r.id.startsWith('reference:')&&r.title.includes('Critical Hit 50'));
 assert.ok(row);assert.equal(row.status,'unknown');assert.match(row.reason,/fixture-build/);assert.match(row.reason,/not verified/);
 assert.equal(analyzeProgression({...s,key:{...key,region:'eu'}},{catalog:p.catalog,now,goal:'crit'}).matchingItems,0);
 const changed=make();changed.equipment[0].detail.grade='Unique';changed.equipment[0].grade='Unique';
 assert.equal(analyzeProgression(changed,{catalog:p.catalog,now,goal:'crit'}).matchingItems,0);
});
test('exact-item reference with observed line out of range is rejected rather than reused',()=>{
 const s=make();const c=catalog();c.items[0].subStats[0].value='34';
 const p=createObservationPack(s,{catalog:c,now});
 assert.equal(analyzeProgression(p.snapshot,{catalog:p.catalog,now,goal:'crit'}).matchingItems,0);
});
test('imported material balances remain distinct, scoped and expire without renewing timestamps',()=>{
 const p=createObservationPack(make(),{wallet:wallet(),now});
 const r=walletResources(p.wallet,key,now);
 assert.equal(r.boundKina.high,100);assert.equal(r.marketKina.high,200);assert.equal(r.ludraEasyVoucher.high,0);assert.equal(r.ludraNormalVoucher.high,3);
 assert.equal(r.ludraHardVoucher,undefined);
 assert.deepEqual(walletResources(p.wallet,key,now+30*60000),{});
 const x=analyzeProgression(p.snapshot,{wallet:p.wallet,now});
 assert.equal(x.rows.find(r=>r.id==='content:ludra:Easy').status,'unaffordable');
});
test('local item references reject unsafe URLs, contradictory ranges and duplicate item/stat identities',()=>{
 for(const mutate of [c=>c.sourceUrl='javascript:alert(1)',c=>c.items[0].subStats[0].minValue='90',c=>c.items.push(c.items[0]),c=>c.items[0].subStats.push(c.items[0].subStats[0]),c=>c.region='kr']){
  const c=catalog();mutate(c);assert.throws(()=>createObservationPack(make(),{catalog:c,now}));
 }
});

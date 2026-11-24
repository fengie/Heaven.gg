import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOfficialArmoryCapture} from '../../apps/aion2-value-atlas/scripts/evidence-import.mjs';
import {ArmoryClient} from '../../apps/aion2-value-atlas/scripts/armory-engine.mjs';

const now=Date.parse('2026-11-23T12:05:00Z'),key={region:'nae',serverId:'1101',characterId:'fixture='};
const info={profile:{characterName:'Fixture',characterId:'fixture%3D',serverId:1101,combatPower:1234},stat:{statList:[{type:'ItemLevel',value:2800}]},daevanion:{boardList:[{id:7,openNodeCount:1,totalNodeCount:2}]}};
const equipment={equipment:{equipmentList:[{id:101,slotPos:1,slotPosName:'Shoulder',name:'Shoulder',enchantLevel:5,exceedLevel:0}]},skill:{skillList:[]}};
function entry(route,body,extra='',seconds=0){
 return {startedDateTime:new Date(now-60000+seconds*1000).toISOString(),request:{method:'GET',url:'https://aion2.plaync.com/api/character/'+route+'?region=nae&lang=en-US&characterId=fixture%3D&serverId=1101'+extra,headers:[],cookies:[]},response:{status:200,headers:[],cookies:[],content:{mimeType:'application/json',text:JSON.stringify(body)}}};
}
function capture(){return {log:{version:'1.2',entries:[entry('info',info),entry('equipment',equipment,'',1),entry('equipment/item',{id:101,name:'Shoulder',subStats:[{name:'Accuracy',value:'31'}],unknownPrivateField:'discard'},'&id=101&slotPos=1&enchantLevel=5&exceedLevel=0',2),entry('daevanion/detail',{boardId:7,nodeList:[{nodeId:1,type:'Stat',open:1},{nodeId:2,type:'Stat',open:0}]},'&boardId=7',3)]}};}
test('import already successful official public responses without a network call or fabricated freshness',()=>{
 const h=capture();h.log.entries.push({request:{url:'https://evil.example/account?secret=do-not-retain'},response:{content:{text:'secret'}}});
 const s=normalizeOfficialArmoryCapture(h,{now});
 assert.deepEqual(s.key,key);assert.equal(s.itemLevel,2800);assert.equal(s.combatPower,1234);
 assert.equal(s.checkedAt,now-60000);assert.equal(s.upstreamObservedAt,null);
 assert.equal(s.equipment[0].detail.subStats[0].value,'31');assert.equal(s.equipment[0].detailCheckedAt,now-58000);
 assert.equal(s.equipment[0].detail.unknownPrivateField,undefined);assert.equal(s.boards[0].detail.nodeList.length,2);assert.equal(s.complete,true);
 assert.equal(s.resources,null);assert.equal(JSON.stringify(s).includes('do-not-retain'),false);
});
test('capture does not mix profiles, old details, foreign routes or unverified upgrade instances',()=>{
 const h=capture();const other=entry('info',{...info,profile:{...info.profile,characterId:'other'}});
 other.request.url=other.request.url.replace('fixture%3D','other');h.log.entries.push(other);
 assert.throws(()=>normalizeOfficialArmoryCapture(h,{now}),/one character/);
 assert.equal(normalizeOfficialArmoryCapture(h,{key,now}).key.characterId,'fixture=');
 const old=capture();old.log.entries[2].startedDateTime=new Date(now-600000).toISOString();
 assert.equal(normalizeOfficialArmoryCapture(old,{now}).equipment[0].detail,null);
 const mismatch=capture();mismatch.log.entries[2].request.url=mismatch.log.entries[2].request.url.replace('enchantLevel=5','enchantLevel=4');
 assert.equal(normalizeOfficialArmoryCapture(mismatch,{now}).equipment[0].detail,null);
 const foreign=capture();foreign.log.entries[1].request.url=foreign.log.entries[1].request.url.replace('aion2.plaync.com','aion2.plaync.com.evil.example');
 assert.throws(()=>normalizeOfficialArmoryCapture(foreign,{now}),/profile and equipment/);
});
test('capture rejects sensitive public-route headers and ambiguous or malformed matching responses',()=>{
 const h=capture();h.log.entries[0].request.headers=[{name:'Authorization',value:'secret'}];
 assert.throws(()=>normalizeOfficialArmoryCapture(h,{now}),/sanitized/);
 const duplicate=capture();duplicate.log.entries.push(entry('info',{...info,profile:{...info.profile,combatPower:9999}},'',4));
 assert.throws(()=>normalizeOfficialArmoryCapture(duplicate,{now}),/one profile and equipment/);
 const bad=capture();bad.log.entries[0].response.content.text='not-json';
 assert.throws(()=>normalizeOfficialArmoryCapture(bad,{now}),/profile and equipment/);
 const future=capture();future.log.entries[0].startedDateTime=new Date(now+1000).toISOString();
 assert.throws(()=>normalizeOfficialArmoryCapture(future,{now}),/profile and equipment/);
});
test('search access denial preserves original status and never repeats the denied request',async()=>{
 let calls=0;const c=new ArmoryClient({minInterval:0,transport:async()=>{calls++;return {status:403};}});
 await assert.rejects(()=>c.search('Fixture','nae'),e=>e.code==='ARMORY_DENIED'&&e.status===403);
 await assert.rejects(()=>c.search('Fixture','nae'),e=>e.code==='ARMORY_DENIED'&&e.status===403);
 assert.equal(calls,1);
});

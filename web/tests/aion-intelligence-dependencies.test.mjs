import test from 'node:test';
import assert from 'node:assert/strict';
import {ArmoryClient, normalizeServerDirectory, parseOfficialCharacterLink, armoryRequestTarget, normalizeArmory} from '../../apps/aion2-value-atlas/scripts/armory-engine.mjs';
import {resolveBrokerRequest} from '../armory-broker.mjs';
import {compareProgressObservations, appendProgressHistory, normalizeProgressHistory} from '../../apps/aion2-value-atlas/scripts/intelligence-context.mjs';

const key={region:'nae',serverId:'1101',characterId:'fixture='};
const now=Date.parse('2026-11-23T23:00:00Z');
const roster={serverList:[{raceId:1,serverId:1101,serverName:'Fixture East',serverShortName:'FIX'},{raceId:2,serverId:2101,serverName:'Fixture West',serverShortName:'FW'}]};
test('official server directory is identity only and refuses duplicate or malformed server records',()=>{
 const rows=normalizeServerDirectory(roster,'nae');
 assert.deepEqual(rows,[{region:'nae',serverId:'1101',name:'Fixture East',raceId:1},{region:'nae',serverId:'2101',name:'Fixture West',raceId:2}]);
 assert.throws(()=>normalizeServerDirectory({serverList:[roster.serverList[0],roster.serverList[0]]},'nae'));
 assert.throws(()=>normalizeServerDirectory({serverList:[{serverId:0,serverName:'Bad'}]},'nae'));
 assert.throws(()=>normalizeServerDirectory({serverList:[]},'nae'));
 assert.throws(()=>normalizeServerDirectory(roster,'kr'));
});
test('directory requests use the fixed official URL and cache only the selected region',async()=>{
 let calls=[];let clock=now;
 const c=new ArmoryClient({minInterval:0,clock:()=>clock,transport:async u=>{
  calls.push(new URL(u));
  return {status:200,body:roster};
 }});
 const first=await c.servers('nae');
 first.rows[0].name='not cached';
 const second=await c.servers('nae');
 assert.equal(second.rows[0].name,'Fixture East');assert.equal(calls.length,1);
 assert.equal(calls[0].origin,'https://aion2.plaync.com');assert.equal(calls[0].pathname,'/en-us/api/gameinfo/servers');
 assert.equal(calls[0].searchParams.get('region'),'nae');
 await c.servers('eu');assert.equal(calls.length,2);
 clock+=3600000;await c.servers('nae');assert.equal(calls.length,3);
});
test('a region-less official link is resolved only against a matching confirmed directory',()=>{
 const url='https://aion2.plaync.com/en-us/characters/view?characterId=fixture%253D&serverId=1101';
 const rows=normalizeServerDirectory(roster,'nae');
 assert.throws(()=>parseOfficialCharacterLink(url));
 assert.deepEqual(parseOfficialCharacterLink(url,{directory:rows}),key);
 assert.throws(()=>parseOfficialCharacterLink(url,{directory:[...rows,{...rows[0],region:'eu'}]}));
 assert.throws(()=>parseOfficialCharacterLink(url+'&region=eu',{directory:rows}));
});
test('selected server filters outgoing search and never returns another server',async()=>{
 let request;
 const c=new ArmoryClient({minInterval:0,transport:async u=>{
  request=new URL(u);return {status:200,body:{list:[{characterId:'fixture%3D',name:'Fixture',serverId:1101},{characterId:'other%3D',name:'Fixture',serverId:2101}]}};
 }});
 const result=await c.search('Fixture','nae',{serverId:'1101'});
 assert.equal(request.searchParams.get('serverId'),'1101');assert.equal(result.rows.length,1);assert.deepEqual(result.rows[0].key,key);
 await assert.rejects(()=>c.search('Fixture','nae',{serverId:'0'}));
});
test('same-origin directory transport permits only the exact official roster route and query',()=>{
 const official='https://aion2.plaync.com/en-us/api/gameinfo/servers?region=nae&lang=en-US';
 assert.equal(armoryRequestTarget(official,{mode:'same-origin',moduleUrl:'http://127.0.0.1:8787/aion2/scripts/armory-engine.mjs'}),'http://127.0.0.1:8787/aion2/armory-api/servers?region=nae&lang=en-US');
 const resolved=resolveBrokerRequest('/aion2/armory-api/servers?region=nae&lang=en-US');
 assert.equal(resolved.origin,'https://aion2.plaync.com');assert.equal(resolved.pathname,'/en-us/api/gameinfo/servers');assert.equal(resolved.searchParams.get('region'),'nae');
 assert.throws(()=>resolveBrokerRequest('/aion2/armory-api/servers?region=nae&lang=en-US&characterId=fixture'));
 assert.throws(()=>resolveBrokerRequest('/aion2/armory-api/servers?region=kr&lang=en-US'));
});
function snapshot(t,cp=1000,crit=35){
 const s=normalizeArmory(key,{profile:{characterId:'fixture=',serverId:1101,characterName:'Fixture',characterLevel:45,combatPower:cp},stat:{statList:[{type:'ItemLevel',value:2800},{name:'Attack',value:1000},{name:'Critical Hit',value:crit}]},daevanion:{boardList:[{id:5,name:'Board',openNodeCount:1}]}},{equipment:{equipmentList:[{id:100,slotPos:1,slotPosName:'MainHand',name:'Orb',grade:'Epic',enchantLevel:5,exceedLevel:0}]},skill:{skillList:[{id:2,name:'Skill',skillLevel:10}]}},t);
 s.equipment[0].detail={id:100,level:108,name:'Orb',grade:'Epic',subStats:[{id:'Critical',name:'Critical Hit',value:String(crit)}]};s.equipment[0].detailCheckedAt=t;
 s.boards[0].detail={boardId:5,nodeList:[{nodeId:1,type:'Stat',open:false,name:'New node'}]};s.boards[0].detailCheckedAt=t;
 return s;
}
test('same-character refresh records observed CP and stat changes, not a causal DPS formula',()=>{
 const before=snapshot(now-60000),after=snapshot(now,1050,40);
 const pair=compareProgressObservations(before,after,now);
 assert.equal(pair.from,now-60000);assert.equal(pair.to,now);
 assert.deepEqual(pair.combatPower,{before:1000,after:1050});assert.deepEqual(pair.stats.crit,{before:35,after:40});
 assert.deepEqual(pair.changedSlots,[1]);assert.equal(pair.patchMatch,null);assert.equal(pair.observational,true);
 assert.equal(compareProgressObservations(before,snapshot(now),now),null);
 const wrong=snapshot(now,1050,40);wrong.key={...key,characterId:'other='};assert.equal(compareProgressObservations(before,wrong,now),null);
 const partial=snapshot(now,1050,40);partial.equipment[0].detail=null;assert.equal(compareProgressObservations(before,partial,now),null);
 const stale=snapshot(now,1050,40);stale.equipment[0].detailCheckedAt=now-360000;assert.equal(compareProgressObservations(before,stale,now),null);
});
test('history is scoped, bounded, deduplicated and rejects invalid timestamps',()=>{
 let history=null;
 for(let i=0;i<25;i++){
  const before=snapshot(now-50000+i*1000,1000+i,35),after=snapshot(now-49000+i*1000,1001+i,35);
  history=appendProgressHistory(history,before,after,now);
 }
 assert.equal(history.changes.length,20);
 const copy=appendProgressHistory(history,snapshot(now-26000,1024,35),snapshot(now-25000,1025,35),now);
 assert.equal(copy.changes.length,20);assert.deepEqual(copy,history);
 assert.throws(()=>normalizeProgressHistory(history,{...key,characterId:'other='},now));
 const bad=structuredClone(history);bad.changes[0].to=now+1;assert.throws(()=>normalizeProgressHistory(bad,key,now));
});

test('observed progress does not confuse enhancement and breakthrough when their values exchange',()=>{
 const a=snapshot(now-1000),b=snapshot(now);
 a.equipment[0].enchantLevel=5;a.equipment[0].exceedLevel=1;
 b.equipment[0].enchantLevel=1;b.equipment[0].exceedLevel=5;
 const result=compareProgressObservations(a,b,now);
 assert.deepEqual(result.changedSlots,[1]);
});

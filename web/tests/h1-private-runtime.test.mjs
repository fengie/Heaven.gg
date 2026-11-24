import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {stageRelease, verifyRelease, openHost, readSourceTree} from '../private-host.mjs';

const repo=process.cwd();
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
 const server=createServer();
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 const port=server.address().port;
 await new Promise(r=>server.close(r));
 return port;
}
async function temp(t,cleanup=true){
 const root=await mkdtemp(join(tmpdir(),'heaven-gg-private-'));
 if(cleanup)t.after(()=>rm(root,{recursive:true,force:true}));
 return root;
}
test('stages a real immutable Git source and exact-revision site, rejects altered release bytes',async t=>{
 const root=await temp(t);
 const release=await stageRelease({repoRoot:repo,stateRoot:root,revision});
 assert.equal((await verifyRelease(release,revision)).revision,revision);
 assert.equal(JSON.parse(await readFile(join(release,'dist','version.json'),'utf8')).revision,revision);
 assert.match(await readFile(join(release,'dist','aion2','intelligence.html'),'utf8'),/intelligence/i);
 assert.equal(await stageRelease({repoRoot:repo,stateRoot:root,revision}),release);
 await writeFile(join(release,'dist','version.json'),'{}');
 await assert.rejects(verifyRelease(release,revision),/RELEASE_INTEGRITY/);
 await assert.rejects(stageRelease({repoRoot:repo,stateRoot:root,revision}),/RELEASE_INTEGRITY/);
});
test('source tree rejects links, unsafe paths, bad modes and excessive blobs before materializing',()=>{
 const sha='a'.repeat(40);
 for(const entry of [
  '120000 blob '+sha+' 4\tweb/link',
  '100644 blob '+sha+' 4\tweb/../x',
  '100644 blob '+sha+' 4\tweb/CON',
  '100644 blob '+sha+' 999999999\tweb/x',
  '100644 blob '+sha+' 4\tweb/x\0'+'100644 blob '+sha+' 4\tweb/X'
 ])assert.throws(()=>readSourceTree(entry+'\0'),/SOURCE_TREE/);
});
test('real private service starts, observes exact SHA, stays idempotent and respects a durable stop',async t=>{
 const root=await temp(t,false),port=await freePort();
 const host=await openHost({repoRoot:repo,stateRoot:root,port});
 t.after(async()=>{try{await host.stop();}finally{await rm(root,{recursive:true,force:true});}});
 const first=await host.apply(revision);
 assert.equal(first.status,'DEPLOYED');
 assert.equal(first.installed_sha,revision);
 assert.equal((await host.status()).status,'verified');
 assert.equal((await host.apply(revision)).status,'CURRENT');
 const version=await fetch('http://127.0.0.1:'+port+'/version.json');
 assert.equal((await version.json()).revision,revision);
 const page=await fetch('http://127.0.0.1:'+port+'/aion2/intelligence.html');
 assert.equal(page.status,200);
 const denied=await fetch('http://127.0.0.1:'+port+'/__heavengg/stop',{method:'POST'});
 assert.equal(denied.status,403);
 const disabled=await fetch('http://127.0.0.1:'+port+'/aion2/armory-api/servers?region=nae&lang=en-US');
 assert.equal(disabled.status,503);
 assert.equal((await host.stop()).status,'STOPPED');
 assert.equal((await host.apply(revision)).status,'DISABLED');
 assert.equal((await host.status()).status,'disabled');
});
test('foreign loopback listener is never stopped or replaced',async t=>{
 const root=await temp(t);
 const listener=createHttpServer((req,res)=>res.writeHead(200,{'Connection':'close'}).end('foreign'));
 await new Promise((r,j)=>{listener.once('error',j);listener.listen(0,'127.0.0.1',r);});
 t.after(()=>new Promise((r,j)=>{listener.close(e=>e?j(e):r());listener.closeAllConnections();}));
 const host=await openHost({repoRoot:repo,stateRoot:root,port:listener.address().port});
 await assert.rejects(host.apply(revision),/FOREIGN_OR_UNKNOWN_LISTENER/);
 assert.equal(listener.listening,true);
 assert.equal(await (await fetch('http://127.0.0.1:'+listener.address().port)).text(),'foreign');
});
test('interrupted handoff fails closed instead of launching another listener',async t=>{
 const root=await temp(t),host=await openHost({repoRoot:repo,stateRoot:root,port:await freePort()});
 await writeFile(join(root,'pending.json'),'{}');
 await assert.rejects(host.apply(revision),/PENDING_HANDOFF/);
});

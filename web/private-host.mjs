// Product-specific private H1 release adapter. No remote shell, public port,
// scheduled task, dependency installation, or game-provider call.
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {lstat,mkdir,mkdtemp,readFile,readdir,realpath,rename,rm,unlink,writeFile,open} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
import {hostname} from 'node:os';
import {fileURLToPath} from 'node:url';

const REPO='fengie/Heaven.gg';
const OWNER='heaven.gg/private-host/v1';
const SHA=/^[a-f0-9]{40}$/;
const FIXED_DATA=['data/reference/codex_published_build_catalog.json','data/reference/raid_boss_resistances_2026_10_08.json','data/catalog/priority_gear_lookup.json','data/gaming/game-registry.json'];
const SOURCE=['web','apps/aion2-value-atlas',...FIXED_DATA];
const MAX_BYTES=64*1024*1024;
const MAX_FILES=2048;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fail=code=>{throw Error(code);};
const digest=b=>createHash('sha256').update(b).digest('hex');
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
function safeRelative(p){
 return typeof p==='string'&&p.length<=240&&p.split('/').every(x=>/^[A-Za-z0-9_.-]+$/.test(x)&&x!=='.'&&x!=='..'&&!x.endsWith('.')&&x.toLowerCase()!=='.git'&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x));
}
const sourcePath=p=>p.startsWith('web/')||p.startsWith('apps/aion2-value-atlas/')||FIXED_DATA.includes(p);
function childEnv(extra={}){
 const env={};
 for(const [k,v] of Object.entries(process.env))if(/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA)$/i.test(k))env[k]=v;
 return {...env,...extra};
}
function git(root,args,encoding){
 return execFileSync('git',['--no-replace-objects','-C',root,...args],{env:childEnv(),encoding,windowsHide:true,timeout:20000,maxBuffer:MAX_BYTES,stdio:['ignore','pipe','pipe']});
}
export function readSourceTree(raw){
 const rows=[],paths=new Map();let total=0;
 for(const line of raw.split('\0')){
  if(!line)continue;
  const m=/^(100644|100755) blob ([a-f0-9]{40}) +(\d+)\t(.+)$/.exec(line);
  if(!m||!safeRelative(m[4])||!sourcePath(m[4]))fail('SOURCE_TREE_INVALID');
  const size=Number(m[3]),path=m[4];
  if(!Number.isSafeInteger(size)||size<0||size>16*1024*1024)fail('SOURCE_TREE_LIMIT');
  for(let i=1;i<=path.split('/').length;i++){
   const prefix=path.split('/').slice(0,i).join('/'),lower=prefix.toLowerCase();
   if(paths.has(lower)&&paths.get(lower)!==prefix)fail('SOURCE_TREE_COLLISION');
   paths.set(lower,prefix);
  }
  if(rows.some(x=>x.path===path))fail('SOURCE_TREE_COLLISION');
  rows.push({path,sha:m[2],size});total+=size;
  if(rows.length>MAX_FILES||total>MAX_BYTES)fail('SOURCE_TREE_LIMIT');
 }
 if(!rows.length)fail('SOURCE_TREE_EMPTY');
 return rows;
}
async function exists(path){
 try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function checkedDirectory(path){
 const info=await lstat(path);
 if(!info.isDirectory()||info.isSymbolicLink()||!samePath(await realpath(path),resolve(path)))fail('STATE_DIRECTORY_UNSAFE');
}
async function ensureDirectory(path){
 if(!await exists(path))try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 await checkedDirectory(path);
}
async function smallJson(path,limit=1024*1024){
 const s=await exists(path);
 if(!s)return null;
 if(!s.isFile()||s.isSymbolicLink()||s.size>limit)fail('STATE_FILE_UNSAFE');
 return JSON.parse(await readFile(path,'utf8'));
}
async function put(path,value){
 const temp=path+'.'+randomBytes(12).toString('hex')+'.tmp';
 try{await writeFile(temp,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});await rename(temp,path);}
 finally{if(await exists(temp))await unlink(temp);}
}
async function removeFile(path){
 const info=await exists(path);
 if(info){if(!info.isFile()||info.isSymbolicLink())fail('STATE_FILE_UNSAFE');await unlink(path);}
}
async function ownedRoot(root){
 root=resolve(root);await ensureDirectory(root);
 const marker=join(root,'owner.json');
 if(!await exists(marker)){
  if((await readdir(root)).length)fail('FOREIGN_STATE_DIRECTORY');
  await writeFile(marker,JSON.stringify({schema:OWNER,repository:REPO})+'\n',{flag:'wx',mode:0o600});
 }
 const owner=await smallJson(marker);
 if(owner?.schema!==OWNER||owner.repository!==REPO)fail('FOREIGN_STATE_DIRECTORY');
 return root;
}
async function inventory(root){
 const rows=[];let bytes=0;
 async function walk(dir,prefix=''){
  await checkedDirectory(dir);
  for(const e of await readdir(dir,{withFileTypes:true})){
   const path=prefix+e.name;
   if(!prefix&&e.name==='release.json')continue;
   if(!safeRelative(path))fail('RELEASE_INTEGRITY');
   const absolute=join(dir,e.name),s=await lstat(absolute);
   if(s.isSymbolicLink())fail('RELEASE_INTEGRITY');
   if(s.isDirectory()){await walk(absolute,path+'/');continue;}
   if(!s.isFile()||s.size>16*1024*1024)fail('RELEASE_INTEGRITY');
   bytes+=s.size;
   if(rows.length>=MAX_FILES||bytes>MAX_BYTES)fail('RELEASE_INTEGRITY');
   rows.push({path,size:s.size,sha256:digest(await readFile(absolute))});
  }
 }
 await walk(root);
 return rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export async function verifyRelease(release,revision){
 if(!SHA.test(revision??''))fail('RELEASE_INTEGRITY');
 await checkedDirectory(release);
 const m=await smallJson(join(release,'release.json'));
 if(m?.schema!==OWNER||m.repository!==REPO||m.revision!==revision||!Array.isArray(m.files))fail('RELEASE_INTEGRITY');
 const actual=await inventory(release);
 if(JSON.stringify(m.files)!==JSON.stringify(actual))fail('RELEASE_INTEGRITY');
 const ver=await smallJson(join(release,'dist','version.json'));
 if(ver?.repository!==REPO||ver.revision!==revision||!actual.some(x=>x.path==='dist/aion2/intelligence.html'))fail('RELEASE_INTEGRITY');
 return m;
}
export async function stageRelease({repoRoot,stateRoot,revision}){
 if(!SHA.test(revision??''))fail('SOURCE_REVISION_INVALID');
 const root=await ownedRoot(stateRoot),releases=join(root,'releases');
 await ensureDirectory(releases);
 const release=join(releases,revision);
 const rows=readSourceTree(git(repoRoot,['ls-tree','-r','-l','-z',revision,'--',...SOURCE],'utf8'));
 function verifyBlob(row,bytes){
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(bytes.length!==row.size||hash!==row.sha)fail('SOURCE_BLOB_MISMATCH');
 }
 if(await exists(release)){
  await verifyRelease(release,revision);
  for(const row of rows)verifyBlob(row,await readFile(join(release,...row.path.split('/'))));
  return release;
 }
 // No archive extraction, mutable checkout copying, hooks, or dependency installation.
 const stage=await mkdtemp(join(root,'.stage-'));
 try{
  for(const row of rows){
   const content=git(repoRoot,['cat-file','blob',row.sha]);
   verifyBlob(row,content);
   const file=join(stage,...row.path.split('/'));
   await mkdir(dirname(file),{recursive:true});
   await writeFile(file,content,{flag:'wx'});
  }
  try{execFileSync(process.execPath,[join(stage,'web','build.mjs')],{cwd:stage,env:childEnv({GITHUB_SHA:revision}),windowsHide:true,timeout:60000,stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});}
  catch{fail('STAGED_BUILD_FAILED');}
  const files=await inventory(stage);
  await writeFile(join(stage,'release.json'),JSON.stringify({schema:OWNER,repository:REPO,revision,files}),{flag:'wx',mode:0o600});
  await verifyRelease(stage,revision);
  await rename(stage,release);
  await verifyRelease(release,revision);
  return release;
 }finally{if(await exists(stage))await rm(stage,{recursive:true,force:true});}
}
function record(revision,port){
 return {schema:OWNER,revision,port,instance:randomBytes(16).toString('hex'),token:randomBytes(32).toString('hex')};
}
function validRecord(r,port){
 return r?.schema===OWNER&&SHA.test(r.revision??'')&&r.port===port&&/^[a-f0-9]{32}$/.test(r.instance??'')&&/^[a-f0-9]{64}$/.test(r.token??'');
}
async function limited(response,max){
 const length=response.headers.get('content-length');
 if(length!==null&&Number(length)>max)fail('FOREIGN_OR_UNKNOWN_LISTENER');
 const reader=response.body?.getReader();
 if(!reader)fail('FOREIGN_OR_UNKNOWN_LISTENER');
 const parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)fail('FOREIGN_OR_UNKNOWN_LISTENER');parts.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(parts,size);
}
async function get(port,path,options={}){
 try{return await fetch('http://127.0.0.1:'+port+path,{...options,redirect:'error',signal:AbortSignal.timeout(1800),cache:'no-store'});}
 catch(e){if(e.cause?.code==='ECONNREFUSED')return null;fail('FOREIGN_OR_UNKNOWN_LISTENER');}
}
async function observe(port,r,release){
 const response=await get(port,'/__heavengg/status');
 if(!response)return null;
 if(!r||response.status!==200){await response.body?.cancel().catch(()=>{});fail('FOREIGN_OR_UNKNOWN_LISTENER');}
 let status;
 try{status=JSON.parse(await limited(response,8192));}catch{fail('FOREIGN_OR_UNKNOWN_LISTENER');}
 if(status.schema!=='heaven.gg/private-runtime/v1'||status.instance!==r.instance||status.revision!==r.revision||status.upstreamEnabled!==false)fail('FOREIGN_OR_UNKNOWN_LISTENER');
 const manifest=await verifyRelease(release,r.revision);
 for(const path of ['version.json','aion2/intelligence.html','index.html']){
  const expected=manifest.files.find(x=>x.path==='dist/'+path);
  const reply=await get(port,'/'+path);
  if(!expected||reply?.status!==200||digest(await limited(reply,16*1024*1024))!==expected.sha256)fail('SERVED_RELEASE_MISMATCH');
 }
 return {schema:OWNER,status:'verified',source_sha:r.revision,installed_sha:r.revision,url:'http://127.0.0.1:'+port,observed_at:new Date().toISOString(),upstream_enabled:false};
}
async function stopOwned(port,r,release){
 if(!await observe(port,r,release))return;
 const response=await get(port,'/__heavengg/stop',{method:'POST',headers:{Authorization:'Bearer '+r.token}});
 if(response?.status!==202)fail('OWNED_STOP_UNVERIFIED');
 await response.body?.cancel().catch(()=>{});
 for(let i=0;i<25;i++){
  const health=await get(port,'/__heavengg/status');
  if(!health)return;
  await health.body?.cancel().catch(()=>{});
  await sleep(200);
 }
 fail('OWNED_STOP_UNVERIFIED');
}
async function startOwned(port,r,release){
 await verifyRelease(release,r.revision);
 if(await observe(port,null,release))fail('FOREIGN_OR_UNKNOWN_LISTENER');
 const child=spawn(process.execPath,[join(release,'web','serve-intelligence.mjs')],{cwd:release,env:childEnv({HEAVEN_INTELLIGENCE_PORT:String(port),HEAVEN_GG_MANAGED_INSTANCE:r.instance,HEAVEN_GG_MANAGED_TOKEN:r.token,HEAVEN_GG_EXPECTED_REVISION:r.revision}),detached:true,windowsHide:true,stdio:'ignore'});
 let error=false;child.once('error',()=>{error=true;});
 try{
  for(let i=0;i<30;i++){
   if(error||child.exitCode!==null||child.signalCode!==null)break;
   const proof=await observe(port,r,release);
   if(proof){child.unref();return proof;}
   await sleep(200);
  }
  fail('CANDIDATE_NOT_READY');
 }catch{
  // Only this invocation's newly spawned process may be terminated.
  if(child.pid&&child.exitCode===null&&child.signalCode===null){
   child.kill();
   for(let i=0;i<25&&child.exitCode===null&&child.signalCode===null;i++)await sleep(100);
   if(child.exitCode===null&&child.signalCode===null)fail('CANDIDATE_EXIT_UNVERIFIED');
  }
  fail('CANDIDATE_NOT_READY');
 }
}
export async function openHost({repoRoot,stateRoot,port=8787,admit=async()=>{}}){
 if(!Number.isInteger(port)||port<1024||port>65535)fail('PORT_INVALID');
 const root=await ownedRoot(stateRoot);
 const file=n=>join(root,n),release=r=>join(root,'releases',r.revision);
 const active=async()=>{const r=await smallJson(file('active.json'));if(r&&!validRecord(r,port))fail('ACTIVE_RECORD_INVALID');return r;};
 const pending=async()=>{if(await exists(file('pending.json')))fail('PENDING_HANDOFF');};
 const disabled=async()=>Boolean(await exists(file('disabled.json')));
 const lock=async fn=>{
  let handle;try{handle=await open(file('deploy.lock'),'wx',0o600);}catch{fail('DEPLOY_LOCK_HOLD');}
  try{return await fn();}finally{await handle.close();await unlink(file('deploy.lock'));}
 };
 const markFailure=revision=>put(file('failed.json'),{schema:OWNER,revision});
 async function prune(keep){
  const dir=file('releases');
  for(const name of await readdir(dir)){
   if(!SHA.test(name)||keep.has(name))continue;
   const candidate=join(dir,name);
   try{await verifyRelease(candidate,name);}catch{continue;} // retain unknown/tampered state
   await rm(candidate,{recursive:true,force:false});
  }
 }
 async function applyLocked(revision,explicit=false){
  if(!SHA.test(revision??''))fail('SOURCE_REVISION_INVALID');
  await pending();
  if(explicit){await removeFile(file('disabled.json'));await removeFile(file('failed.json'));}
  if(await disabled())return {status:'DISABLED'};
  const old=await active(),oldProof=await observe(port,old,old&&release(old));
  if(oldProof&&old.revision===revision)return {...oldProof,status:'CURRENT'};
  const failed=await smallJson(file('failed.json'));
  if(failed?.revision===revision)fail('PREVIOUS_ATTEMPT_HOLD');
  let candidateRelease;
  try{await admit(revision);candidateRelease=await stageRelease({repoRoot,stateRoot:root,revision});}
  catch(e){await markFailure(revision);throw e;}
  const next=record(revision,port);
  await put(file('pending.json'),{schema:OWNER,previous:old,candidate:next});
  // If stop is uncertain, the pending record survives and no subsequent attempt is automatic.
  if(oldProof)await stopOwned(port,old,release(old));
  let proof;
  try{proof=await startOwned(port,next,candidateRelease);}
  catch(e){
   if(e.message==='CANDIDATE_EXIT_UNVERIFIED')throw e;
   // A foreign listener or unknown result is never stopped or overwritten.
   await observe(port,null,null);
   await markFailure(revision);
   if(oldProof){
    const rollback=record(old.revision,port);
    await put(file('pending.json'),{schema:OWNER,previous:old,candidate:rollback});
    await startOwned(port,rollback,release(old));
    await put(file('active.json'),rollback);
   }
   await removeFile(file('pending.json'));
   fail(oldProof?'CANDIDATE_ROLLED_BACK':'CANDIDATE_NOT_READY');
  }
  await put(file('active.json'),next);
  await removeFile(file('pending.json'));
  await removeFile(file('failed.json'));
  await prune(new Set([revision,old?.revision]));
  return {...proof,status:'DEPLOYED'};
 }
 return {
  apply:revision=>lock(()=>applyLocked(revision)),
  start:revision=>lock(()=>applyLocked(revision,true)),
  status:()=>lock(async()=>{
   await pending();
   const r=await active(),proof=await observe(port,r,r&&release(r));
   if(await disabled())return {schema:OWNER,status:proof?'stop-pending':'disabled'};
   return proof??{schema:OWNER,status:'not-running'};
  }),
  stop:()=>lock(async()=>{
   await pending();await put(file('disabled.json'),{schema:OWNER});
   const r=await active();
   if(r)await stopOwned(port,r,release(r));else await observe(port,null,null);
   return {status:'STOPPED'};
  })
 };
}
function localSource(repoRoot){
 const read=(...a)=>git(repoRoot,a,'utf8').trim();
 if(!samePath(resolve(read('rev-parse','--show-toplevel')),resolve(repoRoot)))fail('SOURCE_ROOT_INVALID');
 if(!['https://github.com/'+REPO,'https://github.com/'+REPO+'.git','git@github.com:'+REPO+'.git','ssh://git@github.com/'+REPO+'.git'].some(x=>x.toLowerCase()===read('remote','get-url','origin').toLowerCase()))fail('SOURCE_ORIGIN_INVALID');
 const revision=read('rev-parse','HEAD');
 if(read('branch','--show-current')!=='main'||read('status','--porcelain','--untracked-files=normal')||!SHA.test(revision))fail('SOURCE_NOT_CLEAN_MAIN');
 return revision;
}
async function published(repoRoot,revision){
 if(localSource(repoRoot)!==revision)fail('SOURCE_MAIN_CHANGED');
 const remote=git(repoRoot,['ls-remote','--exit-code','origin','refs/heads/main'],'utf8').trim().split(/\s+/);
 if(remote[0]!==revision||remote[1]!=='refs/heads/main')fail('SOURCE_MAIN_CHANGED');
 const response=await fetch('https://api.github.com/repos/'+REPO+'/commits/'+revision,{headers:{Accept:'application/vnd.github+json','User-Agent':'HeavenGg-PrivateUpdater'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(response.status!==200){await response.body?.cancel().catch(()=>{});fail('PUBLISHER_UNVERIFIED');}
 const result=JSON.parse(await limited(response,2*1024*1024));
 if(result.sha!==revision||result.commit?.verification?.verified!==true)fail('PUBLISHER_UNVERIFIED');
}
async function main(){
 if(process.platform!=='win32'||hostname().toUpperCase()!=='HEAVEN'||!process.env.LOCALAPPDATA)fail('HEAVEN1_REQUIRED');
 const [mode,repoRoot,expected]=process.argv.slice(2);
 if(!['Apply','Start','Stop','Status'].includes(mode)||!repoRoot)fail('INVALID_OPERATION');
 const host=await openHost({repoRoot,stateRoot:join(process.env.LOCALAPPDATA,'HeavenGg'),admit:sha=>published(repoRoot,sha)});
 let result;
 if(mode==='Stop')result=await host.stop();
 else if(mode==='Status')result=await host.status();
 else{
  const revision=localSource(repoRoot);
  if(expected&&expected!==revision)fail('SOURCE_MAIN_CHANGED');
  result=await host[mode.toLowerCase()](revision);
 }
 console.log(JSON.stringify({...result,host:'HEAVEN'}));
}
if(process.argv[1]&&samePath(resolve(process.argv[1]),fileURLToPath(import.meta.url))){
 main().catch(e=>{console.error(/^[A-Z][A-Z0-9_]{2,79}$/.test(e?.message??'')?e.message:'PRIVATE_RUNTIME_HOLD');process.exitCode=1;});
}

// Explicit local preview only. Build the existing static site first.
// Enabling the armory broker requires the operator to confirm permission for these public reads.
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFile,stat,realpath} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createArmoryHandler} from './armory-broker.mjs';
const root=await realpath(resolve(dirname(fileURLToPath(import.meta.url)),'../dist'));
const port=Number(process.env.HEAVEN_INTELLIGENCE_PORT??8787);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
const origin='http://127.0.0.1:'+port;
const enabled=process.env.HEAVEN_ARMORY_UPSTREAM==='allowed';
const broker=createArmoryHandler({enabled,origin});
const instance=process.env.HEAVEN_GG_MANAGED_INSTANCE;
const token=process.env.HEAVEN_GG_MANAGED_TOKEN;
const managed=instance!==undefined||token!==undefined;
let revision;
if(managed){
 if(!/^[a-f0-9]{32}$/.test(instance??'')||!/^[a-f0-9]{64}$/.test(token??'')||enabled)throw Error('Invalid managed local runtime');
 const version=JSON.parse(await readFile(resolve(root,'version.json'),'utf8'));
 revision=version.revision;
 if(version.repository!=='fengie/Heaven.gg'||!(/^[a-f0-9]{40}$/.test(revision??''))||revision!==process.env.HEAVEN_GG_EXPECTED_REVISION)throw Error('Managed release revision mismatch');
}
function managementAuthorized(req){
 const value=Buffer.from(req.headers.authorization??'');
 const expected=Buffer.from('Bearer '+token);
 return !req.headers.origin&&value.length===expected.length&&timingSafeEqual(value,expected);
}
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
await stat(resolve(root,'aion2/intelligence.html'));
const server=createServer(async(req,res)=>{
 if(req.headers.host!=='127.0.0.1:'+port)return res.writeHead(403).end();
 if(req.url==='/__heavengg/status'&&req.method==='GET'&&managed){
  return res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify({schema:'heaven.gg/private-runtime/v1',instance,revision,upstreamEnabled:false}));
 }
 if(req.url==='/__heavengg/stop'&&managed){
  if(req.method!=='POST'||!managementAuthorized(req)||req.headers['transfer-encoding']||Number(req.headers['content-length']??0)!==0)return res.writeHead(403).end();
  return res.writeHead(202,{'Cache-Control':'no-store'}).end(()=>server.close());
 }
 if(req.url?.startsWith('/aion2/armory-api/'))return broker(req,res);
 if(req.method!=='GET')return res.writeHead(405,{Allow:'GET'}).end();
 try{
  const path=new URL(req.url,origin).pathname;
  const relative=path==='/'?'index.html':path.slice(1);
  if(!/^[A-Za-z0-9._/-]+$/.test(relative)||relative.split('/').some(x=>x==='..'||x==='.'||!x))return res.writeHead(400).end();
  const file=resolve(root,relative);
  if(!file.startsWith(root+sep)||!Object.hasOwn(MIME,extname(file)))return res.writeHead(404).end();
  const actual=await realpath(file);if(!actual.startsWith(root+sep))return res.writeHead(404).end();
  const meta=await stat(actual);
  if(!meta.isFile()||meta.size>10_000_000)return res.writeHead(404).end();
  let body=await readFile(actual);
  if(enabled&&relative==='aion2/intelligence.html'){
   // Same-origin mode is a deployment choice, never a query parameter or arbitrary proxy URL.
   body=body.toString('utf8').replace('</head>','<meta name="heaven-gg-armory-transport" content="same-origin">\n</head>');
  }
  res.writeHead(200,{'Content-Type':MIME[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(body);
 }catch{res.writeHead(404).end();}
});
server.listen(port,'127.0.0.1',()=>console.log('Character Intelligence: '+origin+'/aion2/intelligence.html; public armory broker '+(enabled?'enabled by operator':'disabled')));

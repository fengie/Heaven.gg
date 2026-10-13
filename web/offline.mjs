import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeJson = value => JSON.stringify(value).replaceAll('<','\\u003c');
const script = code => '<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>';
const withoutFonts = text => text.replace(/@import\s+url\((['"])https:\/\/fonts\.googleapis\.com\/[\s\S]*?\1\)\s*;/g,'')
  .replace(/<link\b[^>]*href="https:\/\/fonts\.[^"]*"[^>]*>/g,'');

function bundle(source, dependency, filename) {
  const expected = new RegExp("^import \\{[^}]+\\} from ['\"]\\.\\.?/"+filename.replace('.','\\.')+"['\"];?\\n");
  if (!expected.test(source)) throw new Error('Unexpected browser import contract: '+filename);
  const body = dependency.replace(/^export function /gm,'function ')+'\n'+source.replace(expected,'');
  if (/^\s*(?:import|export)\s/m.test(body)) throw new Error('Unbundled module dependency');
  return script('(function(){"use strict";\n'+body+'\n})();');
}
function localData(resources) {
  return script('(function(){const resources='+safeJson(resources)+';window.fetch=async function(input){const key=String(input).replace(/^\\.\\//, "");if(!Object.hasOwn(resources,key))throw new Error("Not included in offline snapshot: "+key);return new Response(JSON.stringify(resources[key]),{status:200,headers:{"Content-Type":"application/json"}});};})();');
}

/** Make one portable, network-free beta from the exact built static directory.
 * No font files, credentials, backend, service worker or live-price requests.
 * Source links remain ordinary user-activated outbound links.
 */
export async function buildOffline(inputDir, outputFile) {
  const get = path => readFile(resolve(inputDir,path),'utf8');
  const [page,css,site,decision,ward,wardJs,wardModule,shop,chJson,aionJson,versionJson] = await Promise.all([
    'index.html','site.css','site.js','decision.mjs','aion2/wardrobe.html','aion2/wardrobe.js',
    'wardrobe.mjs','aion2/index.html','ch/catalog.json','aion2/catalog.json','version.json'
  ].map(get));
  const version=JSON.parse(versionJson),ch=JSON.parse(chJson),aion=JSON.parse(aionJson);
  if (version.repository !== 'fengie/Heaven.gg' || !Array.isArray(ch.builds) || !Array.isArray(aion.products)) throw new Error('Invalid snapshot inputs');
  const style='<style>'+withoutFonts(css)+'</style>';
  let wardrobe=ward.replace('<link rel="stylesheet" href="../site.css">',()=>style)
    .replace('<script src="./wardrobe.js" type="module"></script>','');
  wardrobe=wardrobe.replace('</body>',()=>localData({'catalog.json':aion})+bundle(wardJs,wardModule,'wardrobe.mjs')+'</body>');
  let html=page.replace('<link rel="stylesheet" href="./site.css">',()=>style)
    .replace('<script src="./site.js" type="module"></script>','');
  const embedded={'aion-frame':withoutFonts(shop),'wardrobe-frame':wardrobe};
  for (const [id,doc] of Object.entries(embedded)) {
    const tag=new RegExp('<iframe\\b[^>]*id="'+id+'"[^>]*>');
    if (!tag.test(html)) throw new Error('Missing embedded tool '+id);
    html=html.replace(tag,match=>match.replace(/\s+src="[^"]*"/,()=> ' srcdoc="'+esc(doc)+'"'));
  }
  html=html.replace('class="brand" href="./"','class="brand" href="#celtic-heroes"')
    .replace('href="./aion2/index.html" target="_blank" rel="noopener noreferrer">Open full-screen ↗',
      'href="#aion2">Shop is embedded below ↓');
  const note='<aside role="note" style="padding:10px 20px;background:#172538;color:#e9f2fa;font:12px system-ui">Offline research beta · source '+esc(version.revision)+' · dated data, not live-game validation.</aside>';
  const manifest='<script type="application/json" id="heaven-offline-manifest">'+safeJson({...version,aionRegion:aion.region,counts:{builds:ch.builds.length,gear:ch.gear.length,bosses:ch.bosses.length}})+'</script>';
  html=html.replace('<body>',()=>'<body>'+note+manifest).replace('</body>',()=>localData({'ch/catalog.json':ch,'version.json':version})+bundle(site,decision,'decision.mjs')+'</body>');
  if (/<script\b[^>]*\bsrc=/.test(html)) throw new Error('Offline script dependency remains');
  await writeFile(outputFile,html,'utf8');
  return {revision:version.revision,builds:ch.builds.length,gear:ch.gear.length,bosses:ch.bosses.length,bytes:Buffer.byteLength(html)};
}
const self=fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1])===self) {
  const root=resolve(dirname(self),'..'),input=resolve(root,process.argv[2]||'dist');
  const output=resolve(root,process.argv[3]||'dist/Heaven.gg-Research-Beta.html');
  buildOffline(input,output).then(x=>console.log('HEAVEN_GG_OFFLINE_OK',JSON.stringify(x))).catch(e=>{console.error(e);process.exitCode=1;});
}

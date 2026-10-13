import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Script} from 'node:vm';
import {buildOffline} from '../offline.mjs';

async function fixture() {
  const dir=await mkdtemp(join(tmpdir(),'heaven-offline-'));
  await mkdir(join(dir,'aion2'));await mkdir(join(dir,'ch'));
  for(const name of ['index.html','site.css','site.js','decision.mjs','wardrobe.mjs']) await copyFile(new URL('../'+name,import.meta.url),join(dir,name));
  for(const name of ['wardrobe.html','wardrobe.js']) await copyFile(new URL('../'+name,import.meta.url),join(dir,'aion2',name));
  await writeFile(join(dir,'aion2/index.html'),'<!doctype html><html><body>Fixture atlas</body></html>');
  await writeFile(join(dir,'ch/catalog.json'),JSON.stringify({builds:[],gear:[],bosses:[]}));
  await writeFile(join(dir,'aion2/catalog.json'),JSON.stringify({products:[],packs:[],sources:[],as_of:'2026-10-09',region:'fixture'}));
  await writeFile(join(dir,'version.json'),JSON.stringify({repository:'fengie/Heaven.gg',revision:'a'.repeat(40)}));
  return dir;
}
test('offline artifact is deterministic, embeds both tools and preserves JavaScript dollar sequences',async()=>{
 const dir=await fixture();
 try{
  const sentinel="// replacement sentinels: $$ $& $' $`";
  await writeFile(join(dir,'site.js'),await readFile(join(dir,'site.js'),'utf8')+'\n'+sentinel+'\n');
  await buildOffline(dir,join(dir,'one.html'));await buildOffline(dir,join(dir,'two.html'));
  const html=await readFile(join(dir,'one.html'),'utf8');
  assert.equal(html,await readFile(join(dir,'two.html'),'utf8'));
  assert(html.includes(sentinel));assert(html.includes('const $$ ='));
  assert(html.includes('srcdoc='));assert(html.includes('heaven-offline-manifest'));
  assert(!/<script\b[^>]*\bsrc=/.test(html));assert(!html.includes('@import url('));
  for(const [,code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(code);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('catalog text cannot break out of the offline data script',async()=>{
 const dir=await fixture();
 try{
  await writeFile(join(dir,'ch/catalog.json'),JSON.stringify({builds:[{name:'</script><img data-offline-escape onerror=alert(1)>'}],gear:[],bosses:[]}));
  await buildOffline(dir,join(dir,'one.html'));const html=await readFile(join(dir,'one.html'),'utf8');
  assert(!html.includes('<img data-offline-escape'));
  assert(html.includes('\\u003c/script>'));
  for(const [,code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(code);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('unknown module dependencies fail without replacing an existing artifact',async()=>{
 const dir=await fixture();
 try{
  const out=join(dir,'one.html');await writeFile(out,'known-good');
  await writeFile(join(dir,'site.js'),await readFile(join(dir,'site.js'),'utf8')+'\nimport x from "./unreviewed.mjs";\n');
  await assert.rejects(buildOffline(dir,out),/Unbundled/);
  assert.equal(await readFile(out,'utf8'),'known-good');
 }finally{await rm(dir,{recursive:true,force:true});}
});

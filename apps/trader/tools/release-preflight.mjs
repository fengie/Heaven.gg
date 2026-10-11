// Physical Heaven1, source-byte readback only. This is NOT a production signer or deployer.
// Requires an independently admitted exact release and a protected host-side invocation.
import { hostname } from 'node:os';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const expected=process.env.TRADER_EXPECT_RELEASE_SHA||'';
const origin=process.env.TRADER_PUBLIC_ORIGIN||'';
const files=[
  'apps/trader/server.mjs','apps/trader/app.js','apps/trader/index.html',
  'apps/trader/style.css','apps/trader/tests/live-smoke.mjs',
  'apps/trader/tests/restart.test.mjs',
  'data/game/item_names.tsv'
];
function fail(message) {
  console.error('TRADER_RELEASE_HOLD: '+message);
  process.exitCode=1;
}
function git(...args) {
  return execFileSync('git',['-C',root,...args],{
    encoding:'utf8',timeout:12000,maxBuffer:2*1024*1024,windowsHide:true,
    stdio:['ignore','pipe','pipe']
  }).trim();
}
try {
  if(hostname().toLowerCase()!=='heaven') throw Error('Physical host must be heaven (Heaven1). No Heaven2 fallback.');
  if(!/^[a-f0-9]{40}$/.test(expected)) throw Error('TRADER_EXPECT_RELEASE_SHA must name the signed/admitted 40-hex candidate');
  const url=new URL(origin);
  if(origin!==url.origin||url.protocol!=='https:')throw Error('TRADER_PUBLIC_ORIGIN must be exact HTTPS public origin');
  const installed=git('rev-parse','--verify','HEAD');
  if(installed!==expected)throw Error('Installed git HEAD mismatch: expected '+expected+' got '+installed);
  const dirty=git('status','--porcelain=v1','--untracked-files=no','--','apps/trader','data/game/item_names.tsv');
  if(dirty)throw Error('Tracked Trader or catalog source differs from release commit');
  const hashes={};
  for(const file of files) {
    const onDisk=await readFile(resolve(root,file));
    const committed=execFileSync('git',['-C',root,'show',expected+':'+file],{
      timeout:12000,maxBuffer:8*1024*1024,windowsHide:true,
      stdio:['ignore','pipe','pipe']
    });
    const digest=content=>createHash('sha256').update(content).digest('hex');
    if(digest(onDisk)!==digest(committed))throw Error('Source bytes mismatch: '+file);
    hashes[file]=digest(onDisk);
  }
  // Successful preflight is neither approval, remote service readiness nor runtime attestation.
  console.log(JSON.stringify({
    result:'SOURCE_BYTES_MATCH_PRECHECK_ONLY_NOT_RELEASE_APPROVED',
    host:hostname(),installedCommit:installed,publicOrigin:origin,
    sourceSha256:hashes,checkedAt:new Date().toISOString(),
    limits:'No signed publisher/lease proof, runtime PID attestation, public HTTPS or restart receipt'
  },null,2));
} catch(error) {
  fail(String(error?.message||error));
}
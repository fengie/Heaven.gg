import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('release preflight rejects missing authority/SHA; does not emit success receipt',()=>{
  const file=fileURLToPath(new URL('../tools/release-preflight.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[file],{
    encoding:'utf8',windowsHide:true,timeout:10000,
    env:{...process.env,TRADER_EXPECT_RELEASE_SHA:'',TRADER_PUBLIC_ORIGIN:'https://trader.heaven.gg'}
  });
  assert.notEqual(child.status,0);
  assert.match(child.stderr,/TRADER_RELEASE_HOLD:/);
  assert.doesNotMatch(child.stdout,/SOURCE_BYTES_MATCH_PRECHECK_ONLY/);
});
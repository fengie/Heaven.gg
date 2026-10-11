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
test('Windows physical runtime observer parses and fails closed off Heaven1', {skip:process.platform!=='win32'},()=>{
  const script=fileURLToPath(new URL('../tools/Verify-Heaven1TraderRuntime.ps1',import.meta.url));
  const quoted=script.replaceAll("'","''");
  const parser="$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('"+
    quoted+"',[ref]$tokens,[ref]$errors);if($errors.Count -gt 0){$errors|ForEach-Object{Write-Error $_.Message};exit 4}";
  const parsed=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',parser],{
    encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(parsed.status,0,'PowerShell syntax rejection: '+parsed.stderr);
  const denied=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script,
    '-ExpectedCommit','a'.repeat(40),'-ExpectedPid','12345'],{
    encoding:'utf8',windowsHide:true,timeout:15000});
  assert.notEqual(denied.status,0,'Non-Heaven1 host must never produce a runtime observation');
  assert.match(denied.stderr,/TRADER_RUNTIME_HOLD:/);
  assert.doesNotMatch(denied.stdout,/UNSIGNED_RUNTIME_OBSERVATION_ONLY/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root=process.cwd();
const manifest=JSON.parse(readFileSync(join(root,'data/research/toolbox-game-transfer-2026-10-19.json'),'utf8'));
function gitBlobSha(buffer) {
  return createHash('sha1').update(Buffer.from('blob '+buffer.length+'\0')).update(buffer).digest('hex');
}
test('parent-to-child game utility migration preserves all original blob identities',()=>{
  assert.equal(manifest.schema,'heaven-gg/toolbox-game-transfer/v1');
  assert.equal(manifest.sourceRepository,'fengie/heaven-toolbox');
  assert.equal(manifest.destinationRepository,'fengie/Heaven.gg');
  assert.match(manifest.sourceRevision,/^[0-9a-f]{40}$/);
  assert.equal(manifest.entries.length,12);
  const seen=new Set();
  for(const e of manifest.entries){
    assert.match(e.sourceGitBlob,/^[a-f0-9]{40}$/);
    assert(/^tools\/windows-game-utils\/[A-Za-z][A-Za-z0-9.-]+\.ps1$/.test(e.childPath));
    assert(!seen.has(e.childPath));
    seen.add(e.childPath);
    const bytes=readFileSync(join(root,e.childPath));
    assert.equal(gitBlobSha(bytes),e.sourceGitBlob,'source drift: '+e.childPath);
    assert(!/C:\\Users\\[a-z]/i.test(bytes.toString('utf8')));
    assert(!/github_pat_[A-Za-z0-9_]{20,}/.test(bytes.toString('utf8')));
  }
});
test('manual Windows tooling is source-only and retains isolated native fixtures',()=>{
  const files=['New-HeavenGameShortcuts.ps1','Inspect-HeavenGameCaches.ps1','Invoke-HeavenGameCachePlacement.ps1',
    'Start-HeavenGameCacheTools.ps1','Repair-DesktopShortcutIcons.ps1','Repair-SteamShortcutIcons.ps1',
    'Test-HeavenGameShortcuts.ps1','Test-HeavenGameCachePlacement.ps1','Test-HeavenGameCacheOneClick.ps1',
    'Test-DesktopShortcutIcons.ps1','Test-SteamShortcutIcons.ps1','Cache-Placement.Common.ps1'];
  for(const file of files) assert(existsSync(join(root,'tools/windows-game-utils',file)),file);
  const shortcut=readFileSync(join(root,'tools/windows-game-utils/New-HeavenGameShortcuts.ps1'),'utf8');
  assert.match(shortcut,/ValidateSet\('Preview', 'Create'\)/);
  assert.match(shortcut,/\$Mode = 'Preview'/);
  const cache=readFileSync(join(root,'tools/windows-game-utils/Invoke-HeavenGameCachePlacement.ps1'),'utf8');
  assert.match(cache,/SupportsShouldProcess/);
  assert.equal(existsSync(join(root,'tools/windows-game-utils/Install-HeavenGameCacheTools.ps1')),false);
  const doc=readFileSync(join(root,'docs/TOOLBOX_GAME_TRANSFER_2026_10_19.md'),'utf8');
  assert.match(doc,/not an automated parent-to-child synchronization/i);
  assert.match(doc,/UNVERIFIED/i);
  const workflow=readFileSync(join(root,'.github/workflows/game-utilities.yml'),'utf8');
  for(const word of ['windows-latest','Test-HeavenGameShortcuts.ps1','Test-HeavenGameCachePlacement.ps1','Test-SteamShortcutIcons.ps1'])
    assert(workflow.includes(word),word);
});

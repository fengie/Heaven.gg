import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public Pages release requires explicit manual main dispatch, not ordinary development pushes',async()=>{
 const workflow=(await readFile(new URL('../../.github/workflows/site.yml',import.meta.url),'utf8')).replaceAll('\r\n','\n');
 assert.match(workflow,/\n  workflow_dispatch:\n    inputs:\n      publish_public:\n(?:        [^\n]+\n)*        default: false\n/);
 assert.match(workflow,/\n        type: boolean\n/);
 const gate="github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.publish_public == true";
 const gates=workflow.split('\n').filter(line=>line.trim().startsWith('if:')&&line.includes(gate));
 assert.equal(gates.length,3,'artifact upload, deployment, and served verification require the identical explicit gate');
 const upload=workflow.split('      - name: Upload tested Pages artifact\n')[1]?.split(/\n  [\w-]+:/)[0];
 const deploy=workflow.split('\n  deploy:\n')[1]?.split('\n  verify-served:')[0];
 const served=workflow.split('\n  verify-served:\n')[1];
 for(const block of [upload,deploy,served])assert.ok(block?.includes('if:')&&block.includes(gate),'every publication boundary must be gated');
 assert.match(workflow,/Exercise actual Chrome desktop and mobile interactions/);
 assert.match(workflow,/node web\/verify-deployment\.mjs/);
});

test('private preview remains bound to loopback with broker opt-in',async()=>{
 const source=await readFile(new URL('../serve-intelligence.mjs',import.meta.url),'utf8');
 assert.match(source,/server\.listen\(port,'127\.0\.0\.1'/);
 assert.match(source,/process\.env\.HEAVEN_ARMORY_UPSTREAM==='allowed'/);
 assert.match(source,/createArmoryHandler\(\{enabled,origin\}\)/);
});

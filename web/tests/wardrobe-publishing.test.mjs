import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from '../build.mjs';

const root = process.cwd();

test('WEB-002 publishes the dated AION wardrobe calculator and its exact module paths', async () => {
  const output = await mkdtemp(join(tmpdir(), 'heaven-wardrobe-'));
  try {
    await build(output);
    const index = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(index, /href="\.\/aion2\/wardrobe\.html"/);
    const html = await readFile(join(output, 'aion2/wardrobe.html'), 'utf8');
    const client = await readFile(join(output, 'aion2/wardrobe.js'), 'utf8');
    const engine = await readFile(join(output, 'wardrobe.mjs'), 'utf8');
    const decision = await readFile(join(output, 'decision.mjs'), 'utf8');
    assert.match(html, /type="module"/);
    assert.match(html, /id="budget"/);
    assert.match(html, /id="import-file"/);
    assert.match(html, /dated planning estimate/i);
    assert.match(client, /\.\.\/wardrobe\.mjs/);
    assert.match(engine, /export function wardrobeQuote/);
    assert.match(decision, /export function compareBuilds/);
    for (const path of ['web/wardrobe.js', 'web/wardrobe.mjs', 'web/decision.mjs']) {
      execFileSync(process.execPath, ['--check', path], { cwd:root, stdio:'pipe' });
    }
  } finally {
    await rm(output, {recursive:true, force:true});
  }
});

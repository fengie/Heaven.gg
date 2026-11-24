import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchesGlob } from 'node:path';

const siteInputs = [
  'data/gaming/game-registry.json',
  'data/reference/codex_published_build_catalog.json',
  'data/reference/raid_boss_resistances_2026_10_08.json',
  'data/catalog/priority_gear_lookup.json',
];

test('a change to any external site data input selects both website trigger paths', async () => {
  const workflow = (await readFile(new URL('../../.github/workflows/site.yml', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  for (const event of ['push', 'pull_request']) {
    const eventBlock = workflow.split('\n  ' + event + ':\n')[1]?.split(/\n {0,2}\w/)[0];
    assert.ok(eventBlock, event + ' trigger is missing');
    const pathList = eventBlock.match(/\n    paths:\n((?:      - [^\n]+(?:\n|$))+)/)?.[1];
    assert.ok(pathList, event + ' path filters are missing');
    const filters = pathList.trimEnd().split('\n').map(line => {
      const match = /^      - '([\w./*-]+)'$/.exec(line);
      assert.ok(match, 'Update the test for this filter syntax: ' + line);
      return match[1];
    });
    const selected = path => filters.some(pattern => matchesGlob(path, pattern));
    for (const input of siteInputs) assert.ok(selected(input), event + ' misses ' + input);
    assert.equal(selected('docs/unrelated-note.md'), false, event + ' selects unrelated documentation');
  }
});

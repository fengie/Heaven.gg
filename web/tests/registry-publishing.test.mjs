import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/site.yml', import.meta.url), 'utf8');
const registry = 'data/gaming/game-registry.json';

// Parse only this workflow's deliberately simple, quoted positive path list.
// Refuse unsupported syntax rather than silently approximate GitHub glob rules.
function pathsFor(event) {
  const block = workflow.match(new RegExp('^  ' + event + ':\\n([\\s\\S]*?)(?=^  [a-z_]+:|^permissions:)', 'm'));
  assert.ok(block, event + ' trigger must exist');
  const paths = block[1].match(/    paths:\n((?:      - '[^']+'\n)+)/);
  assert.ok(paths, event + ' must retain an explicit quoted path list');
  return [...paths[1].matchAll(/      - '([^']+)'/g)].map(match => match[1]);
}

function selects(paths, path) {
  return paths.some(pattern => {
    if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2));
    assert.ok(!/[*!?\[\]{}]/.test(pattern), 'unsupported path pattern: ' + pattern);
    return path === pattern;
  });
}

for (const event of ['push', 'pull_request']) {
  test(event + ' selects registry-only and existing web changes, not unrelated research', () => {
    const paths = pathsFor(event);
    assert.ok(selects(paths, registry), event + ': registry-only change must select website validation');
    assert.ok(selects(paths, 'web/game-registry.mjs'));
    assert.equal(selects(paths, 'docs/research/unrelated.md'), false);
  });
}

test('registry validation does not broaden publication beyond main', () => {
  assert.match(workflow, /branches: \['\*\*'\]/);
  assert.match(workflow, /pull_request:\n    branches: \[main\]/);
  for (const job of ['deploy', 'verify-served']) {
    const block = workflow.match(new RegExp('^  ' + job + ':\\n([\\s\\S]*?)(?=^  [a-z-]+:|$(?![\\s\\S]))', 'm'));
    assert.ok(block, job + ' job must exist');
    assert.match(block[1], /if:.*github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  }
});

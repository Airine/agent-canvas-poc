import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteLinks, wikiUrl } from './content-links.mjs';

test('wiki index and nested routes', () => {
  assert.equal(wikiUrl('index.md'), '/docs');
  assert.equal(wikiUrl('modules/e-runtime.md'), '/docs/modules/e-runtime');
});
test('relative links retain anchors without changing code examples', () => {
  const result = rewriteLinks('[总览](../system.md#边界)\n\n`[总览](../system.md)`\n', 'modules/canvas.md', new Set(['system.md']));
  assert.match(result, /\/docs\/system#边界/);
  assert.match(result, /`\[总览\]\(\.\.\/system\.md\)`/);
});
test('broken links fail content preparation', () => {
  assert.throws(() => rewriteLinks('[失效](missing.md)', 'index.md', new Set()), /unsupported relative link/);
});

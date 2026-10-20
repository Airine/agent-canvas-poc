import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { wikiUrl } from './content-links.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const origin = 'http://127.0.0.1:4310';
const files = readdirSync(path.join(root, 'docs/architecture/wiki'), { recursive: true }).filter(f => f.endsWith('.md'));
const results = [];
for (const pathname of ['/', ...files.map(wikiUrl), '/architecture.html']) {
  const response = await fetch(`${origin}${pathname}`);
  assert.equal(response.status, 200, pathname);
  const html = await response.text();
  assert.ok(html.includes('<html'), pathname);
  if (pathname === '/') assert.ok(html.includes('把 Agent 放上画布'));
  if (pathname === '/architecture.html') assert.ok(html.includes('name="wiki-digest"'));
  results.push({ path: pathname, status: response.status });
}
const missing = await fetch(`${origin}/docs/does-not-exist`);
assert.equal(missing.status, 404);
const search = await fetch(`${origin}/api/search?query=${encodeURIComponent('审批')}`);
assert.equal(search.status, 200);
const hits = await search.json();
assert.ok(hits.some(hit => hit.url.includes('/docs/review')));
writeFileSync(path.join(root, 'docs/architecture/reports/site-check.json'), JSON.stringify({ results, missingStatus: missing.status, chineseSearchResults: hits.length }, null, 2) + '\n');
console.log(`${results.length} routes OK; unknown page 404; Chinese search returned ${hits.length} results.`);

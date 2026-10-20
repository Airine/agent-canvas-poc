import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
test('SPA production assets are root-relative for deep-link reloads', () => {
 const config=readFileSync(new URL('../../vite.config.ts',import.meta.url),'utf8');
 assert.match(config,/base:\s*['"]\/['"]/);
 const html=new URL('../../dist/index.html',import.meta.url);
 if(existsSync(html)) {
  const content=readFileSync(html,'utf8');
  const assets=[...content.matchAll(/(?:src|href)=["']([^"']*assets\/[^"']+)["']/g)].map(m=>m[1]);
  assert.ok(assets.length>=2);assert.ok(assets.every(asset=>asset.startsWith('/assets/')));
 }
});

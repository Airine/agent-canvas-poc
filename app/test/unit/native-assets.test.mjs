import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-native-assets-'));
process.env.CANVAS_DATA_DIR = path.join(dir, 'data');
const {nativeAssets} = await import('../../api/native-assets.ts');
const app = new Hono(); app.route('/native', nativeAssets);
test.after(() => fs.rmSync(dir, {recursive: true, force: true}));
test('missing native assets are explicit, never a fake chat or SPA fallback', async () => {
  delete process.env.PI_NATIVE_UI_DIR;
  assert.equal((await app.request('/native/pi/ui.html')).status, 503);
});
test('local upstream assets are confined to their real build root', async () => {
  const root = path.join(dir, 'ui'); fs.mkdirSync(root); process.env.PI_NATIVE_UI_DIR = root;
  fs.writeFileSync(path.join(root, 'ui.html'), '<h1>Original UI</h1>');
  fs.writeFileSync(path.join(dir, 'private.txt'), 'not public');
  fs.symlinkSync(path.join(dir, 'private.txt'), path.join(root, 'escape.txt'));
  const response = await app.request('/native/pi/ui.html');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<h1>Original UI</h1>');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal((await app.request('/native/pi/escape.txt')).status, 404);
  assert.equal((await app.request('/native/pi/missing.js')).status, 404);
});
test('a foreign Codex card cannot proxy arbitrary resources or launch a runtime', async () => {
  assert.equal((await app.request('/native/codex/unknown/n-foreign/ui/')).status, 503);
});

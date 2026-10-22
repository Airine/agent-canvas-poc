import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { bodyLimit } from 'hono/body-limit';
import { codexNative } from './codex-native.js';

/** Serve locally built, separately licensed upstream assets; no SPA fallback. */
export const nativeAssets = new Hono();
nativeAssets.use('/codex/*', bodyLimit({maxSize: 12 * 1024 * 1024}));
nativeAssets.all('/codex/:wid/:nid/*', async c => {
  try {
    const origin = codexNative.upstream(c.req.param('wid'), c.req.param('nid'));
    const prefix = `/native/codex/${c.req.param('wid')}/${c.req.param('nid')}`;
    const suffix = c.req.path.slice(prefix.length);
    if (!['GET', 'POST'].includes(c.req.method) || !/^\/(ui\/|bridge$|events$|attachments$)/.test(suffix)) return c.text('Not found', 404);
    const target = new URL(origin + suffix); target.search = new URL(c.req.url).search;
    const headers = new Headers();
    for (const key of ['content-type', 'x-probe-token']) { const value = c.req.header(key); if (value) headers.set(key, value); }
    const res = await fetch(target, {method: c.req.method, headers, redirect: 'error',
      body: c.req.method === 'POST' ? await c.req.arrayBuffer() : undefined, signal: AbortSignal.timeout(35000)});
    return new Response(res.body, {status: res.status, headers: res.headers});
  } catch { return c.text('Codex host unavailable. Restore the card.', 503); }
});
nativeAssets.get('/pi/*', c => {
  const configured = process.env.PI_NATIVE_UI_DIR;
  if (!configured) return c.text('PI Native UI not built. Set PI_NATIVE_UI_DIR; see app/native/README.md.', 503);
  const root = fs.realpathSync(configured);
  const relative = decodeURIComponent(c.req.path.slice('/native/pi/'.length)) || 'ui.html';
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(root + path.sep) || !fs.existsSync(candidate)) return c.text('Not found', 404);
  const file = fs.realpathSync(candidate);
  if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) return c.text('Not found', 404);
  const types: Record<string, string> = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp'};
  c.header('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
  c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'none'");
  return c.body(fs.readFileSync(file));
});

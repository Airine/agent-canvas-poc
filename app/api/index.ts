/**
 * index.ts — Agent Canvas control plane entrypoint.
 * Hono server on :3000 — /api/* REST, /ws WebSocket, static dist/ hosting.
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, wsHandlers, wireBroadcasts } from './routes.js';
import { wirePumpToGraph } from './pump.js';
import { ensureServer } from './herdr-adapter.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);

const app = new Hono();

app.route('/api', api);

// static frontend (dist/) with SPA fallback
app.use(
  '/*',
  serveStatic({
    root: path.join(REPO_ROOT, 'dist'),
    rewriteRequestPath: (p) => p,
  }),
);
app.get('*', (c) => {
  const index = path.join(REPO_ROOT, 'dist', 'index.html');
  if (fs.existsSync(index)) return c.html(fs.readFileSync(index, 'utf8'));
  return c.text('Agent Canvas API (frontend not built — run `npm run build`)', 404);
});

wireBroadcasts();
wirePumpToGraph();

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] Agent Canvas control plane on http://localhost:${info.port}`);
});

// /ws WebSocket endpoint
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wsHandlers.onOpen(null, ws as never);
    ws.on('message', (data) => wsHandlers.onMessage({ data: data.toString() }, ws as never));
    ws.on('close', () => wsHandlers.onClose(null, ws as never));
    ws.on('error', () => wsHandlers.onClose(null, ws as never));
  });
});

// best-effort: bring up herdr at boot so the first /run is instant
ensureServer()
  .then(() => console.log('[api] herdr server ready'))
  .catch((e) => console.warn(`[api] herdr not ready yet: ${e} (will retry on /api/graph/run)`));

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
void WebSocket;

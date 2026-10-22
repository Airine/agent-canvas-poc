/**
 * routes.ts — contract §2 REST + §3 WS wiring (multi-workspace).
 *
 * New: /api/workspaces registry endpoints. Legacy /api/graph, /api/nodes/*
 * keep working and operate on the ACTIVE workspace (last created/requested).
 * WS hello accepts an optional workspaceId; all graph/node/edge/term pushes
 * carry workspaceId.
 */
import { Hono } from 'hono';
import { z } from 'zod';
// minimal structural socket type (backed by ws WebSocket)
export interface WSContext { send(data: string): void }
import { getGraphStore, listGraphStores, onAnyPatch, type GraphStore } from './graph.js';
import { computeLayout } from './layout.js';
import { eventbus } from './eventbus.js';
import { coordinator } from './coordinator.js';
import { pump } from './pump.js';
import { registry } from './registry.js';
import type { ClientMessage, ServerMessage } from './types.js';

// -- zod schemas for POST /api/workspaces ------------------------------------

const nodeStatusSchema = z.enum(['queued', 'running', 'waiting', 'completed', 'failed', 'skipped']);

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['coordinator', 'operation', 'chat', 'artifact']),
  title: z.string(),
  status: nodeStatusSchema.default('queued'),
  harness: z.string().default(''),
  env: z.string().default(''),
  agentId: z.string().default(''),
  x: z.number(),
  y: z.number(),
  zoneId: z.string().optional(),
  command: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  statusReason: z.string().optional(),
  paneId: z.string().optional(),
  approval: z.object({ prompt: z.string() }).optional(),
  progress: z.number().optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(['strong', 'weak', 'error']),
  label: z.string().optional(),
});

const zoneSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
});

const graphSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  zones: z.array(zoneSchema).default([]),
  runState: z.enum(['idle', 'running', 'done']).default('idle'),
});

const createWorkspaceSchema = z.object({
  title: z.string().min(1),
  path: z.string().default(''),
  description: z.string().default(''),
  graph: graphSchema,
});

// -- helpers -----------------------------------------------------------------

function activeStore(): GraphStore {
  const id = registry.getActiveId();
  const store = id ? getGraphStore(id) : undefined;
  if (!store) throw new Error('no active workspace');
  return store;
}

/** Resolve which workspace owns a nodeId (for tagging event broadcasts). */
function workspaceOfNode(nodeId?: string): string | undefined {
  if (!nodeId) return undefined;
  for (const [wsId, store] of listGraphStores()) {
    if (store.getNode(nodeId)) return wsId;
  }
  return undefined;
}

// -- WS hub ------------------------------------------------------------------

const clients = new Set<WSContext>();

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const c of clients) {
    try {
      c.send(data);
    } catch {
      clients.delete(c);
    }
  }
}

let wired = false;
export function wireBroadcasts(): void {
  if (wired) return;
  wired = true;
  onAnyPatch((workspaceId, msg) => {
    if (msg.type === 'node') broadcast({ type: 'node', node: msg.node, workspaceId });
    else broadcast({ type: 'edge', edge: msg.edge, workspaceId });
  });
  eventbus.subscribe((event) => {
    broadcast({ type: 'event', event, workspaceId: workspaceOfNode(event.nodeId) });
  });
  coordinator.onGraphBroadcast((workspaceId) => {
    const store = getGraphStore(workspaceId);
    if (store) broadcast({ type: 'graph', graph: store.graph, workspaceId });
  });
}

// track per-socket pump subscriptions so unsubscribe/close can find them
interface SubEntry { workspaceId: string; nodeId: string; client: { send: (m: ServerMessage) => void } }
const socketSubs = new Map<WSContext, Map<string, SubEntry>>();

export const wsHandlers = {
  onOpen(_evt: unknown, ws: WSContext): void {
    clients.add(ws);
    socketSubs.set(ws, new Map());
  },
  onMessage(evt: { data: unknown }, ws: WSContext): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(evt.data));
    } catch {
      return;
    }
    const subs = socketSubs.get(ws);
    if (msg.type === 'hello') {
      // hello may target a specific workspace; default = active workspace
      let wsId = registry.getActiveId();
      if (msg.workspaceId && registry.has(msg.workspaceId)) {
        registry.setActive(msg.workspaceId);
        wsId = msg.workspaceId;
      }
      const store = wsId ? getGraphStore(wsId) : undefined;
      if (store) {
        ws.send(JSON.stringify({ type: 'graph', graph: store.graph, workspaceId: wsId } satisfies ServerMessage));
      }
    } else if (msg.type === 'term.subscribe' && subs) {
      const wsId = msg.workspaceId && registry.has(msg.workspaceId) ? msg.workspaceId : registry.getActiveId();
      const k = `${wsId}/${msg.nodeId}`;
      if (!subs.has(k)) {
        const client = { send: (m: ServerMessage) => ws.send(JSON.stringify(m)) };
        subs.set(k, { workspaceId: wsId, nodeId: msg.nodeId, client });
        pump.subscribe(wsId, msg.nodeId, client);
      }
    } else if (msg.type === 'term.unsubscribe' && subs) {
      const wsId = msg.workspaceId && registry.has(msg.workspaceId) ? msg.workspaceId : registry.getActiveId();
      const k = `${wsId}/${msg.nodeId}`;
      const entry = subs.get(k);
      if (entry) {
        subs.delete(k);
        pump.unsubscribe(entry.workspaceId, entry.nodeId, entry.client);
      }
    }
  },
  onClose(_evt: unknown, ws: WSContext): void {
    clients.delete(ws);
    const subs = socketSubs.get(ws);
    if (subs) {
      for (const entry of subs.values()) pump.unsubscribe(entry.workspaceId, entry.nodeId, entry.client);
      socketSubs.delete(ws);
    }
  },
};

// -- REST --------------------------------------------------------------------

export const api = new Hono();

// -- workspace registry endpoints --

api.get('/workspaces', (c) => c.json({ workspaces: registry.list() }));

api.post('/workspaces', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid workspace', issues: parsed.error.issues }, 400);
  }
  const summary = registry.create(parsed.data);
  return c.json(summary, 201);
});

api.get('/workspaces/:id', (c) => {
  const summary = registry.get(c.req.param('id'));
  if (!summary) return c.json({ error: 'not found' }, 404);
  return c.json(summary);
});

api.get('/workspaces/:id/graph', (c) => {
  const graph = registry.getGraph(c.req.param('id'));
  if (!graph) return c.json({ error: 'not found' }, 404);
  return c.json(graph);
});

// convenience: run/reset a specific workspace (also makes it active)
api.post('/workspaces/:id/run', async (c) => {
  const id = c.req.param('id');
  if (!registry.has(id)) return c.json({ error: 'not found' }, 404);
  registry.setActive(id);
  await coordinator.run(id);
  return c.json({ ok: true });
});

api.post('/workspaces/:id/reset', async (c) => {
  const id = c.req.param('id');
  if (!registry.has(id)) return c.json({ error: 'not found' }, 404);
  registry.setActive(id);
  await coordinator.reset(id);
  return c.json({ ok: true });
});

// 一键最优布局：dagre + zone 泳道列；坐标写回 graph 并以 node 补丁广播
api.post('/workspaces/:id/layout', (c) => {
  const id = c.req.param('id');
  const store = getGraphStore(id);
  if (!store) return c.json({ error: 'workspace not found' }, 404);
  registry.setActive(id);
  const { positions } = computeLayout(store.graph);
  for (const p of positions) store.patchNode(p.id, { x: p.x, y: p.y });
  registry.persist();
  return c.json({ ok: true, count: positions.length });
});

// -- workspace-scoped node endpoints: explicit wid, no active pointer --

function scopedStore(c: { req: { param: (k: string) => string } }): GraphStore | null {
  const wid = c.req.param('wid');
  if (!registry.has(wid)) return null;
  return getGraphStore(wid) ?? null;
}

api.post('/workspaces/:wid/nodes/:nid/input', async (c) => {
  const store = scopedStore(c);
  if (!store) return c.json({ error: 'workspace not found' }, 404);
  if (!store.getNode(c.req.param('nid'))) return c.json({ error: 'node not found' }, 404);
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  if (typeof body.text !== 'string') return c.json({ error: 'text required' }, 400);
  try {
    await coordinator.sendInput(c.req.param('wid'), c.req.param('nid'), body.text);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

api.post('/workspaces/:wid/nodes/:nid/approval', async (c) => {
  const store = scopedStore(c);
  if (!store) return c.json({ error: 'workspace not found' }, 404);
  if (!store.getNode(c.req.param('nid'))) return c.json({ error: 'node not found' }, 404);
  const body = await c.req
    .json<{ decision?: string; text?: string }>()
    .catch(() => ({}) as { decision?: string; text?: string });
  // contract vocabulary: approved | rejected | edited ('edited' = resume with
  // human edits); legacy approve/reject tolerated.
  const map: Record<string, 'approve' | 'reject'> = {
    approved: 'approve',
    edited: 'approve',
    approve: 'approve',
    rejected: 'reject',
    reject: 'reject',
  };
  const decision = body.decision ? map[body.decision] : undefined;
  if (!decision) {
    return c.json({ error: "decision must be 'approved' | 'rejected' | 'edited'" }, 400);
  }
  const note = body.decision === 'edited' && body.text ? `edited: ${body.text}` : undefined;
  try {
    await coordinator.approve(c.req.param('wid'), c.req.param('nid'), decision, note);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

api.get('/workspaces/:wid/nodes/:nid/events', (c) => {
  const store = scopedStore(c);
  if (!store) return c.json({ error: 'workspace not found' }, 404);
  if (!store.getNode(c.req.param('nid'))) return c.json({ error: 'node not found' }, 404);
  return c.json(eventbus.forNode(c.req.param('nid')));
});

// -- legacy endpoints: semantics = "the active workspace" --

api.get('/graph', (c) => c.json(activeStore().graph));

api.post('/graph/run', async (c) => {
  await coordinator.run(registry.getActiveId());
  return c.json({ ok: true });
});

api.post('/graph/reset', async (c) => {
  await coordinator.reset(registry.getActiveId());
  return c.json({ ok: true });
});

api.get('/nodes/:id', (c) => {
  const node = activeStore().getNode(c.req.param('id'));
  if (!node) return c.json({ error: 'not found' }, 404);
  return c.json(node);
});

api.post('/nodes/:id/input', async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  if (typeof body.text !== 'string') return c.json({ error: 'text required' }, 400);
  try {
    await coordinator.sendInput(registry.getActiveId(), c.req.param('id'), body.text);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

api.post('/nodes/:id/approval', async (c) => {
  const body = await c.req.json<{ decision?: string }>().catch(() => ({}) as { decision?: string });
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return c.json({ error: "decision must be 'approve' | 'reject'" }, 400);
  }
  try {
    await coordinator.approve(registry.getActiveId(), c.req.param('id'), body.decision);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

api.get('/nodes/:id/events', (c) => {
  const node = activeStore().getNode(c.req.param('id'));
  if (!node) return c.json({ error: 'not found' }, 404);
  return c.json(eventbus.forNode(c.req.param('id')));
});

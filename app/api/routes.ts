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
import { randomUUID } from 'node:crypto';
import { bodyLimit } from 'hono/body-limit';
// minimal structural socket type (backed by ws WebSocket)
export interface WSContext { send(data: string): void }
import { getGraphStore, onAnyPatch, type GraphStore } from './graph.js';
import { computeLayout } from './layout.js';
import { eventbus } from './eventbus.js';
import { coordinator } from './coordinator.js';
import { pump } from './pump.js';
import { registry } from './registry.js';
import type { ClientMessage, ServerMessage } from './types.js';
import { eSessions, runtimeStatus, projectSession } from './e-adapter.js';
import { runtimeRouter, requireHerdr } from './runtime-router.js';
import { PROJECT_ROOT } from './workspace-paths.js';
import type { SessionView, ControlOperation } from './e/contracts.js';
import { bindApproval } from './e/approval-binding.js';

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
  kind: z.enum(['strong', 'weak', 'error', 'communication', 'spawn']),
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
  graph: graphSchema.optional(),
  backend: z.enum(['e', 'herdr']).default('herdr'),
});

// -- helpers -----------------------------------------------------------------

function activeStore(): GraphStore {
  const id = registry.getActiveId();
  const store = id ? getGraphStore(id) : undefined;
  if (!store) throw new Error('no active workspace');
  return store;
}

// -- WS hub ------------------------------------------------------------------

interface Peer { workspaceId?: string; generation: string; sequence: number }
const clients = new Map<WSContext, Peer>();
interface SubEntry { workspaceId: string; nodeId: string; client: { send: (m: ServerMessage) => void } }
const socketSubs = new Map<WSContext, Map<string, SubEntry>>();

function send(ws: WSContext, msg: ServerMessage): void {
  const peer = clients.get(ws);
  if (!peer) return;
  try { ws.send(JSON.stringify({ ...msg, generation: peer.generation, sequence: ++peer.sequence })); }
  catch { wsHandlers.onClose(null, ws); }
}
function broadcast(msg: ServerMessage): void {
  if (!msg.workspaceId) return; // never broadcast unscoped events to every workspace
  for (const [ws, peer] of clients) if (peer.workspaceId === msg.workspaceId) send(ws, msg);
}
function graphMessage(workspaceId: string): ServerMessage {
  const workspace = registry.get(workspaceId)!;
  return { type: 'graph', graph: workspace.graph, backend: workspace.backend, source: workspace.source, archivedAt: workspace.archivedAt, workspaceId };
}
function clearSubscriptions(ws: WSContext): void {
  for (const entry of socketSubs.get(ws)?.values() ?? []) pump.unsubscribe(entry.workspaceId, entry.nodeId, entry.client);
  socketSubs.set(ws, new Map());
}
function applySession(view: SessionView): void {
  if (registry.backend(view.workspaceId) !== 'e') return;
  const store = getGraphStore(view.workspaceId)!;
  const prior = store.getNode(view.nodeId);
  const node = projectSession(view, prior, store.graph.nodes.length);
  if (JSON.stringify(prior) !== JSON.stringify(node)) store.upsertNode(node);
  store.setRunState(store.graph.nodes.some(n => n.status === 'running') ? 'running' : 'idle');
}
function applyCommunications(workspaceId: string): void {
  if (registry.backend(workspaceId) !== 'e') return;
  const store = getGraphStore(workspaceId);if (!store) return;
  for (const edge of eSessions.collaboration.edges(workspaceId)) {
    if (!store.getNode(edge.source) || !store.getNode(edge.target)) continue;
    const prior = store.graph.edges.find(e => e.id === edge.id);
    if (JSON.stringify(prior) !== JSON.stringify(edge)) store.upsertEdge(edge);
  }
}
let wired = false;
export function wireBroadcasts(): void {
  if (wired) return;
  wired = true;
  // Rehydrate from durable session snapshots, not stale live statuses in graph JSON.
  for (const workspace of registry.list()) if (workspace.backend === 'e') {
    for (const session of eSessions.list(workspace.id)) applySession(session);
    eSessions.collaboration.reconcile(workspace.id);applyCommunications(workspace.id);
  }
  onAnyPatch((workspaceId, msg) => broadcast({ ...msg, workspaceId }));
  eventbus.subscribe(event => broadcast({ type: 'event', event, workspaceId: event.workspaceId }));
  coordinator.onGraphBroadcast(workspaceId => broadcast(graphMessage(workspaceId)));
  eSessions.on('communication', applyCommunications);
  // A spawn is a card creation, not a DAG edge someone else executes: place the child next to its
  // parent in the same zone before applySession settles its live status.
  eSessions.on('spawned', (payload: { workspaceId: string; parent: string; nodeId: string; spawnId: string; depth: number; view: SessionView }) => {
    if (registry.backend(payload.workspaceId) !== 'e') return;
    const store = getGraphStore(payload.workspaceId); if (!store) return;
    const view = eSessions.get(payload.workspaceId, payload.nodeId) ?? payload.view;
    const parent = store.getNode(payload.parent);
    const node = projectSession(view, undefined, store.graph.nodes.length);
    node.x = (parent?.x ?? 80) + 560; node.y = parent?.y ?? 80;
    if (parent?.zoneId) node.zoneId = parent.zoneId;
    store.upsertNode(node);
    store.upsertEdge({ id: `spawn:${payload.spawnId}`, source: payload.parent, target: payload.nodeId, kind: 'spawn', label: `派生 · 深度 ${payload.depth}` });
    registry.persist();
  });
  eSessions.on('changed', (view: SessionView) => {
    applySession(view);
    broadcast({ type: 'session', session: view, workspaceId: view.workspaceId });
    // SessionManager persists canonical messages separately. Graph persistence
    // is needed for lifecycle/identity, not every streamed token.
    if (view.lifecycle !== 'ready') registry.persist();
  });
}

export const wsHandlers = {
  onOpen(_evt: unknown, ws: WSContext): void {
    clients.set(ws, { generation: randomUUID(), sequence: 0 });
    socketSubs.set(ws, new Map());
  },
  onMessage(evt: { data: unknown }, ws: WSContext): void {
    let msg: ClientMessage;
    try { msg = JSON.parse(String(evt.data)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const peer = clients.get(ws); if (!peer) return;
    if (msg.type === 'hello') {
      clearSubscriptions(ws);
      peer.workspaceId = undefined; peer.generation = randomUUID(); peer.sequence = 0;
      const wid = msg.workspaceId ?? registry.getActiveId();
      if (typeof wid !== 'string' || !registry.has(wid)) {
        send(ws, { type: 'error', error: 'workspace not found', workspaceId: typeof wid === 'string' ? wid : undefined }); return;
      }
      peer.workspaceId = wid;
      send(ws, graphMessage(wid));
      if (registry.backend(wid) === 'e') for (const session of eSessions.list(wid)) send(ws, { type: 'session', session, workspaceId: wid });
    } else if (msg.type === 'term.subscribe' || msg.type === 'term.unsubscribe') {
      const wid = peer.workspaceId;
      if (!wid || (msg.workspaceId && msg.workspaceId !== wid) || registry.backend(wid) !== 'herdr' || !getGraphStore(wid)?.getNode(msg.nodeId)) return;
      const subs = socketSubs.get(ws)!;
      const key = `${wid}/${msg.nodeId}`;
      if (msg.type === 'term.subscribe' && !subs.has(key)) {
        const client = { send: (m: ServerMessage) => send(ws, { ...m, workspaceId: wid }) };
        subs.set(key, { workspaceId: wid, nodeId: msg.nodeId, client }); pump.subscribe(wid, msg.nodeId, client);
      } else if (msg.type === 'term.unsubscribe') {
        const entry = subs.get(key); if (entry) { pump.unsubscribe(wid, msg.nodeId, entry.client); subs.delete(key); }
      }
    }
  },
  onClose(_evt: unknown, ws: WSContext): void {
    clearSubscriptions(ws); clients.delete(ws); socketSubs.delete(ws);
  },
};

// -- REST --------------------------------------------------------------------

export const api = new Hono();

api.use('*', bodyLimit({ maxSize: 12 * 1024 * 1024, onError: c => c.json({ error: '总请求不能超过 12 MiB' }, 413) }));
api.onError((error, c) => {
  const message = error.message || 'request failed';
  const status = /not found/i.test(message) ? 404 : /unavailable|not configured|not ready|limit|timeout/i.test(message) ? 503 : 409;
  return c.json({ error: message }, status);
});
api.get('/runtime/status', async c => c.json(await runtimeStatus()));
api.get('/backends', async c => c.json({ active: process.env.CANVAS_BACKEND || 'herdr', backends: { e: await runtimeStatus(), herdr: { available: null, reason: 'Checked on explicit run' } } }));
api.all('/e/*', c => c.json({ error: 'Legacy e socket/bind endpoints retired. Use workspace-scoped sessions.' }, 410));

const sessionSchema = z.object({ title: z.string().trim().min(1).max(160).default('Pi Agent'), provider: z.string().min(1).max(160).optional(), model: z.string().min(1).max(256).optional() }).strict();
const attachmentSchema=z.object({id:z.string().min(1).max(128),name:z.string().min(1).max(160),mimeType:z.enum(['text/plain','image/png','image/jpeg','image/webp']),data:z.string().max(3*1024*1024)}).strict();
const controlSchema = z.object({
  intentId: z.string().min(1).max(256), content: z.string().max(100000).optional(), attachments:z.array(attachmentSchema).max(4).optional(),
  deliverAs: z.enum(['nextTurn', 'steer', 'followUp']).optional(), targetRunId: z.string().max(256).optional(),
  approvalId: z.string().max(256).optional(), decision: z.enum(['approved', 'rejected', 'cancelled']).optional(), response: z.unknown().optional(),
}).strict();

api.get('/workspaces/:wid/sessions', c => {
  const wid=c.req.param('wid');
  if(!registry.has(wid))return c.json({error:'workspace not found'},404);
  if(registry.backend(wid)!=='e')return c.json({error:'not an e workspace'},409);
  if(c.req.query('view')!=='archived')return c.json({error:'view=archived required'},400);
  return c.json({sessions:eSessions.list(wid).filter(session=>session.archivedAt)});
});
api.post('/workspaces/:wid/sessions', async c => {
  const wid = c.req.param('wid');
  if (!registry.has(wid)) return c.json({ error: 'workspace not found' }, 404);
  if (registry.backend(wid) !== 'e') return c.json({ error: 'not an e workspace' }, 409);
  registry.assertWritable(wid);
  const parsed = sessionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid session options', issues: parsed.error.issues }, 400);
  const workspace = registry.get(wid)!;
  const session = await eSessions.create({ workspaceId: wid, nodeId: `n-${randomUUID()}`, cwd: workspace.path, ...parsed.data });
  applySession(session); registry.persist();
  return c.json({ session }, 201);
});
api.get('/workspaces/:wid/nodes/:nid/approval-grants/:aid', c => {
  const wid=c.req.param('wid'), nid=c.req.param('nid');
  if(registry.backend(wid)!=='e')return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  const view=eSessions.get(wid,nid);
  const input=view?.snapshot&&bindApproval(view.snapshot,c.req.param('aid'));
  if(view?.lifecycle!=='ready'||!input?.complete||!['bash','write','edit'].includes(input.tool))return c.json({error:'Complete pending tool parameters required'},409);
  return c.json({digest:input.digest,tool:input.tool,args:input.args});
});
api.post('/workspaces/:wid/nodes/:nid/approval-grants', async c => {
  const wid=c.req.param('wid'), nid=c.req.param('nid');
  if(registry.backend(wid)!=='e'||!eSessions.get(wid,nid))return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  const parsed=z.object({approvalId:z.string().min(1).max(256),expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),confirmRisk:z.literal(true)}).strict().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Exact operation and risk confirmation required'},400);
  return c.json({session:eSessions.grantExactApproval(wid,nid,parsed.data.approvalId,parsed.data.expectedDigest)});
});
api.delete('/workspaces/:wid/nodes/:nid/approval-grants', c => {
  const wid=c.req.param('wid'), nid=c.req.param('nid');
  if(registry.backend(wid)!=='e'||!eSessions.get(wid,nid))return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  return c.json({session:eSessions.setApprovalMode(wid,nid,'manual')});
});
api.patch('/workspaces/:wid/nodes/:nid/approval-mode', async c => {
  const wid = c.req.param('wid'), nid = c.req.param('nid');
  if (registry.backend(wid) !== 'e' || !eSessions.get(wid, nid)) return c.json({ error: 'session not found' }, 404);
  registry.assertWritable(wid);
  const parsed = z.object({ mode: z.enum(['manual', 'assisted', 'full']), confirmRisk: z.boolean().optional(), reviewer:z.object({provider:z.string().min(1).max(160),model:z.string().min(1).max(256)}).strict().optional() }).strict().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || parsed.data.mode !== 'manual' && parsed.data.confirmRisk !== true) return c.json({ error: 'automatic approval requires explicit confirmation' }, 400);
  if(parsed.data.mode==='assisted'){
    const status=await runtimeStatus();const reviewer=parsed.data.reviewer;
    if(!reviewer||!status.models.some(m=>m.provider===reviewer.provider&&m.id===reviewer.model))return c.json({error:'Choose an available explicit reviewer model'},400);
  }
  return c.json({ session: eSessions.setApprovalMode(wid, nid, parsed.data.mode, parsed.data.reviewer) });
});
api.get('/workspaces/:wid/nodes/:nid/session', c => {
  const session = eSessions.get(c.req.param('wid'), c.req.param('nid'));
  return session && registry.backend(c.req.param('wid')) === 'e' ? c.json({ session }) : c.json({ error: 'session not found' }, 404);
});
api.patch('/workspaces/:wid/nodes/:nid/session',async c=>{
  const wid=c.req.param('wid'),nid=c.req.param('nid');
  if(registry.backend(wid)!=='e'||!eSessions.get(wid,nid))return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  const parsed=z.object({title:z.string().min(1).max(160),expectedVersion:z.number().int().nonnegative()}).strict().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'invalid nickname update'},400);
  return c.json({session:eSessions.rename(wid,nid,parsed.data.title,parsed.data.expectedVersion)});
});
const configurationSchema=z.object({intentId:z.string().min(1).max(256),expectedRevision:z.number().int().nonnegative(),provider:z.string().min(1).max(160).optional(),model:z.string().min(1).max(256).optional(),thinkingLevel:z.string().min(1).max(40).optional()}).strict().refine(v=>!!v.model===!!v.provider && (!!v.model||v.thinkingLevel!==undefined));
api.post('/workspaces/:wid/nodes/:nid/configuration',async c=>{
  const wid=c.req.param('wid'),nid=c.req.param('nid');
  if(registry.backend(wid)!=='e'||!eSessions.get(wid,nid))return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  const body=await c.req.json().catch(()=>null),parsed=configurationSchema.safeParse(body);
  if(!parsed.success&&!(body&&typeof body==='object'&&Object.keys(body).length===0))return c.json({error:'invalid configuration request'},400);
  return c.json({session:await eSessions.configuration(wid,nid,parsed.success?parsed.data:undefined)});
});
api.post('/workspaces/:wid/nodes/:nid/queue',async c=>{
  const wid=c.req.param('wid'),nid=c.req.param('nid');
  if(registry.backend(wid)!=='e'||!eSessions.get(wid,nid))return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  const parsed=z.object({mutationId:z.string().min(1).max(256),expectedRevision:z.number().int().nonnegative(),operation:z.enum(['add','edit','delete','move','pause','resume','sendNow','reviewUnknown']),itemId:z.string().min(1).max(128).optional(),content:z.string().max(100000).optional(),attachments:z.array(attachmentSchema).max(4).optional(),direction:z.enum(['up','down']).optional(),authorize:z.boolean().optional(),confirmSteer:z.boolean().optional(),confirmReview:z.boolean().optional(),reviewNote:z.string().trim().min(1).max(1000).optional()}).strict().refine(v=>v.operation!=='reviewUnknown'||!!v.itemId&&v.confirmReview===true&&!!v.reviewNote).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'invalid queue request'},400);
  return c.json({session:await eSessions.queue(wid,nid,parsed.data)});
});
for (const operation of ['messages', 'abort', 'approval'] as const) {
  api.post(`/workspaces/:wid/nodes/:nid/${operation}`, async (c, next) => {
    const wid = c.req.param('wid'), nid = c.req.param('nid');
    if (registry.backend(wid) !== 'e') {
      if (operation === 'approval' && registry.backend(wid) === 'herdr') return next();
      return c.json({ error: 'e workspace not found' }, 404);
    }
    if (!eSessions.get(wid, nid)) return c.json({ error: 'session not found' }, 404);
    registry.assertWritable(wid);
    const parsed = controlSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || operation === 'messages' && !parsed.data.content?.trim() && !parsed.data.attachments?.length || operation === 'approval' && (!parsed.data.approvalId || !parsed.data.decision)) return c.json({ error: 'invalid control request' }, 400);
    const action = await eSessions.control(wid, nid, operation as ControlOperation, parsed.data);
    return c.json({ action }, 202);
  });
}
api.post('/workspaces/:wid/nodes/:nid/archive', async c => {
  const wid=c.req.param('wid'),nid=c.req.param('nid');
  if(registry.backend(wid)!=='e'||!eSessions.get(wid,nid))return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  const session=await eSessions.archive(wid,nid);registry.persist();return c.json({session});
});
api.delete('/workspaces/:wid/nodes/:nid/session', async c => {
  const wid=c.req.param('wid'),nid=c.req.param('nid');
  if(registry.backend(wid)!=='e'||!eSessions.get(wid,nid))return c.json({error:'session not found'},404);
  registry.assertWritable(wid);
  const parsed=z.object({confirmDelete:z.literal(true)}).strict().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'删除已归档会话需要明确确认'},400);
  eSessions.deleteArchived(wid,nid);
  getGraphStore(wid)?.removeNode(nid);registry.persist();broadcast(graphMessage(wid));
  return c.json({ok:true});
});
for (const operation of ['stop', 'resume'] as const) {
  api.post(`/workspaces/:wid/nodes/:nid/${operation}`, async c => {
    const wid = c.req.param('wid'), nid = c.req.param('nid');
    if (registry.backend(wid) !== 'e' || !eSessions.get(wid, nid)) return c.json({ error: 'session not found' }, 404);
    if (operation === 'resume') registry.assertWritable(wid);
    const session = await eSessions[operation](wid, nid); registry.persist(); return c.json({ session });
  });
}
api.patch('/workspaces/:wid/layout', async c => {
  const store = getGraphStore(c.req.param('wid'));
  if (!store) return c.json({ error: 'workspace not found' }, 404);
  registry.assertWritable(c.req.param('wid'));
  const parsed = z.object({ positions: z.array(z.object({ id: z.string(), x: z.number().finite(), y: z.number().finite() }).strict()).max(1000) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || parsed.data.positions.some(p => !store.getNode(p.id))) return c.json({ error: 'invalid layout' }, 400);
  for (const position of parsed.data.positions) store.patchNode(position.id, { x: position.x, y: position.y });
  registry.persist(); return c.json({ ok: true });
});

// -- workspace registry endpoints --

api.get('/workspaces', c => {
  const view = c.req.query('view');
  const workspaces = registry.list().filter(w => view === 'archived' ? !!w.archivedAt : !w.archivedAt)
    .filter(w => view === 'examples' ? w.source === 'demo' : view === 'archived' || process.env.CANVAS_BACKEND !== 'e' || w.backend === 'e');
  return c.json({ workspaces });
});
api.patch('/workspaces/:id', async c => {
  const id = c.req.param('id');
  if (!registry.has(id)) return c.json({ error: 'workspace not found' }, 404);
  const parsed = z.object({ title: z.string().trim().min(1).max(160).optional(), archived: z.boolean().optional() }).strict().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid workspace update' }, 400);
  // Archive first to prevent concurrent starts/controls; no history is deleted.
  registry.update(id, parsed.data);
  if (parsed.data.archived) await Promise.all(eSessions.list(id).map(s => eSessions.stop(id, s.nodeId)));
  broadcast(graphMessage(id));
  return c.json(registry.get(id));
});

api.post('/workspaces', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid workspace', issues: parsed.error.issues }, 400);
  }
  if (parsed.data.backend === 'herdr' && !parsed.data.graph) return c.json({ error: 'herdr graph required' }, 400);
  const summary = registry.create({ ...parsed.data,
    path: parsed.data.backend === 'e' ? PROJECT_ROOT : parsed.data.path,
    source: 'live', graph: parsed.data.backend === 'e' ? { nodes: [], edges: [], zones: [], runState: 'idle' } : parsed.data.graph!,
  });
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
  await runtimeRouter.run(id);
  return c.json({ ok: true });
});

api.post('/workspaces/:id/reset', async (c) => {
  const id = c.req.param('id');
  if (!registry.has(id)) return c.json({ error: 'not found' }, 404);
  registry.setActive(id);
  await runtimeRouter.reset(id);
  return c.json({ ok: true });
});

// 一键最优布局：dagre + zone 泳道列；坐标写回 graph 并以 node 补丁广播
api.post('/workspaces/:id/layout', (c) => {
  const id = c.req.param('id');
  const store = getGraphStore(id);
  if (!store) return c.json({ error: 'workspace not found' }, 404);
  registry.setActive(id);
  registry.assertWritable(id);
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
    await runtimeRouter.input(c.req.param('wid'), c.req.param('nid'), body.text);
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
    requireHerdr(c.req.param('wid'));
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
  return c.json(eventbus.forNode(c.req.param('wid'), c.req.param('nid')));
});

// -- legacy endpoints: semantics = "the active workspace" --

api.get('/graph', (c) => c.json(activeStore().graph));

api.post('/graph/run', async (c) => {
  await runtimeRouter.run(registry.getActiveId());
  return c.json({ ok: true });
});

api.post('/graph/reset', async (c) => {
  await runtimeRouter.reset(registry.getActiveId());
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
    await runtimeRouter.input(registry.getActiveId(), c.req.param('id'), body.text);
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
    requireHerdr(registry.getActiveId());
    await coordinator.approve(registry.getActiveId(), c.req.param('id'), body.decision);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

api.get('/nodes/:id/events', (c) => {
  const node = activeStore().getNode(c.req.param('id'));
  if (!node) return c.json({ error: 'not found' }, 404);
  return c.json(eventbus.forNode(registry.getActiveId(), c.req.param('id')));
});

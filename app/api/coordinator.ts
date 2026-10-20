/**
 * coordinator.ts — orchestration driver, multi-workspace edition.
 *
 * One run context per workspaceId:
 *  - run(workspaceId): create a herdr workspace for the canvas, ONE herdr tab
 *    per canvas Zone, and one pane per node inside its zone's tab.
 *    zoneId -> tabId lives in the run context; paneId is patched onto nodes.
 *  - If herdr is unavailable (mock fallback), all herdr calls are skipped and
 *    the graph data is left untouched (nodes stay queued; reset still works).
 *
 * Universal node execution model — every non-coordinator node runs:
 *  - Command priority (startNode): node.command (graph JSON / POST) >
 *    NODE_SCRIPTS (demo legacy) > interactive `bash --norc -i` fallback, so
 *    any topology comes alive (pane has a real process, readable/writable).
 *  - All three variants run under a wrapper that appends the real exit code
 *    to <RUN_DIR>/<wsId>/<node>.exit, because herdr's pane.exited event and
 *    pane.get/PaneInfo carry NO exit code (spike REPORT.md § pitfalls).
 *  - Status derivation, two classes:
 *    a. canvas-aware commands (marker protocol .blocked/.progress/.outbox,
 *       incl. NODE_SCRIPTS demo scripts): unchanged marker polling.
 *    b. plain commands / interactive shells: no markers of their own; pane
 *       spawned & process alive -> running; wrapper .exit code 0 ->
 *       completed, non-0 -> failed; pane.exited with no marker -> failed.
 *    An interactive shell staying `running` forever is CORRECT semantics
 *    (the user is working in it). Nodes waiting on strong deps stay queued
 *    until deps complete; failed deps route via error edges / skip cascade.
 *  - Error edges: a node whose only inbound edges are error edges is an
 *    error handler — never scheduled normally; activated when a source
 *    fails (runs its command, or legacy auto-settle for demo n-fail).
 *  - Weak edge labels carry message rate ('N msg/min') from the event stream.
 *
 * herdr pitfalls honored here (spike REPORT.md):
 *  - pane.report_agent rejects 'done'; we report 'idle' on success which herdr
 *    normalizes to done.
 *  - pane.exited carries no exit code, so completion is detected via the
 *    wrapper's exit marker; pane.exited/closed is only a fallback signal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureServer,
  workspaceCreate,
  workspaceList,
  workspaceClose,
  tabCreate,
  paneSplit,
  paneClose,
  paneSendInput,
  paneReportAgent,
  subscribeEvents,
} from './herdr-adapter.js';
import { getGraphStore, type GraphStore } from './graph.js';
import { eventbus } from './eventbus.js';
import { pump } from './pump.js';
import { registry } from './registry.js';
import type { CanvasNode, Graph } from './types.js';
import { exitWrapper, shellQuote } from './shell.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ROOT = process.env.CANVAS_RUN_DIR || '/tmp/canvas-run';
const WORKSPACE_LABEL = 'agent-canvas';

// Demo script mapping: legacy fallback for the demo seed topology. New graphs
// should put `command` on nodes instead of extending this table.
const NODE_SCRIPTS: Record<string, string> = {
  'n-env': 'env-setup.sh',
  'n-data': 'data-process.sh',
  'n-report': 'report-gen.sh',
  'n-chat': 'chat-analysis.sh',
};

const TERMINAL = ['completed', 'failed', 'skipped'];

/** Resolved launch spec for a node — see header for priority. */
type ResolvedCommand =
  | { kind: 'command'; command: string }
  | { kind: 'script'; script: string }
  | { kind: 'shell' };

function resolveCommand(node: CanvasNode): ResolvedCommand {
  if (node.command) return { kind: 'command', command: node.command };
  if (NODE_SCRIPTS[node.id]) return { kind: 'script', script: NODE_SCRIPTS[node.id] };
  return { kind: 'shell' };
}

/**
 * Error handler = inbound error edge(s) and no inbound strong edge. Such
 * nodes are never scheduled by dependency satisfaction; a failure upstream
 * activates them (activateErrorRoutes).
 */
function isErrorHandler(g: Graph, nodeId: string): boolean {
  const inErr = g.edges.some((e) => e.kind === 'error' && e.target === nodeId);
  const inStrong = g.edges.some((e) => e.kind === 'strong' && e.target === nodeId);
  return inErr && !inStrong;
}

class RunContext {
  herdrWorkspaceId: string | null = null;
  rootPaneId: string | null = null;
  /** zoneId -> herdr tabId (Zone = herdr tab). */
  zoneTabs = new Map<string, string>();
  /** zoneId -> first pane in that tab (split base for the zone). */
  zoneRootPanes = new Map<string, string>();
  zonePaneCounts = new Map<string, number>();
  pollTimer: NodeJS.Timeout | null = null;
  rateTimer: NodeJS.Timeout | null = null;
  outboxOffsets = new Map<string, number>();
  handled = new Set<string>();
  /** nodeIds with an in-flight async startNode (schedule re-entry guard). */
  starting = new Set<string>();
  unsubEvents: (() => void) | null = null;
  /** herdr unreachable: skip every herdr call, keep graph data intact. */
  mock = false;

  constructor(readonly wsId: string) {}

  get runDir(): string {
    return path.join(RUN_ROOT, this.wsId);
  }
}

class Coordinator {
  private contexts = new Map<string, RunContext>();
  private onGraphChange: ((workspaceId: string) => void) | null = null;

  onGraphBroadcast(cb: (workspaceId: string) => void): void {
    this.onGraphChange = cb;
  }

  private store(wsId: string): GraphStore {
    const s = getGraphStore(wsId);
    if (!s) throw new Error(`unknown workspace ${wsId}`);
    return s;
  }

  private ctx(wsId: string): RunContext {
    let c = this.contexts.get(wsId);
    if (!c) {
      c = new RunContext(wsId);
      this.contexts.set(wsId, c);
    }
    return c;
  }

  /** Idempotent per workspace: no-op while running or done (reset to re-run). */
  async run(wsId: string): Promise<void> {
    const store = this.store(wsId);
    const g = store.graph;
    if (g.runState === 'running' || g.runState === 'done') return;

    const ctx = this.ctx(wsId);
    const coordId = g.nodes.find((n) => n.type === 'coordinator')?.id;

    // markers are per-run state; wipe leftovers from previous runs/restarts
    fs.rmSync(ctx.runDir, { recursive: true, force: true });
    fs.mkdirSync(ctx.runDir, { recursive: true });
    ctx.handled.clear();
    ctx.outboxOffsets.clear();
    ctx.starting.clear();
    ctx.mock = false;

    store.setRunState('running');
    if (coordId) store.setStatus(coordId, 'running', { statusReason: 'orchestrating' });
    eventbus.append({ workspaceId: wsId, nodeId: coordId, kind: 'lifecycle', text: `run started (workspace ${wsId})` });

    try {
      await this.ensureHerdr(ctx);
    } catch (err) {
      // Mock fallback: herdr down must not break graph data or the run state.
      ctx.mock = true;
      eventbus.append({
        workspaceId: wsId,
        nodeId: coordId,
        kind: 'lifecycle',
        text: `herdr unavailable, running detached (mock): ${String(err).slice(0, 160)}`,
      });
      console.warn(`[coordinator] herdr unavailable for ${wsId}, mock mode: ${err}`);
    }
    this.startPolling(ctx, store);
    this.startRateUpdater(ctx, store);
    if (!ctx.mock) this.subscribeHerdrEvents(ctx, store);
    this.onGraphChange?.(wsId);
    registry.persist();
    this.schedule(ctx, store);
  }

  async reset(wsId: string): Promise<void> {
    const store = this.store(wsId);
    const ctx = this.ctx(wsId);
    this.stopTimers(ctx);
    pump.stopAll(wsId);
    // close panes / herdr workspaces (incl. leaked ones from previous server
    // incarnations — herdr restores sessions across restarts)
    const panes = store.graph.nodes.map((n) => n.paneId).filter(Boolean) as string[];
    for (const p of panes) await paneClose(p);
    try {
      const all = await workspaceList();
      for (const w of all) {
        if (w.label === `${WORKSPACE_LABEL}:${wsId}` || w.id === ctx.herdrWorkspaceId) {
          await workspaceClose(w.id);
        }
      }
    } catch {
      /* herdr may be down; best effort */
    }
    ctx.herdrWorkspaceId = null;
    ctx.rootPaneId = null;
    ctx.zoneTabs.clear();
    ctx.zoneRootPanes.clear();
    ctx.zonePaneCounts.clear();
    ctx.handled.clear();
    ctx.outboxOffsets.clear();
    ctx.starting.clear();
    ctx.mock = false;
    fs.rmSync(ctx.runDir, { recursive: true, force: true });
    store.reset();
    eventbus.append({ workspaceId: wsId, kind: 'lifecycle', text: `graph reset (workspace ${wsId})` });
    this.onGraphChange?.(wsId);
    registry.persist();
  }

  async sendInput(wsId: string, nodeId: string, text: string): Promise<void> {
    const node = this.store(wsId).getNode(nodeId);
    if (!node?.paneId) throw new Error(`node ${nodeId} has no pane`);
    await paneSendInput(node.paneId, text, ['Enter']);
    eventbus.append({ workspaceId: wsId, nodeId, kind: 'input', text: `> ${text}` });
  }

  async approve(wsId: string, nodeId: string, decision: 'approve' | 'reject', note?: string): Promise<void> {
    const store = this.store(wsId);
    const ctx = this.ctx(wsId);
    const node = store.getNode(nodeId);
    if (!node) throw new Error(`unknown node ${nodeId}`);
    if (node.status !== 'waiting') throw new Error(`node ${nodeId} is not waiting (status=${node.status})`);
    const prompt = node.approval?.prompt ?? node.statusReason ?? '';
    eventbus.append({ workspaceId: wsId, nodeId, kind: 'approval', text: `approval ${decision}${note ? ` (${note})` : ''}: ${prompt}` });
    if (decision === 'approve') {
      store.setStatus(nodeId, 'running', { statusReason: 'approved, resuming' });
      if (node.paneId) {
        await paneReportAgent(node.paneId, node.agentId, 'working', 'approved, resuming').catch(() => {});
        await paneSendInput(node.paneId, 'go', ['Enter']);
      }
    } else {
      store.setStatus(nodeId, 'failed', { statusReason: 'approval rejected' });
      if (node.paneId) {
        await paneSendInput(node.paneId, 'abort', ['Enter']).catch(() => {});
        await paneReportAgent(node.paneId, node.agentId, 'unknown', 'rejected').catch(() => {});
      }
      this.checkDone(ctx, store);
    }
  }

  // -------------------------------------------------------------------------

  /** herdr workspace + one tab per canvas Zone (Zone = herdr tab). */
  private async ensureHerdr(ctx: RunContext): Promise<void> {
    if (ctx.herdrWorkspaceId) return;
    await ensureServer();
    const ws = await workspaceCreate(`${WORKSPACE_LABEL}:${ctx.wsId}`, REPO_ROOT);
    ctx.herdrWorkspaceId = ws.id;
    ctx.rootPaneId = ws.rootPaneId ?? null;
    if (!ctx.rootPaneId) throw new Error('workspace.create returned no root pane');
    eventbus.append({ workspaceId: ctx.wsId, kind: 'lifecycle', text: `herdr workspace ${ws.id} created (root pane ${ctx.rootPaneId})` });

    const store = this.store(ctx.wsId);
    for (const zone of store.graph.zones) {
      try {
        const tab = await tabCreate(ws.id, zone.title);
        ctx.zoneTabs.set(zone.id, tab.id);
        if (tab.rootPaneId) ctx.zoneRootPanes.set(zone.id, tab.rootPaneId);
        eventbus.append({ workspaceId: ctx.wsId, kind: 'lifecycle', text: `zone "${zone.title}" -> tab ${tab.id}` });
      } catch (err) {
        // tab API not available in this herdr build: fall back to root pane
        console.warn(`[coordinator] tab.create failed for zone ${zone.id}: ${err}`);
      }
    }
  }

  /** Start every node whose strong dependencies are satisfied. */
  private schedule(ctx: RunContext, store: GraphStore): void {
    if (ctx.mock) return; // no herdr: leave graph data untouched
    const g = store.graph;
    let progressed = false;
    for (const node of g.nodes) {
      if (node.status !== 'queued') continue;
      if (node.type === 'coordinator') continue; // orchestrator, no pane
      if (isErrorHandler(g, node.id)) continue; // activated by error routes only
      if (ctx.starting.has(node.id)) continue; // spawn already in flight (see below)
      const deps = g.edges.filter((e) => e.kind === 'strong' && e.target === node.id);
      const satisfied = deps.every((e) => {
        const src = store.getNode(e.source);
        return src && (src.status === 'completed' || (src.type === 'coordinator' && src.status === 'running'));
      });
      // n-chat is triggered by n-data completion via the weak consume edge
      if (node.id === 'n-chat') {
        const data = store.getNode('n-data');
        if (!data || data.status !== 'completed') continue;
      } else if (!satisfied) {
        continue;
      }
      // Reserve SYNCHRONOUSLY before the async startNode: schedule() is
      // re-entered from every concurrent finishNode (e.g. parallel nodes
      // exiting in the same poll cycle), and while startNode is suspended
      // on paneSplit/paneReportAgent the node is still 'queued' — without
      // this guard each re-entry spawns another pane running the same
      // command (observed: 3 simultaneous exits -> n-compare spawned 3x).
      ctx.starting.add(node.id);
      progressed = true;
      void this.startNode(ctx, store, node)
        .catch((err) => {
          store.setStatus(node.id, 'failed', { statusReason: `spawn failed: ${String(err).slice(0, 120)}` });
          this.checkDone(ctx, store);
        })
        .finally(() => ctx.starting.delete(node.id));
    }
    if (!progressed) this.checkDone(ctx, store);
  }

  private async startNode(ctx: RunContext, store: GraphStore, node: CanvasNode): Promise<void> {
    if (!ctx.herdrWorkspaceId || !ctx.rootPaneId) throw new Error('no workspace');
    // Pane placement: nodes with a zoneId live in their zone's tab — the tab's
    // first pane is used directly, later nodes split off it. Zone-less nodes
    // use the workspace root pane the same way.
    let paneId: string;
    if (node.zoneId) {
      const used = ctx.zonePaneCounts.get(node.zoneId) ?? 0;
      const zoneBase = ctx.zoneRootPanes.get(node.zoneId);
      if (used === 0 && zoneBase) {
        paneId = zoneBase;
      } else {
        const base = zoneBase ?? ctx.rootPaneId;
        const pane = await paneSplit(base, used % 2 === 0 ? 'right' : 'down', REPO_ROOT);
        paneId = pane.id;
      }
      ctx.zonePaneCounts.set(node.zoneId, used + 1);
    } else {
      const usedPanes = store.graph.nodes.filter((n) => n.paneId).length;
      if (usedPanes === 0) {
        paneId = ctx.rootPaneId;
      } else {
        const pane = await paneSplit(ctx.rootPaneId, usedPanes % 2 === 1 ? 'right' : 'down', REPO_ROOT);
        paneId = pane.id;
      }
    }
    store.patchNode(node.id, { paneId });
    await paneReportAgent(paneId, node.agentId, 'working', `${node.title} started`);
    store.setStatus(node.id, 'running', { statusReason: undefined, progress: 0 });

    const resolved = resolveCommand(node);
    const exitFile = path.join(ctx.runDir, `${node.id}.exit`);
    fs.rmSync(exitFile, { force: true });
    // Every variant ends with `; printf '%s' $? > <exitFile>`: herdr exposes
    // no exit code anywhere (pane.exited event and pane.get/PaneInfo lack it,
    // spike REPORT.md), so the wrapper captures it in-shell. Canvas-aware
    // commands additionally honor CANVAS_RUN_DIR for .blocked/.progress/
    // .outbox markers — always export it explicitly, or pollMarkers (which
    // reads ctx.runDir) never sees them and approval gates silently time out.
    let cmd: string;
    let what: string;
    if (resolved.kind === 'script') {
      const script = path.join(REPO_ROOT, 'scripts', 'agents', resolved.script);
      cmd = exitWrapper(`CANVAS_RUN_DIR=${shellQuote(ctx.runDir)} bash ${shellQuote(script)} ${shellQuote(node.id)}`, exitFile);
      what = resolved.script;
    } else if (resolved.kind === 'command') {
      // Materialize the command into a file: robust against any quoting the
      // command itself contains (single quotes would break `bash -c '...'`).
      const cmdFile = path.join(ctx.runDir, `${node.id}.cmd.sh`);
      fs.writeFileSync(cmdFile, `#!/usr/bin/env bash\n${resolved.command}\n`);
      cmd = exitWrapper(`CANVAS_RUN_DIR=${shellQuote(ctx.runDir)} bash ${shellQuote(cmdFile)}`, exitFile);
      what = resolved.command.length > 80 ? `${resolved.command.slice(0, 77)}...` : resolved.command;
    } else {
      // Interactive fallback keeps any topology alive. No `exec`: when the
      // inner shell exits, the marker is written and the outer pane shell
      // stays open for output inspection. Long-lived shell = running, which
      // is the correct semantics (the user is working in it).
      cmd = exitWrapper('bash --norc -i', exitFile);
      what = 'interactive bash';
    }
    eventbus.append({ workspaceId: ctx.wsId, nodeId: node.id, kind: 'lifecycle', text: `pane ${paneId} spawned, running ${what}` });
    await paneSendInput(paneId, cmd, ['Enter']);
  }

  // -- marker polling (status protocol with scripts) -------------------------

  private startPolling(ctx: RunContext, store: GraphStore): void {
    if (ctx.pollTimer) return;
    ctx.pollTimer = setInterval(() => this.pollMarkers(ctx, store), 400);
  }

  private pollMarkers(ctx: RunContext, store: GraphStore): void {
    if (store.graph.runState !== 'running') return;
    let files: string[] = [];
    try {
      files = fs.readdirSync(ctx.runDir);
    } catch {
      return;
    }
    for (const f of files) {
      const m = f.match(/^([\w-]+)\.(blocked|exit|progress)$/);
      if (!m) continue;
      const [, nodeId, kind] = m;
      const key = `${nodeId}.${kind}`;
      const full = path.join(ctx.runDir, f);
      if (kind === 'blocked' && !ctx.handled.has(key)) {
        ctx.handled.add(key);
        const prompt = fs.readFileSync(full, 'utf8').trim() || 'approval requested';
        const node = store.getNode(nodeId);
        if (node && node.status === 'running') {
          if (node.paneId) void paneReportAgent(node.paneId, node.agentId, 'blocked', prompt).catch(() => {});
          store.setStatus(nodeId, 'waiting', { statusReason: prompt, approval: { prompt } });
          eventbus.append({ workspaceId: ctx.wsId, nodeId, kind: 'approval', text: `approval requested: ${prompt}` });
        }
      } else if (kind === 'exit' && !ctx.handled.has(key)) {
        ctx.handled.add(key);
        const code = parseInt(fs.readFileSync(full, 'utf8').trim(), 10);
        void this.finishNode(ctx, store, nodeId, Number.isNaN(code) ? 1 : code);
      } else if (kind === 'progress') {
        const p = parseFloat(fs.readFileSync(full, 'utf8').trim());
        const node = store.getNode(nodeId);
        if (node && !Number.isNaN(p) && node.progress !== p) {
          store.patchNode(nodeId, { progress: p });
        }
      }
    }
    this.tailOutboxes(ctx);
  }

  private tailOutboxes(ctx: RunContext): void {
    let files: string[] = [];
    try {
      files = fs.readdirSync(ctx.runDir).filter((f) => f.endsWith('.outbox'));
    } catch {
      return;
    }
    for (const f of files) {
      const nodeId = f.replace(/\.outbox$/, '');
      const full = path.join(ctx.runDir, f);
      const size = fs.statSync(full).size;
      const off = ctx.outboxOffsets.get(nodeId) ?? 0;
      if (size <= off) continue;
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(size - off);
      fs.readSync(fd, buf, 0, size - off, off);
      fs.closeSync(fd);
      ctx.outboxOffsets.set(nodeId, size);
      for (const line of buf.toString('utf8').split('\n')) {
        const t = line.trim();
        if (t) eventbus.append({ workspaceId: ctx.wsId, nodeId, kind: 'message', text: t });
      }
    }
  }

  private async finishNode(ctx: RunContext, store: GraphStore, nodeId: string, code: number): Promise<void> {
    const node = store.getNode(nodeId);
    if (!node || TERMINAL.includes(node.status)) return;
    if (code === 0) {
      store.setStatus(nodeId, 'completed', { progress: 1, statusReason: undefined });
      if (node.paneId) await paneReportAgent(node.paneId, node.agentId, 'idle', 'done').catch(() => {});
      eventbus.append({ workspaceId: ctx.wsId, nodeId, kind: 'lifecycle', text: `${nodeId} completed (exit 0)` });
    } else {
      store.setStatus(nodeId, 'failed', { statusReason: `exit ${code}` });
      if (node.paneId) await paneReportAgent(node.paneId, node.agentId, 'unknown', `exit ${code}`).catch(() => {});
      eventbus.append({ workspaceId: ctx.wsId, nodeId, kind: 'lifecycle', text: `${nodeId} failed (exit ${code})` });
      this.activateErrorRoutes(ctx, store, nodeId);
    }
    this.schedule(ctx, store);
    this.checkDone(ctx, store);
  }

  /**
   * Fire every error edge out of a failed node. Handlers with a real command
   * (node.command / NODE_SCRIPTS) are started for real; handlers without one
   * auto-settle (legacy demo n-fail behavior: receive -> archive -> done).
   */
  private activateErrorRoutes(ctx: RunContext, store: GraphStore, failedId: string): void {
    for (const edge of store.graph.edges.filter((e) => e.kind === 'error' && e.source === failedId)) {
      store.patchEdge(edge.id, { label: 'error routed' });
      eventbus.append({ workspaceId: ctx.wsId, nodeId: failedId, kind: 'edge', text: `error route ${failedId} -> ${edge.target} activated` });
      const target = store.getNode(edge.target);
      if (!target || TERMINAL.includes(target.status) || target.status === 'running') continue;
      if (target.command || NODE_SCRIPTS[target.id]) {
        if (ctx.starting.has(target.id)) continue; // same re-entry guard as schedule()
        ctx.starting.add(target.id);
        void this.startNode(ctx, store, target)
          .catch((err) => {
            store.setStatus(target.id, 'failed', { statusReason: `spawn failed: ${String(err).slice(0, 120)}` });
            this.checkDone(ctx, store);
          })
          .finally(() => ctx.starting.delete(target.id));
      } else {
        store.setStatus(target.id, 'running', { statusReason: '接收失败产物' });
        setTimeout(() => {
          store.setStatus(target.id, 'completed', { statusReason: '失败报告已归档', progress: 1 });
          this.checkDone(ctx, store);
        }, 800);
      }
    }
  }

  /** Mark queued worker nodes as skipped when an upstream strong dep failed/skipped. */
  private propagateSkips(store: GraphStore): void {
    const g = store.graph;
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of g.nodes) {
        if (node.status !== 'queued' || node.type === 'coordinator') continue;
        if (isErrorHandler(g, node.id)) continue; // error handlers settle via checkDone
        const deps = g.edges
          .filter((e) => e.kind === 'strong' && e.target === node.id)
          .map((e) => e.source);
        if (node.id === 'n-chat') deps.push('n-data');
        const doomed = deps.some((id) => {
          const s = store.getNode(id)?.status;
          return s === 'failed' || s === 'skipped';
        });
        if (doomed) {
          store.setStatus(node.id, 'skipped', { statusReason: 'upstream failed' });
          eventbus.append({ workspaceId: store.workspaceId, nodeId: node.id, kind: 'lifecycle', text: `${node.id} skipped (upstream failed)` });
          changed = true;
        }
      }
    }
  }

  private checkDone(ctx: RunContext, store: GraphStore): void {
    const g = store.graph;
    if (g.runState !== 'running') return;
    this.propagateSkips(store);
    const workers = g.nodes.filter((n) => n.type !== 'coordinator');
    const allSettled = workers.every((n) => {
      if (TERMINAL.includes(n.status)) return true;
      // An error handler whose route never fired (no source failed) is
      // settled while still queued — the run must not wait for it.
      if (n.status === 'queued' && isErrorHandler(g, n.id)) {
        return g.edges
          .filter((e) => e.kind === 'error' && e.target === n.id)
          .every((e) => store.getNode(e.source)?.status !== 'failed');
      }
      return false;
    });
    if (allSettled) {
      store.setRunState('done');
      const coord = g.nodes.find((n) => n.type === 'coordinator');
      if (coord) store.setStatus(coord.id, 'completed', { statusReason: 'run finished', progress: 1 });
      eventbus.append({ workspaceId: ctx.wsId, nodeId: coord?.id, kind: 'lifecycle', text: 'run done' });
      this.stopTimers(ctx);
      this.onGraphChange?.(ctx.wsId);
      registry.persist();
    }
  }

  // -- weak-edge message rate labels -----------------------------------------

  private startRateUpdater(ctx: RunContext, store: GraphStore): void {
    if (ctx.rateTimer) return;
    ctx.rateTimer = setInterval(() => {
      for (const edge of store.graph.edges) {
        if (edge.kind !== 'weak') continue;
        const rate = eventbus.ratePerMinute(ctx.wsId, [edge.source, edge.target]);
        const label = `${rate} msg/min`;
        if (edge.label !== label) store.patchEdge(edge.id, { label });
      }
    }, 5000);
  }

  // -- herdr lifecycle events -------------------------------------------------

  private subscribeHerdrEvents(ctx: RunContext, store: GraphStore): void {
    if (ctx.unsubEvents) return;
    const sub = subscribeEvents((ev) => this.handlePaneEvent(ctx, store, ev));
    ctx.unsubEvents = sub.close;
  }

  private handlePaneEvent(ctx: RunContext, store: GraphStore, ev: import('./herdr-adapter.js').HerdrEvent): void {
    if (ev.event === 'pane.exited' || ev.event === 'pane.closed') {
      const paneId = ev.data.pane_id as string | undefined;
      const node = store.graph.nodes.find((n) => n.paneId === paneId);
      if (node && !TERMINAL.includes(node.status)) {
        // pane.exited carries no exit code, but the launch wrapper writes
        // <node>.exit right after the command/shell returns — prefer that
        // real code. Only a pane that died before the marker existed means
        // genuine unexpected death (e.g. user killed the pane mid-work).
        let code: number | null = null;
        try {
          const parsed = parseInt(fs.readFileSync(path.join(ctx.runDir, `${node.id}.exit`), 'utf8').trim(), 10);
          if (!Number.isNaN(parsed)) code = parsed;
        } catch {
          /* no marker */
        }
        if (code !== null) {
          ctx.handled.add(`${node.id}.exit`); // pollMarkers must not double-finish
          void this.finishNode(ctx, store, node.id, code);
        } else {
          store.setStatus(node.id, 'failed', { statusReason: `pane ${ev.event === 'pane.exited' ? 'exited' : 'closed'} unexpectedly` });
          eventbus.append({ workspaceId: ctx.wsId, nodeId: node.id, kind: 'lifecycle', text: `pane ${paneId} ${ev.event}` });
          this.activateErrorRoutes(ctx, store, node.id);
          this.schedule(ctx, store);
          this.checkDone(ctx, store);
        }
      }
    }
  }

  private stopTimers(ctx: RunContext): void {
    if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    if (ctx.rateTimer) clearInterval(ctx.rateTimer);
    ctx.pollTimer = null;
    ctx.rateTimer = null;
    if (ctx.unsubEvents) ctx.unsubEvents();
    ctx.unsubEvents = null;
  }
}

export const coordinator = new Coordinator();

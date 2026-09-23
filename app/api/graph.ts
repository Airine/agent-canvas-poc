/**
 * graph.ts — canvas graph model + six-state state machine (contract §1/§4/§5).
 *
 * Multi-workspace edition: one GraphStore per workspaceId, held in a Map.
 * initialGraph() loads the demo seed JSON (graphs/demo-release-pipeline.json)
 * and falls back to the hardcoded v0 demo topology if the file is missing.
 *
 * Six states: queued | running | waiting | completed | failed | skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CanvasEdge, CanvasNode, Graph, NodeStatus } from './types.js';
import { eventbus } from './eventbus.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DEMO_SEED = path.join(API_ROOT, 'graphs', 'demo-release-pipeline.json');

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Demo graph: seed JSON first, hardcoded v0 topology as fallback. */
export function initialGraph(): Graph {
  try {
    const seed = JSON.parse(fs.readFileSync(DEMO_SEED, 'utf8')) as { graph: Graph };
    if (seed.graph?.nodes && seed.graph?.edges) return normalizeGraph(seed.graph);
  } catch {
    /* fall through to hardcoded demo */
  }
  const nodes: CanvasNode[] = [
    { id: 'n-coord', type: 'coordinator', title: 'Coordinator', status: 'queued', harness: 'canvas-orchestrator', env: 'herdr-local', agentId: 'ag-coord-01', x: 80, y: 64, zoneId: 'z-prepare' },
    { id: 'n-env', type: 'operation', title: '环境初始化', status: 'queued', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-env-01', x: 80, y: 224, zoneId: 'z-prepare' },
    { id: 'n-data', type: 'operation', title: '数据处理', status: 'queued', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-data-01', x: 500, y: 64, zoneId: 'z-exec' },
    { id: 'n-report', type: 'operation', title: '报告生成', status: 'queued', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-report-01', x: 500, y: 224, zoneId: 'z-exec' },
    { id: 'n-fail', type: 'artifact', title: '失败处置', status: 'queued', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-fail-01', x: 920, y: 224, zoneId: 'z-deliver' },
    { id: 'n-chat', type: 'chat', title: '分析汇报', status: 'queued', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-chat-01', x: 920, y: 64, zoneId: 'z-deliver' },
  ];
  const edges: CanvasEdge[] = [
    { id: 'e-coord-env', source: 'n-coord', target: 'n-env', kind: 'strong' },
    { id: 'e-env-data', source: 'n-env', target: 'n-data', kind: 'strong' },
    { id: 'e-env-report', source: 'n-env', target: 'n-report', kind: 'strong' },
    { id: 'e-report-fail', source: 'n-report', target: 'n-fail', kind: 'error' },
    { id: 'e-coord-env-weak', source: 'n-coord', target: 'n-env', kind: 'weak', label: '0 msg/min' },
    { id: 'e-data-chat', source: 'n-data', target: 'n-chat', kind: 'weak', label: '0 msg/min' },
  ];
  return {
    nodes,
    edges,
    zones: [
      { id: 'z-prepare', title: '准备' },
      { id: 'z-exec', title: '执行' },
      { id: 'z-deliver', title: '交付' },
    ],
    runState: 'idle',
  };
}

/** Defensive normalization for graphs coming from JSON / the network. */
export function normalizeGraph(g: Graph): Graph {
  return {
    nodes: g.nodes ?? [],
    edges: g.edges ?? [],
    zones: g.zones ?? [],
    runState: g.runState ?? 'idle',
  };
}

const TERMINAL: NodeStatus[] = ['completed', 'failed', 'skipped'];

export type PatchMessage = { type: 'node'; node: CanvasNode } | { type: 'edge'; edge: CanvasEdge };
type AnyPatchListener = (workspaceId: string, msg: PatchMessage) => void;

const anyPatchListeners = new Set<AnyPatchListener>();

/** Subscribe to node/edge patches across every GraphStore (broadcast hub). */
export function onAnyPatch(l: AnyPatchListener): () => void {
  anyPatchListeners.add(l);
  return () => anyPatchListeners.delete(l);
}

export class GraphStore {
  readonly workspaceId: string;
  graph: Graph;
  private readonly initial: Graph;
  private nodeListeners = new Set<(node: CanvasNode) => void>();
  private edgeListeners = new Set<(edge: CanvasEdge) => void>();

  constructor(workspaceId: string, graph: Graph) {
    this.workspaceId = workspaceId;
    this.graph = deepClone(normalizeGraph(graph));
    this.initial = deepClone(this.graph);
  }

  onNodePatch(l: (node: CanvasNode) => void): () => void {
    this.nodeListeners.add(l);
    return () => this.nodeListeners.delete(l);
  }
  onEdgePatch(l: (edge: CanvasEdge) => void): () => void {
    this.edgeListeners.add(l);
    return () => this.edgeListeners.delete(l);
  }

  getNode(id: string): CanvasNode | undefined {
    return this.graph.nodes.find((n) => n.id === id);
  }

  setStatus(id: string, status: NodeStatus, extra: Partial<CanvasNode> = {}): CanvasNode | undefined {
    const node = this.getNode(id);
    if (!node) return undefined;
    const prev = node.status;
    node.status = status;
    Object.assign(node, extra);
    if (status === 'running' && !node.startedAt) node.startedAt = new Date().toISOString();
    if (status !== 'waiting') delete node.approval;
    if (TERMINAL.includes(status)) node.endedAt = new Date().toISOString();
    if (prev !== status) {
      eventbus.append({
        nodeId: id,
        kind: 'status',
        text: `${id}: ${prev} -> ${status}${node.statusReason ? ` (${node.statusReason})` : ''}`,
      });
    }
    this.emitNode(node);
    return node;
  }

  patchNode(id: string, patch: Partial<CanvasNode>): CanvasNode | undefined {
    const node = this.getNode(id);
    if (!node) return undefined;
    Object.assign(node, patch);
    this.emitNode(node);
    return node;
  }

  patchEdge(id: string, patch: Partial<CanvasEdge>): CanvasEdge | undefined {
    const edge = this.graph.edges.find((e) => e.id === id);
    if (!edge) return undefined;
    Object.assign(edge, patch);
    for (const l of this.edgeListeners) l({ ...edge });
    for (const l of anyPatchListeners) l(this.workspaceId, { type: 'edge', edge: { ...edge } });
    return edge;
  }

  setRunState(runState: Graph['runState']): void {
    this.graph.runState = runState;
  }

  reset(): void {
    this.graph = deepClone(this.initial);
  }

  private emitNode(node: CanvasNode): void {
    for (const l of this.nodeListeners) l({ ...node });
    for (const l of anyPatchListeners) l(this.workspaceId, { type: 'node', node: { ...node } });
  }
}

// ---------------------------------------------------------------------------
// Store registry: one GraphStore per workspaceId.
// ---------------------------------------------------------------------------

const stores = new Map<string, GraphStore>();

export function registerGraphStore(workspaceId: string, graph: Graph): GraphStore {
  const existing = stores.get(workspaceId);
  if (existing) return existing;
  const store = new GraphStore(workspaceId, graph);
  stores.set(workspaceId, store);
  return store;
}

export function getGraphStore(workspaceId: string): GraphStore | undefined {
  return stores.get(workspaceId);
}

export function removeGraphStore(workspaceId: string): void {
  stores.delete(workspaceId);
}

export function listGraphStores(): Array<[string, GraphStore]> {
  return [...stores.entries()];
}

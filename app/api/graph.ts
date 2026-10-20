/**
 * graph.ts — canvas graph model + six-state state machine (contract §1/§4/§5).
 *
 * Multi-workspace edition: one GraphStore per workspaceId, held in a Map.
 *
 * Six states: queued | running | waiting | completed | failed | skipped.
 */
import type { CanvasEdge, CanvasNode, Graph, NodeStatus } from './types.js';
import { eventbus } from './eventbus.js';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
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
        workspaceId: this.workspaceId,
        nodeId: id,
        kind: 'status',
        text: `${id}: ${prev} -> ${status}${node.statusReason ? ` (${node.statusReason})` : ''}`,
      });
    }
    this.emitNode(node);
    return node;
  }

  upsertNode(node: CanvasNode): void {
    const prior = this.getNode(node.id);
    if (prior) Object.assign(prior, node);
    else this.graph.nodes.push(node);
    this.emitNode(prior ?? node);
  }

  patchNode(id: string, patch: Partial<CanvasNode>): CanvasNode | undefined {
    const node = this.getNode(id);
    if (!node) return undefined;
    Object.assign(node, patch);
    this.emitNode(node);
    return node;
  }

  upsertEdge(edge: CanvasEdge): void {
    const prior = this.graph.edges.find(e => e.id === edge.id);
    if (prior) { this.patchEdge(edge.id, edge); return; }
    this.graph.edges.push(edge);
    for (const l of this.edgeListeners) l({ ...edge });
    for (const l of anyPatchListeners) l(this.workspaceId, { type: 'edge', edge: { ...edge } });
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

/**
 * Contract types — frozen contract with the frontend (multi-workspace version).
 * Zero deviation: field names and enums are the contract.
 */

import type { Lifecycle, SessionRef, SessionView } from './e/contracts.js';

export type NodeStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';
export type NodeType = 'coordinator' | 'operation' | 'chat' | 'artifact';
export type EdgeKind = 'strong' | 'weak' | 'error' | 'communication' | 'spawn';

export interface CanvasZone {
  id: string;
  title: string;
}

export interface ApprovalInfo {
  prompt: string;
}

export interface CanvasNode {
  backend?: 'e' | 'herdr';
  sessionRef?: SessionRef;
  sessionState?: Lifecycle;
  sessionStatus?: string;
  summary?: string;
  id: string;
  type: NodeType;
  title: string;
  status: NodeStatus;
  harness: string;
  env: string;
  agentId: string;
  x: number;
  y: number;
  /** Owning Zone (= herdr tab). */
  zoneId?: string;
  /**
   * Shell command executed in this node's pane after spawn. Priority in
   * coordinator.startNode: node.command > NODE_SCRIPTS (demo legacy) >
   * interactive bash fallback. Canvas-aware commands may write
   * .blocked/.progress/.outbox markers under $CANVAS_RUN_DIR.
   */
  command?: string;
  /** ISO-8601 timestamps. */
  startedAt?: string;
  endedAt?: string;
  statusReason?: string;
  paneId?: string;
  approval?: ApprovalInfo;
  progress?: number;
  archivedAt?: string;
}

export interface CanvasEdge {
  communication?: import('./e/collaboration-contracts.js').CommunicationSummary;
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
}

export interface Graph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  zones: CanvasZone[];
  runState: 'idle' | 'running' | 'done';
}

export type WorkspaceStatus = 'idle' | 'running' | 'done' | 'failed';

export interface WorkspaceSummary {
  archivedAt?: string;
  backend: 'e' | 'herdr';
  source: 'live' | 'demo';
  id: string;
  title: string;
  path: string;
  description: string;
  createdAt: string;
  lastActiveAt: string;
  status: WorkspaceStatus;
  /** Full graph; the home page uses it for the mini preview. */
  graph: Graph;
}

export interface CanvasEvent {
  workspaceId: string;
  id: number;
  ts: number;
  nodeId?: string;
  kind: string;
  text: string;
}

// WS server -> client messages.
// graph/node/edge/term carry workspaceId so clients can multiplex canvases.
export type ServerMessage =
  | { type: 'graph'; graph: Graph; workspaceId?: string; backend?: 'e' | 'herdr'; source?: 'live' | 'demo'; archivedAt?: string }
  | { type: 'session'; session: SessionView; workspaceId: string }
  | { type: 'error'; error: string; workspaceId?: string }
  | { type: 'node'; node: CanvasNode; workspaceId?: string }
  | { type: 'edge'; edge: CanvasEdge; workspaceId?: string }
  | { type: 'term'; nodeId: string; ansi: string; workspaceId?: string }
  | { type: 'event'; event: CanvasEvent; workspaceId?: string };

// WS client -> server messages
export type ClientMessage =
  | { type: 'hello'; workspaceId?: string }
  | { type: 'term.subscribe'; nodeId: string; workspaceId?: string }
  | { type: 'term.unsubscribe'; nodeId: string; workspaceId?: string };

import type { SessionView, SessionRef, Lifecycle } from '../../../api/e/contracts';

/* ================= 契约 §1 数据模型 ================= */

export type NodeStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';
export type NodeType = 'coordinator' | 'operation' | 'chat' | 'artifact';
export type EdgeKind = 'strong' | 'weak' | 'error' | 'communication' | 'spawn';

export interface CanvasNode {
  nativeEngine?: 'codex';
  backend?: 'e' | 'herdr'; sessionRef?: SessionRef; sessionState?: Lifecycle; sessionStatus?: string; summary?: string;
  id: string;
  type: NodeType;
  title: string;
  status: NodeStatus;
  harness: string;
  env: string;
  agentId: string;
  x: number;
  y: number;
  /** 分区归属（冻结契约）：Zone 容器按成员节点坐标自适应边界 */
  zoneId?: string;
  startedAt?: number;
  endedAt?: number;
  statusReason?: string;
  paneId?: string;
  /** 冻结契约 v1：节点启动命令（纯展示用途，前端暂不消费） */
  command?: string;
  approval?: { prompt: string };
  progress?: number;
  archivedAt?: string;
}

export interface CanvasEdge {
  communication?: import('../../../api/e/collaboration-contracts').CommunicationSummary;
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
}

export type RunState = 'idle' | 'running' | 'done';

/** 冻结契约：画布分区（Zone 容器 = 半透明底 + 顶部标题栏，边界由成员节点坐标计算） */
export interface CanvasZone {
  id: string;
  title: string;
}

export interface Graph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  zones: CanvasZone[];
  runState: RunState;
}

/** 冻结契约：workspace 摘要（GET /api/workspaces，主页按 path 分组聚合渲染） */
export interface WorkspaceSummary {
  archivedAt?: string;
  backend?: 'e' | 'herdr'; source?: 'live' | 'demo';
  id: string;
  title: string;
  path: string;
  description: string;
  createdAt: string;
  lastActiveAt: string;
  status: 'idle' | 'running' | 'done' | 'failed';
  graph: Graph;
}

/** 契约 §3 事件（WS event / GET /api/nodes/:id/events 回放） */
export interface NodeEvent {
  workspaceId?: string;
  id: number;
  ts: number;
  nodeId?: string;
  kind: string;
  text: string;
}

/* ================= 契约 §3 WS 消息 ================= */

export type ClientMessage =
  | { type: 'hello'; workspaceId?: string }
  | { type: 'term.subscribe'; nodeId: string }
  | { type: 'term.unsubscribe'; nodeId: string };

type ServerFrame =
  | { type: 'graph'; graph: Graph; backend?: 'e' | 'herdr'; source?: 'live' | 'demo'; archivedAt?: string }
  | { type: 'session'; session: SessionView }
  | { type: 'error'; error: string }
  | { type: 'node'; node: CanvasNode }
  | { type: 'edge'; edge: CanvasEdge }
  | { type: 'term'; nodeId: string; ansi: string }
  | { type: 'event'; event: NodeEvent };
export type ServerMessage = ServerFrame & { workspaceId?: string; generation?: string; sequence?: number };

/* ================= 后端抽象（远程 / 浏览器内 mock 同构） ================= */

export interface BackendApi {
  send(msg: ClientMessage): void;
  post(path: string, body?: unknown): Promise<{ ok: boolean }>;
  getNodeEvents(nodeId: string): Promise<NodeEvent[]>;
  dispose(): void;
}

export type ConnState = 'connecting' | 'online' | 'reconnecting' | 'mock';

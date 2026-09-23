/**
 * Agent Canvas PoC — 共享类型定义（design.md §8.1）
 * 与画布引擎无关：React Flow / tldraw 两个适配层共用。
 */

/** 节点六态（§1.1.2）。状态词为协议词汇，保留英文小写。 */
export type NodeStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'skipped';

/** 三类节点 + Coordinator 根节点（§1.1.3） */
export type NodeKind = 'coordinator' | 'artifact' | 'operation' | 'chat';

/** 边类型（§1.1.4 / §4）：强链接实线 / 弱链接虚线 / 错误路由 */
export type EdgeKind = 'strong' | 'weak' | 'error';

/** LOD 档位（§3.2）：L0 全局摘要 / L1 默认活窗 / L1s 大活窗 / L2 专注 */
export type ViewMode = 'L0' | 'L1' | 'L1s' | 'L2';

/** 节点身份四元组（§3.1 第二行）[R§2.2.2] */
export interface NodeIdentity {
  harness: string;
  env: string;
  agentId: string;
  model: string;
}

/** 画布节点静态定义（mock 拓扑 §2.3） */
export interface CanvasNodeDef {
  id: string;
  kind: NodeKind;
  title: string;
  /** 活窗窗口栏标题，如 `terminal · sandbox-01` */
  windowTitle: string;
  identity: NodeIdentity;
  /** 默认态 DOM 宽（PoC 固定 400px；Coordinator 320px，§3.3.4） */
  width: number;
  position: { x: number; y: number };
}

export interface CanvasEdgeDef {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  /** hover 语义标签（§4）：`强依赖 · 事务` / `弱链接 · 通信` / `产物引用 · artifact v3 →` */
  semantic: string;
}

/* ---------------- 终端（§3.3.2） ---------------- */

export type TerminalLineKind = 'cmd' | 'stdout' | 'stderr' | 'success';

export interface TerminalLine {
  kind: TerminalLineKind;
  text: string;
}

/* ---------------- 产物（§3.3.1） ---------------- */

export interface ArtifactVersion {
  /** 1 起 */
  v: number;
  /** 命名里程碑，如 `v4 · 配色定稿` */
  label?: string;
  /** Markdown/HTML 内容（快照） */
  content: string;
}

/* ---------------- 对话（§3.3.3） ---------------- */

export type TodoStatus = 'done' | 'current' | 'pending';

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

export type ToolCallStatus = 'running' | 'done' | 'failed';

export interface ToolCall {
  id: string;
  tool: string;
  /** 参数摘要，如 `"agent canvas"` */
  argsSummary: string;
  status: ToolCallStatus;
  /** 耗时文案，如 `1.2s` */
  duration?: string;
  /** 展开后的类型化负载 */
  detail?:
    | { type: 'search'; results: string[] }
    | { type: 'edit'; diff: { added: string[]; removed: string[] } }
    | { type: 'bash'; command: string; output: string };
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  text: string;
}

export type ChatItem =
  | { type: 'message'; message: ChatMessage }
  | { type: 'toolcall'; toolCall: ToolCall };

export type ApprovalDecision = 'approved' | 'rejected' | 'edited';

export interface ApprovalState {
  /** 如 `将访问外部站点 x.com` */
  reason: string;
  decision?: ApprovalDecision;
}

/* ---------------- 委派卡片（§3.3.4） ---------------- */

export interface DelegationItem {
  nodeId: string;
  kind: NodeKind;
  title: string;
  status: NodeStatus;
}

/* ---------------- 事件流（§8.1 append-only） ---------------- */

interface EventBase {
  /** 事件序号（0 起） */
  id: number;
  /** 相对时间轴毫秒偏移 */
  t: number;
}

export type AgentEvent = EventBase &
  (
    | { kind: 'node-status'; nodeId: string; status: NodeStatus; reason?: string }
    | { kind: 'terminal-line'; nodeId: string; line: TerminalLine }
    | { kind: 'artifact-version'; nodeId: string; version: ArtifactVersion }
    | { kind: 'artifact-delta'; nodeId: string; text: string }
    | { kind: 'chat-message'; nodeId: string; message: ChatMessage }
    | { kind: 'chat-toolcall'; nodeId: string; toolCall: ToolCall }
    | { kind: 'chat-todos'; nodeId: string; todos: TodoItem[] }
    | { kind: 'approval-request'; nodeId: string; reason: string }
    | { kind: 'approval-resolve'; nodeId: string; decision: ApprovalDecision }
    | { kind: 'edge-status'; edgeId: string; edgeKind: EdgeKind }
  );

/* ---------------- 引擎重建出的节点状态 ---------------- */

export interface ArtifactNodeState {
  versions: ArtifactVersion[];
  /** 当前选中版本下标（切旧版本=历史预览） */
  current: number;
  /** 最新版本上的流式增量文本 */
  streamingText: string;
  streaming: boolean;
}

export interface ChatNodeState {
  todos: TodoItem[];
  items: ChatItem[];
  approval?: ApprovalState;
}

export interface NodeState {
  status: NodeStatus;
  /** waiting 原因 / failed 一行摘要 */
  statusReason?: string;
  startedAt?: number;
  endedAt?: number;
  terminalLines: TerminalLine[];
  artifact: ArtifactNodeState;
  chat: ChatNodeState;
}

export interface EdgeState {
  kind: EdgeKind;
}

export interface CanvasSnapshot {
  /** 已应用到的事件数量（= index + 1） */
  applied: number;
  nodes: Record<string, NodeState>;
  edges: Record<string, EdgeState>;
}

export function createEmptyNodeState(): NodeState {
  return {
    status: 'queued',
    terminalLines: [],
    artifact: { versions: [], current: 0, streamingText: '', streaming: false },
    chat: { todos: [], items: [] },
  };
}

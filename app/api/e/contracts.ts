/** Wire-only contracts: safe for type-only imports by browser code. */
export type Lifecycle = 'starting' | 'ready' | 'stopped' | 'interrupted' | 'failed';
export type DeliverAs = 'nextTurn' | 'steer' | 'followUp';
export interface Capability { name: string; available: boolean; authority: string; expiresAt?: string; reason?: string }
export interface ContentBlock { type: string; text?: string; [key: string]: unknown }
export interface SessionMessage { runId?: string; turnId?: string; parentId?: string; toolCallId?: string; toolResultId?: string; revision?: number; createdAt?: string; updatedAt?: string; stopReason?: string; error?: unknown; id: string; role: string; state: string; order: number; blocks: ContentBlock[]; [key: string]: unknown }
export interface SessionTool { runId?: string; turnId?: string; parentMessageId?: string; toolResultId?: string; order?: number; revision?: number; createdAt?: string; updatedAt?: string; isError?: boolean; id: string; name: string; state: string; arguments?: unknown; result?: unknown; partialResult?: unknown; [key: string]: unknown }
export interface SessionApproval { runId?: string; turnId?: string; requestedAt?: string; resolvedAt?: string; revision?: number; reason?: string; id: string; state: string; kind: string; summary?: string; toolName?: string; toolCallId?: string; [key: string]: unknown }
export interface SessionAction { targetApprovalId?: string; createdAt?: string; deadlineAt?: string; id: string; kind: string; state: string; idempotencyKey?: string; reason?: string; [key: string]: unknown }
export interface SessionSnapshot {
  id: string; nativeSessionId: string; epoch: string; revision: number; seq: number; nextSeq: number;
  status: 'live' | 'idle' | 'exited' | 'degraded'; cwd?: string; degradedReasons: string[];
  capabilities: Capability[]; messages: SessionMessage[]; tools: SessionTool[];
  runs: Array<{ id: string; state: string; [key: string]: unknown }>;
  turns?: Array<{ id: string; runId: string; index?: number; messageIds: string[]; toolCallIds: string[]; startedAt?: string; state: string }>;
  approvals?: SessionApproval[]; pendingActions: SessionAction[]; [key: string]: unknown;
}
export interface SessionRef {
  agentSessionId: string; nativeSessionId: string; cwd: string; provider?: string; model?: string;
}
export const SESSION_LIFECYCLE_VERSION = 2;
export interface SessionView {
  workspaceId: string; nodeId: string; title: string; lifecycle: Lifecycle; ref: SessionRef;
  snapshot?: SessionSnapshot; error?: string; updatedAt: string; version: number;
  configuration?: RuntimeConfiguration; configurationPending?: boolean; configurationError?: string;
  queue?: MessageQueue;
  collaborationAvailable?: boolean;
  archivedAt?: string;
  sessionLifecycleVersion?: number;
  collaboration?: import('../../shared/collaboration-protocol.mjs').CollaborationStatus;
  approvalPolicyVersion?: number; approvalMode?: ApprovalMode; approvalModeError?: string; sessionApprovalGrantCount?: number;
  approvalReviewer?: {provider:string;model:string}; approvalAudit?: ApprovalAudit[];
}
export type ControlOperation = 'messages' | 'abort' | 'approval';
export interface ControlPayload { intentId: string; content?: string; attachments?: Attachment[]; deliverAs?: DeliverAs; targetRunId?: string; approvalId?: string; decision?: 'approved' | 'rejected' | 'cancelled'; response?: unknown; expectedApprovalDigest?: string }
export interface RuntimeStatus {
  sessionLifecycleVersion?: number;
  available: boolean; projectRoot: string; reason?: string; piVersion?: string;
  models: Array<{ provider: string; id: string; name?: string }>; maxSessions: number;
}
export function capabilityAvailable(view: SessionView | undefined, name: string, now = Date.now()): boolean {
  return view?.lifecycle === 'ready' && !!view.snapshot?.capabilities.some(c =>
    c.name === name && c.available && c.authority === 'authoritative' &&
    (c.expiresAt === undefined || Date.parse(c.expiresAt) > now));
}

export type ApprovalMode = 'manual' | 'assisted' | 'edits' | 'full';
export interface ApprovalAudit {reviewAttempted?:boolean;approvalId:string;digest:string;source:'whitelist'|'ai'|'full'|'manual';state:'reviewing'|'manual'|'submitting'|'submitted'|'cancelled'|'failed';reason:string;rule?:string;at:string;reviewer?:{provider:string;model:string}}

export interface Attachment { id: string; name: string; mimeType: 'text/plain' | 'image/png' | 'image/jpeg' | 'image/webp'; data: string }
export interface RuntimeModel { provider: string; id: string; name?: string; input: string[]; contextWindow?: number }
export interface RuntimeConfiguration {
  revision: number; nativeSessionId: string; confirmedAt: string; model?: RuntimeModel;
  thinkingLevel: string; thinkingLevels: string[]; models: RuntimeModel[];
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}
export interface ConfigurationChange { intentId: string; expectedRevision: number; provider?: string; model?: string; thinkingLevel?: string }
export interface QueueItem {
  id: string; intentId: string; content: string; attachments: Attachment[];
  state: 'pending' | 'dispatching' | 'submitted' | 'consumed' | 'unknown' | 'rejected';
  origin?: MessageOrigin;
  createdAt: string; submittedAt?: string; consumedAt?: string; actionId?: string; error?: string;
}
export interface MessageQueue { revision: number; paused: boolean; reason?: string; items: QueueItem[] }
export interface QueueMutation {
  mutationId: string; expectedRevision: number;
  operation: 'add' | 'edit' | 'delete' | 'move' | 'pause' | 'resume' | 'sendNow';
  itemId?: string; content?: string; attachments?: Attachment[]; direction?: 'up' | 'down';
  authorize?: boolean; confirmSteer?: boolean;
}
export interface MessageOrigin { sourceNodeId?: string; sourceNativeSessionId?: string; communicationId?: string; kind: 'human' | 'agent' | 'system' | 'unknown'; label: string; channel: string; authenticated: boolean; intentId?: string }

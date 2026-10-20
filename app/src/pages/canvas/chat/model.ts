import type { ContentBlock, SessionMessage, SessionTool, SessionApproval } from '../../../../api/e/contracts';
export interface ToolDisplay { id: string; tool: SessionTool; approvals: SessionApproval[]; linked: boolean }
export type TurnPart = { id: string; kind: 'text' | 'thinking'; text: string } | { id: string; kind: 'tool'; activity: ToolDisplay } | { id: string; kind: 'unknown'; block: ContentBlock } | { id: string; kind: 'error'; error: unknown };
export interface TranscriptTurn { id: string; role: string; runId?: string; turnId?: string; timestamp: string; messages: SessionMessage[]; parts: TurnPart[]; approvals: SessionApproval[]; orphan: boolean }

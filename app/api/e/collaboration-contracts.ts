/** Canvas-managed operations: not an HTTP caller-supplied identity. */
export type {CanvasTool, CollaborationRequest, CollaborationStatus, CollaborationManifest} from '../../shared/collaboration-protocol.mjs';
export interface AgentArtifact { id: string; workspaceId: string; nodeId: string; nativeSessionId: string; title: string; content: string; digest: string; createdAt: string }
export type CommunicationState = 'preparing' | 'pending' | 'paused' | 'submitted' | 'consumed' | 'unknown' | 'rejected' | 'cancelled' | 'read';
export interface SpawnRecord { id: string; workspaceId: string; parent: string; child: string; depth: number; runId?: string; sourceNativeSessionId: string; createdAt: string }
export interface CommunicationRecord {
  id: string; workspaceId: string; source: string; target: string; sourceName: string; targetName: string;
  operation: 'send' | 'read'; state: CommunicationState; createdAt: string; updatedAt: string;
  toolCallId: string; nativeSessionId: string; runId?: string; content: string;
  artifactId?: string; digest?: string; truncated?: boolean; itemId?: string; error?: string;
  rootId: string; parentId?: string; hop: number;
}
export interface CommunicationSummary { count: number; records: CommunicationRecord[] }

import { CollaborationError, collaborationReady, validateCollaborationRequest } from '../../shared/collaboration-protocol.mjs';
import { exactOperationKey } from './approval-binding.js';
import type { SessionView } from './contracts.js';
import type { CollaborationRequest } from './collaboration-contracts.js';
/** The caller is pinned by parent IPC, not by request fields or text. */
export function authorizeCollaboration(view: SessionView, request: CollaborationRequest) {
  if (view.lifecycle !== 'ready' || !view.snapshot || view.snapshot.nativeSessionId !== view.ref.nativeSessionId) throw new CollaborationError('NOT_READY', 'collaboration session unavailable');
  if(!collaborationReady(view.collaboration))throw new CollaborationError('NOT_READY','collaboration package has not been verified');
  validateCollaborationRequest(request,view.collaboration?.expected);
  const tool = view.snapshot.tools.find(t => t.id === request.toolCallId);
  const approval = view.snapshot.approvals?.find(a => a.toolCallId === request.toolCallId);
  if (!tool || tool.name !== request.tool || tool.state !== 'running' || approval?.state !== 'approved' || approval.toolName !== request.tool || exactOperationKey(tool.name, tool.arguments) !== exactOperationKey(request.tool, request.args)) throw new CollaborationError('EVIDENCE_PENDING', 'approved exact running tool evidence required');
  return tool;
}

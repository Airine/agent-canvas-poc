import type { CanvasNode } from '../types.js';
import type { SessionView } from './contracts.js';

export function projectSession(view: SessionView, prior?: CanvasNode, index = 0): CanvasNode {
  const snapshot = view.snapshot;
  const active = view.lifecycle === 'ready' && snapshot?.runs.some(run => run.state === 'running');
  const reply = [...(snapshot?.messages ?? [])].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || b.order - a.order).find(m => m.role === 'assistant');
  const summary = reply?.error || reply?.stopReason === 'error' ? '模型服务请求失败，展开对话查看详情' : reply?.blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n').slice(-600) ?? '';
  return {
    id: view.nodeId, type: 'chat', title: view.title, backend: 'e',
    // Compatibility colour only. Session lifecycle/run result are independent.
    status: view.lifecycle === 'failed' ? 'failed' : view.lifecycle === 'starting' ? 'queued' : active ? 'running' : 'waiting',
    harness: 'pi', env: 'e-core', agentId: view.ref.agentSessionId,
    x: prior?.x ?? 80 + index % 3 * 520, y: prior?.y ?? 80 + Math.floor(index / 3) * 420,
    ...(prior?.zoneId ? { zoneId: prior.zoneId } : {}),
    sessionRef: view.ref, sessionState: view.lifecycle, sessionStatus: snapshot?.status,
    // Explicitly clear the marker when GraphStore merges a restored projection.
    archivedAt: view.archivedAt,
    statusReason: view.error ? '运行时发生错误，展开对话查看详情' : undefined, summary,
  };
}

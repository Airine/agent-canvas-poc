import type { SessionView } from '../api/e/contracts';

const text = (value: unknown): string => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
/** Pure projection. The e snapshot, not the renderer store, owns conversation state. */
export function projectPiMessages(view: SessionView) {
  const snapshot = view.snapshot;
  if (!snapshot) return [];
  // e order is local to a run, not a global conversation index.
  const messages = [...snapshot.messages].sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.order - b.order).map(message => ({
    id: message.id, role: ['user', 'assistant', 'system'].includes(message.role) ? message.role : 'tool',
    content: message.blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n') || (message.error ? text(message.error) : ''),
    thinking: message.blocks.filter(b => ['thinking', 'reasoning'].includes(b.type)).map(b => b.text ?? b.thinking ?? '').join('\n') || undefined,
    attachments: message.blocks.flatMap((b, i) => b.type === 'image' && typeof b.data === 'string'
      ? [{kind:'image',name:'Attached image',ref:`canvas-message/${message.id}/${i}`,mimeType:String(b.mimeType)}] : []),
    createdAt: message.createdAt ?? '1970-01-01T00:00:00.000Z',
    status: message.error || message.stopReason === 'error' ? 'error' : ['streaming', 'running'].includes(message.state) ? 'streaming' : message.state === 'aborted' ? 'aborted' : 'complete',
  }));
  // Tool calls are normalized by e; do not render the duplicate tool-result message.
  const rows = messages.filter(m => m.role !== 'tool' && (m.content || m.thinking || m.attachments.length));
  for (const tool of [...snapshot.tools].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const denied = snapshot.approvals?.some(a => a.toolCallId === tool.id && ['rejected', 'cancelled'].includes(a.state));
    const row = {
      id: `tool:${tool.id}`, role: 'tool', content: '', createdAt: tool.createdAt ?? '1970-01-01T00:00:00.000Z',
      status: 'complete', thinking: undefined, attachments: [], toolCallId: tool.id, toolName: tool.name,
      toolArgs: tool.arguments, toolResult: text(tool.result ?? tool.partialResult),
      toolStatus: denied || ['denied', 'rejected', 'declined'].includes(tool.state) ? 'denied' : tool.isError || ['failed', 'error'].includes(tool.state) ? 'error' : ['completed', 'succeeded', 'success'].includes(tool.state) ? 'success' : 'running',
    };
    const parent = rows.findIndex(m => m.id === tool.parentMessageId);
    let index = parent >= 0 ? parent + 1 : rows.findIndex(m => m.createdAt > row.createdAt);
    while (index >= 0 && index < rows.length && rows[index].role === 'tool') index++;
    rows.splice(index < 0 ? rows.length : index, 0, row);
  }
  return rows;
}

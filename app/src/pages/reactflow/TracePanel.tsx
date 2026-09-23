/**
 * TracePanel — 弱链接数据面：消息 trace 泳道面板（design.md §4）[R§6.2.2]
 *
 * 点击虚线 → 右侧滑出 320px 面板，竖向时间轴：
 * 每条消息一行 `时间 · 方向箭头 · 摘要`（该通道两端节点的事件投影）。
 * Esc 关闭（页面级键盘处理）。
 */
import { X } from 'lucide-react';
import { MOCK_EVENTS } from '@/shared';
import type { AgentEvent, CanvasEdgeDef } from '@/shared';

function summarize(ev: AgentEvent): string {
  switch (ev.kind) {
    case 'node-status':
      return `状态 → ${ev.status}${ev.reason ? ` · ${ev.reason}` : ''}`;
    case 'terminal-line':
      return (ev.line.kind === 'cmd' ? '$ ' : '') + ev.line.text;
    case 'artifact-version':
      return `产物 v${ev.version.v} 写入${ev.version.label ? ` · ${ev.version.label}` : ''}`;
    case 'artifact-delta':
      return `流式增量 ${ev.text.trim().length} 字符`;
    case 'chat-message':
      return ev.message.text;
    case 'chat-toolcall':
      return `调用 ${ev.toolCall.tool}(${ev.toolCall.argsSummary})`;
    case 'chat-todos':
      return `更新 todo ${ev.todos.length} 项`;
    case 'approval-request':
      return `请求批准：${ev.reason}`;
    case 'approval-resolve':
      return `审批结果：${ev.decision}`;
    case 'edge-status':
      return `边 ${ev.edgeId} → ${ev.edgeKind}`;
  }
}

export interface TracePanelProps {
  edge: CanvasEdgeDef;
  /** 当前事件指针（含），只显示已到达的消息（实时与回放同构） */
  uptoIndex: number;
  onClose: () => void;
}

export function TracePanel({ edge, uptoIndex, onClose }: TracePanelProps) {
  const messages = MOCK_EVENTS.filter(
    (ev, i) =>
      i <= uptoIndex &&
      'nodeId' in ev &&
      (ev.nodeId === edge.source || ev.nodeId === edge.target),
  );

  return (
    <aside
      className="animate-delta-in absolute bottom-0 right-0 top-0 z-legend flex w-80 flex-col border-l border-border-subtle bg-surface-1 shadow-overlay"
      role="complementary"
      aria-label={`消息 trace · ${edge.semantic}`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <span className="min-w-0 flex-1 truncate text-node-title text-text-primary">
          消息 trace
        </span>
        <span className="truncate text-node-meta text-text-tertiary">{edge.semantic}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭面板"
          className="flex size-6 shrink-0 items-center justify-center rounded-inner text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="tnum shrink-0 border-b border-border-subtle px-3 py-1.5 text-node-meta text-text-tertiary">
        {edge.source} ⇄ {edge.target} · {messages.length} 条
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-small text-text-tertiary">
            暂无消息
          </div>
        ) : (
          <ol className="relative space-y-0.5 border-l border-border-subtle pl-3">
            {messages.map((ev) => {
              const fromSource = 'nodeId' in ev && ev.nodeId === edge.source;
              return (
                <li key={ev.id} className="relative py-0.5">
                  <span className="absolute -left-[15px] top-2 size-1.5 rounded-pill bg-text-tertiary" />
                  <div className="flex items-baseline gap-1.5 text-node-meta">
                    <span className="tnum shrink-0 text-text-tertiary">
                      {(ev.t / 1000).toFixed(1)}s
                    </span>
                    <span
                      className="shrink-0"
                      style={{ color: fromSource ? 'var(--nt-chat)' : 'var(--nt-artifact)' }}
                    >
                      {fromSource ? '→' : '←'}
                    </span>
                    <span className="min-w-0 break-all text-text-secondary">{summarize(ev)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}

/**
 * TracePanel — 弱链接消息 trace 泳道面板（design.md §4 弱链接数据面，R§6.2.2）
 *
 * 点击虚线 → 右侧滑出 320px 宽面板：竖向时间轴，每条消息一行
 * `时间 · 方向箭头 · 摘要`。内容从共享 mock 事件流按源/目标节点过滤投影，
 * Esc 或 ✕ 关闭。
 */
import { useMemo } from 'react';
import { X } from 'lucide-react';
import { MOCK_EVENTS } from '@/shared';
import type { CanvasEdgeDef } from '@/shared/types';
import { NODE_DEFS } from './model';

interface TraceLine {
  key: string;
  time: string;
  dir: '→' | '←';
  text: string;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function buildTrace(edge: CanvasEdgeDef): TraceLine[] {
  const lines: TraceLine[] = [];
  for (const ev of MOCK_EVENTS) {
    if (ev.kind === 'node-status' && (ev.nodeId === edge.source || ev.nodeId === edge.target)) {
      lines.push({
        key: `e${ev.id}`,
        time: fmtTime(ev.t),
        dir: ev.nodeId === edge.source ? '→' : '←',
        text: `${NODE_DEFS[ev.nodeId]?.title ?? ev.nodeId} 进入 ${ev.status}`,
      });
    } else if (ev.kind === 'artifact-version' && (ev.nodeId === edge.source || ev.nodeId === edge.target)) {
      lines.push({
        key: `e${ev.id}`,
        time: fmtTime(ev.t),
        dir: ev.nodeId === edge.source ? '→' : '←',
        text: `产物 v${ev.version.v}${ev.version.label ? ` · ${ev.version.label}` : ''} 写入通道`,
      });
    } else if (ev.kind === 'chat-message' && (ev.nodeId === edge.source || ev.nodeId === edge.target)) {
      lines.push({
        key: `e${ev.id}`,
        time: fmtTime(ev.t),
        dir: ev.nodeId === edge.source ? '→' : '←',
        text: ev.message.text,
      });
    }
  }
  return lines.slice(0, 24);
}

export function TracePanel({
  edge,
  onClose,
}: {
  edge: CanvasEdgeDef | null;
  onClose: () => void;
}) {
  const lines = useMemo(() => (edge ? buildTrace(edge) : []), [edge]);

  return (
    <aside
      aria-label="消息 trace 泳道"
      className="absolute inset-y-0 right-0 z-legend flex w-[320px] flex-col border-l border-border-subtle bg-surface-1 transition-transform duration-med"
      style={{
        transform: edge ? 'translateX(0)' : 'translateX(100%)',
        transitionTimingFunction: 'var(--ease-out)',
        pointerEvents: edge ? 'all' : 'none',
      }}
    >
      {edge && (
        <>
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-node-title text-text-primary">消息 trace</div>
              <div className="truncate text-node-meta text-text-secondary">
                {NODE_DEFS[edge.source]?.title} → {NODE_DEFS[edge.target]?.title} · {edge.semantic}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭面板"
              className="flex size-7 items-center justify-center rounded-inner text-text-tertiary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {lines.length === 0 ? (
              <div className="text-small text-text-tertiary">该通道尚无消息（播放事件流以产生 trace）</div>
            ) : (
              <ol className="relative ml-1.5 border-l border-border-subtle pl-3">
                {lines.map((l) => (
                  <li key={l.key} className="relative pb-2.5">
                    <span className="absolute -left-[17px] top-1 size-2 rounded-pill bg-surface-3 outline outline-1 outline-border-subtle" />
                    <div className="flex items-baseline gap-1.5">
                      <span className="tnum shrink-0 text-node-meta text-text-tertiary">{l.time}</span>
                      <span className="shrink-0 text-node-meta text-accent">{l.dir}</span>
                      <span className="text-small text-text-secondary">{l.text}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

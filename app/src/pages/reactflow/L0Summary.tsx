/**
 * L0 全局模式 · 摘要卡（design.md §3.2.1）
 *
 * 独立轻量组件，【不是】默认卡的缩小版 [R§2.2.1]：零交互、只读，
 * 飞行记录器模式 = 静态快照（终端末 3 行 / 产物前 4 行 / 对话末条），不渲染任何活窗。
 * 状态徽章与耗时仍实时更新；hover 浮层（--surface-3，浮于节点上方 8px）：
 * 完整身份四元组 + 状态 + 最近一条事件摘要 +「双击进入专注」提示。
 */
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { NODE_KIND_META, StatusBadge } from '@/shared';
import type { CanvasNodeDef, NodeState } from '@/shared';
import { l0SnapshotText, lastEventSummary } from './utils';

export interface L0SummaryCardProps {
  def: CanvasNodeDef;
  state: NodeState;
  detail?: string;
  selected?: boolean;
}

export function L0SummaryCard({ def, state, detail, selected }: L0SummaryCardProps) {
  const meta = NODE_KIND_META[def.kind];
  return (
    <div className="group/l0 relative w-full animate-delta-in">
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div
        className={cn(
          'rounded-node bg-surface-1 shadow-node transition-[box-shadow,opacity] duration-fast',
          'hover:[box-shadow:var(--shadow-hover)]',
          state.status === 'failed' && 'shadow-failed hover:shadow-failed',
          state.status === 'skipped' && 'node-skipped',
          def.kind === 'coordinator' &&
            '[box-shadow:0_0_0_1.5px_var(--nt-coord)]',
          selected && 'shadow-node-selected hover:shadow-node-selected',
        )}
      >
        {/* ● 标题 [徽章·耗时] */}
        <div className="flex items-center gap-2 p-3 pb-1.5">
          <span className="size-2 shrink-0 rounded-pill" style={{ backgroundColor: meta.color }} />
          <span className="min-w-0 flex-1 truncate text-node-title text-text-primary">{def.title}</span>
          <StatusBadge status={state.status} detail={detail} />
        </div>
        {/* harness · env · #id */}
        <div className="truncate px-3 text-node-meta text-text-secondary">
          {def.identity.harness} · {def.identity.env} · #{def.identity.agentId}
        </div>
        {/* 飞行记录器：静态快照 */}
        <div className="p-3 pt-2">
          <div className="max-h-16 overflow-hidden whitespace-pre-wrap break-all rounded-inner bg-surface-2 px-2 py-1.5 font-mono text-node-meta text-text-secondary">
            {l0SnapshotText(state)}
          </div>
        </div>
      </div>

      {/* hover 浮层：完整身份四元组 + 状态 + 最近事件摘要 + 提示（不改变节点本体） */}
      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-node-selected hidden w-[280px] rounded-lg bg-surface-3 p-3 shadow-overlay group-hover/l0:block">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-pill" style={{ backgroundColor: meta.color }} />
          <span className="min-w-0 flex-1 truncate text-node-title text-text-primary">{def.title}</span>
          <StatusBadge status={state.status} detail={detail} />
        </div>
        <div className="mt-1.5 text-node-meta text-text-secondary">
          {def.identity.harness} · {def.identity.env} · {def.identity.agentId} · {def.identity.model}
        </div>
        <div className="mt-2 line-clamp-2 border-t border-border-subtle pt-2 text-small text-text-secondary">
          {lastEventSummary(state)}
        </div>
        <div className="mt-2 text-node-meta text-text-tertiary">双击进入专注</div>
      </div>
    </div>
  );
}

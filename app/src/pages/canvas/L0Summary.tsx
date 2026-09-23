/**
 * L0 全局模式 · 摘要卡（design.md §3.2.1，`/canvas` 版）
 *
 * 独立轻量组件，【不是】默认卡的缩小版：零交互、只读，
 * 飞行记录器模式 = 静态快照（终端末 3 行，来自最近一次 ansi 快照剥离转义），不渲染活窗。
 * 状态徽章与耗时仍实时更新（WS node 补丁 + 每秒时钟）；
 * hover 浮层：身份四元组 + 状态 + 最近事件摘要 +「双击进入专注」。
 */
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { NODE_KIND_META, StatusBadge } from '@/shared';
import type { CanvasNode, LiveStore } from './live-store';
import { ansiTail } from './utils';

export interface L0SummaryCardProps {
  store: LiveStore;
  node: CanvasNode;
  detail?: string;
  selected?: boolean;
}

/** 最近一条摘要：approval > statusReason > 终端末行 */
function lastSummary(store: LiveStore, node: CanvasNode): string {
  if (node.approval) return `审批：${node.approval.prompt}`;
  if (node.statusReason) return node.statusReason;
  const tail = ansiTail(store.termLastSnapshot(node.id), 1);
  return tail || '暂无事件';
}

export function L0SummaryCard({ store, node, detail, selected }: L0SummaryCardProps) {
  const meta = NODE_KIND_META[node.type];
  const snapshot = ansiTail(store.termLastSnapshot(node.id), 3);
  return (
    <div className="group/l0 relative w-full animate-delta-in">
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div
        className={cn(
          'rounded-node bg-surface-1 shadow-node transition-[box-shadow,opacity] duration-fast',
          'hover:[box-shadow:0_1px_2px_rgba(0,0,0,.4),0_0_0_1px_var(--border-strong)]',
          node.status === 'failed' && 'shadow-failed hover:shadow-failed',
          node.status === 'skipped' && 'node-skipped',
          node.type === 'coordinator' &&
            '[box-shadow:0_1px_2px_rgba(0,0,0,.4),0_0_0_1.5px_var(--nt-coord)]',
          selected && 'shadow-node-selected hover:shadow-node-selected',
        )}
      >
        {/* ● 标题 [徽章·耗时] */}
        <div className="flex items-center gap-2 p-3 pb-1.5">
          <span className="size-2 shrink-0 rounded-pill" style={{ backgroundColor: meta.color }} />
          <span className="min-w-0 flex-1 truncate text-node-title text-text-primary">{node.title}</span>
          <StatusBadge status={node.status} detail={detail} />
        </div>
        {/* harness · env · #id */}
        <div className="truncate px-3 text-node-meta text-text-secondary">
          {node.harness} · {node.env} · #{node.agentId}
        </div>
        {/* 飞行记录器：静态快照 */}
        <div className="p-3 pt-2">
          <div className="max-h-16 overflow-hidden whitespace-pre-wrap break-all rounded-inner bg-surface-2 px-2 py-1.5 font-mono text-node-meta text-text-secondary">
            {snapshot || (node.approval ? `⏸ ${node.approval.prompt}` : '等待事件…')}
          </div>
        </div>
      </div>

      {/* hover 浮层：身份四元组 + 状态 + 最近摘要 + 提示（不改变节点本体） */}
      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-node-selected hidden w-[280px] rounded-lg bg-surface-3 p-3 shadow-overlay group-hover/l0:block">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-pill" style={{ backgroundColor: meta.color }} />
          <span className="min-w-0 flex-1 truncate text-node-title text-text-primary">{node.title}</span>
          <StatusBadge status={node.status} detail={detail} />
        </div>
        <div className="mt-1.5 text-node-meta text-text-secondary">
          {node.harness} · {node.env} · {node.agentId}
          {node.paneId ? ` · ${node.paneId}` : ''}
        </div>
        <div className="mt-2 line-clamp-2 border-t border-border-subtle pt-2 text-small text-text-secondary">
          {lastSummary(store, node)}
        </div>
        <div className="mt-2 text-node-meta text-text-tertiary">双击进入专注</div>
      </div>
    </div>
  );
}

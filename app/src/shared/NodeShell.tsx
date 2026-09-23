/**
 * NodeShell — 节点通用骨架（design.md §3.1，所有类型、所有实现共用）
 *
 *  ┌──────────────────────────────────────┐
 *  │ ●类型图标  标题              [状态徽章] │  header：12px 内边距，底部 1px 分隔线
 *  │ harness · env · agent-id (11px 灰)    │  身份四元组第二行 [R§2.2.2]
 *  ├──────────────────────────────────────┤
 *  │         （类型内容区 children）         │
 *  ├──────────────────────────────────────┤
 *  │ 状态栏：模型 | 上下文% | $成本 | 耗时   │  仅默认态显示 [R§5.2.2]
 *  └──────────────────────────────────────┘
 *
 * 附加通道：failed = 2px 红描边常亮 + 左上角 `!` 圆徽章；skipped = 60% 透明 + 45° 斜纹；
 * hover = 描边变 --border-strong + 右上浮现「进入专注 ⤢」；选中 = accent 2px 描边。
 */
import type { ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_KIND_META } from './meta';
import { StatusBadge } from './StatusBadge';
import type { NodeIdentity, NodeKind, NodeStatus, ViewMode } from './types';

export interface NodeShellProps {
  kind: NodeKind;
  title: string;
  identity: NodeIdentity;
  status: NodeStatus;
  /** 状态徽章后缀：elapsed / waiting reason / failed 一行摘要 */
  statusDetail?: string;
  mode: ViewMode;
  selected?: boolean;
  onFocus?: () => void;
  /** 底部状态栏数据（仅默认态渲染） */
  stats?: { contextPct?: number; cost?: string; elapsed?: string };
  className?: string;
  children?: ReactNode;
}

export function NodeShell({
  kind,
  title,
  identity,
  status,
  statusDetail,
  mode,
  selected,
  onFocus,
  stats,
  className,
  children,
}: NodeShellProps) {
  const meta = NODE_KIND_META[kind];
  const TypeIcon = meta.icon;
  const failed = status === 'failed';
  const skipped = status === 'skipped';
  const isCoord = kind === 'coordinator';

  return (
    <div
      data-node-shell
      data-status={status}
      className={cn(
        'group relative flex flex-col overflow-visible rounded-node bg-surface-1 shadow-node transition-[box-shadow,border-color,opacity] duration-fast',
        'hover:[box-shadow:0_1px_2px_rgba(0,0,0,.4),0_0_0_1px_var(--border-strong)]',
        failed && 'shadow-failed hover:shadow-failed',
        selected && 'shadow-node-selected hover:shadow-node-selected',
        skipped && 'node-skipped',
        isCoord && '[box-shadow:0_1px_2px_rgba(0,0,0,.4),0_0_0_1.5px_var(--nt-coord)]',
        className,
      )}
    >
      {/* failed 位置通道：左上角 `!` 圆徽章 [R§2.4.1] */}
      {failed && (
        <span className="absolute -left-1.5 -top-1.5 z-10 flex size-4 items-center justify-center rounded-pill bg-st-failed text-[10px] font-bold leading-none text-white">
          !
        </span>
      )}

      {/* hover 浮现「进入专注 ⤢」（--surface-3 底） */}
      {onFocus && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          className="absolute -top-2.5 right-2 z-10 flex h-6 items-center gap-1 rounded-inner bg-surface-3 px-2 text-small text-text-secondary opacity-0 shadow-node transition-opacity duration-fast hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Maximize2 className="size-3" />
          进入专注
        </button>
      )}

      {/* header */}
      <div className="border-b border-border-subtle p-3 pb-2">
        <div className="flex items-center gap-2">
          {/* 类型图标徽章：类型色仅用于此与聚焦描边（§1.1.3）；Coordinator 28px（§3.3.4） */}
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-inner',
              isCoord ? 'size-7' : 'size-5',
            )}
            style={{ backgroundColor: 'color-mix(in srgb, ' + meta.color + ' 16%, transparent)', color: meta.color }}
          >
            <TypeIcon className={isCoord ? 'size-4' : 'size-3.5'} />
          </span>
          <span className="min-w-0 flex-1 truncate text-node-title text-text-primary">{title}</span>
          <StatusBadge status={status} detail={statusDetail} />
        </div>
        {/* 身份四元组第二行 */}
        <div className="mt-1 truncate pl-7 text-node-meta text-text-secondary">
          {identity.harness} · {identity.env} · {identity.agentId}
        </div>
      </div>

      {/* 类型内容区 */}
      {children}

      {/* 状态栏：仅默认态（L1/L1s）显示 [R§5.2.2] */}
      {mode !== 'L0' && stats && (
        <div className="flex items-center gap-2 border-t border-border-subtle px-3 py-1.5 text-small text-text-tertiary">
          <span>{identity.model}</span>
          <span aria-hidden>·</span>
          <span className="tnum">{stats.contextPct ?? 0}% ctx</span>
          <span aria-hidden>·</span>
          <span className="tnum">{stats.cost ?? '$0.00'}</span>
          <span aria-hidden>·</span>
          <span className="tnum">{stats.elapsed ?? '0s'}</span>
        </div>
      )}
    </div>
  );
}

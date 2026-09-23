/**
 * WindowFrame — 活窗（Live Window）外框（design.md §3.2.2）
 *
 * --surface-2 底 + --r-inner + 顶部 24px 窗口栏：
 * 三个装饰圆点（#F2555A/#F5A524/#3DC97E，直径 8px）+ 窗口标题 11px + 右侧操作区。
 *
 * 观察权实现：内容层 pointer-events: none（窗口栏按钮除外）——由调用方按档位控制。
 * 活节点配额降级（§3.2.2）：被降级节点窗口栏右侧显示 `▸ 2fps` / `▸ 快照` 标记，
 * 点击可手动点亮升入配额。
 */
import type { ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LiveTier = 'live' | 'fps2' | 'snapshot';

export interface WindowFrameProps {
  /** 窗口栏标题，如 `terminal · sandbox-01` */
  title: string;
  /** 活窗层级：live 活窗 / fps2 心跳帧 / snapshot 快照 */
  tier?: LiveTier;
  /** 点击降级标记，手动点亮升入配额 */
  onActivate?: () => void;
  /** 「⤢ 专注」按钮（窗口栏按钮不受 pointer-events 限制） */
  onFocus?: () => void;
  /** 观察权：true 时内容层 pointer-events: none（L1 默认） */
  observeOnly?: boolean;
  /** 窗口栏右侧额外内容（徽标、版本选择器等） */
  headerRight?: ReactNode;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}

const DOTS = ['#F2555A', '#F5A524', '#3DC97E'];

export function WindowFrame({
  title,
  tier = 'live',
  onActivate,
  onFocus,
  observeOnly,
  headerRight,
  className,
  contentClassName,
  children,
}: WindowFrameProps) {
  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-inner bg-surface-2', className)}>
      {/* 24px 窗口栏 */}
      <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-border-subtle px-2">
        {DOTS.map((c) => (
          <span key={c} className="size-2 rounded-pill" style={{ backgroundColor: c }} />
        ))}
        <span className="ml-1 min-w-0 flex-1 truncate text-node-meta text-text-secondary">{title}</span>
        {tier !== 'live' && (
          <button
            type="button"
            onClick={onActivate}
            title="已降级，点击升入活窗配额"
            className="tnum shrink-0 rounded-inner px-1 text-node-meta text-text-tertiary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
          >
            ▸ {tier === 'fps2' ? '2fps' : '快照'}
          </button>
        )}
        {headerRight}
        {onFocus && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
            }}
            title="进入专注"
            className="flex h-4 shrink-0 items-center gap-0.5 rounded-inner px-1 text-node-meta text-text-tertiary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
          >
            <Maximize2 className="size-3" />
            专注
          </button>
        )}
      </div>
      {/* 内容层 */}
      <div
        className={cn('min-h-0 flex-1', observeOnly && 'pointer-events-none', contentClassName)}
        aria-hidden={observeOnly || undefined}
      >
        {children}
      </div>
    </div>
  );
}

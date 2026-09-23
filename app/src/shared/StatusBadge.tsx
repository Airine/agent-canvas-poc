/**
 * StatusBadge — 节点六态徽章（design.md §1.1.2 / §3.1）
 *
 * 多通道冗余编码（P2）：图标 + 文字 + 颜色 + 动效，绝不仅用颜色。
 * pill 形，结构 = 图标 + 状态文字 + 耗时，耗时等宽数字（tabular-nums）。
 * running：color-mix 18% 底 + 脉冲 1.6s；waiting：呼吸 2.4s。
 */
import type { ComponentType } from 'react';
import {
  CheckCircle2,
  Clock,
  Hand,
  Loader2,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NodeStatus } from './types';

interface StatusMeta {
  icon: ComponentType<{ className?: string }>;
  /** 状态词：协议词汇，英文小写 */
  label: string;
  color: string;
  /** 徽章底色（§3.1 color-mix） */
  bg: string;
  animation?: 'pulse' | 'breathe';
}

const STATUS_META: Record<NodeStatus, StatusMeta> = {
  queued: {
    icon: Clock,
    label: 'queued',
    color: 'var(--st-queued)',
    bg: 'color-mix(in srgb, var(--st-queued) 14%, transparent)',
  },
  running: {
    icon: Loader2,
    label: 'running',
    color: 'var(--st-running)',
    bg: 'color-mix(in srgb, var(--st-running) 18%, transparent)',
    animation: 'pulse',
  },
  waiting: {
    icon: Hand,
    label: 'waiting',
    color: 'var(--st-waiting)',
    bg: 'color-mix(in srgb, var(--st-waiting) 16%, transparent)',
    animation: 'breathe',
  },
  completed: {
    icon: CheckCircle2,
    label: 'done',
    color: 'var(--st-completed)',
    bg: 'color-mix(in srgb, var(--st-completed) 14%, transparent)',
  },
  failed: {
    icon: XCircle,
    label: 'failed',
    color: 'var(--st-failed)',
    bg: 'color-mix(in srgb, var(--st-failed) 14%, transparent)',
  },
  skipped: {
    icon: SkipForward,
    label: 'skipped',
    color: 'var(--st-skipped)',
    bg: 'color-mix(in srgb, var(--st-skipped) 14%, transparent)',
  },
};

export interface StatusBadgeProps {
  status: NodeStatus;
  /** 后缀：`42s` / `approval` / `一行摘要`，渲染为 ` · {detail}` */
  detail?: string;
  className?: string;
}

export function StatusBadge({ status, detail, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-pill px-2 text-node-meta leading-none',
        meta.animation === 'pulse' && 'animate-badge-pulse',
        meta.animation === 'breathe' && 'animate-breathe',
        className,
      )}
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      <Icon
        className={cn('size-3', status === 'running' && 'animate-spin [animation-duration:1.6s]')}
      />
      <span>
        {meta.label}
        {detail ? <span className="tnum"> · {detail}</span> : null}
      </span>
    </span>
  );
}

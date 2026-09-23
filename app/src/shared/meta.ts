/**
 * 共享常量（与组件分离，满足 react-refresh 约束）。
 */
import type { ComponentType } from 'react';
import { FileCode2, MessagesSquare, Monitor, Network } from 'lucide-react';
import type { NodeKind, NodeStatus } from './types';

/** 节点类型元信息：类型色仅用于头部图标徽章与聚焦描边（§1.1.3） */
export const NODE_KIND_META: Record<
  NodeKind,
  { icon: ComponentType<{ className?: string }>; color: string; label: string }
> = {
  coordinator: { icon: Network, color: 'var(--nt-coord)', label: 'coordinator' },
  artifact: { icon: FileCode2, color: 'var(--nt-artifact)', label: 'artifact' },
  operation: { icon: Monitor, color: 'var(--nt-operation)', label: 'operation' },
  chat: { icon: MessagesSquare, color: 'var(--nt-chat)', label: 'chat' },
};

/** 六态状态色（供委派卡片色点、minimap 色块等冗余通道复用） */
export const STATUS_COLORS: Record<NodeStatus, string> = {
  queued: 'var(--st-queued)',
  running: 'var(--st-running)',
  waiting: 'var(--st-waiting)',
  completed: 'var(--st-completed)',
  failed: 'var(--st-failed)',
  skipped: 'var(--st-skipped)',
};

/**
 * CoordinatorView — Coordinator 根节点内容区（design.md §3.3.4）
 *
 * 内容 = 委派卡片列表 [R§5.3.1]：每张 40px 高（类型色点 + 子任务名 + 状态徽章缩略版），
 * 卡片状态与子节点实时同步。
 * 双向锚定 [R§5.3.2]：点委派卡片 → 画布平滑飞向对应子节点（onSelect）；
 * 点子节点 → 对应卡片高亮（activeId）。
 * 底部一行聚合统计：`4 个子任务 · 2 运行 · 1 等待 · 1 完成`，等宽数字。
 */
import { cn } from '@/lib/utils';
import { NODE_KIND_META } from './meta';
import { StatusBadge } from './StatusBadge';
import type { DelegationItem } from './types';

export interface CoordinatorViewProps {
  items: DelegationItem[];
  /** 双向锚定：当前高亮的委派卡片（子节点被选中时传入） */
  activeId?: string;
  /** 点击委派卡片：画布 600ms ease-in-out 飞向目标子节点 */
  onSelect?: (nodeId: string) => void;
  className?: string;
}

export function CoordinatorView({ items, activeId, onSelect, className }: CoordinatorViewProps) {
  const running = items.filter((i) => i.status === 'running').length;
  const waiting = items.filter((i) => i.status === 'waiting').length;
  const done = items.filter((i) => i.status === 'completed').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const skipped = items.filter((i) => i.status === 'skipped').length;

  const stats = [
    `${items.length} 个子任务`,
    running > 0 ? `${running} 运行` : null,
    waiting > 0 ? `${waiting} 等待` : null,
    done > 0 ? `${done} 完成` : null,
    failed > 0 ? `${failed} 失败` : null,
    skipped > 0 ? `${skipped} 跳过` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={cn('flex flex-col gap-1 p-2', className)}>
      {items.map((item) => {
        const meta = NODE_KIND_META[item.kind];
        return (
          <button
            key={item.nodeId}
            type="button"
            onClick={() => onSelect?.(item.nodeId)}
            className={cn(
              'flex h-10 items-center gap-2 rounded-inner border border-transparent px-2 text-left transition-colors duration-fast',
              'hover:border-border-strong hover:bg-surface-2',
              activeId === item.nodeId && 'border-accent bg-accent-soft',
            )}
          >
            {/* 类型色点（身份色，不大面积铺色） */}
            <span className="size-2 shrink-0 rounded-pill" style={{ backgroundColor: meta.color }} />
            <span className="min-w-0 flex-1 truncate text-body text-text-primary">{item.title}</span>
            <StatusBadge status={item.status} />
          </button>
        );
      })}
      {/* 聚合统计，等宽数字 */}
      <div className="tnum border-t border-border-subtle px-2 pt-1.5 text-small text-text-tertiary">
        {stats}
      </div>
    </div>
  );
}

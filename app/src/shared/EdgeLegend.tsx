/**
 * EdgeLegend — 常驻图例（design.md §2.2.4，必须常驻、可折叠）[R§6.1.1]
 *
 * 实线/虚线语义业界惯例分裂 → 图例是一等功能。内容一行：
 * `━━ 强依赖 · 事务` `┅┅ 弱链接 · 通信/产物` `━━ 错误路由` `● 运行中动画已开启/已关闭`，
 * 右侧「边动画」开关。折叠态收成 `图例 ⓘ` 按钮。
 * 样式：--surface-2 胶囊、11px 字号、z-index 阶梯 40。
 */
import { useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

function LineSample({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="28"
        y2="4"
        stroke={color}
        strokeWidth={dashed ? 1.5 : 2.5}
        strokeDasharray={dashed ? '6 6' : undefined}
      />
    </svg>
  );
}

export interface EdgeLegendProps {
  /** 边动画开关（接入 ViewModeManager 动画总开关，§8.5） */
  animationsEnabled: boolean;
  onAnimationsChange: (enabled: boolean) => void;
  className?: string;
}

export function EdgeLegend({ animationsEnabled, onAnimationsChange, className }: EdgeLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={cn(
          'z-legend flex h-7 items-center gap-1 rounded-pill bg-surface-2 px-2.5 text-small text-text-secondary shadow-node transition-colors duration-fast hover:text-text-primary',
          className,
        )}
      >
        图例
        <Info className="size-3" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'z-legend flex h-7 items-center gap-3 rounded-pill bg-surface-2 px-3 text-small text-text-secondary shadow-node',
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <LineSample color="var(--edge-strong)" />
        强依赖 · 事务
      </span>
      <span className="flex items-center gap-1.5">
        <LineSample color="var(--edge-weak)" dashed />
        弱链接 · 通信/产物
      </span>
      <span className="flex items-center gap-1.5">
        <LineSample color="var(--edge-error)" />
        错误路由
      </span>
      <span className="flex items-center gap-1.5 text-text-tertiary">
        <span
          className={cn('size-1.5 rounded-pill', animationsEnabled && 'animate-badge-pulse')}
          style={{ backgroundColor: animationsEnabled ? 'var(--st-running)' : 'var(--st-skipped)' }}
        />
        运行中动画{animationsEnabled ? '已开启' : '已关闭'}
      </span>
      <label className="flex items-center gap-1.5">
        <span className="text-text-tertiary">边动画</span>
        <Switch
          checked={animationsEnabled}
          onCheckedChange={onAnimationsChange}
          aria-label="边动画开关"
          className="scale-75 data-[state=checked]:bg-accent"
        />
      </label>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="折叠图例"
        className="text-text-tertiary transition-colors duration-fast hover:text-text-primary"
      >
        ✕
      </button>
    </div>
  );
}

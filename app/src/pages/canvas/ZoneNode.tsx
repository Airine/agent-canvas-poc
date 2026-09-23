/**
 * ZoneNode — `/canvas` 分区容器（冻结契约 CanvasZone 的画布投影）
 *
 * React Flow 自定义节点，渲染在成员节点之下（zIndex -1）、背景之上：
 * 半透明底 + 顶部 36px 标题栏。边界由 CanvasInner 按成员节点坐标计算
 * （padding 40px、顶部标题栏 36px），随节点拖动/LOD 高度变化自适应。
 *
 * 不干扰现有交互：整个容器 pointer-events:none、不可拖动、不可选中，
 * 节点拖动 / ViewModeManager 档位计算 / FocusOverlay 均不受影响。
 */
import type { NodeProps, Node } from '@xyflow/react';

export type ZoneFlowNode = Node<{ title: string }, 'zone'>;

export const ZONE_HEADER_H = 36;
export const ZONE_PADDING = 40;

export function ZoneNode({ data }: NodeProps<ZoneFlowNode>) {
  return (
    <div
      className="size-full rounded-node border border-border-subtle bg-surface-1/40"
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <div
        className="flex items-center gap-2 px-3 text-small text-text-secondary"
        style={{ height: ZONE_HEADER_H }}
      >
        <span className="size-1.5 rounded-pill bg-text-tertiary" />
        <span className="select-none">{data.title}</span>
      </div>
    </div>
  );
}

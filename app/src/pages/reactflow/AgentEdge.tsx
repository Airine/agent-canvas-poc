/**
 * AgentEdge — React Flow 自定义边（design.md §4 三通道编码）
 *
 * | 边类型   | 线型           | 颜色           | 粗细  | 端点                        | 运行态动画            |
 * | 强链接   | 实线           | --edge-strong  | 2.5px | 实心三角箭头                 | 2 粒子/边，速率∝源进度 |
 * | 弱链接   | 虚线 dash 6 6  | --edge-weak    | 1.5px | 空心圆起点 + 空心箭头终点     | 1 稀疏光点，透明度 60% |
 * | 错误路由 | 实线           | --edge-error   | 2px   | 圆点端口 + 中端 `!` 徽章      | 静态高亮              |
 *
 * - 粒子 = 沿路径运动的 SVG 圆点（r=3，源节点状态色，animateMotion），
 *   【禁用 dasharray 动画】[R§6.2.1]；仅运行态开启，总开关接 ViewModeManager（§8.5）。
 * - 节点完成后粒子停止、边透明度降至 50%（A5）。
 * - hover：线宽 +1px、明度 +20%（color-mix），浮出语义标签胶囊 [R§6.1.1]。
 * - 弱链接中点常驻 `msg/min` 标签；点击虚线 → 右侧消息 trace 泳道面板（§4 数据面）。
 * - 贝塞尔曲率 0.25。
 */
import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { EdgeKind, NodeStatus } from '@/shared';

export interface AgentEdgeData extends Record<string, unknown> {
  kind: EdgeKind;
  semantic: string;
  sourceStatus: NodeStatus;
  /** 源节点状态色（粒子色） */
  sourceColor: string;
  /** 源节点进度 0..1（粒子速率 ∝ 进度） */
  progress: number;
  /** 弱链接 `msg/min` 标签值 */
  rate?: number;
  animationsEnabled: boolean;
  onOpenTrace?: (edgeId: string) => void;
}

export type AgentFlowEdge = Edge<AgentEdgeData, 'agent'>;

const EDGE_COLOR: Record<EdgeKind, string> = {
  strong: 'var(--edge-strong)',
  weak: 'var(--edge-weak)',
  error: 'var(--edge-error)',
};
const EDGE_WIDTH: Record<EdgeKind, number> = { strong: 2.5, weak: 1.5, error: 2 };

/** 全局 marker 定义（在页面挂一次；SVG fill/stroke attribute 不支持 var()，用 style） */
export function EdgeMarkerDefs() {
  return (
    <svg aria-hidden style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        {/* 强链接：实心三角箭头 */}
        <marker
          id="ac-arrow-strong"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--edge-strong)' }} />
        </marker>
        {/* 弱链接：空心圆起点（BPMN 消息流符号） */}
        <marker id="ac-circle-weak" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
          <circle
            cx="5"
            cy="5"
            r="3.5"
            style={{ fill: 'var(--canvas-bg)', stroke: 'var(--edge-weak)', strokeWidth: 1.5 }}
          />
        </marker>
        {/* 弱链接：空心箭头终点 */}
        <marker
          id="ac-arrow-weak"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M1,1 L9,5 L1,9"
            style={{ fill: 'none', stroke: 'var(--edge-weak)', strokeWidth: 1.5 }}
          />
        </marker>
        {/* 错误路由：圆点端口 */}
        <marker id="ac-dot-error" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
          <circle cx="5" cy="5" r="3" style={{ fill: 'var(--edge-error)' }} />
        </marker>
      </defs>
    </svg>
  );
}

export function AgentEdge(props: EdgeProps<AgentFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [hover, setHover] = useState(false);
  const d = data as AgentEdgeData;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });

  const done =
    d.sourceStatus === 'completed' || d.sourceStatus === 'failed' || d.sourceStatus === 'skipped';
  const live = d.sourceStatus === 'running' || d.sourceStatus === 'waiting';
  const showParticles = d.animationsEnabled && live && d.kind !== 'error';
  /** 速率 ∝ 源节点进度；基准 1400ms 走完全程（--dur-particle） */
  const dur = 1.4 / (0.5 + d.progress);

  const stroke = hover
    ? `color-mix(in srgb, ${EDGE_COLOR[d.kind]}, white 20%)`
    : EDGE_COLOR[d.kind];
  const strokeWidth = EDGE_WIDTH[d.kind] + (hover ? 1 : 0);

  return (
    <>
      <g
        opacity={done ? 0.5 : 1}
        style={{ transition: 'opacity var(--dur-med) var(--ease-out)' }}
      >
        <BaseEdge
          id={id}
          path={path}
          style={{
            stroke,
            strokeWidth,
            strokeDasharray: d.kind === 'weak' ? '6 6' : undefined,
            transition: 'stroke var(--dur-fast), stroke-width var(--dur-fast)',
          }}
          markerStart={
            d.kind === 'weak'
              ? 'url(#ac-circle-weak)'
              : d.kind === 'error'
                ? 'url(#ac-dot-error)'
                : undefined
          }
          markerEnd={
            d.kind === 'strong'
              ? 'url(#ac-arrow-strong)'
              : d.kind === 'weak'
                ? 'url(#ac-arrow-weak)'
                : 'url(#ac-dot-error)'
          }
        />
        {/* 加宽热区：hover 提亮 + 语义标签；点击虚线开 trace 面板 */}
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => {
            if (d.kind === 'weak') d.onOpenTrace?.(id);
          }}
          style={{ cursor: d.kind === 'weak' ? 'pointer' : 'default', pointerEvents: 'stroke' }}
        />
        {/* 运行态粒子（SVG animateMotion，禁用 dasharray 动画） */}
        {showParticles &&
          (d.kind === 'strong' ? (
            <>
              <circle r={3} style={{ fill: d.sourceColor }}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
              </circle>
              <circle r={3} style={{ fill: d.sourceColor }}>
                <animateMotion
                  dur={`${dur}s`}
                  begin={`${-dur / 2}s`}
                  repeatCount="indefinite"
                  path={path}
                />
              </circle>
            </>
          ) : (
            <circle r={3} opacity={0.6} style={{ fill: d.sourceColor }}>
              <animateMotion dur={`${dur * 1.4}s`} repeatCount="indefinite" path={path} />
            </circle>
          ))}
      </g>

      <EdgeLabelRenderer>
        {/* 弱链接：中点常驻 msg/min 标签（等宽数字） */}
        {d.kind === 'weak' && d.rate !== undefined && (
          <div
            className="tnum absolute text-node-meta text-text-tertiary"
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            {d.rate} msg/min
          </div>
        )}
        {/* 错误路由：中端 `!` 徽章 */}
        {d.kind === 'error' && (
          <div
            className="absolute flex size-3.5 items-center justify-center rounded-pill bg-st-failed text-[9px] font-bold leading-none text-white"
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            !
          </div>
        )}
        {/* hover 语义标签胶囊（消解实线/虚线惯例分裂）[R§6.1.1] */}
        {hover && (
          <div
            className="absolute whitespace-nowrap rounded-pill bg-surface-3 px-2 py-0.5 text-small text-text-secondary shadow-node"
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY - 20}px)`,
              pointerEvents: 'none',
            }}
          >
            {d.semantic}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

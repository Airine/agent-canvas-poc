/**
 * EdgesLayer — SVG 覆盖层边渲染（design.md §4，挂 tldraw OnTheCanvas 插槽，页面坐标系）
 *
 * tldraw 原生无节点图边概念 → 用 SVG 覆盖层实现，端点跟随节点拖拽（监听 shape
 * bounds 变化重算路径）。贝塞尔曲率 0.25，三通道编码两两不同：
 * - 强链接：实线 2.5px --edge-strong + 实心三角箭头；运行态 2 粒子/边，速率∝源节点进度；
 * - 弱链接：虚线 dash 6 6 1.5px --edge-weak + 空心圆起点 + 空心箭头终点 + 中点
 *   `msg/min` 标签；1 稀疏粒子（60% 透明）；点击打开右侧消息 trace 泳道面板；
 * - 错误路由：实线 2px --edge-error + 圆点端口 + 中端 `!` 徽章，静态高亮。
 *
 * 粒子 = 沿路径运动的 SVG 圆点（r=3，源节点状态色），rAF 驱动，
 * 【禁用 CSS stroke-dasharray 滚动】（R§6.2.1）。总开关接 ViewModeManager
 * （手动开关 + prefers-reduced-motion），源节点完成后粒子停止、边透明度降至 50%（A5）。
 * hover：线宽 +1px、颜色提亮 + 语义标签（--surface-3 胶囊，消解惯例分裂 R§6.1.1）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useValue } from 'tldraw';
import { MOCK_EDGES, STATUS_COLORS, useAnimationsEnabled } from '@/shared';
import type { EdgeKind, NodeStatus } from '@/shared/types';
import { shapeIdForNode } from './model';
import { nodeProgress, useCanvasServices } from './context';

/* ---------------- 贝塞尔几何（曲率 0.25） ---------------- */

interface Pt {
  x: number;
  y: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EdgeGeom {
  d: string;
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
  mid: Pt;
  /** 终点切线角（箭头方向） */
  endAngle: number;
  /** 起点切线角 */
  startAngle: number;
}

function cubicAt(g: { p0: Pt; c1: Pt; c2: Pt; p1: Pt }, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * g.p0.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * g.p1.x,
    y: u * u * u * g.p0.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * g.p1.y,
  };
}

/** 端口选择：按相对位置出 right/left/bottom/top，曲率 0.25 */
function edgeGeometry(src: Rect, dst: Rect): EdgeGeom {
  const sc = { x: src.x + src.w / 2, y: src.y + src.h / 2 };
  const dc = { x: dst.x + dst.w / 2, y: dst.y + dst.h / 2 };
  const dx = dc.x - sc.x;
  const dy = dc.y - sc.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  let p0: Pt;
  let p1: Pt;
  let dir0: Pt;
  let dir1: Pt;
  if (horizontal) {
    const sign = dx >= 0 ? 1 : -1;
    p0 = { x: sign > 0 ? src.x + src.w : src.x, y: sc.y };
    p1 = { x: sign > 0 ? dst.x : dst.x + dst.w, y: dc.y };
    dir0 = { x: sign, y: 0 };
    dir1 = { x: -sign, y: 0 };
  } else {
    const sign = dy >= 0 ? 1 : -1;
    p0 = { x: sc.x, y: sign > 0 ? src.y + src.h : src.y };
    p1 = { x: dc.x, y: sign > 0 ? dst.y : dst.y + dst.h };
    dir0 = { x: 0, y: sign };
    dir1 = { x: 0, y: -sign };
  }
  const dist = Math.max(24, Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.25);
  const c1 = { x: p0.x + dir0.x * dist, y: p0.y + dir0.y * dist };
  const c2 = { x: p1.x + dir1.x * dist, y: p1.y + dir1.y * dist };
  const g = { p0, c1, c2, p1 };
  const mid = cubicAt(g, 0.5);
  return {
    d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`,
    p0,
    c1,
    c2,
    p1,
    mid,
    endAngle: Math.atan2(p1.y - c2.y, p1.x - c2.x),
    startAngle: Math.atan2(c1.y - p0.y, c1.x - p0.x),
  };
}

/* ---------------- 样式令牌 ---------------- */

const EDGE_STYLE: Record<EdgeKind, { color: string; width: number; dash?: string }> = {
  strong: { color: 'var(--edge-strong)', width: 2.5 },
  weak: { color: 'var(--edge-weak)', width: 1.5, dash: '6 6' },
  error: { color: 'var(--edge-error)', width: 2 },
};

const PARTICLE_BASE_MS = 1400; /* --dur-particle */

function arrowHead(tip: Pt, angle: number, size: number): string {
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  return `${tip.x},${tip.y} ${tip.x + size * Math.cos(a1)},${tip.y + size * Math.sin(a1)} ${
    tip.x + size * Math.cos(a2)
  },${tip.y + size * Math.sin(a2)}`;
}

function hollowArrow(tip: Pt, angle: number, size: number): string {
  /* 空心箭头（V 形，BPMN 消息流符号） */
  const a1 = angle + Math.PI * 0.78;
  const a2 = angle - Math.PI * 0.78;
  const p1 = { x: tip.x + size * Math.cos(a1), y: tip.y + size * Math.sin(a1) };
  const p2 = { x: tip.x + size * Math.cos(a2), y: tip.y + size * Math.sin(a2) };
  return `M ${p1.x} ${p1.y} L ${tip.x} ${tip.y} L ${p2.x} ${p2.y}`;
}

/* ---------------- 组件 ---------------- */

interface ParticleMeta {
  key: string;
  geom: EdgeGeom;
  color: string;
  opacity: number;
  phase: number;
  durationMs: number;
}

export function EdgesLayer() {
  const editor = useEditor();
  const services = useCanvasServices();
  const animsOn = useAnimationsEnabled(services.manager);
  const [hoverId, setHoverId] = useState<string | null>(null);

  /* 端点跟随：shape bounds 任何变化（拖拽/量高回写）都重算 */
  const bounds = useValue(
    'agent-node-bounds',
    () => {
      const acc: Record<string, Rect> = {};
      for (const edge of MOCK_EDGES) {
        for (const nid of [edge.source, edge.target]) {
          if (!acc[nid]) {
            const b = editor.getShapePageBounds(shapeIdForNode(nid));
            if (b) acc[nid] = { x: b.x, y: b.y, w: b.w, h: b.h };
          }
        }
      }
      return acc;
    },
    [editor],
  );

  const { snapshot } = services;

  const edges = useMemo(
    () =>
      MOCK_EDGES.map((def) => {
        const src = bounds[def.source];
        const dst = bounds[def.target];
        if (!src || !dst) return null;
        const liveKind = snapshot.edges[def.id]?.kind ?? def.kind;
        const srcState = snapshot.nodes[def.source];
        return { def, kind: liveKind, geom: edgeGeometry(src, dst), srcState };
      }).filter((e): e is NonNullable<typeof e> => e !== null),
    [bounds, snapshot],
  );

  /* 运行态粒子清单：仅运行态 + 动画总开关开启 */
  const particles = useMemo(() => {
    if (!animsOn) return [] as ParticleMeta[];
    const list: ParticleMeta[] = [];
    for (const { def, kind, geom, srcState } of edges) {
      if (!srcState || srcState.status !== 'running' || kind === 'error') continue;
      const progress = nodeProgress(def.source, srcState);
      /* 速率∝源节点进度：进度越高走得越快（0.6x–1.4x 基准速率） */
      const duration = PARTICLE_BASE_MS / (0.6 + 0.8 * progress);
      const count = kind === 'strong' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        list.push({
          key: `${def.id}-p${i}`,
          geom,
          color: STATUS_COLORS[srcState.status as NodeStatus],
          opacity: kind === 'weak' ? 0.6 : 1,
          phase: i / count,
          durationMs: duration,
        });
      }
    }
    return list;
  }, [edges, animsOn]);

  /* rAF 驱动粒子沿路径运动（不触发 React 重渲染） */
  const circleRefs = useRef(new Map<string, SVGCircleElement>());
  useEffect(() => {
    if (particles.length === 0) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      for (const p of particles) {
        const el = circleRefs.current.get(p.key);
        if (!el) continue;
        const t = (elapsed / p.durationMs + p.phase) % 1;
        const pt = cubicAt(p.geom, t);
        el.setAttribute('cx', String(pt.x));
        el.setAttribute('cy', String(pt.y));
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [particles]);

  const hoverEdge = hoverId ? edges.find((e) => e.def.id === hoverId) : null;

  return (
    <>
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 'var(--z-edge)',
        }}
      >
        {edges.map(({ def, kind, geom, srcState }) => {
          const style = EDGE_STYLE[kind];
          const hovered = hoverId === def.id;
          /* A5：源节点完成后粒子停止、边透明度降至 50% */
          const done =
            srcState &&
            (srcState.status === 'completed' ||
              srcState.status === 'failed' ||
              srcState.status === 'skipped');
          return (
            <g
              key={def.id}
              opacity={done ? 0.5 : 1}
              style={{ filter: hovered ? 'brightness(1.2)' : undefined }}
            >
              {/* 主路径 */}
              <path
                d={geom.d}
                fill="none"
                stroke={style.color}
                strokeWidth={hovered ? style.width + 1 : style.width}
                strokeDasharray={style.dash}
              />
              {/* 宽透明命中路径：hover 提亮 + 点击弱链接打开 trace */}
              <path
                d={geom.d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: 'stroke', cursor: kind === 'weak' ? 'pointer' : 'default' }}
                onMouseEnter={() => setHoverId(def.id)}
                onMouseLeave={() => setHoverId((v) => (v === def.id ? null : v))}
                onPointerDown={(e) => {
                  if (kind === 'weak') {
                    e.stopPropagation();
                    services.openTrace(def);
                  }
                }}
              />
              {/* 端口符号 */}
              {kind === 'strong' && (
                <polygon
                  points={arrowHead(geom.p1, geom.endAngle, 11)}
                  fill={style.color}
                />
              )}
              {kind === 'weak' && (
                <>
                  {/* 空心圆起点（BPMN 消息流符号） */}
                  <circle
                    cx={geom.p0.x + Math.cos(geom.startAngle) * 6}
                    cy={geom.p0.y + Math.sin(geom.startAngle) * 6}
                    r={4}
                    fill="var(--canvas-bg)"
                    stroke={style.color}
                    strokeWidth={1.5}
                  />
                  <path
                    d={hollowArrow(geom.p1, geom.endAngle, 9)}
                    fill="none"
                    stroke={style.color}
                    strokeWidth={1.5}
                  />
                </>
              )}
              {kind === 'error' && (
                <>
                  <circle cx={geom.p0.x} cy={geom.p0.y} r={3} fill={style.color} />
                  <circle cx={geom.p1.x} cy={geom.p1.y} r={3} fill={style.color} />
                </>
              )}
            </g>
          );
        })}
        {/* 运行态粒子（SVG 圆点沿路径，禁用 dasharray 动画） */}
        {particles.map((p) => (
          <circle
            key={p.key}
            ref={(el) => {
              if (el) circleRefs.current.set(p.key, el);
              else circleRefs.current.delete(p.key);
            }}
            cx={p.geom.p0.x}
            cy={p.geom.p0.y}
            r={3}
            fill={p.color}
            opacity={p.opacity}
          />
        ))}
      </svg>

      {/* 弱链接中点常驻 `msg/min` 标签（等宽数字，--text-tertiary） */}
      {edges
        .filter((e) => e.kind === 'weak')
        .map(({ def, geom }) => (
          <button
            key={`label-${def.id}`}
            type="button"
            onClick={() => services.openTrace(def)}
            className="tnum absolute rounded-pill bg-surface-2 px-1.5 py-0.5 text-node-meta text-text-tertiary shadow-node transition-colors duration-fast hover:text-text-primary"
            style={{
              left: geom.mid.x,
              top: geom.mid.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'all',
            }}
          >
            {msgRate(def.id)} msg/min
          </button>
        ))}

      {/* 错误路由中端 `!` 徽章 */}
      {edges
        .filter((e) => e.kind === 'error')
        .map(({ def, geom }) => (
          <span
            key={`err-${def.id}`}
            className="absolute flex size-4 items-center justify-center rounded-pill bg-st-failed text-[10px] font-bold leading-none text-white"
            style={{ left: geom.mid.x, top: geom.mid.y, transform: 'translate(-50%, -50%)' }}
          >
            !
          </span>
        ))}

      {/* hover 语义标签（--surface-3 小胶囊） */}
      {hoverEdge && (
        <div
          className="pointer-events-none absolute z-legend rounded-pill bg-surface-3 px-2 py-1 text-small text-text-primary shadow-overlay"
          style={{
            left: hoverEdge.geom.mid.x,
            top: hoverEdge.geom.mid.y - 14,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {hoverEdge.def.semantic}
        </div>
      )}
    </>
  );
}

/** 每条弱链接确定性的 msg/min 演示值 */
function msgRate(edgeId: string): number {
  let h = 0;
  for (const ch of edgeId) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return 6 + (h % 13);
}

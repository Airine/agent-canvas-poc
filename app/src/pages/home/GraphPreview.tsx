/**
 * GraphPreview — workspace 卡片的迷你预览（冻结契约 Graph 的只读 schematic）
 *
 * 刻意不嵌 React Flow（太贵）：按 graph.nodes/edges 坐标缩放到卡片宽，
 * 纯 SVG 画 zones 色块底 + 圆点节点（六态色）+ 边线（强实/弱虚/错误红）。
 */
import type { CanvasNode, Graph } from '@/pages/canvas/live-store';
import { STATUS_HEX, nodeWidth } from '@/pages/canvas/utils';

/** 预览用的节点高度估值（schematic 只画圆点，高度只影响包围盒） */
const PREVIEW_NODE_H = 200;
const PREVIEW_PAD = 30;
/** 与画布页 ZoneNode 对齐的分区内边距 */
const ZONE_PAD = 40;
const ZONE_HEAD = 36;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function nodeBox(n: CanvasNode): Box {
  return { minX: n.x, minY: n.y, maxX: n.x + nodeWidth(n), maxY: n.y + PREVIEW_NODE_H };
}

function union(boxes: Box[]): Box {
  return boxes.reduce<Box>(
    (acc, b) => ({
      minX: Math.min(acc.minX, b.minX),
      minY: Math.min(acc.minY, b.minY),
      maxX: Math.max(acc.maxX, b.maxX),
      maxY: Math.max(acc.maxY, b.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

const EDGE_STROKE: Record<string, string> = {
  strong: 'var(--edge-strong)',
  weak: 'var(--edge-weak)',
  error: 'var(--st-failed)',
};

export function GraphPreview({ graph }: { graph: Graph }) {
  if (graph.nodes.length === 0) {
    return <div className="flex h-full items-center justify-center text-small text-text-tertiary">空画布</div>;
  }
  const boxes = new Map(graph.nodes.map((n) => [n.id, nodeBox(n)]));
  const all = union([...boxes.values()]);
  const viewX = all.minX - PREVIEW_PAD;
  const viewY = all.minY - PREVIEW_PAD;
  const viewW = all.maxX - all.minX + PREVIEW_PAD * 2;
  const viewH = all.maxY - all.minY + PREVIEW_PAD * 2;

  const zones = graph.zones
    .map((z) => {
      const memberBoxes = graph.nodes.filter((n) => n.zoneId === z.id).map((n) => boxes.get(n.id)!);
      if (memberBoxes.length === 0) return null;
      const b = union(memberBoxes);
      return { id: z.id, title: z.title, box: b };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);

  return (
    <svg
      viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label="workspace 画布缩略预览"
    >
      {/* zones 色块底 */}
      {zones.map((z) => (
        <g key={z.id}>
          <rect
            x={z.box.minX - ZONE_PAD}
            y={z.box.minY - ZONE_PAD - ZONE_HEAD}
            width={z.box.maxX - z.box.minX + ZONE_PAD * 2}
            height={z.box.maxY - z.box.minY + ZONE_PAD * 2 + ZONE_HEAD}
            rx={14}
            fill="var(--surface-2)"
            opacity={0.55}
          />
          <text
            x={z.box.minX - ZONE_PAD + 18}
            y={z.box.minY - ZONE_PAD - ZONE_HEAD + 24}
            fontSize={20}
            fill="var(--text-tertiary)"
          >
            {z.title}
          </text>
        </g>
      ))}
      {/* 边：源右缘中点 → 目标左缘中点 */}
      {graph.edges.map((e) => {
        const s = boxes.get(e.source);
        const t = boxes.get(e.target);
        if (!s || !t) return null;
        return (
          <line
            key={e.id}
            x1={s.maxX}
            y1={(s.minY + s.maxY) / 2}
            x2={t.minX}
            y2={(t.minY + t.maxY) / 2}
            stroke={EDGE_STROKE[e.kind] ?? 'var(--edge-strong)'}
            strokeWidth={e.kind === 'strong' ? 5 : 3}
            strokeDasharray={e.kind === 'weak' ? '10 8' : undefined}
            opacity={0.8}
          />
        );
      })}
      {/* 节点圆点：六态色 */}
      {graph.nodes.map((n) => {
        const b = boxes.get(n.id)!;
        return (
          <circle
            key={n.id}
            cx={(b.minX + b.maxX) / 2}
            cy={(b.minY + b.maxY) / 2}
            r={16}
            fill={STATUS_HEX[n.status]}
            stroke="var(--surface-1)"
            strokeWidth={4}
          />
        );
      })}
    </svg>
  );
}

/**
 * layout.ts — 一键最优布局
 *
 * 布局原则（以用户确认的参考图为准）：
 *  1. 节点 rank 是横向列：每经过一条依赖边，目标节点向右推进一列；
 *  2. 并行节点在同一列内纵向排列；
 *  3. Zone 只是自适应容器，不决定列；一个 Zone 可以横跨多个 rank；
 *  4. strong / weak / error 都表达有方向的信息流，都会参与视觉布局。
 *
 * 实现：最长路径分层 + rank 内 barycenter 排序，适合当前小规模画布。
 */
import type { Graph, CanvasNode } from './types.js';

function widthOf(n: CanvasNode): number {
  return n.type === 'coordinator' ? 320 : 400;
}

const NODE_H = 310;
const NODE_GAP_Y = 50;
const RANK_GAP_X = 110;
const MARGIN_X = 60;
const MARGIN_Y = 60;

export interface LayoutResult {
  positions: Array<{ id: string; x: number; y: number }>;
}

interface LayoutEdge {
  source: string;
  target: string;
}

function layoutEdges(graph: Graph, ids: Set<string>): LayoutEdge[] {
  return graph.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
    .map((e) => ({ source: e.source, target: e.target }));
}

/** 最长路径分层：源节点 rank=0，每条边令 target 至少比 source 右一列。 */
function computeRanks(nodes: CanvasNode[], edges: LayoutEdge[]): Map<string, number> {
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const e of edges) {
      const next = (rank.get(e.source) ?? 0) + 1;
      if (next > (rank.get(e.target) ?? 0)) {
        rank.set(e.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // 环图保护：避免错误拓扑让画布无限扩张。
  const maxRank = Math.max(...rank.values(), 0);
  if (maxRank >= nodes.length) {
    for (const [id, value] of rank) rank.set(id, value % nodes.length);
  }
  return rank;
}

/** rank 内 barycenter 排序，减少长边和交叉。 */
function orderRanks(
  columns: Map<number, CanvasNode[]>,
  edges: LayoutEdge[],
  rank: Map<string, number>,
): void {
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e.target]);
  }

  const indexOf = (): Map<string, number> => {
    const index = new Map<string, number>();
    for (const ns of columns.values()) ns.forEach((n, i) => index.set(n.id, i));
    return index;
  };

  const reorder = (
    r: number,
    neighbours: Map<string, string[]>,
    index: Map<string, number>,
  ): void => {
    const ns = columns.get(r);
    if (!ns || ns.length < 2) return;
    ns.sort((a, b) => {
      const barycenter = (n: CanvasNode): number => {
        const refs = (neighbours.get(n.id) ?? []).filter((id) => rank.get(id) !== r);
        if (refs.length === 0) return Number.POSITIVE_INFINITY;
        return refs.reduce((sum, id) => sum + (index.get(id) ?? 0), 0) / refs.length;
      };
      const da = barycenter(a);
      const db = barycenter(b);
      if (da !== db) return da - db;
      return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
    });
  };

  for (let pass = 0; pass < 4; pass += 1) {
    let index = indexOf();
    for (const r of ranks) reorder(r, incoming, index);
    index = indexOf();
    for (const r of [...ranks].reverse()) reorder(r, outgoing, index);
  }
}

/** 错误路由的源节点置于并行列顶部，保持主任务→失败处置的视觉连续性。 */
function prioritizeErrorBranches(columns: Map<number, CanvasNode[]>, graph: Graph): void {
  const errorSources = new Set(
    graph.edges.filter((e) => e.kind === 'error').map((e) => e.source),
  );
  for (const column of columns.values()) {
    column.sort((a, b) => Number(errorSources.has(b.id)) - Number(errorSources.has(a.id)));
  }
}

/** 计算一键最优布局，输出 React Flow 使用的左上角坐标。 */
export function computeLayout(graph: Graph): LayoutResult {
  const nodes = graph.nodes;
  if (nodes.length === 0) return { positions: [] };

  const edges = layoutEdges(graph, new Set(nodes.map((n) => n.id)));
  const rank = computeRanks(nodes, edges);
  const columns = new Map<number, CanvasNode[]>();
  for (const node of nodes) {
    const r = rank.get(node.id) ?? 0;
    columns.set(r, [...(columns.get(r) ?? []), node]);
  }

  orderRanks(columns, edges, rank);
  prioritizeErrorBranches(columns, graph);

  const positions: Array<{ id: string; x: number; y: number }> = [];
  let cursorX = MARGIN_X;
  for (const r of [...columns.keys()].sort((a, b) => a - b)) {
    const column = columns.get(r)!;
    let y = MARGIN_Y;
    let columnWidth = 0;
    for (const node of column) {
      positions.push({ id: node.id, x: cursorX, y });
      columnWidth = Math.max(columnWidth, widthOf(node));
      y += NODE_H + NODE_GAP_Y;
    }
    cursorX += columnWidth + RANK_GAP_X;
  }
  return { positions };
}

/**
 * `/canvas` — Agent Canvas 产品版画布：PoC React Flow 实现接真实控制面（api-contract.md v0）
 *
 * 与 /react-flow 的唯一差异是数据源：mock 事件流引擎 → LiveStore（WS /ws + REST /api）。
 * - hello 后收全量 graph；node/edge 补丁增量更新；term 快照分发到订阅的活窗组件。
 * - PlaybackBar 替换为 RunBar：▶ 运行（POST /api/graph/run）/ ⟳ 重置（/reset）/
 *   runState 指示 + 连接状态徽标（后端不在场回退浏览器内 mock 并明示）。
 * - 设计规范不变（design.md）：三态 LOD、边三通道编码、粒子动画、常驻图例、minimap、
 *   键盘快捷键（+/- 缩放、F 适应、Esc 退出专注/关面板、Enter 专注）、reduced-motion。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../reactflow/reactflow.css';
import { Diamond, LayoutGrid, Maximize, Minus, Plus, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  EdgeLegend,
  STATUS_COLORS,
  ViewModeManager,
  useAnimationsEnabled,
  useFocusedNodeId,
} from '@/shared';
import type { LiveTier, NodeStatus } from '@/shared';
import { LiveEdge, EdgeMarkerDefs, type LiveFlowEdge } from './LiveEdge';
import { LiveNode, type LiveFlowNode } from './LiveNode';
import { ArchivedSessionsControl } from './ArchivedSessionsControl';
import { GlobalCardViewControl } from './GlobalCardViewControl';
import { ZoneNode, ZONE_HEADER_H, ZONE_PADDING, type ZoneFlowNode } from './ZoneNode';
import { TracePanel } from './TracePanel';
import { RunBar } from './RunBar';
import { CanvasCtx, type CanvasCtxValue } from './canvas-context';
import {
  LiveStore,
  fetchWorkspaces,
  pickActiveWorkspace,
  useLiveStore,
  type CanvasEdge,
} from './live-store';
import { EDGE_KIND_SEMANTIC, STATUS_HEX, nodeWidth } from './utils';

/* React Flow 类型表必须稳定（模块级常量） */
const nodeTypes = { agent: LiveNode, zone: ZoneNode } as unknown as NodeTypes;
const edgeTypes = { agent: LiveEdge } as unknown as EdgeTypes;

/** zone 节点 + agent 节点的并集（zone 必须排在成员之前，zIndex -1 沉底） */
type CanvasFlowNode = LiveFlowNode | ZoneFlowNode;

/** 成员节点实测高度缺失时的估值（首帧 measured 未就绪，次帧即被实测值替换） */
const NODE_HEIGHT_FALLBACK = 260;

/**
 * 冻结契约 Zone 分区：边界 = 成员节点包围盒 + padding 40px + 顶部标题栏 36px。
 * 不用 RF parent/child 机制（成员保持绝对坐标，拖拽/LOD/FocusOverlay 零侵入），
 * 仅作为沉底容器节点随成员位置自适应。
 */
function computeZoneNodes(nodes: LiveFlowNode[], store: LiveStore): ZoneFlowNode[] {
  const out: ZoneFlowNode[] = [];
  for (const zone of store.zones.values()) {
    const members = nodes.filter((n) => store.nodes.get(n.id)?.zoneId === zone.id);
    if (members.length === 0) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const m of members) {
      const w = m.measured?.width ?? (typeof m.style?.width === 'number' ? m.style.width : 400);
      const h = m.measured?.height ?? NODE_HEIGHT_FALLBACK;
      minX = Math.min(minX, m.position.x);
      minY = Math.min(minY, m.position.y);
      maxX = Math.max(maxX, m.position.x + w);
      maxY = Math.max(maxY, m.position.y + h);
    }
    const zw = maxX - minX + ZONE_PADDING * 2;
    const zh = maxY - minY + ZONE_PADDING * 2 + ZONE_HEADER_H;
    out.push({
      id: `zone-${zone.id}`,
      type: 'zone',
      position: { x: minX - ZONE_PADDING, y: minY - ZONE_PADDING - ZONE_HEADER_H },
      // 显式宽高：RF12 据此视为已测量，否则 zone 一直 visibility:hidden
      width: zw,
      height: zh,
      data: { title: zone.title },
      style: { width: zw, height: zh, zIndex: -1 },
      draggable: false,
      selectable: false,
      focusable: false,
    });
  }
  return out;
}

/* ---------------- 活窗配额（§3.2.2）：前 3 live / 第 4 个 2fps / 其余快照 ---------------- */

const LIVE_QUOTA = 3;

function computeTiers(
  store: LiveStore,
  promoted: string[],
): { tiers: Record<string, LiveTier>; liveCount: number } {
  const windowIds = [...store.nodes.values()]
    .filter((n) => n.type !== 'coordinator'&&!n.archivedAt)
    .map((n) => n.id);
  const rank = (id: string): number => {
    const s = store.nodes.get(id)?.status ?? 'queued';
    if (s === 'running') return 0;
    if (s === 'waiting') return 1;
    return 2;
  };
  const auto = [...windowIds]
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const sa = store.nodes.get(a)?.startedAt ?? Number.MAX_SAFE_INTEGER;
      const sb = store.nodes.get(b)?.startedAt ?? Number.MAX_SAFE_INTEGER;
      return sa - sb;
    })
    .filter((id) => !promoted.includes(id));
  const order = [...promoted.filter((id) => windowIds.includes(id)), ...auto];
  const tiers: Record<string, LiveTier> = {};
  order.forEach((id, i) => {
    tiers[id] = i < LIVE_QUOTA ? 'live' : i < LIVE_QUOTA + 1 ? 'fps2' : 'snapshot';
  });
  return { tiers, liveCount: Math.min(LIVE_QUOTA, order.length) };
}

/* ---------------- zoom → ViewModeManager 上报（120ms 防抖在 manager 内） ---------------- */

function ZoomReporter({ manager }: { manager: ViewModeManager }) {
  const { zoom } = useViewport();
  useEffect(() => {
    manager.setZoom(zoom);
  }, [manager, zoom]);
  return null;
}

/** 画布底：点径 1.5px、间距 24px；zoom < 0.4 网格淡出防摩尔纹（§2.1） */
function CanvasBackground() {
  const { zoom } = useViewport();
  return (
    <div
      className="absolute inset-0 transition-opacity duration-med"
      style={{ opacity: zoom < 0.4 ? 0 : 1 }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.5}
        color="var(--canvas-grid)"
        bgColor="var(--canvas-bg)"
      />
    </div>
  );
}

/* ---------------- 左下缩放控制（§2.2.2 竖排 36px 按钮组） ---------------- */

function ZoomControls() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const btn =
    'flex size-9 items-center justify-center text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary';
  return (
    <div className="absolute bottom-4 left-4 z-legend flex flex-col divide-y divide-border-subtle overflow-hidden rounded-inner border border-border-subtle bg-surface-2 shadow-node">
      <button
        type="button"
        aria-label="缩小"
        title="缩小（-）"
        onClick={() => void rf.zoomOut({ duration: 120 })}
        className={btn}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="复位到 100%"
        title="复位到 100%"
        onClick={() => void rf.zoomTo(1, { duration: 200 })}
        className="tnum flex size-9 items-center justify-center text-node-meta text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="放大"
        title="放大（+）"
        onClick={() => void rf.zoomIn({ duration: 120 })}
        className={btn}
      >
        <Plus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="适应画布"
        title="适应画布（F）"
        onClick={() => void rf.fitView({ duration: 300, padding: 0.2 })}
        className={btn}
      >
        <Maximize className="size-4" />
      </button>
    </div>
  );
}

/* ---------------- 页面主体 ---------------- */

function CanvasInner({ workspaceId }: { workspaceId?: string }) {
  const [store] = useState(() => new LiveStore(workspaceId));
  const [manager] = useState(() => new ViewModeManager(workspaceId));
  const rf = useReactFlow();

  const storeVersion = useLiveStore(store); // graph/node/edge/event 补丁 → 版本号重渲染
  useEffect(
    () => () => {
      store.dispose();
      manager.dispose();
    },
    [store, manager],
  );

  const animationsEnabled = useAnimationsEnabled(manager);
  const focusedNodeId = useFocusedNodeId(manager);

  /* ---- React Flow 节点：reset 时按契约 x/y 重建，平时保留拖拽位置 ---- */
  const dragPos = useRef(new Map<string, { x: number; y: number }>());
  const lastResetSeq = useRef(0);
  if (store.resetSeq !== lastResetSeq.current) {
    lastResetSeq.current = store.resetSeq;
    dragPos.current.clear();
  }
  /* 一键布局确认后：丢弃本地拖拽位置，跟随服务端新坐标 */
  const lastLayoutSeq = useRef(0);
  if (store.layoutSeq !== lastLayoutSeq.current) {
    lastLayoutSeq.current = store.layoutSeq;
    dragPos.current.clear();
  }
  const [nodes, setNodes] = useState<LiveFlowNode[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return [...store.nodes.values()].filter(n=>!n.archivedAt).map((n) => {
        const old = prevById.get(n.id);
        return {
          id: n.id,
          type: 'agent' as const,
          position: dragPos.current.get(n.id) ?? { x: n.x, y: n.y },
          data: { nodeId: n.id },
          style: { width: nodeWidth(n) },
          selected: old?.selected,
        };
      });
    });

  }, [store, storeVersion]);
  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) dragPos.current.set(c.id, c.position);
    }
    // zone 容器不可拖动/选中，变化只会落在 agent 节点上，此处收窄是安全的
    setNodes((ns) => applyNodeChanges(changes as NodeChange<LiveFlowNode>[], ns));
  }, []);

  /* ---- Zone 分区容器（沉底，随成员节点位置/实测尺寸自适应） ---- */
  const zoneNodes = useMemo(
    () => computeZoneNodes(nodes, store),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, store, storeVersion],
  );
  const flowNodes = useMemo<CanvasFlowNode[]>(
    () => [...zoneNodes, ...nodes],
    [zoneNodes, nodes],
  );

  /* ---- 边：三通道编码数据随补丁重建 ---- */
  const [traceEdgeId, setTraceEdgeId] = useState<string | null>(null);
  const edges = useMemo<LiveFlowEdge[]>(
    () =>
      [...store.edges.values()].filter(e=>!store.nodes.get(e.source)?.archivedAt&&!store.nodes.get(e.target)?.archivedAt).map((e: CanvasEdge) => {
        const src = store.nodes.get(e.source);
        const srcStatus: NodeStatus = src?.status ?? 'queued';
        const channels = [...store.edges.values()].filter(other => other.kind === 'communication' &&
          (other.source === e.source && other.target === e.target || other.source === e.target && other.target === e.source)).sort((a,b)=>a.id.localeCompare(b.id));
        const lane = e.kind === 'communication' ? (channels.findIndex(other=>other.id===e.id) - (channels.length - 1) / 2) * 56 : 0;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'agent' as const,
          data: {
            kind: e.kind,
            lane,
            semantic: EDGE_KIND_SEMANTIC[e.kind],
            sourceStatus: srcStatus,
            sourceColor: STATUS_COLORS[srcStatus],
            progress: src?.progress ?? 0.15,
            label: e.label,
            animationsEnabled,
            onOpenTrace: setTraceEdgeId,
          },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, storeVersion, animationsEnabled],
  );

  /* ---- 活窗配额 ---- */
  const [promoted, setPromoted] = useState<string[]>([]);
  const { tiers, liveCount } = useMemo(
    () => computeTiers(store, promoted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, storeVersion, promoted],
  );
  const activateNode = useCallback(
    (id: string) => setPromoted((p) => [id, ...p.filter((x) => x !== id)]),
    [],
  );

  /* ---- 一键布局后自动 fitView（layoutSeq 由 store.autoLayout() 递增） ---- */
  const lastFitLayoutSeq = useRef(0);
  const layoutSeq = store.layoutSeq;
  useEffect(() => {
    if (layoutSeq !== lastFitLayoutSeq.current) {
      lastFitLayoutSeq.current = layoutSeq;
      // 等 node 补丁渲染完一帧再适应
      const t = setTimeout(() => void rf.fitView({ duration: 400, padding: 0.15 }), 120);
      return () => clearTimeout(t);
    }
  }, [layoutSeq, rf]);

  /* ---- 选中 / 双向锚定闪烁（600ms×2） ---- */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedId(params.nodes[0]?.id ?? null);
  }, []);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flashNode = useCallback((id: string) => {
    for (const t of flashTimers.current) clearTimeout(t);
    setFlashId(id);
    setFlashOn(true);
    flashTimers.current = [
      setTimeout(() => setFlashOn(false), 600),
      setTimeout(() => setFlashOn(true), 1200),
      setTimeout(() => {
        setFlashOn(false);
        setFlashId(null);
      }, 1800),
    ];
  }, []);

  /* ---- 拖拽期间强制活窗 pointer-events:none（§8.4） ---- */
  const [dragging, setDragging] = useState(false);

  /* ---- A6：approval 到达（节点转 waiting）→ toast 右上角滑入 ---- */
  const prevStatus = useRef<Record<string, NodeStatus>>({});
  useEffect(() => {
    for (const n of store.nodes.values()) {
      const prev = prevStatus.current[n.id];
      if (n.backend !== 'e' && n.status === 'waiting' && prev !== 'waiting') {
        toast(`${n.title} 等待批准`, {
          description: n.approval?.prompt ?? n.statusReason ?? 'approval',
        });
      }
      prevStatus.current[n.id] = n.status;
    }

  }, [store, storeVersion]);

  /* ---- 键盘（§7）：+/- 缩放、F 适应、Esc 关面板、Enter 专注 ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (manager.focusedNodeId) return; // 专注态画布快捷键挂起（焦点仲裁 §3.2.3）
      if (e.key === '+' || e.key === '=') void rf.zoomIn({ duration: 120 });
      else if (e.key === '-') void rf.zoomOut({ duration: 120 });
      else if (e.key === 'f' || e.key === 'F') void rf.fitView({ duration: 300, padding: 0.2 });
      else if (e.key === 'Escape') setTraceEdgeId(null);
      else if (e.key === 'Enter' && selectedId) manager.enterFocus(selectedId);
      else if (e.key === 'l' || e.key === 'L') void store.autoLayout().catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf, manager, selectedId, store]);

  /* ---- 窄屏提示（§7：桌面优先，<1024px 提示但仍可用） ---- */
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /* ---- 双击空白复位 zoom=1，以指针为锚点（§2.1） ---- */
  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
      const pane = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const px = e.clientX - pane.left;
      const py = e.clientY - pane.top;
      const fp = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      void rf.setViewport({ x: px - fp.x, y: py - fp.y, zoom: 1 }, { duration: 300 });
    },
    [rf],
  );

  const ctxValue: CanvasCtxValue = {
    manager,
    store,
    tiers,
    liveCount,
    activateNode,
    dragging,
    flashId,
    flashOn,
    flashNode,
    selectedId,
  };

  const traceEdge = traceEdgeId ? store.edges.get(traceEdgeId) : undefined;
  const windowTotal = [...store.nodes.values()].filter((n) => n.type !== 'coordinator'&&!n.archivedAt).length;
  useEffect(()=>{if(focusedNodeId){const node=store.nodes.get(focusedNodeId);if(!node||node.archivedAt)manager.exitFocus();}},[focusedNodeId,manager,store,storeVersion]);

  return (
    <CanvasCtx.Provider value={ctxValue}>
      <GlobalCardViewControl manager={manager}/>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-canvas-bg text-text-primary">
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onSelectionChange={onSelectionChange}
          onNodeDoubleClick={(_, node) => manager.enterFocus(node.id)}
          onNodeDragStart={() => setDragging(true)}
          onNodeDragStop={(_, node) => { setDragging(false);void store.saveLayout([{id:node.id,x:node.position.x,y:node.position.y}]).catch(e=>toast.error(String(e))); }}
          onDoubleClick={onCanvasDoubleClick}
          onPaneClick={() => setTraceEdgeId(null)}
          minZoom={0.1}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          onlyRenderVisibleElements={!focusedNodeId}
          zoomOnDoubleClick={false}
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <ZoomReporter manager={manager} />
          <CanvasBackground />
          <EdgeMarkerDefs />
        </ReactFlow>

        {/* §2.2.1 左上：产品标识（点击新标签页打开主页）+ 产品版徽标（herdr 真实驱动） */}
        <div className="absolute left-4 top-4 z-legend flex items-center gap-2">
          <button
            type="button"
            title="新标签页打开 Agent Canvas 主页"
            onClick={() => window.open('/', '_blank')}
            className="flex items-center gap-2 rounded-pill px-2 py-1 transition-colors duration-fast hover:bg-surface-2"
          >
            <Diamond className="size-4 text-accent" fill="currentColor" />
            <span className="text-focus-title text-text-primary">Agent Canvas · 产品版</span>
          </button>
          <span className="flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-small text-text-secondary shadow-node">
            <Radio className="size-3 text-accent" />
            {store.backendKind === 'e' ? 'Native UI · e/Pi + Codex' : 'herdr / 示例'}
          </span>
          {workspaceId && (
            <span
              className="tnum flex h-7 items-center rounded-pill bg-surface-2 px-2.5 text-small text-text-tertiary shadow-node"
              title="当前 workspace"
            >
              {workspaceId}
            </span>
          )}
        </div>

        {/* §2.2.4 顶部居中：常驻图例（含边动画总开关，接 ViewModeManager） */}
        {store.backendKind !== 'e' && <EdgeLegend
          className="absolute left-1/2 top-4 -translate-x-1/2 max-[1180px]:hidden"
          animationsEnabled={animationsEnabled}
          onAnimationsChange={(v) => manager.setAnimationsOverride(v)}
        />}
        {store.backendKind === 'e' && <span className="absolute left-1/2 top-5 -translate-x-1/2 text-small text-text-tertiary max-[1280px]:hidden">独立会话 · 无自动连线调度</span>}

        {/* 顶部右侧：RunBar（运行/重置/runState/连接状态）+ 活窗配额 + 一键布局 */}
        <div className="absolute right-4 top-4 z-legend flex items-center gap-2">
          <button
            type="button"
            aria-label="一键最优布局"
            title="一键最优布局（L）：按依赖方向整理为 zone 泳道"
            onClick={() => void store.autoLayout().catch(() => {})}
            className="flex h-9 items-center gap-1.5 rounded-pill bg-surface-2 px-3 text-small text-text-secondary shadow-node transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
          >
            <LayoutGrid className="size-4" />
            布局
          </button>
          <span
            className="tnum flex h-9 items-center rounded-pill bg-surface-2 px-3 text-small text-text-secondary shadow-node"
            title="活窗配额：超出降为 2fps 心跳帧 / 快照，点窗口栏标记可手动点亮（§3.2.2）"
          >
            活窗 {liveCount}/{windowTotal}
          </span>
          {store.backendKind === 'e' ? <div className="flex items-center gap-2 rounded bg-surface-2 p-2 text-small"><span>{store.connState}</span><button disabled={store.connState !== 'online'} onClick={()=>void store.addSession().catch(e=>toast.error(String(e)))}>添加 Pi 会话</button><button disabled={store.connState !== 'online'} onClick={()=>void store.addCodexCard().catch(e=>toast.error(String(e)))}>添加 Codex</button><ArchivedSessionsControl store={store}/></div> : <RunBar
            runState={store.runState}
            connState={store.connState}
            onRun={() => store.run()}
            onReset={() => store.reset()}
          />}
        </div>

        {store.error && <div role="alert" className="absolute bottom-4 left-1/2 z-legend -translate-x-1/2 rounded bg-surface-2 p-3">{store.error}</div>}
        {/* §2.2.2 左下：缩放控制 */}
        <ZoomControls />

        {/* §2.2.3 右下：Minimap 200×130，节点色块用状态色 */}
        <div className="absolute bottom-4 right-4 z-legend">
          <MiniMap
            style={{ width: 200, height: 130 }}
            nodeColor={(n) =>
              n.type === 'zone'
                ? 'var(--minimap-zone)'
                : STATUS_HEX[store.nodes.get(n.id)?.status ?? 'queued']
            }
            maskColor="var(--minimap-mask)"
            bgColor="var(--surface-1)"
            pannable
            zoomable
          />
        </div>

        {/* §4 数据面：弱链接消息 trace 泳道面板 */}
        {traceEdge && (
          <TracePanel store={store} edge={traceEdge} onClose={() => setTraceEdgeId(null)} />
        )}

        {/* §7 窄屏提示条 */}
        {narrow && (
          <div className="absolute left-1/2 top-14 z-legend -translate-x-1/2 rounded-pill bg-surface-3 px-3 py-1 text-small text-text-secondary shadow-node">
            画布体验为桌面设计，建议 ≥1280px
          </div>
        )}

        <Toaster position="top-right" visibleToasts={3}  />
      </div>
    </CanvasCtx.Provider>
  );
}

export default function CanvasPage() {
  const { workspaceId } = useParams();
  return (
    <ReactFlowProvider>
      {/* workspaceId 变化整体重建：LiveStore 按新 id 重新 hello（冻结契约） */}
      <CanvasInner key={workspaceId ?? 'default'} workspaceId={workspaceId} />
    </ReactFlowProvider>
  );
}

/**
 * `/canvas` 无参入口：按冻结契约 GET /api/workspaces（失败回退 mock）选活跃 workspace 重定向。
 * 活跃 = running 优先，否则 lastActiveAt 最新。
 */
export function CanvasRedirect() {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchWorkspaces().then(({ workspaces }) => {
      if (!alive) return;
      setTarget(pickActiveWorkspace(workspaces)?.id ?? '');
    });
    return () => {
      alive = false;
    };
  }, []);
  if (target === null) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-canvas-bg text-body text-text-secondary">
        正在定位活跃 workspace…
      </div>
    );
  }
  if (target === '') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-canvas-bg text-body text-text-secondary">
        没有可用 workspace
      </div>
    );
  }
  return <Navigate to={`/canvas/${target}`} replace />;
}

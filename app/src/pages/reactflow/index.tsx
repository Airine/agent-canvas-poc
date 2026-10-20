/**
 * `/react-flow` — Agent Canvas PoC · React Flow 版画布（design.md §2 全局 + §6/§7 交互）
 *
 * 适配层职责（§8.1）：节点包装（AgentNode）、边渲染（AgentEdge）、zoom 订阅上报
 * ViewModeManager；节点/边/内容组件全部来自共享层 src/shared。
 *
 * 常驻 UI（§2.2）：左上产品标识（#61DAFB 徽标点 + 返回首页）、左下缩放控制（竖排
 * 36px 按钮组）、右下 Minimap（200×130，状态色块）、顶部居中 EdgeLegend、
 * 顶部右侧 PlaybackBar（接共享 mock 引擎）+ 活窗配额 `活窗 3/4`（§3.2.2）。
 *
 * 事件流：共享 EventEngine + MOCK_EVENTS 驱动全部节点状态；play/pause/seek/变速/reset，
 * seek 时全部节点状态经 buildSnapshot 纯函数重建（实时与回放同构）。
 * 键盘（§7）：+/- 缩放、F 适应、Esc 退出专注/关面板、Enter 进入选中节点专注。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
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
import './reactflow.css';
import { ArrowLeft, Diamond, Maximize, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  EdgeLegend,
  EventEngine,
  MOCK_EDGES,
  MOCK_EVENTS,
  MOCK_NODES,
  PlaybackBar,
  STATUS_COLORS,
  ViewModeManager,
  useAnimationsEnabled,
} from '@/shared';
import type { EngineState, LiveTier, NodeStatus } from '@/shared';
import type { CanvasSnapshot } from '@/shared';
import { AgentEdge, EdgeMarkerDefs, type AgentFlowEdge } from './AgentEdge';
import { AgentNode, type AgentFlowNode } from './AgentNode';
import { TracePanel } from './TracePanel';
import { CanvasCtx, type CanvasCtxValue } from './canvas-context';
import { MSG_RATE, STATUS_HEX, nodeProgress, useEngineClock } from './utils';

/* React Flow 类型表必须稳定（模块级常量） */
const nodeTypes = { agent: AgentNode } as unknown as NodeTypes;
const edgeTypes = { agent: AgentEdge } as unknown as EdgeTypes;

/* ---------------- 活窗配额（§3.2.2）：前 3 live / 第 4 个 2fps / 其余快照 ---------------- */

const WINDOW_NODE_IDS = MOCK_NODES.filter((n) => n.kind !== 'coordinator').map((n) => n.id);
const LIVE_QUOTA = 3;

function computeTiers(
  snapshot: CanvasSnapshot,
  promoted: string[],
): { tiers: Record<string, LiveTier>; liveCount: number } {
  const rank = (id: string): number => {
    const s = snapshot.nodes[id]?.status ?? 'queued';
    if (s === 'running') return 0;
    if (s === 'waiting') return 1;
    return 2;
  };
  const auto = [...WINDOW_NODE_IDS]
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const sa = snapshot.nodes[a]?.startedAt ?? Number.MAX_SAFE_INTEGER;
      const sb = snapshot.nodes[b]?.startedAt ?? Number.MAX_SAFE_INTEGER;
      return sa - sb;
    })
    .filter((id) => !promoted.includes(id));
  const order = [...promoted.filter((id) => WINDOW_NODE_IDS.includes(id)), ...auto];
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

function CanvasInner() {
  const [engine] = useState(() => new EventEngine());
  const [manager] = useState(() => new ViewModeManager());
  const rf = useReactFlow();

  const [engineState, setEngineState] = useState<EngineState>(() => engine.getState());
  const [snapshot, setSnapshot] = useState<CanvasSnapshot>(() => engine.snapshot());
  useEffect(
    () =>
      engine.subscribe(() => {
        setEngineState(engine.getState());
        setSnapshot(engine.snapshot());
      }),
    [engine],
  );
  useEffect(
    () => () => {
      engine.dispose();
      manager.dispose();
    },
    [engine, manager],
  );

  const timeMs = useEngineClock(engineState);
  const animationsEnabled = useAnimationsEnabled(manager);

  /* ---- React Flow 节点（位置/选中受控） ---- */
  const [nodes, setNodes] = useState<AgentFlowNode[]>(() =>
    MOCK_NODES.map((def) => ({
      id: def.id,
      type: 'agent' as const,
      position: def.position,
      data: { def },
      style: { width: def.width },
    })),
  );
  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) =>
      setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  /* ---- 边：三通道编码数据随快照重建 ---- */
  const [traceEdgeId, setTraceEdgeId] = useState<string | null>(null);
  const edges = useMemo<AgentFlowEdge[]>(
    () =>
      MOCK_EDGES.map((def) => {
        const kind = snapshot.edges[def.id]?.kind ?? def.kind;
        const src = snapshot.nodes[def.source];
        const srcStatus: NodeStatus = src?.status ?? 'queued';
        return {
          id: def.id,
          source: def.source,
          target: def.target,
          type: 'agent' as const,
          data: {
            kind,
            semantic: def.semantic,
            sourceStatus: srcStatus,
            sourceColor: STATUS_COLORS[srcStatus],
            progress: src ? nodeProgress(src) : 0.15,
            rate: MSG_RATE[def.id],
            animationsEnabled,
            onOpenTrace: setTraceEdgeId,
          },
        };
      }),
    [snapshot, animationsEnabled],
  );

  /* ---- 活窗配额 ---- */
  const [promoted, setPromoted] = useState<string[]>([]);
  const { tiers, liveCount } = useMemo(() => computeTiers(snapshot, promoted), [snapshot, promoted]);
  const activateNode = useCallback(
    (id: string) => setPromoted((p) => [id, ...p.filter((x) => x !== id)]),
    [],
  );

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

  /* ---- approval：批准后事件流继续 ---- */
  const resolveApproval = useCallback(
    (nodeId: string) => {
      const idx = MOCK_EVENTS.findIndex(
        (ev, i) => i > engine.getState().index && ev.kind === 'approval-resolve' && ev.nodeId === nodeId,
      );
      if (idx >= 0) {
        engine.seek(idx);
        engine.play();
      }
    },
    [engine],
  );

  /* ---- A6：approval 到达 → toast 右上角滑入 ---- */
  const prevStatus = useRef<Record<string, NodeStatus>>({});
  useEffect(() => {
    for (const def of MOCK_NODES) {
      const s = snapshot.nodes[def.id]?.status ?? 'queued';
      if (s === 'waiting' && prevStatus.current[def.id] !== 'waiting') {
        toast(`${def.title} 等待批准`, {
          description: snapshot.nodes[def.id]?.statusReason ?? 'approval',
        });
      }
      prevStatus.current[def.id] = s;
    }
  }, [snapshot]);

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf, manager, selectedId]);

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
    engine,
    engineState,
    snapshot,
    timeMs,
    tiers,
    liveCount,
    activateNode,
    dragging,
    flashId,
    flashOn,
    flashNode,
    selectedId,
    resolveApproval,
  };

  const traceEdge = traceEdgeId ? MOCK_EDGES.find((e) => e.id === traceEdgeId) : undefined;

  return (
    <CanvasCtx.Provider value={ctxValue}>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-canvas-bg text-text-primary">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onSelectionChange={onSelectionChange}
          onNodeDoubleClick={(_, node) => manager.enterFocus(node.id)}
          onNodeDragStart={() => setDragging(true)}
          onNodeDragStop={() => setDragging(false)}
          onDoubleClick={onCanvasDoubleClick}
          onPaneClick={() => setTraceEdgeId(null)}
          minZoom={0.1}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          onlyRenderVisibleElements
          zoomOnDoubleClick={false}
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <ZoomReporter manager={manager} />
          <CanvasBackground />
          <EdgeMarkerDefs />
        </ReactFlow>

        {/* §2.2.1 左上：产品标识 + React Flow 徽标点（#61DAFB）+ 返回首页 */}
        <div className="absolute left-4 top-4 z-legend flex items-center gap-2">
          <Diamond className="size-4 text-accent" fill="currentColor" />
          <span className="text-focus-title text-text-primary">Agent Canvas · PoC</span>
          <span className="flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-small text-text-secondary shadow-node">
            <span className="size-1.5 rounded-pill" style={{ backgroundColor: '#61DAFB' }} />
            React Flow
          </span>
          <Link
            to="/"
            className="flex h-7 items-center gap-1 rounded-pill bg-surface-2 px-2.5 text-small text-text-secondary shadow-node transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
          >
            <ArrowLeft className="size-3.5" />
            返回首页
          </Link>
        </div>

        {/* §2.2.4 顶部居中：常驻图例（含边动画总开关，接 ViewModeManager） */}
        <EdgeLegend
          className="absolute left-1/2 top-4 -translate-x-1/2"
          animationsEnabled={animationsEnabled}
          onAnimationsChange={(v) => manager.setAnimationsOverride(v)}
        />

        {/* §2.2.5 顶部右侧：播放控制条 + 活窗配额 */}
        <div className="absolute right-4 top-4 z-legend flex items-center gap-2">
          <span
            className="tnum flex h-9 items-center rounded-pill bg-surface-2 px-3 text-small text-text-secondary shadow-node"
            title="活窗配额：超出降为 2fps 心跳帧 / 快照，点窗口栏标记可手动点亮（§3.2.2）"
          >
            活窗 {liveCount}/4
          </span>
          <PlaybackBar
            state={engineState}
            onToggle={() => engine.toggle()}
            onReset={() => engine.reset()}
            onSeek={(i) => engine.seek(i)}
            onSpeed={(s) => engine.setSpeed(s)}
          />
        </div>

        {/* §2.2.2 左下：缩放控制 */}
        <ZoomControls />

        {/* §2.2.3 右下：Minimap 200×130，节点色块用状态色 */}
        <div className="absolute bottom-4 right-4 z-legend">
          <MiniMap
            style={{ width: 200, height: 130 }}
            nodeColor={(n) => STATUS_HEX[snapshot.nodes[n.id]?.status ?? 'queued']}
            maskColor="var(--minimap-mask)"
            bgColor="var(--surface-1)"
            pannable
            zoomable
          />
        </div>

        {/* §4 数据面：弱链接消息 trace 泳道面板 */}
        {traceEdge && (
          <TracePanel
            edge={traceEdge}
            uptoIndex={engineState.index}
            onClose={() => setTraceEdgeId(null)}
          />
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

export default function ReactFlowPage() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

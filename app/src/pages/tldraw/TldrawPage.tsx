/**
 * TldrawPage — `/tldraw` 画布路由（design.md §8：只写画布适配层，复用共享层）
 *
 * - `<Tldraw hideUi>` 隐藏默认工具栏/菜单，常驻 UI 按 §2.2 自绘（CanvasOverlays）；
 * - 自定义 agent-node ShapeUtil + SVG 边覆盖层 + 点阵 Grid 覆写；
 * - 共享 mock EventEngine 驱动全部节点状态（play/pause/seek/变速/reset，seek 全量重建）；
 * - ViewModeManager：按节点屏幕像素宽切换 L0/L1/L1s，L2 专注由用户显式触发；
 * - 键盘：+/- 缩放、F 适应、Enter 进入选中节点专注、Esc 退出专注/关闭面板（§7）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import './tldraw-overrides.css';
import { Toaster, toast } from 'sonner';
import { EventEngine, MOCK_NODES, ViewModeManager } from '@/shared';
import type { ApprovalDecision, CanvasEdgeDef, CanvasSnapshot } from '@/shared/types';
import type { LiveTier } from '@/shared/WindowFrame';
import { AgentNodeShapeUtil } from './AgentNodeShape';
import {
  AGENT_NODE_TYPE,
  setAgentNodeDoubleClickHandler,
  shapeIdForNode,
  type AgentNodeShape,
} from './model';
import { DotGrid } from './DotGrid';
import { EdgesLayer } from './EdgesLayer';
import { CanvasOverlays } from './CanvasOverlays';
import { TracePanel } from './TracePanel';
import {
  CanvasServicesContext,
  FPS2_QUOTA,
  LIVE_QUOTA,
  type CanvasServices,
} from './context';

const shapeUtils = [AgentNodeShapeUtil];
const components = { Grid: DotGrid, OnTheCanvas: EdgesLayer };

/** 活窗配额档位计算（§3.2.2）：已启动节点按 状态优先级+id 排序，前 3 live、第 4 fps2、其余快照 */
function computeTiers(
  snapshot: CanvasSnapshot,
  pinned: Record<string, LiveTier>,
): Record<string, LiveTier> {
  const started = MOCK_NODES.filter((d) => {
    if (d.kind === 'coordinator') return false;
    const s = snapshot.nodes[d.id];
    return s && s.status !== 'queued';
  });
  const priority = (id: string): number => {
    const st = snapshot.nodes[id]?.status;
    if (st === 'running') return 0;
    if (st === 'waiting') return 1;
    if (st === 'completed') return 2;
    return 3;
  };
  const sorted = [...started].sort(
    (a, b) => priority(a.id) - priority(b.id) || a.id.localeCompare(b.id),
  );
  const pinnedLive = sorted.filter((d) => pinned[d.id] === 'live');
  const rest = sorted.filter((d) => pinned[d.id] !== 'live');
  const tiers: Record<string, LiveTier> = {};
  [...pinnedLive, ...rest].forEach((d, i) => {
    tiers[d.id] = i < LIVE_QUOTA ? 'live' : i < LIVE_QUOTA + FPS2_QUOTA ? 'fps2' : 'snapshot';
  });
  return tiers;
}

export default function TldrawPage() {
  const [engine] = useState(() => new EventEngine());
  const [manager] = useState(() => new ViewModeManager());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tick, setTick] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [traceEdge, setTraceEdge] = useState<CanvasEdgeDef | null>(null);
  const [approvalOverrides, setApprovalOverrides] = useState<Record<string, ApprovalDecision>>({});
  const [liveOverrides, setLiveOverrides] = useState<Record<string, LiveTier>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenApprovals = useRef(new Set<string>());

  /* 引擎事件流 → tick（播放/暂停/seek/变速/reset 全走这一条管道） */
  useEffect(() => engine.subscribe(() => setTick((n) => n + 1)), [engine]);

  /* 挂载后自动播放演示（PlaybackBar 可随时暂停/seek） */
  useEffect(() => {
    const t = setTimeout(() => engine.play(), 600);
    return () => clearTimeout(t);
  }, [engine]);

  /* 专注态镜像到 React（manager 为唯一事实源） */
  useEffect(
    () =>
      manager.subscribe(() => {
        setFocusedId(manager.focusedNodeId);
      }),
    [manager],
  );

  useEffect(
    () => () => {
      engine.dispose();
      manager.dispose();
    },
    [engine, manager],
  );

  /* 有效快照 = 引擎全量重建 + approval 本地覆盖合并（点击后事件流继续） */
  const snapshot = useMemo<CanvasSnapshot>(() => {
    const snap = engine.snapshot();
    for (const [nodeId, decision] of Object.entries(approvalOverrides)) {
      const n = snap.nodes[nodeId];
      if (n?.chat.approval && !n.chat.approval.decision) {
        n.chat.approval = { ...n.chat.approval, decision };
        if (n.status === 'waiting') {
          n.status = 'running';
          n.statusReason = undefined;
        }
      }
    }
    return snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick 驱动引擎快照重算
  }, [engine, tick, approvalOverrides]);

  /* A6/A9：approval 到达 → toast 右上滑入（最多叠 3 条，4s 自动消失） */
  useEffect(() => {
    for (const def of MOCK_NODES) {
      const n = snapshot.nodes[def.id];
      const pending = n?.chat.approval && !n.chat.approval.decision;
      if (pending && !seenApprovals.current.has(def.id)) {
        seenApprovals.current.add(def.id);
        toast.warning(`${def.title} 等待批准`, {
          description: n.chat.approval?.reason,
          duration: 4000,
        });
      }
      if (!pending) seenApprovals.current.delete(def.id);
    }
  }, [snapshot]);

  const tiers = useMemo(() => computeTiers(snapshot, liveOverrides), [snapshot, liveOverrides]);
  const liveCount = Object.values(tiers).filter((t) => t === 'live').length;

  /* 双击 shape → 专注（ShapeUtil 类 → React 桥） */
  useEffect(() => {
    setAgentNodeDoubleClickHandler((id) => manager.enterFocus(id));
    return () => setAgentNodeDoubleClickHandler(null);
  }, [manager]);

  /* 双向锚定：委派卡片点击 → 600ms ease-in-out 飞向子节点 + 选中框闪烁 2 次（A8） */
  const flyToNode = useCallback(
    (nodeId: string) => {
      if (!editor) return;
      const bounds = editor.getShapePageBounds(shapeIdForNode(nodeId));
      if (!bounds) return;
      editor.select(shapeIdForNode(nodeId));
      editor.zoomToBounds(bounds, { inset: 96, animation: { duration: 600 } });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlashId(nodeId);
      flashTimer.current = setTimeout(() => setFlashId(null), 1300);
    },
    [editor],
  );

  /* 键盘（§7）：F 适应、Enter 专注选中节点、Esc 关闭面板；
     +/- 缩放由 tldraw 原生快捷键覆盖（useKeyboardShortcuts 在 hideUi 下仍挂载，`=/-` → zoom）；
     专注开启时挂起画布快捷键（焦点仲裁 R§2.3.2，Esc 由 FocusOverlay 捕获处理） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editor) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (manager.focusedNodeId) return;
      switch (e.key) {
        case 'f':
        case 'F':
          editor.zoomToFit({ animation: { duration: 220 } });
          break;
        case 'Enter': {
          const sel = editor
            .getSelectedShapes()
            .find((s): s is AgentNodeShape => s.type === AGENT_NODE_TYPE);
          if (sel) manager.enterFocus(sel.props.nodeId);
          break;
        }
        case 'Escape':
          setTraceEdge(null);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, manager]);

  /* 双击空白复位到 zoom=1（§2.1，以指针为锚点） */
  useEffect(() => {
    if (!editor) return;
    const container = editor.getContainer();
    const onDblClick = () => {
      if (!editor.getShapeAtPoint(editor.inputs.currentPagePoint)) {
        editor.resetZoom(editor.inputs.currentScreenPoint);
      }
    };
    container.addEventListener('dblclick', onDblClick);
    return () => container.removeEventListener('dblclick', onDblClick);
  }, [editor]);

  const handleMount = useCallback((ed: Editor) => {
    setEditor(ed);
    ed.user.updateUserPreferences({ colorScheme: 'dark' });
    ed.updateInstanceState({ isGridMode: true });
    ed.createShapes(
      MOCK_NODES.map((def) => ({
        id: shapeIdForNode(def.id),
        type: AGENT_NODE_TYPE,
        x: def.position.x,
        y: def.position.y,
        props: {
          nodeId: def.id,
          w: def.width,
          h: def.kind === 'coordinator' ? 300 : 340,
        },
      })),
    );
    ed.selectNone();
    /* 初始视野：适应全部节点 */
    requestAnimationFrame(() => ed.zoomToFit());
  }, []);

  const services = useMemo<CanvasServices>(
    () => ({
      engine,
      manager,
      snapshot,
      tick,
      enterFocus: (id) => manager.enterFocus(id),
      exitFocus: () => manager.exitFocus(),
      focusedId,
      flyToNode,
      flashId,
      getTier: (id) => tiers[id] ?? 'live',
      activateLive: (id) => setLiveOverrides((prev) => ({ ...prev, [id]: 'live' })),
      liveCount,
      onApproval: (nodeId, decision) => {
        setApprovalOverrides((prev) => ({ ...prev, [nodeId]: decision }));
        toast.success(
          decision === 'approved'
            ? '已批准，事件流继续'
            : decision === 'rejected'
              ? '已拒绝'
              : '已改需求',
        );
        engine.play();
      },
      traceEdge,
      openTrace: (edge) => setTraceEdge(edge),
      closeTrace: () => setTraceEdge(null),
    }),
    [engine, manager, snapshot, tick, focusedId, flyToNode, flashId, tiers, liveCount, traceEdge],
  );

  return (
    <CanvasServicesContext.Provider value={services}>
      <div className="fixed inset-0 overflow-hidden bg-canvas-bg">
        <Tldraw
          shapeUtils={shapeUtils}
          components={components}
          onMount={handleMount}
          hideUi
          cameraOptions={{ zoomSteps: [0.1, 0.2, 0.33, 0.5, 0.67, 0.8, 1, 1.33, 1.6, 2] }}
        >
          <CanvasOverlays />
          <TracePanel edge={traceEdge} onClose={() => setTraceEdge(null)} />
        </Tldraw>
        <Toaster theme="dark" position="top-right" visibleToasts={3} />
      </div>
    </CanvasServicesContext.Provider>
  );
}

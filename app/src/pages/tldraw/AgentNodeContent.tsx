/**
 * AgentNodeContent — agent-node shape 的渲染组件（design.md §8.1 适配层）
 *
 * - 渲染共享 NodeShell + 三类内容视图（ArtifactView / TerminalView / ChatView）+ CoordinatorView；
 *   L0 档位换成独立轻量 L0SummaryCard（不是缩小版默认卡）[R§2.2.1]。
 * - 接入 ViewModeManager：按节点屏幕像素宽（shape 宽 × zoom）在 L0/L1/L1s 间切换，
 *   zoom 上报走 editor.getZoomLevel() + manager 内部 120ms 防抖。
 * - 交互模型对齐 tldraw embed 先例：单击=选中 shape（活窗不吞事件，L1 内容层
 *   pointer-events:none，窗口栏按钮除外），双击=进入专注（指针事件才归内容），Esc 退出。
 * - L2 专注：共享 FocusOverlay（createPortal DOM 搬迁不 remount）。
 * - 活窗配额降级（§3.2.2）：tier live / fps2 心跳帧 / snapshot 快照，点击标记手动点亮。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { HTMLContainer, useEditor, useValue } from 'tldraw';
import {
  ArtifactView,
  ChatView,
  CoordinatorView,
  FocusOverlay,
  NodeShell,
  TerminalView,
  createEmptyNodeState,
  useViewMode,
  type CanvasNodeDef,
  type DelegationItem,
  type NodeState,
} from '@/shared';
import { MOCK_EVENTS } from '@/shared';
import { L0SummaryCard } from './L0SummaryCard';
import { useCanvasServices, useTieredNodeState } from './context';
import { AGENT_NODE_TYPE, DELEGATION_IDS, NODE_DEFS, type AgentNodeShape } from './model';
/* ---------------- 耗时文案（等宽数字，每秒刷新） ---------------- */

function useStatusDetail(nodeId: string, state: NodeState): string {
  const { engine, tick } = useCanvasServices();
  /* running 时每秒触发一次重渲染，驱动耗时刷新 */
  const [, setSec] = useState(0);
  useEffect(() => {
    if (state.status !== 'running' && state.status !== 'waiting') return;
    const t = setInterval(() => setSec((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state.status]);
  void nodeId;
  void tick;
  const timeMs = engine.getState().timeMs;
  if (state.status === 'running' || state.status === 'waiting') {
    const elapsed = state.startedAt !== undefined ? Math.max(0, (timeMs - state.startedAt) / 1000) : 0;
    const suffix = state.status === 'waiting' && state.statusReason ? ` · ${state.statusReason}` : '';
    return `${Math.round(elapsed)}s${suffix}`;
  }
  if (state.status === 'completed' && state.startedAt !== undefined && state.endedAt !== undefined) {
    return `${Math.round((state.endedAt - state.startedAt) / 1000)}s`;
  }
  if (state.status === 'failed') return state.statusReason ?? '';
  if (state.status === 'skipped') return state.statusReason ?? '';
  return '';
}

function useStats(state: NodeState): { contextPct: number; cost: string; elapsed: string } {
  const { engine } = useCanvasServices();
  const timeMs = engine.getState().timeMs;
  return useMemo(() => {
    const progress =
      state.artifact.versions.length / 5 +
      state.terminalLines.length / 42 +
      state.chat.items.length / 6;
    const pct = Math.min(96, Math.round(18 + progress * 22));
    const elapsed =
      state.startedAt !== undefined
        ? Math.max(0, ((state.endedAt ?? timeMs) - state.startedAt) / 1000)
        : 0;
    return {
      contextPct: pct,
      cost: `$${(progress * 0.42).toFixed(2)}`,
      elapsed: `${Math.round(elapsed)}s`,
    };
  }, [state, timeMs]);
}

/* ---------------- shape 组件 ---------------- */

export function AgentNodeComponent({ shape }: { shape: AgentNodeShape }) {
  const editor = useEditor();
  const services = useCanvasServices();
  const def = NODE_DEFS[shape.props.nodeId];
  const mode = useViewMode(services.manager, def.id);
  const isFocused = mode === 'L2';

  const isSelected = useValue(
    'agent-node-selected',
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );
  /* 点子节点 → Coordinator 对应委派卡片高亮（双向锚定 R§5.3.2） */
  const selectedNodeId = useValue(
    'agent-node-selection',
    () => {
      for (const s of editor.getSelectedShapes()) {
        if (s.type === AGENT_NODE_TYPE) return (s as AgentNodeShape).props.nodeId;
      }
      return null;
    },
    [editor],
  );

  const rawState = services.snapshot.nodes[def.id] ?? createEmptyNodeState();
  const tier = services.getTier(def.id);
  const tieredState = useTieredNodeState(rawState, tier);
  /* L0 徽章仍实时（用 rawState）；L1/L1s/L2 活窗走配额降级后的状态 */
  const state = mode === 'L0' ? rawState : tieredState;
  const statusDetail = useStatusDetail(def.id, rawState);
  const stats = useStats(tieredState);

  /* 节点 DOM 宽注册到 ViewModeManager（屏幕像素宽 = domWidth × zoom） */
  useEffect(() => {
    services.manager.registerNode(def.id, def.width);
    return () => services.manager.unregisterNode(def.id);
  }, [services.manager, def.id, def.width]);

  /* 高度随内容重排：量测后回写 shape.h（tldraw 需要确定 bounds） */
  const measureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.offsetHeight);
      if (h > 0 && Math.abs(h - shape.props.h) > 2) {
        editor.updateShape<AgentNodeShape>({
          id: shape.id,
          type: AGENT_NODE_TYPE,
          props: { ...shape.props, h },
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, shape.id, shape.props.h, mode]);

  const enterFocus = () => services.enterFocus(def.id);
  const observeOnly = mode === 'L1' || mode === 'L1s';
  /* L1s：活窗放大档（§3.2 表） */
  const inlineHeight = def.kind === 'coordinator' ? undefined : mode === 'L1s' ? 'h-[300px]' : 'h-[220px]';

  const content =
    def.kind === 'artifact' ? (
      <ArtifactView
        title={def.windowTitle}
        state={state.artifact}
        tier={tier}
        observeOnly={observeOnly}
        onActivate={() => services.activateLive(def.id)}
        onFocus={enterFocus}
        className="h-full"
      />
    ) : def.kind === 'operation' ? (
      <OperationContent
        def={def}
        state={state}
        tier={tier}
        observeOnly={observeOnly}
        isFocused={isFocused}
        onActivate={() => services.activateLive(def.id)}
        onFocus={enterFocus}
      />
    ) : def.kind === 'chat' ? (
      <ChatView
        title={def.windowTitle}
        state={state.chat}
        tier={tier}
        observeOnly={observeOnly}
        onActivate={() => services.activateLive(def.id)}
        onFocus={enterFocus}
        interactive={isFocused}
        onApproval={(decision) => services.onApproval(def.id, decision)}
        className="h-full"
      />
    ) : (
      <CoordinatorView
        items={delegationItems(services.snapshot.nodes)}
        activeId={selectedNodeId ?? undefined}
        onSelect={(nodeId) => services.flyToNode(nodeId)}
        className="h-full"
      />
    );

  return (
    <HTMLContainer style={{ pointerEvents: 'all' }}>
      <div
        ref={measureRef}
        style={{ width: shape.props.w }}
        className={services.flashId === def.id ? 'anchor-flash' : undefined}
      >
        {mode === 'L0' ? (
          <L0SummaryCard def={def} state={state} statusDetail={statusDetail} selected={isSelected} />
        ) : (
          <NodeShell
            kind={def.kind}
            title={def.title}
            identity={def.identity}
            status={rawState.status}
            statusDetail={statusDetail}
            mode={mode}
            selected={isSelected}
            onFocus={enterFocus}
            stats={def.kind === 'coordinator' ? undefined : stats}
          >
            <FocusOverlay
              open={isFocused}
              onClose={services.exitFocus}
              kind={def.kind}
              title={def.title}
              identity={def.identity}
              status={rawState.status}
              statusDetail={statusDetail}
              inlineClassName={inlineHeight}
              className={def.kind === 'coordinator' ? 'h-auto' : undefined}
            >
              {content}
            </FocusOverlay>
          </NodeShell>
        )}
      </div>
    </HTMLContainer>
  );
}

/* 操作节点专注态扩展：回放时间轴 + takeover 演示（§3.3.2） */
function OperationContent({
  def,
  state,
  tier,
  observeOnly,
  isFocused,
  onActivate,
  onFocus,
}: {
  def: CanvasNodeDef;
  state: NodeState;
  tier: 'live' | 'fps2' | 'snapshot';
  observeOnly: boolean;
  isFocused: boolean;
  onActivate: () => void;
  onFocus: () => void;
}) {
  const services = useCanvasServices();
  const [takeover, setTakeover] = useState(false);
  const engineState = services.engine.getState();
  const keyIndices = useMemo(
    () =>
      MOCK_EVENTS.map((ev, i) => ({ ev, i }))
        .filter(
          ({ ev }) =>
            ev.kind === 'terminal-line' &&
            ev.nodeId === def.id &&
            (ev.line.kind === 'cmd' || ev.line.kind === 'stderr'),
        )
        .map(({ i }) => i),
    [def.id],
  );
  return (
    <TerminalView
      title={def.windowTitle}
      state={state}
      tier={tier}
      observeOnly={observeOnly}
      onActivate={onActivate}
      onFocus={onFocus}
      className="h-full"
      variant={isFocused ? 'focus' : 'embedded'}
      replay={
        isFocused
          ? {
              index: engineState.index,
              total: engineState.total,
              onSeek: (i) => services.engine.seek(i),
            }
          : undefined
      }
      keyIndices={keyIndices}
      takeover={{
        active: takeover,
        onToggle: () => {
          setTakeover((v) => {
            /* 接管：mock agent 事件暂停注入（R§4.2.1） */
            services.engine.setInjecting(!v);
            return !v;
          });
        },
      }}
    />
  );
}

function delegationItems(nodes: Record<string, NodeState>): DelegationItem[] {
  return DELEGATION_IDS.map((id) => {
    const def = NODE_DEFS[id];
    return {
      nodeId: id,
      kind: def.kind,
      title: def.title.replace(/^.*?·\s*/, ''),
      status: nodes[id]?.status ?? 'queued',
    };
  });
}

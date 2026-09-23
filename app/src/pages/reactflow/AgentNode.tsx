/**
 * AgentNode — React Flow 自定义节点（画布适配层，design.md §3 + §8.1）
 *
 * 包装共享 NodeShell + 三类内容视图 + CoordinatorView：
 * - 接入 ViewModeManager：注册节点 DOM 宽，按【屏幕像素宽】在 L0 摘要卡 /
 *   L1 默认卡（活窗 220px，L1s 300px）间切换；L0 是独立轻量组件（§8.2）。
 * - 观察权（§3.2.2）：L1 活窗内容层 pointer-events:none（窗口栏按钮除外，
 *   内容区整体挂 reactflow 的 nodrag class）；拖拽节点期间强制 pointer-events:none。
 * - L2 专注：共享 FocusOverlay（createPortal DOM 搬迁不 remount），
 *   进出专注终端光标不重置、产物流式不中断（§8.3）。
 * - 双向锚定（§3.3.4）：Coordinator 委派卡片点击 → setCenter 平滑飞向子节点
 *   并闪烁选中框 600ms×2；点子节点 → Coordinator 对应卡片高亮（ctx.selectedId）。
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import {
  ArtifactView,
  ChatView,
  CoordinatorView,
  FocusOverlay,
  MOCK_NODES,
  NodeShell,
  TerminalView,
  createEmptyNodeState,
  useViewMode,
} from '@/shared';
import type { CanvasNodeDef, DelegationItem } from '@/shared';
import { useCanvasCtx } from './canvas-context';
import { L0SummaryCard } from './L0Summary';
import { FpsGate } from './FpsGate';
import { statusDetailFor, terminalKeyIndices } from './utils';

export type AgentFlowNode = Node<{ def: CanvasNodeDef }, 'agent'>;

const COORD_ID = 'coord';

function AgentNodeComponent({ id, data, selected }: NodeProps<AgentFlowNode>) {
  const ctx = useCanvasCtx();
  const rf = useReactFlow();
  const { def } = data;
  const state = ctx.snapshot.nodes[id] ?? createEmptyNodeState();
  const mode = useViewMode(ctx.manager, id);
  const focused = ctx.manager.focusedNodeId === id;
  const detail = statusDetailFor(state, ctx.timeMs);
  const isSelected = selected || (ctx.flashId === id && ctx.flashOn);

  /* 向 ViewModeManager 注册 DOM 宽：档位 = f(节点宽 × zoom) */
  useEffect(() => {
    ctx.manager.registerNode(id, def.width);
    return () => ctx.manager.unregisterNode(id);
  }, [ctx.manager, id, def.width]);

  /* 产物版本条：切旧版本=历史预览；新版本到达自动跳回最新（§3.3.1，render 期调整） */
  const versionsLen = state.artifact.versions.length;
  const [verSel, setVerSel] = useState<number | null>(null);
  const [prevVersionsLen, setPrevVersionsLen] = useState(versionsLen);
  if (prevVersionsLen !== versionsLen) {
    setPrevVersionsLen(versionsLen);
    setVerSel(null);
  }
  const artifactState =
    verSel === null ? state.artifact : { ...state.artifact, current: verSel };

  /* 接管终端演示（§3.3.2）：接管期 mock agent 事件暂停注入 */
  const [takeover, setTakeover] = useState(false);

  const keyIndices = useMemo(
    () => (def.kind === 'operation' ? terminalKeyIndices(id) : undefined),
    [def.kind, id],
  );

  /* L0 全局摘要：独立轻量渲染路径（§8.2） */
  if (mode === 'L0' && !focused) {
    return <L0SummaryCard def={def} state={state} detail={detail} selected={isSelected} />;
  }

  const isCoord = def.kind === 'coordinator';
  const tier = ctx.tiers[id] ?? 'live';
  const observeOnly = !focused || ctx.dragging;
  const windowHeight = mode === 'L1s' ? 'h-[300px]' : 'h-[220px]';

  /** 活窗配额降级抽帧（§3.2.2）：专注态始终 live */
  const gate = (children: React.ReactNode) => {
    if (focused || tier === 'live') return children;
    return <FpsGate intervalMs={tier === 'fps2' ? 500 : 0}>{children}</FpsGate>;
  };

  /* Coordinator 委派卡片列表：状态与子节点实时同步 */
  const delegations: DelegationItem[] = MOCK_NODES.filter((n) => n.id !== COORD_ID).map((n) => ({
    nodeId: n.id,
    kind: n.kind,
    title: n.title,
    status: ctx.snapshot.nodes[n.id]?.status ?? 'queued',
  }));

  /** 双向锚定：点委派卡片 → 600ms ease-in-out 飞向子节点 + 选中框闪烁 600ms×2（A8） */
  const flyToNode = (nodeId: string) => {
    const target = MOCK_NODES.find((n) => n.id === nodeId);
    if (!target) return;
    void rf.setCenter(target.position.x + target.width / 2, target.position.y + 170, {
      zoom: Math.max(rf.getViewport().zoom, 1),
      duration: 600,
    });
    ctx.flashNode(nodeId);
  };

  const enterFocus = () => ctx.manager.enterFocus(id);
  const exitFocus = () => ctx.manager.exitFocus();

  let content: React.ReactNode;
  if (isCoord) {
    content = (
      <CoordinatorView
        items={delegations}
        activeId={ctx.selectedId ?? undefined}
        onSelect={flyToNode}
      />
    );
  } else if (def.kind === 'artifact') {
    content = (
      <ArtifactView
        title={def.windowTitle}
        state={artifactState}
        tier={focused ? 'live' : tier}
        observeOnly={observeOnly}
        onActivate={() => ctx.activateNode(id)}
        onFocus={focused ? undefined : enterFocus}
        onSelectVersion={setVerSel}
        className="h-full"
      />
    );
  } else if (def.kind === 'operation') {
    content = (
      <TerminalView
        title={def.windowTitle}
        state={state}
        tier={focused ? 'live' : tier}
        observeOnly={observeOnly}
        onActivate={() => ctx.activateNode(id)}
        onFocus={focused ? undefined : enterFocus}
        className="h-full"
        variant={focused ? 'focus' : 'embedded'}
        replay={
          focused
            ? {
                index: ctx.engineState.index,
                total: ctx.engineState.total,
                onSeek: (i) => ctx.engine.seek(i),
              }
            : undefined
        }
        keyIndices={keyIndices}
        takeover={
          focused
            ? {
                active: takeover,
                onToggle: () => {
                  const next = !takeover;
                  setTakeover(next);
                  if (next) ctx.engine.setInjecting(true);
                },
              }
            : undefined
        }
      />
    );
  } else {
    content = (
      <ChatView
        title={def.windowTitle}
        state={state.chat}
        tier={focused ? 'live' : tier}
        observeOnly={observeOnly}
        onActivate={() => ctx.activateNode(id)}
        onFocus={focused ? undefined : enterFocus}
        interactive={focused}
        onApproval={() => ctx.resolveApproval(id)}
        className="h-full"
      />
    );
  }

  return (
    <div className="w-full animate-delta-in">
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <NodeShell
        kind={def.kind}
        title={def.title}
        identity={def.identity}
        status={state.status}
        statusDetail={detail}
        mode={mode}
        selected={isSelected}
        onFocus={enterFocus}
        stats={{ elapsed: detail }}
        className={cn(state.status === 'waiting' && '-translate-y-0.5')}
      >
        {/* nodrag：活窗区不触发节点拖拽（窗口栏按钮可点）；拖拽从 header 发起 */}
        <div className={cn('nodrag', isCoord ? 'h-auto' : cn('p-3 pt-2', windowHeight))}>
          <FocusOverlay
            open={focused}
            onClose={exitFocus}
            kind={def.kind}
            title={def.title}
            identity={def.identity}
            status={state.status}
            statusDetail={detail}
            inlineClassName="h-full"
          >
            {gate(content)}
          </FocusOverlay>
        </div>
      </NodeShell>
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);

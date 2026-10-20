/**
 * LiveNode — `/canvas` 自定义节点：全部状态来自 WS 实时补丁（契约 §3 node 消息）
 *
 * 与 PoC AgentNode 的差异只在数据源：EventEngine 快照 → LiveStore 节点补丁。
 * 视觉/交互规范不变（design.md §3）：L0 独立摘要卡 / L1 默认卡（观察权，
 * 活窗 pointer-events:none）/ L2 专注（FocusOverlay DOM 搬迁不 remount）。
 * - operation/chat 活窗 = LiveTerminal（xterm.js，term.subscribe/unsubscribe 随配额）。
 * - waiting 且带 approval → ApprovalCard：默认态 disabled，专注态可点击
 *   （POST /api/nodes/:id/approval，等待后端状态补丁）。
 * - Coordinator = 委派卡片列表（子节点状态实时同步）+ 双向锚定。
 */
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { CoordinatorView, FocusOverlay, NodeShell, useViewMode } from '@/shared';
import type { DelegationItem } from '@/shared';
import { useCanvasCtx } from './canvas-context';
import { useLiveStore, type CanvasNode } from './live-store';
import { L0SummaryCard } from './L0Summary';
import { LiveTerminal } from './LiveTerminal';
import { LiveChat } from './LiveChat';
import { CardViewControl } from './CardViewControl';
import { SessionHeaderActions } from './SessionHeaderActions';
import { SessionIdentity, SessionStatus } from './SessionIdentity';
import { useSession } from './session-store';
import { presentation, sessionModelPresentation } from './chat/presentation-state';
import { ApprovalCard } from './ApprovalCard';
import { nodeWidth, statusDetailFor, useSecondClock } from './utils';

export type LiveFlowNode = Node<{ nodeId: string }, 'agent'>;

/** 运行进度条（P1：长耗时节点不允裸 spinner；progress 0..1 来自契约字段） */
function ProgressBar({ node }: { node: CanvasNode }) {
  if (node.progress === undefined) return null;
  if (node.status !== 'running' && node.status !== 'waiting') return null;
  return (
    <div
      className="h-1 overflow-hidden rounded-pill bg-surface-2"
      role="progressbar"
      aria-valuenow={Math.round(node.progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-pill transition-[width] duration-med ease-out-expo"
        style={{
          width: `${Math.round(node.progress * 100)}%`,
          backgroundColor:
            node.status === 'waiting' ? 'var(--st-waiting)' : 'var(--st-running)',
        }}
      />
    </div>
  );
}

function LiveNodeComponent({ id, selected }: NodeProps<LiveFlowNode>) {
  const ctx = useCanvasCtx();
  const rf = useReactFlow();
  const { store, manager } = ctx;
  useLiveStore(store); // structural/connection changes only for e nodes
  useSyncExternalStore(fn=>store.subscribeNode(id,fn),()=>store.nodes.get(id));
  const session=useSession(store.sessions,id);
  const [diagnostic,setDiagnostic]=useState(false);
  const actionsRef=useRef<HTMLDivElement>(null);
  const openDiagnostics=useCallback(()=>{setDiagnostic(true);if(manager.getMode(id)==='L0')manager.enterFocus(id);},[manager,id]);
  const returnToActions=useCallback(()=>actionsRef.current?.querySelector<HTMLButtonElement>('[aria-label="会话操作"]')?.focus(),[]);
  const node = store.nodes.get(id);
  const mode = useViewMode(manager, id);
  const focused = manager.focusedNodeId === id;
  const enterFocus = useCallback(() => manager.enterFocus(id), [manager,id]);
  const exitFocus = useCallback(() => manager.exitFocus(), [manager]);
  const nowMs = useSecondClock(node?.status === 'running');
  const isSelected = selected || (ctx.flashId === id && ctx.flashOn);

  /* 向 ViewModeManager 注册 DOM 宽：档位 = f(节点宽 × zoom) */
  const width = node ? nodeWidth(node) : 400;
  useEffect(() => {
    manager.registerNode(id, width);
    return () => manager.unregisterNode(id);
  }, [manager, id, width]);

  /* reset / pane close 后退出残留专注态，避免 queued 节点显示“已接管交互”空终端 */
  useEffect(() => {
    if (focused && node?.backend !== 'e' && (!node?.paneId || node?.status === 'queued')) {
      manager.exitFocus();
    }
  }, [focused, manager, node?.paneId, node?.status, node?.backend]);

  if (!node) return null;
  const detail = node.backend === 'e' ? presentation(session,store.connState==='online','nextTurn',nowMs,store.readOnly).label : statusDetailFor(node, nowMs);

  const actions=node.backend==='e'?<SessionHeaderActions store={store} node={node} manager={manager} onDiagnostics={openDiagnostics} actionsRef={actionsRef}/>:undefined;

  /* L0 全局摘要：独立轻量渲染路径（§8.2） */
  if (mode === 'L0' && !focused) {
    return <L0SummaryCard store={store} node={node} detail={detail} selected={isSelected} viewControl={node.backend==='e'?undefined:<CardViewControl manager={manager} nodeId={id}/>} headerActions={actions} />;
  }

  const isCoord = node.type === 'coordinator';
  const tier = ctx.tiers[id] ?? 'live';
  /*
   * 交互权：L2 专注 / L1s 放大档可输入可审批（herdr pane 级交互）；
   * L1 默认卡保持观察权；拖拽期间强制 pointer-events:none（§8.4）。
   */
  const interactiveTier = focused || mode === 'L1s';
  const observeOnly = ctx.dragging || !interactiveTier;
  const windowHeight = node.backend === 'e' ? 'h-[430px]' : mode === 'L1s' ? 'h-[300px]' : 'h-[220px]';

  /* Coordinator 委派卡片列表：状态与子节点实时同步（WS 补丁） */
  const delegations: DelegationItem[] = [...store.nodes.values()]
    .filter((n) => n.type !== 'coordinator')
    .map((n) => ({ nodeId: n.id, kind: n.type, title: n.title, status: n.status }));

  /** 双向锚定：点委派卡片 → 600ms ease-in-out 飞向子节点 + 选中框闪烁 600ms×2（A8） */
  const flyToNode = (nodeId: string) => {
    const target = store.nodes.get(nodeId);
    if (!target) return;
    void rf.setCenter(target.x + nodeWidth(target) / 2, target.y + 170, {
      zoom: Math.max(rf.getViewport().zoom, 1),
      duration: 600,
    });
    ctx.flashNode(nodeId);
  };


  /** 身份四元组（契约无 model 字段：第四元用 paneId 顶替展示） */
  const identity = {
    harness: node.harness,
    env: node.env,
    agentId: node.agentId,
    model: node.backend === 'e' ? sessionModelPresentation(session,store.connState==='online',node.sessionRef).label : node.paneId ?? '—',
  };

  let content: React.ReactNode;
  if (node.backend === 'e') {
    content = <LiveChat store={store} node={node} focused={focused} diagnosticOpen={diagnostic} onDiagnosticChange={setDiagnostic} onReturnFocus={returnToActions}/>;
  } else if (isCoord) {
    content = (
      <CoordinatorView
        items={delegations}
        activeId={ctx.selectedId ?? undefined}
        onSelect={flyToNode}
      />
    );
  } else {
    content = (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <ProgressBar node={node} />
        <LiveTerminal
          store={store}
          node={node}
          tier={tier}
          focused={focused}
          observeOnly={observeOnly}
          onActivate={() => ctx.activateNode(id)}
          onFocus={focused ? undefined : enterFocus}
          className="min-h-0 flex-1"
        />
        {/* approval 卡片：L1 只读（观察权），L1s/专注可点击 → scoped POST approval */}
        {node.status === 'waiting' && node.approval && (
          <ApprovalCard
            nodeId={id}
            prompt={node.approval.prompt}
            interactive={interactiveTier}
            onDecision={(nodeId, decision) => store.sendApproval(nodeId, decision)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full animate-delta-in">
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <NodeShell
        viewControl={node.backend==='e'?undefined:<CardViewControl manager={manager} nodeId={id}/>}
        compactHeader={node.backend==='e'}
        headerActions={!focused?actions:undefined}
        kind={node.type}
        title={session?.title ?? node.title}
        titleContent={node.backend === 'e' ? <SessionIdentity store={store} node={node} /> : undefined}
        statusContent={node.backend === 'e' ? <SessionStatus store={store} node={node} /> : undefined}
        hideHeader={node.backend === 'e' && focused}
        identity={identity}
        status={node.status}
        statusDetail={detail}
        sessionLabel={node.backend === 'e' ? detail : undefined}
        mode={mode}
        selected={isSelected}
        onFocus={enterFocus}
        stats={node.backend === 'e' ? undefined : { elapsed: detail }}
        className={cn(node.status === 'waiting' && '-translate-y-0.5')}
      >
        {/* nodrag：活窗区不触发节点拖拽（窗口栏按钮可点）；拖拽从 header 发起 */}
        <div className={cn('nodrag', isCoord ? 'h-auto' : cn('p-3 pt-2', windowHeight))}>
          <FocusOverlay
            compactHeader={node.backend==='e'}
            headerActions={focused?actions:undefined}
            open={focused}
            onClose={exitFocus}
            kind={node.type}
            title={session?.title ?? node.title}
            titleContent={node.backend === 'e' ? <SessionIdentity store={store} node={node} /> : undefined}
            statusContent={node.backend === 'e' ? <SessionStatus store={store} node={node} /> : undefined}
            identity={identity}
            status={node.status}
            statusDetail={detail}
            sessionLabel={node.backend === 'e' ? detail : undefined}
            inlineClassName="h-full"
          >
            {content}
          </FocusOverlay>
        </div>
      </NodeShell>
    </div>
  );
}

export const LiveNode = memo(LiveNodeComponent);

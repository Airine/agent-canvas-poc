/**
 * tldraw 适配层 — 画布服务上下文
 *
 * 页面级单例（EventEngine / ViewModeManager / 活窗配额 / 审批覆盖 / 锚定闪烁）
 * 通过 React context 注入到 tldraw 内部渲染树（shape 组件、边覆盖层、常驻 UI）。
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveTier } from '@/shared/WindowFrame';
import type {
  ApprovalDecision,
  CanvasEdgeDef,
  CanvasSnapshot,
  NodeState,
} from '@/shared/types';
import type { EventEngine } from '@/shared/mock/engine';
import type { ViewModeManager } from '@/shared/ViewModeManager';

/** 活窗配额（design.md §3.2.2）：live ≤ 3，fps2 1 个，其余快照；总数演示为 4 */
export const LIVE_QUOTA = 3;
export const FPS2_QUOTA = 1;
export const QUOTA_TOTAL = LIVE_QUOTA + FPS2_QUOTA;

export interface CanvasServices {
  engine: EventEngine;
  manager: ViewModeManager;
  /** 当前快照（含审批覆盖合并后） */
  snapshot: CanvasSnapshot;
  /** 引擎时间轴版本号（事件推进/seek 时 +1，驱动重渲染） */
  tick: number;
  /** 双击/Enter/hover 按钮 → L2 专注 */
  enterFocus: (nodeId: string) => void;
  exitFocus: () => void;
  focusedId: string | null;
  /** 双向锚定：平滑飞向子节点并闪烁选中框（A8） */
  flyToNode: (nodeId: string) => void;
  /** 锚定闪烁中的节点 id（600ms × 2 次） */
  flashId: string | null;
  /** 活窗配额 */
  getTier: (nodeId: string) => LiveTier;
  activateLive: (nodeId: string) => void;
  liveCount: number;
  /** approval 点击（专注态）：本地覆盖 + 事件流标记 */
  onApproval: (nodeId: string, decision: ApprovalDecision) => void;
  /** 弱链接消息 trace 泳道面板 */
  traceEdge: CanvasEdgeDef | null;
  openTrace: (edge: CanvasEdgeDef) => void;
  closeTrace: () => void;
}

export const CanvasServicesContext = createContext<CanvasServices | null>(null);

export function useCanvasServices(): CanvasServices {
  const ctx = useContext(CanvasServicesContext);
  if (!ctx) throw new Error('CanvasServicesContext 未提供');
  return ctx;
}

/* ---------------- 活窗配额降级（§3.2.2 / R§2.2.3） ---------------- */

/**
 * fps2 心跳帧：以 500ms 抽帧节流节点状态（模拟 2fps 心跳帧）；
 * snapshot 快照：冻结首次进入快照档时的状态，不再更新。
 */
export function useTieredNodeState(state: NodeState, tier: LiveTier): NodeState {
  const latestRef = useRef(state);
  useEffect(() => {
    latestRef.current = state;
  }, [state]);

  /* fps2：500ms 抽帧 */
  const [fpsFrame, setFpsFrame] = useState(state);
  useEffect(() => {
    if (tier !== 'fps2') return;
    const timer = setInterval(() => setFpsFrame(latestRef.current), 500);
    return () => clearInterval(timer);
  }, [tier]);

  /* snapshot：冻结进入快照档时的状态（仅在档位翻转时重取，离开后不读） */
  const isSnapshot = tier === 'snapshot';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 快照冻结：仅随档位翻转重取
  const frozen = useMemo(() => state, [isSnapshot]);

  if (isSnapshot) return frozen;
  if (tier === 'fps2') return fpsFrame;
  return state;
}

/* ---------------- 节点进度（边粒子速率 ∝ 源节点进度） ---------------- */

export function nodeProgress(nodeId: string, state: NodeState): number {
  if (state.status === 'completed') return 1;
  if (state.status === 'failed' || state.status === 'skipped') return 1;
  if (nodeId === 'n-artifact') return Math.min(1, state.artifact.versions.length / 5);
  if (nodeId === 'n-op') return Math.min(1, state.terminalLines.length / 42);
  if (nodeId.startsWith('n-chat')) return Math.min(1, state.chat.items.length / 6);
  /* coord：聚合子任务平均进度的近似 */
  return state.status === 'running' ? 0.5 : 0;
}

/**
 * React Flow 适配层内部上下文（design.md §8.1：适配层只写节点包装/边渲染/zoom 订阅）
 * 共享 ViewModeManager + EventEngine 实例经此下发给自定义节点/边组件。
 */
import { createContext, useContext } from 'react';
import type {
  CanvasSnapshot,
  EngineState,
  EventEngine,
  LiveTier,
  ViewModeManager,
} from '@/shared';

export interface CanvasCtxValue {
  manager: ViewModeManager;
  engine: EventEngine;
  engineState: EngineState;
  snapshot: CanvasSnapshot;
  /** 事件时间轴当前毫秒（播放中随墙钟前进，供 elapsed 每秒刷新） */
  timeMs: number;
  /** 活窗配额层级（§3.2.2）：live / fps2 / snapshot */
  tiers: Record<string, LiveTier>;
  liveCount: number;
  /** 手动点亮：把节点升入活窗配额 */
  activateNode: (id: string) => void;
  /** 拖拽中：强制全部活窗 pointer-events:none（§3.2.2 / §8.4） */
  dragging: boolean;
  /** 双向锚定闪烁（600ms×2，§3.3.4 / A8） */
  flashId: string | null;
  flashOn: boolean;
  flashNode: (id: string) => void;
  /** 当前 React Flow 选中节点（点子节点 → Coordinator 卡片高亮） */
  selectedId: string | null;
  /** approval 批准后事件流继续（seek 到 scripted approval-resolve 并续播） */
  resolveApproval: (nodeId: string) => void;
}

export const CanvasCtx = createContext<CanvasCtxValue | null>(null);

export function useCanvasCtx(): CanvasCtxValue {
  const ctx = useContext(CanvasCtx);
  if (!ctx) throw new Error('useCanvasCtx 必须在 ReactFlowPage 内使用');
  return ctx;
}

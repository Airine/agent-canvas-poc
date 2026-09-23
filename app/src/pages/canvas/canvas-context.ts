/**
 * `/canvas` 适配层内部上下文：LiveStore + ViewModeManager + 活窗配额等下发给节点/边组件。
 */
import { createContext, useContext } from 'react';
import type { LiveTier, ViewModeManager } from '@/shared';
import type { LiveStore } from './live-store';

export interface CanvasCtxValue {
  manager: ViewModeManager;
  store: LiveStore;
  /** 活窗配额层级（§3.2.2）：live 订阅 / fps2 心跳 / snapshot 静态末屏 */
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
}

export const CanvasCtx = createContext<CanvasCtxValue | null>(null);

export function useCanvasCtx(): CanvasCtxValue {
  const ctx = useContext(CanvasCtx);
  if (!ctx) throw new Error('useCanvasCtx 必须在 CanvasPage 内使用');
  return ctx;
}

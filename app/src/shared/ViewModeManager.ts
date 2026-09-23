/**
 * ViewModeManager — 集中式 LOD 档位管理（design.md §3.2 + §8.5）
 *
 * - 切换阈值按【节点屏幕像素宽】（DOM 宽 × zoom），绝不写死 zoom 值 [R§2.2.1]：
 *     < 240px        → L0 全局摘要（零交互，hover 浮层）
 *     240–640px      → L1 默认（卡片 + 内嵌活窗，观察权）
 *     ≥ 640px        → L1s（同 L1，活窗放大）
 *     用户显式触发     → L2 专注（非 zoom 驱动）
 * - zoom 防抖 120ms：相机运动中冻结档位，停止 120ms 后统一重算。
 * - 动画总开关：手动开关接入，默认跟随系统 prefers-reduced-motion（§1.4 / §8.5）。
 *   关闭时同时置 <html data-motion="off">，全局 CSS 降级为静态可供性。
 *
 * 与画布引擎无关：React Flow / tldraw 适配层只负责上报 zoom 与节点 DOM 宽。
 */
import { useSyncExternalStore } from 'react';
import type { ViewMode } from './types';

export const L0_MAX_PX = 240;
export const L1_MAX_PX = 640;
export const ZOOM_DEBOUNCE_MS = 120;

export function modeForScreenWidth(screenWidth: number): ViewMode {
  if (screenWidth < L0_MAX_PX) return 'L0';
  if (screenWidth < L1_MAX_PX) return 'L1';
  return 'L1s';
}

interface NodeReg {
  domWidth: number;
  mode: ViewMode;
}

export class ViewModeManager {
  private nodes = new Map<string, NodeReg>();
  private zoom = 1;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private focusedId: string | null = null;
  private listeners = new Set<() => void>();
  /** null = 跟随系统 prefers-reduced-motion */
  private animationsOverride: boolean | null = null;
  private systemReducedMotion = false;
  private version = 0;

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.systemReducedMotion = mq.matches;
      const onChange = (e: MediaQueryListEvent) => {
        this.systemReducedMotion = e.matches;
        this.syncMotionAttribute();
        this.emit();
      };
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', onChange);
      }
    }
    this.syncMotionAttribute();
  }

  /* ---------------- 节点注册 ---------------- */

  registerNode(id: string, domWidth: number): void {
    this.nodes.set(id, { domWidth, mode: modeForScreenWidth(domWidth * this.zoom) });
    this.emit();
  }

  unregisterNode(id: string): void {
    this.nodes.delete(id);
    if (this.focusedId === id) this.focusedId = null;
    this.emit();
  }

  setNodeWidth(id: string, domWidth: number): void {
    const reg = this.nodes.get(id);
    if (!reg || reg.domWidth === domWidth) return;
    reg.domWidth = domWidth;
    reg.mode = modeForScreenWidth(domWidth * this.zoom);
    this.emit();
  }

  /* ---------------- zoom 上报（防抖 120ms） ---------------- */

  /** 相机运动中调用：冻结档位，停止 ZOOM_DEBOUNCE_MS 后重算 */
  setZoom(zoom: number): void {
    this.zoom = zoom;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.recomputeAll();
    }, ZOOM_DEBOUNCE_MS);
  }

  private recomputeAll(): void {
    for (const reg of this.nodes.values()) {
      reg.mode = modeForScreenWidth(reg.domWidth * this.zoom);
    }
    this.emit();
  }

  /* ---------------- L2 专注（用户显式触发，非 zoom） ---------------- */

  enterFocus(id: string): void {
    this.focusedId = id;
    this.emit();
  }

  exitFocus(): void {
    this.focusedId = null;
    this.emit();
  }

  get focusedNodeId(): string | null {
    return this.focusedId;
  }

  /* ---------------- 档位查询 ---------------- */

  getMode(id: string): ViewMode {
    if (this.focusedId === id) return 'L2';
    return this.nodes.get(id)?.mode ?? 'L1';
  }

  getZoom(): number {
    return this.zoom;
  }

  /** 节点屏幕像素宽（供适配层/minimap 使用） */
  getScreenWidth(id: string): number {
    return (this.nodes.get(id)?.domWidth ?? 0) * this.zoom;
  }

  /* ---------------- 动画总开关（§1.4 / §8.5） ---------------- */

  /** 手动开关：true 强制开 / false 强制关 / null 跟随系统 */
  setAnimationsOverride(value: boolean | null): void {
    this.animationsOverride = value;
    this.syncMotionAttribute();
    this.emit();
  }

  get animationsEnabled(): boolean {
    return this.animationsOverride ?? !this.systemReducedMotion;
  }

  get isFollowingSystem(): boolean {
    return this.animationsOverride === null;
  }

  private syncMotionAttribute(): void {
    if (typeof document === 'undefined') return;
    if (this.animationsEnabled) delete document.documentElement.dataset.motion;
    else document.documentElement.dataset.motion = 'off';
  }

  /* ---------------- 订阅 ---------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** useSyncExternalStore 快照：版本号（模式经 getMode 读取） */
  getVersion = (): number => this.version;

  private emit(): void {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  dispose(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.listeners.clear();
    this.nodes.clear();
  }
}

/* ---------------- React 绑定 ---------------- */

/** 订阅某节点的当前档位（L0/L1/L1s/L2），档位切换时重渲染 */
export function useViewMode(manager: ViewModeManager, nodeId: string): ViewMode {
  useSyncExternalStore(manager.subscribe, manager.getVersion);
  return manager.getMode(nodeId);
}

/** 订阅动画总开关有效值 */
export function useAnimationsEnabled(manager: ViewModeManager): boolean {
  useSyncExternalStore(manager.subscribe, manager.getVersion);
  return manager.animationsEnabled;
}

/** 订阅当前专注节点 id */
export function useFocusedNodeId(manager: ViewModeManager): string | null {
  useSyncExternalStore(manager.subscribe, manager.getVersion);
  return manager.focusedNodeId;
}

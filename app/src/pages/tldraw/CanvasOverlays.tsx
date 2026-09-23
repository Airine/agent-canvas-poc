/**
 * CanvasOverlays — 常驻 UI（design.md §2.2，与 React Flow 版样式完全一致）
 *
 * tldraw 默认 UI 与本设计冲突 → `<Tldraw hideUi>` 隐藏默认工具栏/菜单后自绘：
 * 左上 产品标识 + tldraw 徽标点（#F5A524）+ 返回首页；
 * 左下 缩放控制（缩/百分比复位/放/适应，调 editor zoom API）；
 * 右下 Minimap（200×130）；
 * 顶部居中 EdgeLegend；顶部右侧 PlaybackBar（接 mock 引擎）+ 活窗配额 `活窗 n/4`。
 * 另含 ZoomBridge：editor.getZoomLevel() 上报 ViewModeManager（内部 120ms 防抖）。
 */
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useEditor, useValue } from 'tldraw';
import { Diamond, Maximize, Minus, Plus } from 'lucide-react';
import { EdgeLegend, PlaybackBar, useAnimationsEnabled } from '@/shared';
import { Minimap } from './Minimap';
import { QUOTA_TOTAL, useCanvasServices } from './context';

/**
 * zoom → ViewModeManager（按屏幕像素宽切换 LOD，manager 内部 120ms 防抖）。
 * 等效于 editor.getEfficientZoomLevel() 的机制：上报真实 getZoomLevel()，
 * 由 manager 在相机运动停止 120ms 后统一重算档位（§3.2 阈值按像素宽，非绝对 zoom）。
 */
export function ZoomBridge() {
  const editor = useEditor();
  const { manager } = useCanvasServices();
  const zoom = useValue('zoom-bridge', () => editor.getZoomLevel(), [editor]);
  useEffect(() => {
    manager.setZoom(zoom);
  }, [manager, zoom]);
  return null;
}

function ZoomControls() {
  const editor = useEditor();
  const zoom = useValue('zoom-level', () => editor.getZoomLevel(), [editor]);
  const btn =
    'flex size-9 items-center justify-center text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary';
  return (
    <div className="flex flex-col overflow-hidden rounded-inner bg-surface-2 shadow-node">
      <button type="button" aria-label="缩小" className={btn} onClick={() => editor.zoomOut()}>
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="复位到 100%"
        title="复位到 100%"
        className={`${btn} tnum text-small`}
        onClick={() => editor.resetZoom()}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="放大" className={btn} onClick={() => editor.zoomIn()}>
        <Plus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="适应画布"
        title="适应画布 (F)"
        className={btn}
        onClick={() => editor.zoomToFit({ animation: { duration: 220 } })}
      >
        <Maximize className="size-4" />
      </button>
    </div>
  );
}

function TopLeftBrand() {
  return (
    <div className="flex h-9 items-center gap-2 rounded-pill bg-surface-2 px-3 shadow-node">
      <Diamond className="size-3.5 text-accent" fill="currentColor" />
      <span className="text-body text-text-primary">Agent Canvas · PoC</span>
      <span className="flex items-center gap-1.5 rounded-pill bg-surface-3 px-2 py-0.5 text-small text-text-secondary">
        <span className="size-1.5 rounded-pill" style={{ backgroundColor: '#F5A524' }} />
        tldraw
      </span>
      <Link
        to="/"
        className="ml-1 text-small text-text-tertiary transition-colors duration-fast hover:text-text-primary"
      >
        ← 返回首页
      </Link>
    </div>
  );
}

function TopRightControls() {
  const services = useCanvasServices();
  const state = services.engine.getState();
  void services.tick; /* tick 驱动重渲染 */
  return (
    <div className="flex items-center gap-2">
      {/* 活节点配额演示（§3.2.2） */}
      <span
        className="tnum flex h-7 items-center rounded-pill bg-surface-2 px-2.5 text-small text-text-secondary shadow-node"
        title="活窗配额：live ≤ 3，超出降级为 2fps 心跳帧 / 快照"
      >
        活窗 {services.liveCount}/{QUOTA_TOTAL}
      </span>
      <PlaybackBar
        state={state}
        onToggle={() => services.engine.toggle()}
        onReset={() => services.engine.reset()}
        onSeek={(i) => services.engine.seek(i)}
        onSpeed={(s) => services.engine.setSpeed(s)}
      />
    </div>
  );
}

function TopCenterLegend() {
  const services = useCanvasServices();
  const animsOn = useAnimationsEnabled(services.manager);
  return (
    <EdgeLegend
      animationsEnabled={animsOn}
      onAnimationsChange={(v) => services.manager.setAnimationsOverride(v)}
    />
  );
}

export function CanvasOverlays() {
  return (
    <>
      <ZoomBridge />
      {/* 窄屏提示（§7，仍可使用） */}
      <div className="pointer-events-none absolute inset-x-0 top-12 z-legend hidden justify-center max-lg:flex">
        <span className="rounded-pill bg-surface-3 px-3 py-1 text-small text-text-secondary shadow-node">
          画布体验为桌面设计，建议 ≥1280px
        </span>
      </div>
      <div className="absolute left-4 top-4 z-legend" style={{ pointerEvents: 'all' }}>
        <TopLeftBrand />
      </div>
      <div className="absolute right-4 top-4 z-legend" style={{ pointerEvents: 'all' }}>
        <TopRightControls />
      </div>
      <div
        className="absolute left-1/2 top-4 z-legend -translate-x-1/2"
        style={{ pointerEvents: 'all' }}
      >
        <TopCenterLegend />
      </div>
      <div className="absolute bottom-4 left-4 z-legend" style={{ pointerEvents: 'all' }}>
        <ZoomControls />
      </div>
      <div className="absolute bottom-4 right-4 z-legend" style={{ pointerEvents: 'all' }}>
        <Minimap />
      </div>
    </>
  );
}

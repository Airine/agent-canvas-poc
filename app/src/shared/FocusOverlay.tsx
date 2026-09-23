/**
 * FocusOverlay — L2 专注模式（design.md §3.2.3）
 *
 * 核心验收（§8.3）：节点 DOM【物理搬迁】到全屏容器，不 remount——
 * 进入/退出专注时终端光标不重置、产物流式不中断 [R§2.3.1]。
 *
 * 实现：children 通过 createPortal 挂进一个【稳定 carrier div】（组件存活期只创建一次），
 * 进出专注只是把 carrier appendChild 到 内联槽位 / overlay 槽位 之间——
 * carrier 本身不被销毁，React 子树因此零 remount。
 *
 * - 真实宽高重排：carrier 始终 w/h 100%，由两个槽位的真实尺寸驱动重排，禁止 CSS scale [R§2.3.2]；
 *   过渡只对 width/height/transform 做 280ms --ease-out（A3）。
 * - 遮罩 --surface-overlay + 8px backdrop-blur，220ms 淡入；z-index 60。
 * - 容器居中：宽 min(1080px, 92vw)、高 min(760px, 88vh)、--surface-1 底、16px 圆角、大阴影。
 * - 顶栏 56px：类型图标 + 标题 16px + 身份四元组 + 状态徽章 +「已接管交互」标签（--accent-soft 底）
 *   + 右侧「← 返回画布 Esc」。
 * - 焦点仲裁 [R§2.3.2]：进入后滚轮/键盘事件归节点内容（stopPropagation 挂起画布快捷键），
 *   Esc / 点击遮罩 / 顶栏按钮退出；退出时双回收（权限 + 焦点还原）。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_KIND_META } from './meta';
import { StatusBadge } from './StatusBadge';
import type { NodeIdentity, NodeKind, NodeStatus } from './types';

export interface FocusOverlayProps {
  open: boolean;
  onClose: () => void;
  kind: NodeKind;
  title: string;
  identity: NodeIdentity;
  status: NodeStatus;
  statusDetail?: string;
  /** 内联槽位尺寸（节点活窗区域），需给出确定高度避免画布布局跳动 */
  inlineClassName?: string;
  className?: string;
  children?: ReactNode;
}

export function FocusOverlay({
  open,
  onClose,
  kind,
  title,
  identity,
  status,
  statusDetail,
  inlineClassName,
  className,
  children,
}: FocusOverlayProps) {
  /* 稳定 carrier：组件存活期只创建一次，搬迁 = appendChild，不 remount */
  const [carrier] = useState(() => {
    const el = document.createElement('div');
    el.dataset.focusCarrier = 'true';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.minHeight = '0';
    el.style.transition =
      'width var(--dur-focus) var(--ease-out), height var(--dur-focus) var(--ease-out), transform var(--dur-focus) var(--ease-out)';
    return el;
  });
  const inlineSlotRef = useRef<HTMLDivElement>(null);
  const overlaySlotRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  /* DOM 搬迁：carrier 在 内联槽位 ↔ overlay 槽位 之间移动 */
  useEffect(() => {
    const target = open ? overlaySlotRef.current : inlineSlotRef.current;
    if (target && carrier.parentElement !== target) {
      target.appendChild(carrier);
    }
  });

  /* 焦点仲裁：进入接管 / 退出双回收（权限 + 焦点） */
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (prevFocusRef.current instanceof HTMLElement) prevFocusRef.current.focus();
    };
  }, [open, onClose]);

  /* 卸载兜底：carrier 归位，避免遗留 detached 引用 */
  useEffect(() => () => carrier.remove(), [carrier]);

  const meta = NODE_KIND_META[kind];
  const TypeIcon = meta.icon;

  return (
    <>
      {/* 内联槽位：节点活窗原位 */}
      <div ref={inlineSlotRef} className={cn('min-h-0', inlineClassName)} />

      {/* children 始终挂进稳定 carrier：进出专注零 remount */}
      {createPortal(<div className={cn('h-full min-h-0 w-full', className)}>{children}</div>, carrier)}

      {/* L2 全屏 overlay（z-index 60） */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`专注模式 · ${title}`}
            className="animate-delta-in fixed inset-0 z-focus-overlay flex items-center justify-center backdrop-blur-[8px]"
            style={{ backgroundColor: 'var(--surface-overlay)', animationDuration: 'var(--dur-med)' }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            {/* 全屏容器：真实宽高，禁止 CSS scale */}
            <div
              ref={panelRef}
              tabIndex={-1}
              className="animate-delta-in flex flex-col overflow-hidden bg-surface-1 shadow-overlay outline-none"
              style={{
                width: 'min(1080px, 92vw)',
                height: 'min(760px, 88vh)',
                borderRadius: '16px',
                animationDuration: 'var(--dur-focus)',
                animationTimingFunction: 'var(--ease-out)',
              }}
              /* 焦点仲裁：滚轮/键盘归节点内容，画布快捷键挂起 */
              onWheel={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') e.stopPropagation();
              }}
            >
              {/* 顶栏 56px */}
              <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
                <span
                  className="flex size-8 items-center justify-center rounded-inner"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
                    color: meta.color,
                  }}
                >
                  <TypeIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-focus-title text-text-primary">{title}</div>
                  <div className="truncate text-node-meta text-text-secondary">
                    {identity.harness} · {identity.env} · {identity.agentId} · {identity.model}
                  </div>
                </div>
                <StatusBadge status={status} detail={statusDetail} />
                {/* 权限可视化：交互权已移交（§3.2.3） */}
                <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-node-meta text-accent">
                  已接管交互
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 items-center gap-1.5 rounded-inner bg-surface-3 px-2.5 text-small text-text-secondary transition-colors duration-fast hover:text-text-primary"
                >
                  <ArrowLeft className="size-3.5" />
                  返回画布
                  <kbd className="rounded-inner border border-border-subtle px-1 font-mono text-node-meta text-text-tertiary">
                    Esc
                  </kbd>
                </button>
              </div>

              {/* 内容槽位：carrier 搬迁目的地 */}
              <div ref={overlaySlotRef} className="min-h-0 flex-1 p-3" />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

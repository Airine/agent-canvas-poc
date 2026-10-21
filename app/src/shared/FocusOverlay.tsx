/** Focus window: one stable carrier, floating/full-viewport are layout changes only. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_KIND_META } from './meta';
import { StatusBadge } from './StatusBadge';
import type { NodeIdentity, NodeKind, NodeStatus } from './types';
import '../pages/canvas/identity-window.css';

export interface FocusOverlayProps {
  open: boolean;
  onClose: () => void;
  kind: NodeKind;
  title: string;
  titleContent?: ReactNode;
  statusContent?: ReactNode;
  compactHeader?: boolean;
  headerActions?: ReactNode;
  identity: NodeIdentity;
  status: NodeStatus;
  statusDetail?: string;
  sessionLabel?: string;
  inlineClassName?: string;
  className?: string;
  children?: ReactNode;
  preserveFrameState?: boolean;
}

export function FocusOverlay({
  open, onClose, kind, title, titleContent, statusContent, compactHeader=false, headerActions, identity, status,
  statusDetail, sessionLabel, inlineClassName, className, children, preserveFrameState = false,
}: FocusOverlayProps) {
  const [fullViewport, setFullViewport] = useState(false);
  // A fresh focus visit always starts floating, including externally closed windows.
  if (!open && fullViewport) setFullViewport(false);
  const [carrier] = useState(() => {
    const el = document.createElement('div');
    el.dataset.focusCarrier = 'true';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.minHeight = '0';
    return el;
  });
  const inlineSlotRef = useRef<HTMLDivElement>(null);
  const overlaySlotRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const target = open ? overlaySlotRef.current : inlineSlotRef.current;
    if (target && carrier.parentElement !== target) {
      const active = document.activeElement;
      // appendChild reloads descendant iframes even when React does not remount.
      // Keep both slots connected and use a state-preserving DOM move for native UI.
      if (preserveFrameState && carrier.isConnected && 'moveBefore' in target) {
        (target as HTMLDivElement & {moveBefore(node: Node, before: Node | null): void}).moveBefore(carrier, null);
      } else target.appendChild(carrier);
      if (active instanceof HTMLElement && carrier.contains(active)) active.focus({ preventScroll: true });
    }
  });

  // Focus ownership is independent of window size: toggling must not steal composer focus.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    if (!carrier.contains(previous)) panelRef.current?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, carrier]);

  useEffect(() => {
    if (!open) return;
    let composing = false;
    const nestedEscapes = new WeakSet<KeyboardEvent>();
    const beginComposition = () => { composing = true; };
    const endComposition = () => { composing = false; };
    // Snapshot before a portal menu unmounts. Do not consume its event in capture.
    const captureEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const layers = document.querySelectorAll<HTMLElement>(
        '[role="menu"]:not([data-state="closed"]), [role="listbox"]:not([data-state="closed"]), [data-chat-diagnostics], [data-radix-popper-content-wrapper]:has([data-state="open"]), [role="dialog"]:not([data-focus-overlay]):not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"])',
      );
      if ([...layers].some(layer => layer.getClientRects().length > 0)) nestedEscapes.add(event);
    };
    // Bubble at window: React handlers and portal dismissal get first refusal.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || composing || nestedEscapes.has(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (fullViewport) setFullViewport(false);
      else onClose();
    };
    window.addEventListener('compositionstart', beginComposition, true);
    window.addEventListener('compositionend', endComposition, true);
    window.addEventListener('keydown', captureEscape, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('compositionstart', beginComposition, true);
      window.removeEventListener('compositionend', endComposition, true);
      window.removeEventListener('keydown', captureEscape, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, fullViewport, onClose]);

  useEffect(() => () => carrier.remove(), [carrier]);
  const meta = NODE_KIND_META[kind];
  const TypeIcon = meta.icon;
  return <>
    <div ref={inlineSlotRef} className={cn('min-h-0', inlineClassName)} />
    {createPortal(<div className={cn('h-full min-h-0 w-full', className)}>{children}</div>, carrier)}
    {(open || preserveFrameState) && createPortal(
      <div role="dialog" aria-modal="false" aria-label={`专注模式 · ${title}`} data-focus-overlay
        style={{display: open ? 'flex' : 'none'}}
        data-window-mode={fullViewport ? 'full' : 'floating'}
        className="focus-window-backdrop fixed inset-0 z-focus-overlay flex items-center justify-center"
        onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={panelRef} tabIndex={-1} className="focus-window-panel flex flex-col bg-surface-1 shadow-overlay outline-none"
          onWheel={event => event.stopPropagation()}
          onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}>
          <div className={cn("focus-window-header flex shrink-0 items-center gap-3 border-b border-border-subtle px-4",compactHeader&&"focus-header-compact")}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-inner"
              style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 16%, transparent)`, color: meta.color }}>
              <TypeIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              {titleContent ?? <div className="truncate text-focus-title text-text-primary">{title}</div>}
              {!compactHeader&&<div className="truncate text-node-meta text-text-secondary">
                {sessionLabel ? `${identity.harness} · ${identity.model}` : `${identity.harness} · ${identity.env} · ${identity.agentId} · ${identity.model}`}
              </div>}
            </div>
            {statusContent ?? (sessionLabel ? <span className="text-small text-text-secondary">{sessionLabel}</span> : <StatusBadge status={status} detail={statusDetail} />)}
            {headerActions}
            {!sessionLabel && <span className="focus-ownership rounded-pill bg-accent-soft px-2 py-0.5 text-node-meta text-accent">已接管交互</span>}
            <button type="button" aria-label={fullViewport ? '还原浮窗' : '铺满视口'} aria-pressed={fullViewport}
              className="focus-window-action" onClick={() => setFullViewport(value => !value)}>
              {fullViewport ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{fullViewport ? '还原浮窗' : '铺满视口'}</span>
            </button>
            <button type="button" aria-label="返回画布" onClick={onClose} className="focus-window-action">
              <ArrowLeft size={15} /><span>返回画布</span>
              <kbd className="rounded-inner border border-border-subtle px-1 font-mono text-node-meta text-text-tertiary">Esc</kbd>
            </button>
          </div>
          <div ref={overlaySlotRef} className="min-h-0 flex-1 p-3" />
        </div>
      </div>, document.body,
    )}
  </>;
}

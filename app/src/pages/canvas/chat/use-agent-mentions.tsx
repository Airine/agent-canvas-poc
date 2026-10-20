import { useContext, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { LiveStore } from '../live-store';
import { useAgentIdentities } from '../use-agent-identities';
import { ChatOverlayContext } from './chat-overlay-context';
import { insertMention, mentionQuery } from './agent-mentions';
import '../collaboration.css';

export function useAgentMentions({ store, nodeId, textarea, draft, setDraft, disabled }: {
  store: LiveStore; nodeId: string; textarea: RefObject<HTMLTextAreaElement | null>; draft: string; setDraft: (text: string) => void; disabled: boolean;
}) {
  const peers = useAgentIdentities(store), scope = useContext(ChatOverlayContext), id = useId(), layerId = `mentions-${id}`;
  const [selection, setSelection] = useState({ start: 0, end: 0, focused: false, composing: false, dismissed: '' });
  const [active, setActive] = useState(0), menuRef = useRef<HTMLDivElement>(null);
  const range = mentionQuery(draft, selection.start, selection.end), key = `${draft}:${selection.start}:${selection.end}`;
  const open = !disabled && selection.focused && !selection.composing && range && selection.dismissed !== key && (!scope || scope.open === layerId);
  const options = range ? [...peers].filter(([peerId, identity]) => peerId !== nodeId && (!range.query || `${identity.nickname} ${identity.referenceHash}`.toLocaleLowerCase().includes(range.query))).slice(0, 30) : [];
  const index = Math.min(active, options.length - 1);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = textarea.current, menu = menuRef.current; if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect(), width = Math.min(360, window.innerWidth - 24);
      const above = rect.top > 240, available = above ? rect.top - 12 : window.innerHeight - rect.bottom - 12;
      menu.style.width = `${width}px`; menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      menu.style.maxHeight = `${Math.max(90, Math.min(260, available))}px`;
      menu.style.top = above ? 'auto' : `${rect.bottom + 6}px`; menu.style.bottom = above ? `${window.innerHeight - rect.top + 6}px` : 'auto';
    };
    update(); const observer = new ResizeObserver(update); if (textarea.current) observer.observe(textarea.current);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, textarea]);
  useLayoutEffect(() => { menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);
  function close() { setSelection(s => ({ ...s, dismissed: key })); scope?.close(layerId); }
  function changed(el: HTMLTextAreaElement, reset = true) {
    setSelection(s => ({ ...s, start: el.selectionStart, end: el.selectionEnd, focused: true, dismissed: reset ? '' : s.dismissed }));
    if (reset) setActive(0);
    if (mentionQuery(el.value, el.selectionStart, el.selectionEnd)) scope?.setOpen(layerId); else scope?.close(layerId);
  }
  function pick(option: (typeof options)[number]) {
    if (!range) return;
    const inserted = insertMention(draft, range, option[1].reference); setDraft(inserted.text); close();
    requestAnimationFrame(() => { textarea.current?.focus({ preventScroll: true }); textarea.current?.setSelectionRange(inserted.caret, inserted.caret); });
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || selection.composing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return false;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return true; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation(); setActive(options.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : 0); return true;
    }
    if (event.key === 'Enter' && !event.shiftKey || event.key === 'Tab' && options.length > 0) {
      event.preventDefault(); event.stopPropagation(); if (options[index]) pick(options[index]); return true;
    }
    return false;
  }
  return {
    changed, selection: (el: HTMLTextAreaElement) => changed(el, false),
    blur: () => { setSelection(s => ({ ...s, focused: false })); scope?.close(layerId); },
    composition: (composing: boolean) => setSelection(s => ({ ...s, composing })), keyDown,
    aria: { 'aria-autocomplete': 'list' as const, 'aria-expanded': !!open, 'aria-controls': open ? id : undefined, 'aria-activedescendant': open && options[index] ? `${id}-${index}` : undefined },
    menu: open ? createPortal(<div ref={menuRef} className="canvas-mention-menu" data-chat-popover="mentions" onMouseDown={event => event.preventDefault()}>
      <p className="canvas-mention-heading">引用同画布 Agent <span>只插入引用，不发送</span></p>
      <div role="listbox" id={id} aria-label="其他 Agent">{options.length ? options.map(([peerId, identity], at) => <button key={peerId} id={`${id}-${at}`} role="option" type="button" tabIndex={-1} aria-selected={at === index} onMouseEnter={() => setActive(at)} onClick={() => pick([peerId, identity])}>
        <span>{identity.nickname}</span><code>#{identity.referenceHash}</code>
      </button>) : <p className="canvas-mention-empty">没有匹配的其他 Agent</p>}</div>
      <p className="canvas-mention-foot">↑↓ 选择 · Enter / Tab 插入 · Esc 关闭</p>
    </div>, document.body) : null,
  };
}

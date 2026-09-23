/**
 * LiveTerminal — operation/chat 节点活窗（契约 §3 term 通道，xterm.js 渲染）
 *
 * - 挂载且配额内（live / 专注）→ store.subscribeTerm（= WS term.subscribe），
 *   卸载/降级 → unsubscribe；收到的 ansi 全量快照每次 write 前 term.reset() 清空重绘。
 * - 配额降级阶梯（§3.2.2）保留：fps2 心跳档仍订阅但 500ms 抽帧应用；
 *   快照档不订阅，只显示静态末屏（store.termLastSnapshot 剥离 ansi 的纯文本）。
 * - 可交互终端：L1s 放大档 / L2 专注模式下 xterm 打开 stdin，击键/粘贴经 onData
 *   原样转发 scoped POST input（契约 §2）；前端不回显，回显来自后端快照，无双回显。
 *   焦点仲裁：可输入档滚轮/键盘归终端（stopPropagation），画布快捷键挂起，blur 恢复。
 * - 专注模式（variant="focus"）：
 *   · takeover 输入框 → scoped POST input（整行 + \r 提交，与 xterm 直输并存）；
 *   · 底部事件回放（简化 v0）：scoped GET events 只读列表，3s 轮询刷新，
 *     不做 seek 重建。
 * - xterm 实例随组件创建一次；FocusOverlay DOM 搬迁不 remount，终端内容/滚动不丢；
 *   ResizeObserver 驱动 fit（进出专注、窗口变化时重排真实宽高，禁止 CSS scale）。
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { CircleDot, RefreshCw, SendHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { WindowFrame, type LiveTier } from '@/shared';
import type { CanvasNode, LiveStore, NodeEvent } from './live-store';
import { ansiTail } from './utils';

const XTERM_THEME = {
  background: '#0A0C10',
  foreground: '#E8EAF0',
  cursor: '#E8EAF0',
  cursorAccent: '#0A0C10',
  selectionBackground: '#262C3A',
  black: '#0B0D12',
  red: '#F2555A',
  green: '#3DC97E',
  yellow: '#F5A524',
  blue: '#4D9FFF',
  magenta: '#7C6BF5',
  cyan: '#2DD4BF',
  white: '#E8EAF0',
  brightBlack: '#5C6478',
  brightRed: '#F2555A',
  brightGreen: '#3DC97E',
  brightYellow: '#F5A524',
  brightBlue: '#4D9FFF',
  brightMagenta: '#7C6BF5',
  brightCyan: '#2DD4BF',
  brightWhite: '#FFFFFF',
};

/* ---------------- 事件回放（简化 v0，只读列表） ---------------- */

function EventReplay({ store, nodeId }: { store: LiveStore; nodeId: string }) {
  const [events, setEvents] = useState<NodeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    store
      .fetchNodeEvents(nodeId)
      .then((evs) => {
        setEvents(evs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, nodeId]);

  return (
    <div className="flex max-h-36 shrink-0 flex-col border-t border-border-subtle">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <span className="min-w-0 flex-1 text-node-meta text-text-tertiary">
          事件回放（只读） · scoped GET nodes/{nodeId}/events
        </span>
        <span className="tnum text-node-meta text-text-tertiary">{events.length} 条</span>
        <button
          type="button"
          onClick={refresh}
          title="刷新事件列表"
          className="flex size-5 items-center justify-center rounded-inner text-text-tertiary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
        >
          <RefreshCw className="size-3" />
        </button>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
        {loading && events.length === 0 ? (
          <li className="py-1 text-node-meta text-text-tertiary">加载中…</li>
        ) : events.length === 0 ? (
          <li className="py-1 text-node-meta text-text-tertiary">暂无事件</li>
        ) : (
          events.map((ev) => (
            <li key={ev.id} className="flex items-baseline gap-2 py-0.5 text-node-meta">
              <span className="tnum shrink-0 text-text-tertiary">
                {new Date(ev.ts).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
              <span className="shrink-0 rounded-inner bg-surface-3 px-1 font-mono text-[10px] text-text-secondary">
                {ev.kind}
              </span>
              <span className="min-w-0 break-all text-text-secondary">{ev.text}</span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

/* ---------------- 主组件 ---------------- */

export interface LiveTerminalProps {
  store: LiveStore;
  node: CanvasNode;
  tier: LiveTier;
  /** 专注模式：订阅升格 live + takeover 输入 + 事件回放 */
  focused: boolean;
  observeOnly?: boolean;
  onActivate?: () => void;
  onFocus?: () => void;
  className?: string;
}

export function LiveTerminal({
  store,
  node,
  tier,
  focused,
  observeOnly,
  onActivate,
  onFocus,
  className,
}: LiveTerminalProps) {
  const nodeId = node.id;
  /** 订阅档位：live / fps2 心跳 / 专注；快照档不订阅（静态末屏） */
  const subscribed = focused || tier === 'live' || tier === 'fps2';
  const throttled = !focused && tier === 'fps2';
  /**
   * 可输入 = 已订阅且非观察权（L1s 放大档 / L2 专注；observeOnly 随档位与拖拽态切换）。
   * 用 ref 供 xterm onData 闭包读取，避免重建终端实例。
   */
  const interactive = subscribed && !observeOnly;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const latestAnsi = useRef<string | null>(null);
  const [takeoverText, setTakeoverText] = useState('');
  const [sending, setSending] = useState(false);

  /* xterm 实例：组件存活期创建一次（DOM 搬迁不 remount，终端不丢） */
  useEffect(() => {
    if (!subscribed) return;
    const term = new Terminal({
      theme: XTERM_THEME,
      fontSize: 12,
      fontFamily: '"JetBrains Mono", "SF Mono", Consolas, monospace',
      lineHeight: 17 / 12,
      convertEol: true,
      disableStdin: !interactiveRef.current,
      cursorBlink: interactiveRef.current,
      scrollback: 2000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;
    const el = containerRef.current;
    if (el) {
      term.open(el);
      fit.fit();
    }
    /*
     * herdr pane.send_text 语义：onData 给的就是用户输入字符串（含逐键、粘贴整块、
     * 控制键转义），原样转发后端，不自行组装行缓冲。前端不回显 —— 回显来自后端
     * 2Hz pane.read 快照，无双回显。
     */
    term.onData((data) => {
      if (!interactiveRef.current) return;
      store.sendInput(nodeId, data).catch(() => {
        /* 逐键失败静默：下一帧全量快照仍是事实来源 */
      });
    });
    // 挂载前可能已有快照：补一帧
    const last = store.termLastSnapshot(nodeId);
    if (last !== undefined) {
      latestAnsi.current = last;
      term.reset();
      term.write(last);
    }
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* 隐藏时 fit 会抛，忽略 */
      }
    });
    if (el) ro.observe(el);
    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
     
  }, [subscribed, nodeId, store]);

  /* 交互权随档位切换：可输入档打开 stdin + 光标闪烁，其余只读（不重建终端，内容不丢） */
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = !interactive;
    term.options.cursorBlink = interactive;
  }, [interactive, subscribed]);

  /* term 订阅：live 实时写；fps2 心跳 500ms 抽帧应用（契约：全量快照，write 前 reset） */
  useEffect(() => {
    if (!subscribed) return;
    const apply = (ansi: string) => {
      const term = termRef.current;
      if (!term) return;
      term.reset();
      term.write(ansi);
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    const unsubscribe = store.subscribeTerm(nodeId, (ansi) => {
      latestAnsi.current = ansi;
      if (!throttled) apply(ansi);
    });
    if (throttled) {
      timer = setInterval(() => {
        if (latestAnsi.current !== null) apply(latestAnsi.current);
      }, 500);
    }
    return () => {
      unsubscribe();
      if (timer !== null) clearInterval(timer);
    };
     
  }, [subscribed, throttled, nodeId, store]);

  /* takeover 输入 → scoped POST input（契约 §2；send_text 语义需显式 \r 提交） */
  const submitInput = () => {
    const text = takeoverText.trim();
    if (!text || sending) return;
    setSending(true);
    store
      .sendInput(nodeId, `${text}\r`)
      .then(() => setTakeoverText(''))
      .catch((err: unknown) => {
        toast.error('输入发送失败', {
          description: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => setSending(false));
  };

  const windowTitle = `terminal · ${node.paneId ?? node.env}`;

  return (
    <WindowFrame
      title={windowTitle}
      tier={focused ? 'live' : tier}
      observeOnly={observeOnly}
      onActivate={onActivate}
      onFocus={onFocus}
      className={className}
      headerRight={
        focused ? (
          <span className="tnum flex shrink-0 items-center gap-1 rounded-inner px-1 text-node-meta text-st-completed">
            <CircleDot className="size-3" />● 直播
          </span>
        ) : undefined
      }
    >
      <div className="terminal-bg flex h-full min-h-0 flex-col">
        {/* 终端区：订阅档 = xterm；快照档 = 静态末屏纯文本 */}
        {subscribed ? (
          <div
            ref={containerRef}
            className="min-h-0 flex-1 px-1 py-1 [&_.xterm]:h-full"
            /*
             * 焦点仲裁：可输入档滚轮/键盘归终端（画布缩放与快捷键挂起），blur 即恢复。
             * 窗口级 keydown 为冒泡监听，此处 stopPropagation 后画布快捷键不触发；
             * FocusOverlay 的 Esc 走 window 捕获阶段，不受影响。
             */
            onWheel={interactive ? (e) => e.stopPropagation() : undefined}
            onKeyDown={interactive ? (e) => e.stopPropagation() : undefined}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 font-mono text-mono">
            {(() => {
              const tail = ansiTail(store.termLastSnapshot(nodeId), 12);
              return tail ? (
                <pre className="whitespace-pre-wrap break-all text-text-secondary">{tail}</pre>
              ) : (
                <div className="text-text-tertiary">等待输出…</div>
              );
            })()}
          </div>
        )}

        {/* 专注模式：takeover 输入框（契约 §2 POST /api/nodes/:id/input） */}
        {focused && (
          <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border-subtle px-2">
            <span className="font-mono text-mono" style={{ color: 'var(--nt-operation)' }}>
              $
            </span>
            <input
              value={takeoverText}
              onChange={(e) => setTakeoverText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitInput()}
              disabled={sending}
              placeholder="takeover：输入发送到节点 pane（POST /input）"
              aria-label="takeover 终端输入"
              className="min-w-0 flex-1 bg-transparent font-mono text-mono text-text-primary caret-accent outline-none placeholder:text-text-tertiary"
            />
            <button
              type="button"
              onClick={submitInput}
              disabled={sending || !takeoverText.trim()}
              title="发送输入"
              className="flex size-6 shrink-0 items-center justify-center rounded-inner text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
            >
              <SendHorizontal className="size-3.5" />
            </button>
          </div>
        )}

        {/* 专注模式：事件回放（简化 v0 只读列表） */}
        {focused && <EventReplay store={store} nodeId={nodeId} />}
      </div>
    </WindowFrame>
  );
}

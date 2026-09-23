/**
 * TerminalView — 操作节点内容区（design.md §3.3.2）
 *
 * 默认态活窗 = 模拟终端：#0A0C10 底、--fs-mono、stdout --text-primary、
 * 命令行前缀 `$` 用 --nt-operation、stderr 用 --st-failed、✓/done 用 --st-completed。
 * 字符流入场 60ms 逐行淡入（非逐字打字机）[R§3.1.2]。
 *
 * 专注模式（variant="focus"）：终端放大 + 底部回放时间轴（横向 scrubber，刻度=事件序号，
 * 已播放区 --nt-operation 色）+ 右上「⏺ 回放中 / ● 直播」切换徽标 + 「接管终端」演示。
 */
import { useEffect, useRef, useState } from 'react';
import { CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NodeState, TerminalLine } from './types';
import { WindowFrame, type LiveTier } from './WindowFrame';

function Line({ line }: { line: TerminalLine }) {
  if (line.kind === 'cmd') {
    return (
      <div className="animate-line-in whitespace-pre-wrap break-all">
        <span style={{ color: 'var(--nt-operation)' }}>$ </span>
        <span className="text-text-primary">{line.text}</span>
      </div>
    );
  }
  if (line.kind === 'stderr') {
    return <div className="animate-line-in whitespace-pre-wrap break-all text-st-failed">{line.text}</div>;
  }
  if (line.kind === 'success') {
    return <div className="animate-line-in whitespace-pre-wrap break-all text-st-completed">{line.text}</div>;
  }
  return <div className="animate-line-in whitespace-pre-wrap break-all text-text-primary">{line.text}</div>;
}

export interface TerminalViewProps {
  title: string;
  state: NodeState;
  tier?: LiveTier;
  observeOnly?: boolean;
  onActivate?: () => void;
  onFocus?: () => void;
  className?: string;
  /* —— 专注模式扩展（回放时间轴 + takeover） —— */
  variant?: 'embedded' | 'focus';
  /** 回放：当前事件序号 / 总数 / seek 回调（拖动=暂停并跳转） */
  replay?: { index: number; total: number; onSeek: (index: number) => void };
  /** 时间轴关键事件刻度（命令执行、报错） */
  keyIndices?: number[];
  /** takeover 演示：接管后 mock agent 事件暂停注入，终端仅演示回显 */
  takeover?: { active: boolean; onToggle: () => void };
}

export function TerminalView({
  title,
  state,
  tier,
  observeOnly,
  onActivate,
  onFocus,
  className,
  variant = 'embedded',
  replay,
  keyIndices,
  takeover,
}: TerminalViewProps) {
  const lines = state.terminalLines;
  const running = state.status === 'running';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [echo, setEcho] = useState<string[]>([]);
  const [input, setInput] = useState('');

  /* 直播时自动滚到底部；回放（seek 历史）不打断用户滚动位置 */
  const isLive = !replay || replay.index >= replay.total - 1;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isLive && !takeover?.active) el.scrollTop = el.scrollHeight;
  }, [lines.length, isLive, takeover?.active]);

  const submitEcho = () => {
    if (!input.trim()) return;
    setEcho((prev) => [...prev, `$ ${input}`, `bash: ${input.split(' ')[0]}: （演示回显，未真正执行）`]);
    setInput('');
  };

  return (
    <WindowFrame
      title={title}
      tier={tier}
      observeOnly={observeOnly}
      onActivate={onActivate}
      onFocus={onFocus}
      className={className}
      headerRight={
        replay ? (
          <span
            className={cn(
              'tnum flex shrink-0 items-center gap-1 rounded-inner px-1 text-node-meta',
              isLive ? 'text-st-completed' : 'text-st-waiting',
            )}
          >
            <CircleDot className="size-3" />
            {isLive ? '● 直播' : '⏺ 回放中'}
          </span>
        ) : undefined
      }
    >
      <div className="terminal-bg flex h-full min-h-0 flex-col">
        {/* 终端区 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 font-mono text-mono">
          {lines.length === 0 && echo.length === 0 ? (
            <div className="text-text-tertiary">等待输出…</div>
          ) : (
            lines.map((line, i) => <Line key={i} line={line} />)
          )}
          {echo.map((text, i) => (
            <div key={`echo-${i}`} className="whitespace-pre-wrap break-all text-text-secondary">{text}</div>
          ))}
          {/* 光标闪烁（takeover 时变为可输入行） */}
          {takeover?.active ? (
            <div className="flex items-center">
              <span style={{ color: 'var(--nt-operation)' }}>$ </span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitEcho()}
                className="ml-1 flex-1 bg-transparent font-mono text-mono text-text-primary caret-accent outline-none"
                placeholder="已接管：键入仅演示回显"
                aria-label="接管终端输入"
              />
            </div>
          ) : (
            running && <span className="animate-caret-blink mt-0.5 block h-3.5 w-2 bg-text-primary" aria-hidden />
          )}
        </div>

        {/* 专注模式：回放时间轴（§3.3.2） */}
        {variant === 'focus' && replay && (
          <div className="shrink-0 border-t border-border-subtle px-3 py-2">
            <div className="relative">
              <input
                type="range"
                min={-1}
                max={Math.max(0, replay.total - 1)}
                value={replay.index}
                onChange={(e) => replay.onSeek(Number(e.target.value))}
                aria-label="回放时间轴"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-pill outline-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-pill [&::-webkit-slider-thumb]:bg-nt-operation"
                style={{
                  background: `linear-gradient(to right, var(--nt-operation) 0%, var(--nt-operation) ${((replay.index + 1) / replay.total) * 100}%, var(--border-subtle) ${((replay.index + 1) / replay.total) * 100}%, var(--border-subtle) 100%)`,
                }}
              />
              {/* 关键事件小圆点（命令执行、报错），hover 显示摘要 */}
              {keyIndices?.map((idx) => (
                <span
                  key={idx}
                  className="pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-text-secondary"
                  style={{ left: `${((idx + 1) / replay.total) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between text-node-meta text-text-tertiary">
              <span className="tnum">t={String(Math.max(0, replay.index + 1)).padStart(3, '0')}/{String(replay.total).padStart(3, '0')}</span>
              {takeover && (
                <button
                  type="button"
                  onClick={takeover.onToggle}
                  className={cn(
                    'h-5 rounded-inner px-2 text-node-meta transition-colors duration-fast',
                    takeover.active
                      ? 'bg-accent-soft text-accent'
                      : 'bg-surface-3 text-text-secondary hover:text-text-primary',
                  )}
                >
                  {takeover.active ? '交还控制 · 已接管' : '接管终端'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </WindowFrame>
  );
}

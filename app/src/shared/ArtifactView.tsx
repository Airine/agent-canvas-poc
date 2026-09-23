/**
 * ArtifactView — 产物节点内容区（design.md §3.3.1）
 *
 * 默认态活窗 = 产物预览 + 版本条：
 *  ┌ 窗口栏：artifact · landing.html        v3 ▾ ┐
 *  │  （流式增量渲染区：Markdown/HTML 实时打字）   │
 *  │  ▍流式时光标块（accent 色 8px 方块呼吸）      │
 *  ├──────────────────────────────────────────┤
 *  │ ◀ v3/5 ▶   ● 流式中… / ✓ 已完成   [diff]  │
 *  └──────────────────────────────────────────┘
 *
 * - 版本条：线性链 ◀ ▶ + 下拉命名里程碑；切旧版本 → 窗口栏「历史版本」徽标 + 内容降透明 85%。
 * - 人机并发演示：agent 流式写入区域显示 --nt-artifact 色左侧 2px 竖条 [R§3.3.4]。
 * - 增量新内容 220ms 淡入；光标块呼吸。
 */
import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, GitCompareArrows } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArtifactNodeState } from './types';
import { WindowFrame, type LiveTier } from './WindowFrame';

export interface ArtifactViewProps {
  title: string;
  state: ArtifactNodeState;
  tier?: LiveTier;
  observeOnly?: boolean;
  onActivate?: () => void;
  onFocus?: () => void;
  onSelectVersion?: (index: number) => void;
  className?: string;
}

export function ArtifactView({
  title,
  state,
  tier,
  observeOnly,
  onActivate,
  onFocus,
  onSelectVersion,
  className,
}: ArtifactViewProps) {
  const { versions, current, streamingText, streaming } = state;
  const total = versions.length;
  const clamped = total === 0 ? 0 : Math.min(current, total - 1);
  const version = versions[clamped];
  const isLatest = total === 0 || clamped === total - 1;
  const scrollRef = useRef<HTMLDivElement>(null);

  /* 流式时保持滚动到底部 */
  useEffect(() => {
    const el = scrollRef.current;
    if (el && streaming && isLatest) el.scrollTop = el.scrollHeight;
  }, [streamingText, streaming, isLatest]);

  const select = (index: number) => {
    if (index >= 0 && index < total) onSelectVersion?.(index);
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
        !isLatest ? (
          <span className="shrink-0 rounded-inner bg-accent-soft px-1 text-node-meta text-accent">
            历史版本
          </span>
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* 流式渲染区 */}
        <div
          ref={scrollRef}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-2 py-1.5 transition-opacity duration-med',
            !isLatest && 'opacity-85',
          )}
        >
          {version ? (
            <div className="relative border-l-2 pl-2" style={{ borderColor: streaming && isLatest ? 'var(--nt-artifact)' : 'transparent' }}>
              <pre className="whitespace-pre-wrap break-words font-mono text-mono text-text-primary">
                {version.content}
                {isLatest && streamingText && (
                  <span className="animate-delta-in">{streamingText}</span>
                )}
              </pre>
              {/* 流式光标块：accent 色 8px 方块呼吸 */}
              {streaming && isLatest && (
                <span className="animate-cursor-breathe mt-1 block size-2 bg-accent" aria-hidden />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-small text-text-tertiary">
              等待产物写入…
            </div>
          )}
        </div>

        {/* 版本条 */}
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-t border-border-subtle px-2 text-small">
          <button
            type="button"
            aria-label="上一版本"
            onClick={() => select(clamped - 1)}
            disabled={clamped <= 0}
            className="flex size-5 items-center justify-center rounded-inner text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="tnum text-text-secondary">
            v{total === 0 ? 0 : clamped + 1}/{total}
          </span>
          <button
            type="button"
            aria-label="下一版本"
            onClick={() => select(clamped + 1)}
            disabled={clamped >= total - 1}
            className="flex size-5 items-center justify-center rounded-inner text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
          >
            <ChevronRight className="size-3.5" />
          </button>

          {/* 命名里程碑下拉 */}
          {total > 0 && (
            <div className="relative">
              <select
                aria-label="版本里程碑"
                value={clamped}
                onChange={(e) => select(Number(e.target.value))}
                className="h-5 max-w-[120px] appearance-none truncate rounded-inner bg-surface-3 pl-1.5 pr-5 text-node-meta text-text-secondary outline-none transition-colors duration-fast hover:text-text-primary"
              >
                {versions.map((v, i) => (
                  <option key={v.v} value={i}>
                    v{v.v}{v.label ? ` · ${v.label}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3 -translate-y-1/2 text-text-tertiary" />
            </div>
          )}

          <span className="min-w-0 flex-1" />

          {streaming ? (
            <span className="flex items-center gap-1 text-st-running">
              <span className="size-1.5 rounded-pill bg-st-running" />
              流式中…
            </span>
          ) : total > 0 ? (
            <span className="flex items-center gap-1 text-st-completed">✓ 已完成</span>
          ) : (
            <span className="text-text-tertiary">待生成</span>
          )}
          <button
            type="button"
            className="flex h-5 items-center gap-1 rounded-inner px-1.5 text-node-meta text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
          >
            <GitCompareArrows className="size-3" />
            diff
          </button>
        </div>
      </div>
    </WindowFrame>
  );
}

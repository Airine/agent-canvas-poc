/**
 * PlaybackBar — 播放控制条（design.md §2.2.5，顶部右侧，挂全局不挂节点）
 *
 * mock 事件流引擎的统一 UI：⏮ 重置 / ▶⏸ 播放暂停 / 速度 1x 2x 4x /
 * 时间轴滑杆（可 seek）/ 当前事件序号 `t=042/128`，等宽数字。
 * 「模拟实时执行 + 可回放」统一入口。
 */
import { Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EngineState, PlaybackSpeed } from './mock/engine';

const SPEEDS: PlaybackSpeed[] = [1, 2, 4];

export interface PlaybackBarProps {
  state: EngineState;
  onToggle: () => void;
  onReset: () => void;
  onSeek: (index: number) => void;
  onSpeed: (speed: PlaybackSpeed) => void;
  className?: string;
}

export function PlaybackBar({ state, onToggle, onReset, onSeek, onSpeed, className }: PlaybackBarProps) {
  const { index, total, playing, speed } = state;
  const progress = total <= 1 ? 0 : ((index + 1) / total) * 100;

  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded-pill bg-surface-2 px-2.5 text-small shadow-node',
        className,
      )}
    >
      {/* ⏮ 重置 */}
      <button
        type="button"
        onClick={onReset}
        aria-label="重置"
        title="重置"
        className="flex size-6 items-center justify-center rounded-inner text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
      >
        <RotateCcw className="size-3.5" />
      </button>

      {/* ▶⏸ 播放暂停 */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? '暂停' : '播放'}
        title={playing ? '暂停' : '播放'}
        className="flex size-6 items-center justify-center rounded-inner bg-accent text-white transition-colors duration-fast hover:bg-accent/90"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </button>

      {/* 速度档 1x 2x 4x */}
      <div className="flex items-center gap-0.5" role="group" aria-label="播放速度">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeed(s)}
            className={cn(
              'tnum h-5 rounded-inner px-1.5 text-node-meta transition-colors duration-fast',
              speed === s
                ? 'bg-accent-soft text-accent'
                : 'text-text-tertiary hover:bg-surface-3 hover:text-text-primary',
            )}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* 时间轴滑杆（可 seek；点任意位置暂停并跳转） */}
      <input
        type="range"
        min={-1}
        max={Math.max(0, total - 1)}
        value={index}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="事件时间轴"
        className="h-1.5 w-36 cursor-pointer appearance-none rounded-pill outline-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-pill [&::-webkit-slider-thumb]:bg-accent"
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${progress}%, var(--border-subtle) ${progress}%, var(--border-subtle) 100%)`,
        }}
      />

      {/* 当前事件序号，等宽数字 */}
      <span className="tnum text-node-meta text-text-secondary">
        t={String(Math.max(0, index + 1)).padStart(3, '0')}/{String(total).padStart(3, '0')}
      </span>
    </div>
  );
}

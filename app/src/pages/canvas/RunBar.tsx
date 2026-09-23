/**
 * RunBar — 运行控制条（替换 PoC 的 PlaybackBar；契约 §2 POST /api/graph/run|reset）
 *
 * ▶ 运行（幂等；running 中点击仅 toast 提示、不重复发请求）/ ⟳ 重置（二次确认，
 * 第一次点击进入 3s 确认态）/ runState 指示（idle · running · done，
 * 颜色+图标+文字三通道，§1.1.2 P2）。等宽文字，胶囊样式与图例/配额徽标一致。
 */
import { useEffect, useRef, useState } from 'react';
import { CircleDot, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ConnState, RunState } from './live-store';

const RUN_STATE_META: Record<RunState, { label: string; className: string }> = {
  idle: { label: 'idle · 待运行', className: 'text-st-queued' },
  running: { label: 'running · 编排中', className: 'text-st-running' },
  done: { label: 'done · 已完成', className: 'text-st-completed' },
};

const CONN_META: Record<ConnState, { label: string; className: string }> = {
  connecting: { label: '连接中…', className: 'text-text-tertiary' },
  online: { label: '控制面在线', className: 'text-st-completed' },
  reconnecting: { label: '重连中…', className: 'text-st-waiting' },
  mock: { label: '本地 mock（后端未连接）', className: 'text-st-waiting' },
};

export interface RunBarProps {
  runState: RunState;
  connState: ConnState;
  onRun: () => Promise<void>;
  onReset: () => Promise<void>;
}

export function RunBar({ runState, connState, onRun, onReset }: RunBarProps) {
  const [busy, setBusy] = useState<'run' | 'reset' | null>(null);
  /** reset 二次确认：第一次点击进入确认态，3s 内未再点自动解除 */
  const [confirmReset, setConfirmReset] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta = RUN_STATE_META[runState];
  const conn = CONN_META[connState];

  useEffect(
    () => () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const invoke = (which: 'run' | 'reset', fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(which);
    fn()
      .catch((err: unknown) => {
        toast.error(which === 'run' ? '运行请求失败' : '重置请求失败', {
          description: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => setBusy(null));
  };

  const clickRun = () => {
    if (runState === 'running') {
      toast.info('编排正在运行中', { description: 'run 幂等：重复请求已被忽略' });
      return;
    }
    invoke('run', onRun);
  };

  const clickReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      confirmTimer.current = setTimeout(() => {
        confirmTimer.current = null;
        setConfirmReset(false);
      }, 3000);
      return;
    }
    if (confirmTimer.current !== null) {
      clearTimeout(confirmTimer.current);
      confirmTimer.current = null;
    }
    setConfirmReset(false);
    invoke('reset', onReset);
  };

  const btn =
    'flex h-7 items-center gap-1.5 rounded-inner px-2.5 text-small transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex h-9 items-center gap-1 rounded-pill bg-surface-2 px-1.5 shadow-node">
      {/* runState 指示（颜色+图标+文字） */}
      <span className={cn('flex items-center gap-1.5 px-2 text-small', meta.className)}>
        <CircleDot className={cn('size-3.5', runState === 'running' && 'animate-pulse-dot')} />
        <span className="tnum">{meta.label}</span>
      </span>
      <span className="h-4 w-px bg-border-subtle" aria-hidden />
      <button
        type="button"
        disabled={busy !== null}
        onClick={clickRun}
        title={
          runState === 'running'
            ? '编排运行中：点击仅提示，不重复发 run'
            : 'POST /api/graph/run（幂等）'
        }
        className={cn(
          btn,
          'bg-accent text-white hover:bg-accent/90',
          runState === 'running' && 'cursor-default opacity-60 hover:bg-accent',
        )}
      >
        <Play className="size-3.5" />
        运行
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={clickReset}
        title={
          confirmReset
            ? '3s 内再次点击确认重置'
            : 'POST /api/graph/reset：关闭全部 pane、清空事件、回到初始图（需二次确认）'
        }
        className={cn(
          btn,
          confirmReset
            ? 'bg-st-failed/15 text-st-failed hover:bg-st-failed/25'
            : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary',
        )}
      >
        <RotateCcw className="size-3.5" />
        {confirmReset ? '确认重置？' : '重置'}
      </button>
      <span className="h-4 w-px bg-border-subtle" aria-hidden />
      {/* 连接状态（mock 回退明示） */}
      <span className={cn('px-2 text-node-meta', conn.className)}>{conn.label}</span>
    </div>
  );
}

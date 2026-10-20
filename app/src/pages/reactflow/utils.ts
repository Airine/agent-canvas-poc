/**
 * React Flow 适配层工具：耗时格式化 / 节点进度 / 引擎时钟 / 降级抽帧门 / 快照摘要。
 */
import { useEffect, useState } from 'react';
import type { EngineState, NodeState, NodeStatus } from '@/shared';
import { MOCK_EVENTS } from '@/shared';

/** 耗时：`42s` / `3m12s`，等宽数字（§1.2） */
function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

/** 状态徽章后缀（§3.1）：running=elapsed / waiting=reason / done=duration / failed=一行摘要 */
export function statusDetailFor(state: NodeState, timeMs: number): string | undefined {
  switch (state.status) {
    case 'running':
      return fmtElapsed(timeMs - (state.startedAt ?? timeMs));
    case 'waiting':
      return state.statusReason;
    case 'completed':
      return (
        state.statusReason ??
        (state.startedAt !== undefined && state.endedAt !== undefined
          ? fmtElapsed(state.endedAt - state.startedAt)
          : undefined)
      );
    case 'failed':
      return state.statusReason;
    default:
      return undefined;
  }
}

/**
 * 源节点进度 0..1（边粒子速率 ∝ 进度，§4）。
 * 按类型估算：产物=版本数/5，操作=终端行数/48，对话=todo 完成比，Coordinator=子节点完成比。
 */
export function nodeProgress(state: NodeState): number {
  if (state.artifact.versions.length > 0) {
    return Math.min(1, state.artifact.versions.length / 5);
  }
  if (state.terminalLines.length > 0) {
    return Math.min(1, state.terminalLines.length / 48);
  }
  const todos = state.chat.todos;
  if (todos.length > 0) {
    return todos.filter((t) => t.status === 'done').length / todos.length;
  }
  if (state.startedAt !== undefined) {
    const end = state.endedAt ?? state.startedAt + 20000;
    return Math.min(0.95, Math.max(0.15, 1 - (end - state.startedAt) / 25000 + 0.55));
  }
  return 0.15;
}

/** 引擎时钟：事件时间轴毫秒，播放中按速度档随墙钟每秒前进（徽章耗时每秒刷新） */
export function useEngineClock(engineState: EngineState): number {
  const { timeMs, playing, speed } = engineState;
  const [tick, setTick] = useState<{ base: number; start: number; now: number } | null>(null);
  useEffect(() => {
    if (!playing) return;
    const base = timeMs;
    const start = Date.now();
    const t = setInterval(() => setTick({ base, start, now: Date.now() }), 1000);
    return () => clearInterval(t);
  }, [playing, speed, timeMs]);
  if (!playing || !tick || tick.base !== timeMs) return timeMs;
  return timeMs + Math.max(0, tick.now - tick.start) * speed;
}

/** L0 摘要卡 / hover 浮层的「最近一条事件摘要」（§3.2.1 飞行记录器模式） */
export function lastEventSummary(state: NodeState): string {
  if (state.terminalLines.length > 0) {
    const line = state.terminalLines[state.terminalLines.length - 1];
    return (line.kind === 'cmd' ? '$ ' : '') + line.text;
  }
  const items = state.chat.items;
  if (items.length > 0) {
    const last = items[items.length - 1];
    return last.type === 'message'
      ? last.message.text
      : `${last.toolCall.tool}(${last.toolCall.argsSummary})`;
  }
  if (state.artifact.versions.length > 0) {
    const v = state.artifact.versions[state.artifact.versions.length - 1];
    return `产物 v${v.v}${v.label ? ` · ${v.label}` : ''}`;
  }
  if (state.chat.approval) return `审批：${state.chat.approval.reason}`;
  return '暂无事件';
}

/** L0 飞行记录器快照文本：终端末 3 行 / 产物前 4 行 / 对话末条（§3.2.1） */
export function l0SnapshotText(state: NodeState): string {
  if (state.terminalLines.length > 0) {
    return state.terminalLines
      .slice(-3)
      .map((l) => (l.kind === 'cmd' ? '$ ' : '') + l.text)
      .join('\n');
  }
  if (state.artifact.versions.length > 0) {
    const v = state.artifact.versions[state.artifact.versions.length - 1];
    return v.content.split('\n').slice(0, 4).join('\n');
  }
  if (state.chat.items.length > 0) return lastEventSummary(state);
  return '等待事件…';
}

/** 终端回放时间轴关键事件刻度（命令执行、报错，§3.3.2） */
export function terminalKeyIndices(nodeId: string): number[] {
  const out: number[] = [];
  MOCK_EVENTS.forEach((ev, i) => {
    if (
      ev.kind === 'terminal-line' &&
      ev.nodeId === nodeId &&
      (ev.line.kind === 'cmd' || ev.line.kind === 'stderr')
    ) {
      out.push(i);
    }
  });
  return out;
}

/** 弱链接消息速率演示值（§4 数据面，等宽数字） */
export const MSG_RATE: Record<string, number> = {
  e4: 3,
  e5: 12,
  e6: 6,
  e7: 9,
};

/** minimap 节点色块（SVG fill attribute 不支持 var()，用与令牌一致的 hex） */
export const STATUS_HEX: Record<NodeStatus, string> = {
  queued: 'var(--st-queued)',
  running: 'var(--st-running)',
  waiting: 'var(--st-waiting)',
  completed: 'var(--st-completed)',
  failed: 'var(--st-failed)',
  skipped: 'var(--st-skipped)',
};

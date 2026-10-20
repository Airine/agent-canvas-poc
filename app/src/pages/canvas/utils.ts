/**
 * `/canvas` 适配层工具：耗时格式化 / 状态徽章后缀 / ansi 剥离 / 状态色 hex。
 * 数据源是契约 CanvasNode（WS 补丁），不是 mock 引擎快照。
 */
import { useEffect, useState } from 'react';
import type { CanvasNode, EdgeKind, NodeStatus } from './live-store';

/** 耗时：`42s` / `3m12s`，等宽数字（§1.2） */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

/** 状态徽章后缀（§3.1）：running=elapsed / waiting=reason / done=duration / failed=一行摘要 */
/**
 * 契约里的时间戳是 ISO 字符串（后端 toISOString），历史版本误当 number 用，
 * 直接做减法会得到 NaN（"NaNmNaNs"）。统一在此归一为 epoch ms。
 */
function toMs(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

export function statusDetailFor(node: CanvasNode, nowMs: number): string | undefined {
  const started = toMs(node.startedAt);
  const ended = toMs(node.endedAt);
  switch (node.status) {
    case 'running':
      return started === undefined ? undefined : fmtElapsed(nowMs - started);
    case 'waiting':
      return node.statusReason;
    case 'completed':
      return (
        node.statusReason ??
        (started !== undefined && ended !== undefined ? fmtElapsed(ended - started) : undefined)
      );
    case 'failed':
      return node.statusReason;
    default:
      return undefined;
  }
}

/** running 节点的每秒时钟（徽章耗时每秒刷新，等宽数字防跳动） */
export function useSecondClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** 剥离 ansi 转义序列（L0 静态快照 / 未订阅节点的静态末屏用） */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
}

/** ansi 全量快照 → 末 N 行纯文本 */
export function ansiTail(ansi: string | undefined, n: number): string {
  if (!ansi) return '';
  const lines = stripAnsi(ansi).split('\n').filter((l) => l.trim().length > 0);
  return lines.slice(-n).join('\n');
}

/** 边 hover 语义标签（§4：消解实线/虚线惯例分裂） */
export const EDGE_KIND_SEMANTIC: Record<EdgeKind, string> = {
  strong: '强依赖 · 事务',
  weak: '弱链接 · 通信',
  error: '错误路由',
  communication: 'Agent 通信 · 实际记录',
};

/** 节点 DOM 宽（§3.2：默认态固定 400px；Coordinator 320px，§3.3.4） */
export function nodeWidth(node: CanvasNode): number {
  return node.type === 'coordinator' ? 320 : 400;
}

/** minimap 节点色块（SVG fill attribute 不支持 var()，用与令牌一致的 hex） */
export const STATUS_HEX: Record<NodeStatus, string> = {
  queued: 'var(--st-queued)',
  running: 'var(--st-running)',
  waiting: 'var(--st-waiting)',
  completed: 'var(--st-completed)',
  failed: 'var(--st-failed)',
  skipped: 'var(--st-skipped)',
};

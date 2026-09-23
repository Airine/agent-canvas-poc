/**
 * FpsGate — 活窗降级抽帧门（design.md §3.2.2 活节点配额）
 * - fps2：500ms 抽一帧（2fps「心跳帧」模拟，定时器抽帧）
 * - 快照：冻结首帧，不再更新
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function FpsGate({ intervalMs, children }: { intervalMs: number; children: ReactNode }) {
  const [latched, setLatched] = useState(children);
  const ref = useRef(children);
  useEffect(() => {
    ref.current = children;
  });
  useEffect(() => {
    if (intervalMs <= 0) return; // 快照档：冻结首帧
    const t = setInterval(() => setLatched(ref.current), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return <>{latched}</>;
}

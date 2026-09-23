/**
 * 画布占位页 — `/react-flow` 与 `/tldraw`（实际画布由后续 agent 实现）
 * 居中提示 + 返回首页链接；复用设计令牌，保持深色画布底。
 */
import { Link } from 'react-router';
import { ArrowLeft, Diamond } from 'lucide-react';

export default function CanvasPlaceholder({ impl, dotColor }: { impl: string; dotColor: string }) {
  return (
    <div className="canvas-dots flex min-h-[100dvh] flex-col items-center justify-center text-text-primary">
      <div className="flex items-center gap-2 text-focus-title">
        <Diamond className="size-4 text-accent" fill="currentColor" />
        Agent Canvas · PoC
        <span className="flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-small text-text-secondary">
          <span className="size-1.5 rounded-pill" style={{ backgroundColor: dotColor }} />
          {impl}
        </span>
      </div>
      <p className="mt-4 text-body text-text-secondary">
        {impl} 画布实现即将接入 —— 共享层（设计令牌 / 事件流引擎 / 节点组件）已就绪
      </p>
      <Link
        to="/"
        className="mt-6 flex items-center gap-1.5 rounded-inner bg-surface-2 px-3 py-2 text-small text-text-secondary transition-colors duration-fast hover:bg-surface-3 hover:text-text-primary"
      >
        <ArrowLeft className="size-3.5" />
        返回首页
      </Link>
    </div>
  );
}

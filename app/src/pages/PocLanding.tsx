/**
 * 首页 `/` — PoC 对比落地页（design.md §5）
 *
 * 30 秒讲清 PoC 验证什么 + 双入口。单屏 + 一屏滚动，不做营销页。
 * 顶栏 64px / Hero（max-w 880px 居中）/ 决策点四卡（4→2→1 列）/
 * 双入口卡（480px ×2，间距 24px，视觉权重一致，内联 SVG 缩略示意）/ 页脚 40px。
 */
import { Link } from 'react-router';
import { ArrowRight, Diamond, ExternalLink, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ---------------- 决策点四卡（§5.3） ---------------- */

const DECISION_CARDS = [
  { no: '01', title: '三态展示', desc: '全局摘要 / 内嵌活窗 / 全屏专注，zoom 驱动的语义缩放' },
  { no: '02', title: '三类节点', desc: '产物 · 操作 · 对话，同一事件流三种投影' },
  { no: '03', title: '强弱双链', desc: '实线事务依赖、虚线通信面，运行态粒子可观测' },
  { no: '04', title: '事件溯源', desc: 'append-only 事件流，实时与回放同构' },
];

/* ---------------- 双入口（§5.4） ---------------- */

const ENTRIES = [
  {
    name: 'React Flow',
    path: '/react-flow',
    points: ['onlyRenderVisibleElements', 'Contextual Zoom LOD', 'nodrag 交互隔离'],
    solid: true,
    cta: '进入 React Flow 版',
  },
  {
    name: 'tldraw',
    path: '/tldraw',
    points: ['自定义 ShapeUtil', 'embed 单击选中/双击交互', 'getEfficientZoomLevel 防抖'],
    solid: false,
    cta: '进入 tldraw 版',
  },
];

/** 缩略示意（内联 SVG：圆角矩形节点 + 实线/虚线连线，设计令牌着色） */
function ThumbnailSvg({ variant }: { variant: 'react-flow' | 'tldraw' | 'canvas' }) {
  return (
    <svg
      viewBox="0 0 440 160"
      role="img"
      aria-label={
        variant === 'react-flow'
          ? 'React Flow 画布示意'
          : variant === 'tldraw'
            ? 'tldraw 画布示意'
            : '产品版画布示意'
      }
      className="h-40 w-full"
    >
      {/* 点阵底 */}
      <defs>
        <pattern id={`dots-${variant}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.75" fill="var(--canvas-grid)" />
        </pattern>
      </defs>
      <rect width="440" height="160" rx="6" fill="var(--canvas-bg)" />
      <rect width="440" height="160" rx="6" fill={`url(#dots-${variant})`} />
      {/* 连线：强链接实线 + 弱链接虚线（dash 6 6） */}
      <path d="M 118 52 C 150 52, 150 40, 182 40" fill="none" stroke="var(--edge-strong)" strokeWidth="2.5" />
      <path d="M 118 96 C 150 96, 150 116, 182 116" fill="none" stroke="var(--edge-strong)" strokeWidth="2.5" />
      <path
        d="M 258 44 C 290 44, 290 76, 322 80"
        fill="none"
        stroke="var(--edge-weak)"
        strokeWidth="1.5"
        strokeDasharray="6 6"
      />
      {/* Coordinator 节点（accent 1.5px 常亮描边） */}
      <rect x="30" y="52" width="88" height="44" rx="10" fill="var(--surface-1)" stroke="var(--nt-coord)" strokeWidth="1.5" />
      <circle cx="44" cy="68" r="4" fill="var(--nt-coord)" />
      <rect x="54" y="64" width="52" height="7" rx="3.5" fill="var(--surface-3)" />
      <rect x="54" y="76" width="34" height="5" rx="2.5" fill="var(--surface-2)" />
      {/* 子节点 A（running） */}
      <rect x="182" y="20" width="76" height="40" rx="10" fill="var(--surface-1)" stroke="var(--border-subtle)" />
      <circle cx="195" cy="34" r="4" fill="var(--nt-artifact)" />
      <rect x="205" y="30" width="42" height="7" rx="3.5" fill="var(--surface-3)" />
      <rect x="205" y="42" width="20" height="5" rx="2.5" fill="var(--st-running)" opacity="0.7" />
      {/* 子节点 B（waiting） */}
      <rect x="182" y="96" width="76" height="40" rx="10" fill="var(--surface-1)" stroke="var(--border-subtle)" />
      <circle cx="195" cy="110" r="4" fill="var(--nt-chat)" />
      <rect x="205" y="106" width="42" height="7" rx="3.5" fill="var(--surface-3)" />
      <rect x="205" y="118" width="20" height="5" rx="2.5" fill="var(--st-waiting)" opacity="0.7" />
      {/* 下游节点（completed） */}
      <rect x="322" y="60" width="88" height="44" rx="10" fill="var(--surface-1)" stroke="var(--border-subtle)" />
      <circle cx="336" cy="76" r="4" fill="var(--nt-operation)" />
      <rect x="346" y="72" width="52" height="7" rx="3.5" fill="var(--surface-3)" />
      <rect x="346" y="84" width="24" height="5" rx="2.5" fill="var(--st-completed)" opacity="0.7" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas-bg text-text-primary">
      {/* 顶栏 64px（§5.1.1） */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex items-center gap-2">
          <Diamond className="size-4 text-accent" fill="currentColor" />
          <span className="text-focus-title">Agent Canvas</span>
          <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-node-meta text-accent">PoC</span>
        </div>
        <nav className="flex items-center gap-5 text-body text-text-secondary">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            title="调研报告未随站点发布（本地文件）"
            className="flex items-center gap-1 transition-colors duration-fast hover:text-text-primary"
          >
            调研报告
            <ExternalLink className="size-3.5" />
          </a>
          <Link to="/react-flow" className="transition-colors duration-fast hover:text-text-primary">
            React Flow
          </Link>
          <span className="text-text-tertiary">/</span>
          <Link to="/tldraw" className="transition-colors duration-fast hover:text-text-primary">
            tldraw
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center px-6">
        {/* Hero（§5.1.2） */}
        <section className="flex w-full max-w-[880px] flex-col items-center pb-12 pt-16 text-center">
          <span className="rounded-pill bg-accent-soft px-3 py-1 text-small text-accent">
            设计验证原型 · 双实现对比
          </span>
          <h1 className="mt-5 text-hero">一个画布，看清 Agent 集群的工作现场</h1>
          <p className="mt-4 max-w-[640px] text-[15px] leading-6 text-text-secondary">
            无限画布 × 三态展示 × 三类节点。同一设计、同一 mock 事件流，React Flow 与 tldraw 双实现对照。
          </p>
        </section>

        {/* 决策点四卡（§5.1.3）：4→2→1 列，hover 上抬 2px */}
        <section className="grid w-full max-w-[1080px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DECISION_CARDS.map((card) => (
            <div
              key={card.no}
              className="rounded-node border border-border-subtle bg-surface-1 p-4 transition-transform duration-fast ease-out-expo hover:-translate-y-0.5"
            >
              <div className="tnum text-node-meta text-text-tertiary">{card.no}</div>
              <div className="mt-2 text-focus-title">{card.title}</div>
              <p className="mt-1.5 text-body text-text-secondary">{card.desc}</p>
            </div>
          ))}
        </section>

        {/* 双入口区（§5.1.4）：480px ×2，间距 24px，等高等宽、视觉权重一致，横→纵 */}
        <section className="flex w-full flex-col items-center justify-center gap-6 pt-12 lg:flex-row">
          {ENTRIES.map((entry) => (
            <div
              key={entry.name}
              className="flex w-full max-w-[480px] flex-1 flex-col rounded-node border border-border-subtle bg-surface-1 p-5 lg:basis-[480px] lg:grow-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-h2">{entry.name}</span>
                <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-node-meta text-text-tertiary">
                  {entry.solid ? '生态成熟' : '自由度高'}
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-inner border border-border-subtle">
                <ThumbnailSvg variant={entry.solid ? 'react-flow' : 'tldraw'} />
              </div>
              <ul className="mt-4 flex-1 space-y-1.5">
                {entry.points.map((point) => (
                  <li key={point} className="flex items-center gap-2 text-body text-text-secondary">
                    <span className="size-1 rounded-pill bg-accent" />
                    <span className="font-mono text-mono">{point}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={entry.solid ? 'default' : 'outline'}
                className={
                  entry.solid
                    ? 'mt-5 h-11 w-full bg-accent text-[14px] text-white hover:bg-accent/90'
                    : 'mt-5 h-11 w-full border-accent bg-transparent text-[14px] text-accent hover:bg-accent-soft hover:text-accent'
                }
              >
                <Link to={entry.path}>
                  {entry.cta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          ))}
        </section>

        {/* 产品版入口（/canvas）：同一 React Flow 蓝本接真实控制面，herdr 真实驱动 */}
        <section className="flex w-full justify-center pb-12">
          <div className="flex w-full max-w-[480px] flex-col rounded-node border border-accent/40 bg-surface-1 p-5 shadow-node">
            <div className="flex items-center justify-between">
              <span className="text-h2">产品版 /canvas</span>
              <span className="flex items-center gap-1.5 rounded-pill bg-accent-soft px-2 py-0.5 text-node-meta text-accent">
                <Radio className="size-3" />
                herdr 真实驱动
              </span>
            </div>
            <div className="mt-4 overflow-hidden rounded-inner border border-border-subtle">
              <ThumbnailSvg variant="canvas" />
            </div>
            <ul className="mt-4 flex-1 space-y-1.5">
              {['WebSocket 实时状态补丁', 'xterm.js 活窗终端（term.subscribe）', 'approval / takeover 可操作'].map(
                (point) => (
                  <li key={point} className="flex items-center gap-2 text-body text-text-secondary">
                    <span className="size-1 rounded-pill bg-accent" />
                    <span className="font-mono text-mono">{point}</span>
                  </li>
                ),
              )}
            </ul>
            <Button
              asChild
              className="mt-5 h-11 w-full bg-accent text-[14px] text-white hover:bg-accent/90"
            >
              <Link to="/canvas">
                进入产品版
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* 页脚 40px（§5.1.5） */}
      <footer className="flex h-10 shrink-0 items-center justify-center border-t border-border-subtle text-small text-text-tertiary">
        设计依据：Agent Canvas 可视化调研报告 · mock 数据驱动，无后端
      </footer>
    </div>
  );
}

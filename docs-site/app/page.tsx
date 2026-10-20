import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { ArrowDown, ArrowRight, Check, CircleDot, GitBranch, Layers3, ShieldCheck, Terminal, Workflow } from 'lucide-react';
import { baseOptions } from '@/lib/layout.shared';

const paths = [
  { number: '01', icon: Terminal, title: '先把项目跑起来', text: '配置本地运行时，创建工作区，再开始第一个真实 Pi 会话。', href: '/docs/getting-started', label: '本地开发' },
  { number: '02', icon: Workflow, title: '沿着一条消息读代码', text: '从画布输入到会话进程，顺着请求、事件和持久化找到实现。', href: '/docs/data-flow', label: '数据流' },
  { number: '03', icon: ShieldCheck, title: '带着证据做改动', text: '查看模块边界、Review 发现和代码体检，用哈希检查文档是否过期。', href: '/docs/review', label: '工程维护' },
];

function CanvasPreview() {
  return <div className="canvas-preview" aria-label="Agent Canvas 会话界面示意，非实时运行状态">
    <div className="preview-toolbar"><span className="preview-dots"><i /><i /><i /></span><span>workspace / agent-canvas</span><span className="preview-label">界面示意</span></div>
    <div className="preview-body">
      <div className="preview-sidebar"><Layers3 size={18} /><Workflow size={18} /><Terminal size={18} /></div>
      <div className="workspace-label"><span className="status-dot" /> LOCAL WORKSPACE <span>·</span> Pi runtime</div>
      <svg className="preview-edges" viewBox="0 0 600 350" aria-hidden="true"><path d="M220 155 C320 155 280 85 380 85" /><path d="M220 155 C320 155 280 270 380 270" /></svg>
      <div className="agent-card agent-main"><div className="agent-card-header"><span className="agent-icon"><Terminal size={15} /></span><strong>代码助手</strong><span className="state-badge">会话</span></div><div className="agent-message">从同一张画布，<br />进入每一段对话。</div><div className="tool-line"><Check size={13} /><span>会话记录与工具调用</span></div><div className="mock-composer">发送消息…<span>↵</span></div></div>
      <div className="agent-card agent-small agent-secondary"><div className="agent-card-header"><span className="agent-icon blue"><CircleDot size={15} /></span><strong>独立会话</strong></div><p>各自的上下文<br /><span>各自的运行状态</span></p></div>
      <div className="agent-card agent-small agent-approval"><div className="agent-card-header"><span className="agent-icon amber"><ShieldCheck size={15} /></span><strong>工具审批</strong></div><p>在执行前，<br /><span>确认具体操作。</span></p></div>
      <span className="preview-bottom">画布组织关系 ≠ 自动任务调度</span><div className="preview-zoom">− <span>100%</span> ＋</div>
    </div>
  </div>;
}

export default function Home() {
  return <HomeLayout {...baseOptions()}>
    <main className="landing">
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span /> AGENT CANVAS / ENGINEERING DOCS</div><h1>把 Agent 放上画布，<br /><span>把实现看清楚。</span></h1><p className="hero-description">一个本地多 Agent 会话工作台。<br />从真实 Pi 会话到画布交互，这里记录代码如何工作，<br className="desktop-break" />也说明它现在还做不到什么。</p><div className="hero-actions"><Link className="primary-link" href="/docs/getting-started">开始阅读 <ArrowRight size={17} /></Link><a className="secondary-link" href="/architecture.html">探索架构地图 <GitBranch size={16} /></a></div><div className="hero-footnote"><span className="status-dot" /> 本地运行 <span>/</span> 代码可追溯 <span>/</span> 文档可校验</div></div>
        <CanvasPreview />
      </section>
      <div className="stack-strip"><span>BUILT WITH</span><strong>React 19</strong><span className="stack-cross">+</span><strong>React Flow</strong><span className="stack-cross">+</span><strong>Hono</strong><span className="stack-cross">+</span><strong>Pi runtime</strong><Link href="/docs/system">系统总览 <ArrowRight size={14} /></Link></div>
      <section className="reading-section"><div className="section-heading"><div><span className="eyebrow">FIND YOUR STARTING POINT</span><h2>从你要做的事开始。</h2></div><p>初次运行、理解设计，或准备改代码。</p></div><div className="reading-grid">{paths.map(({ number, icon: Icon, title, text, href, label }) => <Link href={href} className="reading-card" key={number}><div className="reading-card-top"><Icon size={21} /><span>{number}</span></div><h3>{title}</h3><p>{text}</p><div className="reading-card-link">{label}<ArrowRight size={16} /></div></Link>)}</div></section>
      <section className="boundary-section"><div><span className="eyebrow">KNOW THE BOUNDARY</span><h2>连起来，不代表自动执行。</h2><p>当前主线是 e / Pi 本地会话工作台。节点对应真实会话，Zone 和连线帮助组织视图。herdr 编排保留为兼容路径，不与主线能力混写。</p><Link href="/docs/system">了解当前能力边界 <ArrowRight size={16} /></Link></div><div className="boundary-list"><span><Check size={16} /> 结构化聊天与独立会话</span><span><Check size={16} /> 工具审批与原生会话恢复</span><span className="not-yet"><ArrowDown size={16} /> 自动 DAG 调度与 Git 合并不属于 e MVP</span></div></section>
      <footer className="landing-footer"><span>Agent Canvas <span className="muted">/ 以代码为准</span></span><div><Link href="/docs/maintenance">文档维护</Link><Link href="/docs/health">代码体检</Link><span className="muted">Powered by Fumadocs</span></div></footer>
    </main>
  </HomeLayout>;
}

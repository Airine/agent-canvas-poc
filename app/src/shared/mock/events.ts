/**
 * Mock agent 事件流脚本（design.md §2.3 拓扑 + §8.7 硬要求）
 *
 * 拓扑（6 节点 + 1 Coordinator）：
 *                    ┌─[Artifact] 产物·landing page──┐
 * [Coordinator] ─强──┤─[Operation] 终端·env setup     ├─ 弱(产物引用) ─→ [Artifact] 汇总报告
 *        │           └─[Chat] 通用·需求分析 ──────────┘
 *        └──弱(通信)──→ [Chat] 调研员（waiting 态演示）
 *
 * 脚本覆盖（§8.7）：
 *  - ≥2 个 running 并发（n-artifact / n-op / n-chat-a 同时运行）
 *  - 1 次 approval 中断（n-chat-r 访问外部站点 → waiting → 批准后继续）
 *  - 1 次 failed（n-op 构建失败，下游边转错误路由）
 *  - 1 个 skipped 分支（n-report 因上游失败被跳过；skipped ≠ 未到达）
 *  - 产物 5 个版本（v4 为命名里程碑「配色定稿」）
 *  - 终端 ≥40 行输出
 */
import type {
  AgentEvent,
  CanvasEdgeDef,
  CanvasNodeDef,
  TerminalLine,
} from '../types';

/* ---------------- 节点与边定义（供两个画布适配层共用） ---------------- */

export const MOCK_NODES: CanvasNodeDef[] = [
  {
    id: 'coord',
    kind: 'coordinator',
    title: 'Coordinator · 主编排',
    windowTitle: 'coordinator · main',
    identity: { harness: 'orchestrator', env: 'prod-mock', agentId: 'coord-01', model: 'claude-opus-4' },
    width: 320,
    position: { x: 0, y: 220 },
  },
  {
    id: 'n-artifact',
    kind: 'artifact',
    title: '产物 · landing page',
    windowTitle: 'artifact · landing.html',
    identity: { harness: 'claude-code', env: 'sandbox-01', agentId: 'builder-01', model: 'claude-sonnet-4' },
    width: 400,
    position: { x: 480, y: 0 },
  },
  {
    id: 'n-op',
    kind: 'operation',
    title: '终端 · env setup',
    windowTitle: 'terminal · sandbox-01',
    identity: { harness: 'claude-code', env: 'sandbox-01', agentId: 'ops-01', model: 'claude-sonnet-4' },
    width: 400,
    position: { x: 480, y: 400 },
  },
  {
    id: 'n-chat-a',
    kind: 'chat',
    title: '通用 · 需求分析',
    windowTitle: 'chat · analyst-01',
    identity: { harness: 'claude-code', env: 'sandbox-02', agentId: 'analyst-01', model: 'claude-sonnet-4' },
    width: 400,
    position: { x: 480, y: 800 },
  },
  {
    id: 'n-chat-r',
    kind: 'chat',
    title: '调研员',
    windowTitle: 'chat · researcher-02',
    identity: { harness: 'claude-code', env: 'sandbox-03', agentId: 'researcher-02', model: 'claude-sonnet-4' },
    width: 400,
    position: { x: 0, y: 680 },
  },
  {
    id: 'n-report',
    kind: 'artifact',
    title: '产物 · 汇总报告',
    windowTitle: 'artifact · report.md',
    identity: { harness: 'claude-code', env: 'sandbox-01', agentId: 'writer-01', model: 'claude-sonnet-4' },
    width: 400,
    position: { x: 1040, y: 400 },
  },
];

export const MOCK_EDGES: CanvasEdgeDef[] = [
  { id: 'e1', source: 'coord', target: 'n-artifact', kind: 'strong', semantic: '强依赖 · 事务' },
  { id: 'e2', source: 'coord', target: 'n-op', kind: 'strong', semantic: '强依赖 · 事务' },
  { id: 'e3', source: 'coord', target: 'n-chat-a', kind: 'strong', semantic: '强依赖 · 事务' },
  { id: 'e4', source: 'n-artifact', target: 'n-report', kind: 'weak', semantic: '产物引用 · artifact v3 →' },
  { id: 'e5', source: 'n-op', target: 'n-report', kind: 'weak', semantic: '弱链接 · 通信' },
  { id: 'e6', source: 'n-chat-a', target: 'n-report', kind: 'weak', semantic: '弱链接 · 产物' },
  { id: 'e7', source: 'coord', target: 'n-chat-r', kind: 'weak', semantic: '弱链接 · 通信' },
];

/* ---------------- 终端输出（n-op，≥40 行） ---------------- */

const OP_LINES: Array<[number, TerminalLine]> = [
  [900, { kind: 'cmd', text: 'npm install vite react react-dom' }],
  [1200, { kind: 'stdout', text: '➜  resolving packages…' }],
  [1500, { kind: 'stdout', text: '➜  fetching vite@7.2.4' }],
  [1800, { kind: 'stdout', text: '➜  fetching react@19.2.0' }],
  [2100, { kind: 'stdout', text: '➜  added 42 packages in 3.2s' }],
  [2400, { kind: 'success', text: '✓ dependencies installed' }],
  [2700, { kind: 'cmd', text: 'cat package.json | jq .name' }],
  [2900, { kind: 'stdout', text: '"landing-preview"' }],
  [3100, { kind: 'cmd', text: 'npm run dev -- --port 5173' }],
  [3400, { kind: 'stdout', text: '  VITE v7.2.4  ready in 218 ms' }],
  [3600, { kind: 'stdout', text: '  ➜  Local:   http://localhost:5173/' }],
  [3800, { kind: 'stdout', text: '  ➜  Network: http://10.8.0.12:5173/' }],
  [4200, { kind: 'cmd', text: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/' }],
  [4500, { kind: 'stdout', text: '200' }],
  [4800, { kind: 'success', text: '✓ dev server healthy' }],
  [5200, { kind: 'cmd', text: 'npx tsc --noEmit' }],
  [5600, { kind: 'stdout', text: "src/Hero.tsx(12,7): warning TS6133: 'cx' is declared but never used." }],
  [6000, { kind: 'cmd', text: 'npm run lint' }],
  [6400, { kind: 'stdout', text: '  6 problems (0 errors, 6 warnings)' }],
  [6800, { kind: 'success', text: '✓ lint passed (warnings only)' }],
  [7200, { kind: 'cmd', text: 'npm run test -- --run' }],
  [7600, { kind: 'stdout', text: ' ✓ src/App.test.tsx (3 tests) 41ms' }],
  [7900, { kind: 'stdout', text: ' ✓ src/Hero.test.tsx (2 tests) 28ms' }],
  [8200, { kind: 'stdout', text: ' Test Files  2 passed (2)' }],
  [8500, { kind: 'success', text: '✓ 5 tests passed' }],
  [9000, { kind: 'cmd', text: 'npm run build' }],
  [9400, { kind: 'stdout', text: 'vite v7.2.4 building for production…' }],
  [9800, { kind: 'stdout', text: 'transforming… 128 modules' }],
  [10200, { kind: 'stdout', text: 'rendering chunks…' }],
  [10600, { kind: 'stdout', text: 'dist/index.html                   0.46 kB │ gzip:  0.30 kB' }],
  [11000, { kind: 'stdout', text: 'dist/assets/index-Bx2kL9.css     18.22 kB │ gzip:  4.01 kB' }],
  [11400, { kind: 'stdout', text: 'dist/assets/index-Qw81Mz.js     142.87 kB │ gzip: 46.12 kB' }],
  [11800, { kind: 'success', text: '✓ built in 2.41s' }],
  [12400, { kind: 'cmd', text: 'npm run preview -- --port 4173 &' }],
  [12800, { kind: 'stdout', text: '  ➜  Local:   http://localhost:4173/' }],
  [13200, { kind: 'cmd', text: 'node scripts/smoke.mjs' }],
  [13600, { kind: 'stdout', text: 'smoke: GET / → 200 (142ms)' }],
  [14000, { kind: 'stdout', text: 'smoke: GET /assets/index-Qw81Mz.js → 200' }],
  [14400, { kind: 'stdout', text: 'smoke: checking hero heading…' }],
  [15000, { kind: 'cmd', text: 'node scripts/screenshot.mjs --out hero.png' }],
  [15600, { kind: 'stdout', text: 'launching headless chromium…' }],
  [16200, { kind: 'stderr', text: "Error: EACCES: permission denied, mkdir '/var/www/shots'" }],
  [16600, { kind: 'stderr', text: '    at Object.mkdirSync (node:fs:1398:3)' }],
  [17000, { kind: 'stderr', text: '    at capture (scripts/screenshot.mjs:21:9)' }],
  [17400, { kind: 'cmd', text: 'sudo mkdir -p /var/www/shots' }],
  [17800, { kind: 'stderr', text: 'sudo: a password is required' }],
  [18200, { kind: 'stderr', text: 'Error: command failed with exit code 1' }],
  [18600, { kind: 'stderr', text: '✗ screenshot pipeline failed — 无法写入快照目录' }],
];

/* ---------------- 产物版本（n-artifact，5 个版本） ---------------- */

const V1 = `<section class="hero">
  <h1>Landing Page</h1>
  <p>draft v1 — 骨架</p>
</section>`;

const V2 = `<section class="hero">
  <h1>Agent Canvas</h1>
  <p>看清 Agent 集群的工作现场</p>
  <button>开始使用</button>
</section>
<!-- v2: 文案定稿 -->`;

const V3 = `<section class="hero grid-2">
  <div>
    <h1>Agent Canvas</h1>
    <p>无限画布 × 三态展示 × 三类节点</p>
    <button>开始使用</button>
  </div>
  <canvas id="demo"></canvas>
</section>
<!-- v3: 双栏布局 + demo 画布 -->`;

const V4 = `<section class="hero grid-2 theme-dark">
  <div>
    <h1>Agent Canvas</h1>
    <p>无限画布 × 三态展示 × 三类节点</p>
    <button class="accent">开始使用</button>
  </div>
  <canvas id="demo"></canvas>
</section>
<style>:root{ --accent:#7C6BF5; --bg:#0B0D12; }</style>
<!-- v4 · 配色定稿 -->`;

const V5 = `<section class="hero grid-2 theme-dark">
  <div>
    <h1>Agent Canvas</h1>
    <p>无限画布 × 三态展示 × 三类节点</p>
    <button class="accent">开始使用</button>
    <small>React Flow / tldraw 双实现</small>
  </div>
  <canvas id="demo"></canvas>
</section>
<style>:root{ --accent:#7C6BF5; --bg:#0B0D12; }</style>
<script src="/demo.js" defer></script>
<!-- v5: 终版，挂载 demo 脚本 -->`;

/* ---------------- 事件脚本 ---------------- */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Raw = DistributiveOmit<AgentEvent, 'id'>;

const raw: Raw[] = [
  /* —— 启动：Coordinator + 三个强依赖子节点并发 running（≥2 并发 ✓） —— */
  { t: 0, kind: 'node-status', nodeId: 'coord', status: 'running' },
  { t: 300, kind: 'node-status', nodeId: 'n-op', status: 'running' },
  { t: 400, kind: 'node-status', nodeId: 'n-artifact', status: 'running' },
  { t: 500, kind: 'node-status', nodeId: 'n-chat-a', status: 'running' },

  /* —— n-chat-a：需求分析（todo 吸附 + tool call 折叠） —— */
  { t: 700, kind: 'chat-todos', nodeId: 'n-chat-a', todos: [
    { id: 'a1', text: '收集需求资料', status: 'current' },
    { id: 'a2', text: '对比竞品方案', status: 'pending' },
    { id: 'a3', text: '撰写分析结论', status: 'pending' },
  ] },
  { t: 1000, kind: 'chat-message', nodeId: 'n-chat-a', message: { id: 'am1', role: 'assistant', text: '开始需求分析：先检索 agent canvas 品类的公开资料。' } },
  { t: 1300, kind: 'chat-toolcall', nodeId: 'n-chat-a', toolCall: { id: 'at1', tool: 'search_web', argsSummary: '"agent canvas"', status: 'done', duration: '1.2s', detail: { type: 'search', results: ['ComfyUI — 节点式 Stable Diffusion 画布', 'Unreal Blueprint — 可视化脚本', 'n8n — 工作流自动化'] } } },
  /* —— n-op 终端行在 0.9s–18.6s 持续输出（见 OP_LINES 注入） —— */
  { t: 2000, kind: 'chat-toolcall', nodeId: 'n-chat-a', toolCall: { id: 'at2', tool: 'search_web', argsSummary: '"node-based UI orchestration"', status: 'done', duration: '0.9s', detail: { type: 'search', results: ['LangGraph Studio', 'Flowise', 'Dify 工作流'] } } },
  { t: 2600, kind: 'chat-toolcall', nodeId: 'n-chat-a', toolCall: { id: 'at3', tool: 'search_web', argsSummary: '"multi-agent observability"', status: 'done', duration: '1.1s', detail: { type: 'search', results: ['LangSmith traces', 'OpenTelemetry GenAI conventions'] } } },
  /* —— n-artifact：产物 v1 + 流式增量 —— */
  { t: 3200, kind: 'artifact-version', nodeId: 'n-artifact', version: { v: 1, content: V1 } },
  { t: 3400, kind: 'artifact-delta', nodeId: 'n-artifact', text: '\n<!-- stream: 建立文档骨架 -->' },
  { t: 3900, kind: 'artifact-delta', nodeId: 'n-artifact', text: '\n<meta name="viewport" content="width=device-width">' },
  /* 连续 >3 条同类工具调用 → 前端自动折叠演示 */
  { t: 4200, kind: 'chat-toolcall', nodeId: 'n-chat-a', toolCall: { id: 'at4', tool: 'search_web', argsSummary: '"agent workflow canvas 2025"', status: 'done', duration: '1.0s', detail: { type: 'search', results: ['Agent Canvas 调研报告（内部）'] } } },
  { t: 4700, kind: 'chat-todos', nodeId: 'n-chat-a', todos: [
    { id: 'a1', text: '收集需求资料', status: 'done' },
    { id: 'a2', text: '对比竞品方案', status: 'current' },
    { id: 'a3', text: '撰写分析结论', status: 'pending' },
  ] },
  { t: 5000, kind: 'chat-message', nodeId: 'n-chat-a', message: { id: 'am2', role: 'assistant', text: '资料收集完毕。共检索 4 轮，接下来对比三类节点式产品的交互范式。' } },

  /* —— n-chat-r：调研员启动（弱链接·通信） —— */
  { t: 5400, kind: 'node-status', nodeId: 'n-chat-r', status: 'running' },
  { t: 5600, kind: 'chat-todos', nodeId: 'n-chat-r', todos: [
    { id: 'r1', text: '收集资料', status: 'current' },
    { id: 'r2', text: '对比方案', status: 'pending' },
    { id: 'r3', text: '撰写摘要', status: 'pending' },
  ] },
  { t: 6000, kind: 'chat-message', nodeId: 'n-chat-r', message: { id: 'rm1', role: 'assistant', text: '收到 Coordinator 委派：调研画布类工具的 LOD 策略。' } },
  { t: 6400, kind: 'chat-toolcall', nodeId: 'n-chat-r', toolCall: { id: 'rt1', tool: 'search_web', argsSummary: '"canvas LOD zoom threshold"', status: 'done', duration: '1.4s', detail: { type: 'search', results: ['tldraw getEfficientZoomLevel', 'React Flow onlyRenderVisibleElements'] } } },

  /* —— n-artifact：v2 / v3 —— */
  { t: 7000, kind: 'artifact-version', nodeId: 'n-artifact', version: { v: 2, content: V2 } },
  { t: 7300, kind: 'artifact-delta', nodeId: 'n-artifact', text: '\n<!-- stream: hero 文案替换 -->' },
  { t: 8600, kind: 'chat-toolcall', nodeId: 'n-chat-a', toolCall: { id: 'at5', tool: 'read_page', argsSummary: 'https://reactflow.dev', status: 'failed', duration: '2.0s', detail: { type: 'bash', command: 'read_page https://reactflow.dev', output: 'HTTP 403 — 站点拒绝抓取' } } },
  { t: 9200, kind: 'chat-message', nodeId: 'n-chat-a', message: { id: 'am3', role: 'assistant', text: 'reactflow.dev 抓取失败（403），改用本地调研报告作为对照来源。' } },
  { t: 9800, kind: 'artifact-version', nodeId: 'n-artifact', version: { v: 3, content: V3 } },
  { t: 10100, kind: 'artifact-delta', nodeId: 'n-artifact', text: '\n<!-- stream: 插入双栏栅格 -->' },
  { t: 10800, kind: 'chat-toolcall', nodeId: 'n-chat-a', toolCall: { id: 'at6', tool: 'edit', argsSummary: 'analysis.md', status: 'done', duration: '0.6s', detail: { type: 'edit', diff: { added: ['+ React Flow：声明式节点/边，生态成熟', '+ tldraw：ShapeUtil 自由度更高，嵌入原生'], removed: ['- 待补：两个画布引擎对比'] } } } },

  /* —— n-artifact：v4 命名里程碑「配色定稿」 —— */
  { t: 12000, kind: 'artifact-version', nodeId: 'n-artifact', version: { v: 4, label: '配色定稿', content: V4 } },
  { t: 12300, kind: 'artifact-delta', nodeId: 'n-artifact', text: '\n<!-- stream: 注入 design tokens -->' },

  /* —— n-chat-r：approval 中断 → waiting —— */
  { t: 13000, kind: 'chat-toolcall', nodeId: 'n-chat-r', toolCall: { id: 'rt2', tool: 'read_page', argsSummary: 'https://x.com/agentcanvas', status: 'running', detail: { type: 'bash', command: 'read_page https://x.com/agentcanvas', output: '（等待批准，未执行）' } } },
  { t: 13200, kind: 'approval-request', nodeId: 'n-chat-r', reason: '将访问外部站点 x.com' },
  { t: 13201, kind: 'node-status', nodeId: 'n-chat-r', status: 'waiting', reason: 'approval' },

  /* —— n-chat-a：完成 —— */
  { t: 14500, kind: 'chat-todos', nodeId: 'n-chat-a', todos: [
    { id: 'a1', text: '收集需求资料', status: 'done' },
    { id: 'a2', text: '对比竞品方案', status: 'done' },
    { id: 'a3', text: '撰写分析结论', status: 'current' },
  ] },
  { t: 15200, kind: 'chat-message', nodeId: 'n-chat-a', message: { id: 'am4', role: 'assistant', text: '已完成两轮调研，结论是：三态展示与强弱双链是差异化核心，建议按报告 §2/§6 落地。' } },
  { t: 15800, kind: 'chat-todos', nodeId: 'n-chat-a', todos: [
    { id: 'a1', text: '收集需求资料', status: 'done' },
    { id: 'a2', text: '对比竞品方案', status: 'done' },
    { id: 'a3', text: '撰写分析结论', status: 'done' },
  ] },
  { t: 16000, kind: 'node-status', nodeId: 'n-chat-a', status: 'completed', reason: '14s' },

  /* —— n-artifact：v5 终版，完成 —— */
  { t: 16800, kind: 'artifact-version', nodeId: 'n-artifact', version: { v: 5, content: V5 } },
  { t: 17100, kind: 'artifact-delta', nodeId: 'n-artifact', text: '\n<!-- stream: 挂载 demo.js -->' },
  { t: 18000, kind: 'node-status', nodeId: 'n-artifact', status: 'completed', reason: '17s' },

  /* —— n-op：截图流水线失败 → failed；下游边转错误路由；n-report skipped —— */
  { t: 19000, kind: 'node-status', nodeId: 'n-op', status: 'failed', reason: 'EACCES 无法写入快照目录' },
  { t: 19100, kind: 'edge-status', edgeId: 'e5', edgeKind: 'error' },
  { t: 19200, kind: 'node-status', nodeId: 'n-report', status: 'skipped', reason: '上游 env setup 失败' },

  /* —— n-chat-r：批准 → 恢复 running → 完成 —— */
  { t: 22000, kind: 'approval-resolve', nodeId: 'n-chat-r', decision: 'approved' },
  { t: 22100, kind: 'node-status', nodeId: 'n-chat-r', status: 'running' },
  { t: 22600, kind: 'chat-todos', nodeId: 'n-chat-r', todos: [
    { id: 'r1', text: '收集资料', status: 'done' },
    { id: 'r2', text: '对比方案', status: 'current' },
    { id: 'r3', text: '撰写摘要', status: 'pending' },
  ] },
  { t: 23200, kind: 'chat-message', nodeId: 'n-chat-r', message: { id: 'rm2', role: 'assistant', text: '已获批准。外部站点内容确认：LOD 按屏幕像素切换是主流做法。' } },
  { t: 24000, kind: 'chat-toolcall', nodeId: 'n-chat-r', toolCall: { id: 'rt3', tool: 'edit', argsSummary: 'summary.md', status: 'done', duration: '0.5s', detail: { type: 'edit', diff: { added: ['+ 摘要：zoom 阈值按节点屏幕像素宽，而非绝对 zoom 值'], removed: [] } } } },
  { t: 24800, kind: 'chat-todos', nodeId: 'n-chat-r', todos: [
    { id: 'r1', text: '收集资料', status: 'done' },
    { id: 'r2', text: '对比方案', status: 'done' },
    { id: 'r3', text: '撰写摘要', status: 'done' },
  ] },
  { t: 25400, kind: 'chat-message', nodeId: 'n-chat-r', message: { id: 'rm3', role: 'assistant', text: '调研完成：摘要已回传 Coordinator。' } },
  { t: 26000, kind: 'node-status', nodeId: 'n-chat-r', status: 'completed', reason: '20s' },

  /* —— 收尾 —— */
  { t: 27000, kind: 'node-status', nodeId: 'coord', status: 'completed', reason: '27s' },
];

/* 注入 n-op 终端行（48 行，满足 ≥40 行硬要求），保持按时间轴有序 */
const withTerminal: Raw[] = [
  ...raw,
  ...OP_LINES.map(([t, line]): Raw => ({ t, kind: 'terminal-line', nodeId: 'n-op', line })),
].sort((a, b) => a.t - b.t);

/** append-only 事件流：id 即下标，序号单调递增 */
export const MOCK_EVENTS: AgentEvent[] = withTerminal.map((e, i) => ({ ...e, id: i }));

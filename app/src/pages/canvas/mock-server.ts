/**
 * mock-server — 浏览器内最小控制面（仅在后端不在场时自证渲染链路）
 *
 * 严格按 api-contract.md 实现同一组消息与语义：
 * - client→server：hello / term.subscribe / term.unsubscribe
 * - server→client：graph / node / edge / term（2Hz 全量 ansi 快照）/ event
 * - REST 等价物：graph/run、graph/reset、scoped /workspaces/:wid/nodes/:nid/{approval,input,events}
 *   （旧 /nodes/:id/* 端点保留为 active-workspace 别名，同一正则解析）
 * - 编排脚本 = 契约 §5：n-env →（并行）n-data（中途 blocked 等 approval）/ n-report（exit 1
 *   → failed，错误路由边到 n-fail）；n-chat 弱链接消费 n-data；runState idle→running→done。
 *
 * 它与真实后端的唯一区别是传输：直接函数回调而非 WebSocket/fetch。
 */
import type {
  BackendApi,
  CanvasEdge,
  CanvasNode,
  CanvasZone,
  ClientMessage,
  Graph,
  NodeEvent,
  ServerMessage,
  WorkspaceSummary,
} from './contracts';

type Emit = (msg: ServerMessage) => void;

/* ansi 颜色（验证 xterm 真彩链路） */
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

interface NodeScript {
  /** 开跑后逐行推出的 [延迟ms, 行文本] */
  lines: [number, string][];
}

function initialZones(): CanvasZone[] {
  return [
    { id: 'z-orch', title: '编排' },
    { id: 'z-pipeline', title: '数据管线' },
    { id: 'z-output', title: '产出与兜底' },
  ];
}

function initialNodes(): CanvasNode[] {
  return [
    {
      id: 'n-coord', type: 'coordinator', title: 'Coordinator · 主编排', status: 'queued',
      harness: 'herdr-coordinator', env: 'herdr-local', agentId: 'ag-coord-00',
      x: 0, y: 240, zoneId: 'z-orch',
    },
    {
      id: 'n-env', type: 'operation', title: '环境初始化', status: 'queued',
      harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-env-01',
      x: 480, y: 0, paneId: 'pane-env', zoneId: 'z-pipeline',
      command: 'bash scripts/agents/env.sh',
    },
    {
      id: 'n-data', type: 'operation', title: '数据处理', status: 'queued',
      harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-data-02',
      x: 480, y: 360, paneId: 'pane-data', zoneId: 'z-pipeline',
      command: 'bash scripts/agents/data.sh',
    },
    {
      id: 'n-report', type: 'operation', title: '报告生成', status: 'queued',
      harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-report-03',
      x: 480, y: 720, paneId: 'pane-report', zoneId: 'z-output',
      command: 'bash scripts/agents/report.sh',
    },
    {
      id: 'n-fail', type: 'operation', title: '失败兜底 · 告警', status: 'queued',
      harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-fail-04',
      x: 960, y: 720, paneId: 'pane-fail', zoneId: 'z-output',
      command: 'bash scripts/agents/failover.sh',
    },
    {
      id: 'n-chat', type: 'chat', title: '分析汇报', status: 'queued',
      harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-chat-05',
      x: 960, y: 360, paneId: 'pane-chat', zoneId: 'z-output',
      command: 'bash scripts/agents/chat.sh',
    },
  ];
}

function initialEdges(): CanvasEdge[] {
  return [
    { id: 'e1', source: 'n-coord', target: 'n-env', kind: 'strong' },
    { id: 'e2', source: 'n-env', target: 'n-data', kind: 'strong' },
    { id: 'e3', source: 'n-env', target: 'n-report', kind: 'strong' },
    { id: 'e4', source: 'n-coord', target: 'n-env', kind: 'weak', label: '12 msg/min' },
    { id: 'e5', source: 'n-report', target: 'n-fail', kind: 'strong' },
    { id: 'e6', source: 'n-data', target: 'n-chat', kind: 'weak', label: '8 msg/min' },
  ];
}

const SCRIPTS: Record<string, NodeScript> = {
  'n-env': {
    lines: [
      [200, `${C.cyan}$ bash scripts/agents/env.sh${C.reset}`],
      [500, '创建 herdr session: canvas-demo'],
      [400, `${C.dim}pane pane-env ready (bash)${C.reset}`],
      [600, '安装依赖 … ok (1.8s)'],
      [500, '校验环境变量 HERDR_SOCKET_PATH … ok'],
      [700, `${C.green}✓ 环境初始化完成${C.reset}`],
    ],
  },
  'n-data': {
    lines: [
      [200, `${C.cyan}$ bash scripts/agents/data.sh${C.reset}`],
      [500, '读取输入 /data/raw … 12,480 行'],
      [600, '清洗与归一化 … 38%'],
      [600, '清洗与归一化 … 76%'],
      [500, `${C.yellow}report blocked: 写入 /data/prod 需要批准${C.reset}`],
      // —— 此处进入 waiting，等 approval；批准后续跑 ——
      [300, `${C.green}✓ 审批通过，继续执行${C.reset}`],
      [500, '写入 /data/prod … 12,480 行'],
      [600, `${C.green}✓ 数据处理完成${C.reset}`],
    ],
  },
  'n-report': {
    lines: [
      [200, `${C.cyan}$ bash scripts/agents/report.sh${C.reset}`],
      [500, '加载模板 report.hbs'],
      [600, '渲染图表 (1/3) …'],
      [500, `${C.red}Error: 模板变量 summary 缺失${C.reset}`],
      [400, `${C.red}exit 1${C.reset}`],
    ],
  },
  'n-fail': {
    lines: [
      [200, `${C.cyan}$ bash scripts/agents/failover.sh${C.reset}`],
      [400, '捕获上游失败：n-report (exit 1)'],
      [500, `${C.yellow}发送告警 → #canvas-ops${C.reset}`],
      [400, `${C.green}✓ 兜底流程完成${C.reset}`],
    ],
  },
  'n-chat': {
    lines: [
      [200, `${C.cyan}$ bash scripts/agents/chat.sh${C.reset}`],
      [500, 'assistant: 已接入数据面，等待 n-data 产物…'],
      [700, 'assistant: 数据质量初检通过，开始汇总'],
      // —— n-data 完成后续跑 ——
      [400, 'assistant: 汇总完成：12,480 行，3 个异常已标记'],
      [500, `${C.green}✓ 分析汇报完成${C.reset}`],
    ],
  },
};

export class MockBackend {
  readonly api: BackendApi;
  private emit: Emit;
  /** hello/reset 时使用的种子图（ws-demo 为可运行动态图，其余 workspace 为静态快照） */
  private readonly baseGraph: Graph;
  private nodes = new Map<string, CanvasNode>();
  private edges = new Map<string, CanvasEdge>();
  private zones = new Map<string, CanvasZone>();
  private runState: 'idle' | 'running' | 'done' = 'idle';
  private events: NodeEvent[] = [];
  private nextEventId = 1;
  /** 每节点终端行缓冲（全量快照 = join 后整屏重发） */
  private screen = new Map<string, string[]>();
  private termSubs = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private termTimer: ReturnType<typeof setInterval> | null = null;
  private approved: 'approve' | 'reject' | null = null;
  /** 终端输入行缓冲（模拟 shell）：nodeId → 未提交草稿；draftActive = 屏幕末行为编辑行 */
  private drafts = new Map<string, string>();
  private draftActive = new Set<string>();

  constructor(emit: Emit, workspaceId?: string) {
    this.emit = emit;
    this.baseGraph = graphForWorkspace(workspaceId);
    this.resetState();
    this.api = {
      send: (msg) => this.onClientMessage(msg),
      post: (path, body) => this.onPost(path, body),
      getNodeEvents: async (nodeId) => this.events.filter((e) => e.nodeId === nodeId),
      dispose: () => {
        this.clearTimers();
        if (this.termTimer !== null) clearInterval(this.termTimer);
      },
    };
    // 2Hz 终端快照（契约 §3：只推给订阅者）
    this.termTimer = setInterval(() => this.pushTermSnapshots(), 500);
  }

  /* ---------------- 连接层 ---------------- */

  private onClientMessage(msg: ClientMessage): void {
    if (msg.type === 'hello') this.pushGraph();
    else if (msg.type === 'term.subscribe') {
      this.termSubs.add(msg.nodeId);
      this.pushTerm(msg.nodeId); // 立即一帧，避免等 500ms
    } else if (msg.type === 'term.unsubscribe') {
      this.termSubs.delete(msg.nodeId);
    }
  }

  private onPost(path: string, body?: unknown): Promise<{ ok: boolean }> {
    if (path === '/graph/run') this.startRun();
    else if (path === '/graph/reset') this.doReset();
    else {
      /*
       * scoped 端点（契约 v1）：/workspaces/:wid/nodes/:nid/<action>；
       * 旧端点 /nodes/:nid/<action> 保留为 active-workspace 别名 —— 统一正则解析。
       */
      const m = /\/nodes\/([^/]+)\/(input|approval)$/.exec(path);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (m[2] === 'approval') {
          const raw = (body as { decision: string }).decision;
          // 契约 v1 词表 approved/rejected/edited（兼容旧 approve/reject）
          const decision = raw === 'approved' || raw === 'approve' ? 'approve' : 'reject';
          this.resolveApproval(id, decision);
        } else {
          const { text } = body as { text: string };
          this.receiveInput(id, text);
        }
      }
    }
    return Promise.resolve({ ok: true });
  }

  /* ---------------- 终端输入（模拟 shell 行缓冲回显） ---------------- */

  /**
   * herdr pane.send_text 语义：text 是原始输入（逐键 / 粘贴整块 / 控制键）。
   * 可打印字符本地回显到编辑行；\x7f 退格；\r 提交一行并给出模拟响应。
   * echo 进屏幕后走 2Hz 全量快照推送，与真实后端一致。
   */
  private receiveInput(nodeId: string, text: string): void {
    if (!this.screen.has(nodeId)) return;
    let prevCr = false;
    for (const ch of text) {
      if (ch === '\r' || ch === '\n') {
        if (ch === '\n' && prevCr) {
          prevCr = false;
          continue; // \r\n 只提交一次
        }
        prevCr = ch === '\r';
        this.commitDraft(nodeId);
      } else if (ch === '\x7f' || ch === '\b') {
        prevCr = false;
        const d = this.drafts.get(nodeId) ?? '';
        if (d) {
          this.drafts.set(nodeId, d.slice(0, -1));
          this.renderDraft(nodeId);
        }
      } else if (ch >= ' ' || ch === '\t') {
        prevCr = false;
        this.drafts.set(nodeId, (this.drafts.get(nodeId) ?? '') + ch);
        this.renderDraft(nodeId);
      }
    }
    this.pushTerm(nodeId);
  }

  /** 编辑行：屏幕末行实时渲染 `$ <draft>`（draft 首次出现时追加新行） */
  private renderDraft(nodeId: string): void {
    const buf = this.screen.get(nodeId);
    if (!buf) return;
    const line = `${C.green}$${C.reset} ${this.drafts.get(nodeId) ?? ''}`;
    if (this.draftActive.has(nodeId)) buf[buf.length - 1] = line;
    else {
      buf.push(line);
      this.draftActive.add(nodeId);
    }
  }

  /** 回车提交：定稿编辑行 + 模拟响应 + 事件日志 */
  private commitDraft(nodeId: string): void {
    const buf = this.screen.get(nodeId);
    if (!buf) return;
    const line = this.drafts.get(nodeId) ?? '';
    if (!this.draftActive.has(nodeId)) buf.push(`${C.green}$${C.reset} `);
    else buf[buf.length - 1] = `${C.green}$${C.reset} ${line}`;
    this.draftActive.delete(nodeId);
    this.drafts.delete(nodeId);
    if (line.trim()) {
      buf.push(`${C.dim}（mock：「${line.trim()}」已写入 pane，真实输出见后端）${C.reset}`);
      this.log(nodeId, 'input', line.trim());
    }
  }

  /* ---------------- 状态推进 ---------------- */

  private resetState(): void {
    this.clearTimers();
    this.nodes = new Map(this.baseGraph.nodes.map((n) => [n.id, { ...n }]));
    this.edges = new Map(this.baseGraph.edges.map((e) => [e.id, { ...e }]));
    this.zones = new Map(this.baseGraph.zones.map((z) => [z.id, { ...z }]));
    this.runState = this.baseGraph.runState;
    this.events = [];
    this.nextEventId = 1;
    this.approved = null;
    this.drafts = new Map();
    this.draftActive = new Set();
    this.screen = new Map(
      this.baseGraph.nodes.map((n) => [n.id, [`${C.dim}等待运行…${C.reset}`]]),
    );
  }

  private doReset(): void {
    this.resetState();
    // 契约 §3：reset 后推全量 graph；终端屏幕也重置并推给订阅者
    this.pushGraph();
    for (const id of this.termSubs) this.pushTerm(id);
  }

  private startRun(): void {
    if (this.runState === 'running') return; // 幂等（契约 §2）
    this.runState = 'running';
    this.log(undefined, 'run', 'coordinator 编排启动');
    this.pushGraphMeta(); // runState 变化同步给前端
    this.patchNode('n-coord', { status: 'running', startedAt: Date.now(), progress: 0.1 });
    this.startScript('n-env', () => {
      this.patchNode('n-env', { status: 'completed', endedAt: Date.now(), progress: 1 });
      this.log('n-env', 'node-status', 'completed');
      // n-env 完成后并行启动 n-data（前 5 行后 blocked 等 approval）/ n-report / n-chat
      this.startScript('n-data', () => this.finishData(), 5);
      this.startScript('n-report', () => this.failReport());
      this.startScript('n-chat', () => this.finishChat(), 2); // 前 2 行先行，余下等 n-data
    });
  }

  /**
   * 播放节点脚本：逐行推屏幕；holdFromLine 起暂停（等待外部条件，由 resume 续播）。
   */
  private startScript(nodeId: string, onDone: () => void, holdFromLine?: number): void {
    this.patchNode(nodeId, { status: 'running', startedAt: Date.now(), progress: 0.15 });
    this.log(nodeId, 'node-status', 'running');
    const script = SCRIPTS[nodeId];
    this.screen.set(nodeId, []);
    let t = 0;
    const limit = holdFromLine ?? script.lines.length;
    for (let i = 0; i < limit; i++) {
      const [delay, line] = script.lines[i];
      t += delay;
      this.after(t, () => {
        this.appendLine(nodeId, line);
        this.pushTerm(nodeId);
        this.log(nodeId, 'term', this.stripAnsi(line));
      });
    }
    if (nodeId === 'n-data') {
      // 契约 §5：n-data 中途 report blocked → waiting（approval）
      this.after(t + 200, () => {
        this.patchNode(nodeId, {
          status: 'waiting',
          statusReason: 'approval',
          approval: { prompt: '将写入生产数据集 /data/prod（12,480 行）' },
          progress: 0.55,
        });
        this.log(nodeId, 'approval-request', '写入 /data/prod 需要批准');
      });
      this.after(t + 400, () => void onDone);
    } else if (nodeId === 'n-chat') {
      // 前 holdFromLine 行先行，余下等 n-data 完成（resumeChat）
      this.after(t + 200, () => void onDone);
    } else {
      this.after(t + 200, () => {
        this.patchNode(nodeId, { progress: 0.85 });
        onDone();
      });
    }
  }

  /** approval 决议（契约 §2）：批准后续跑；拒绝则 failed */
  private resolveApproval(nodeId: string, decision: 'approve' | 'reject'): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.status !== 'waiting') return;
    this.approved = decision;
    this.log(nodeId, 'approval-resolve', decision);
    if (decision === 'reject') {
      this.patchNode(nodeId, {
        status: 'failed',
        statusReason: '审批被拒绝',
        approval: undefined,
        endedAt: Date.now(),
      });
      return;
    }
    // 批准：续跑脚本剩余行（n-data 从第 5 行起）
    this.patchNode(nodeId, { status: 'running', approval: undefined, statusReason: undefined });
    const script = SCRIPTS[nodeId];
    let t = 0;
    for (let i = 5; i < script.lines.length; i++) {
      const [delay, line] = script.lines[i];
      t += delay;
      this.after(t, () => {
        this.appendLine(nodeId, line);
        this.pushTerm(nodeId);
        this.log(nodeId, 'term', this.stripAnsi(line));
      });
    }
    this.after(t + 200, () => {
      this.patchNode(nodeId, { status: 'completed', endedAt: Date.now(), progress: 1 });
      this.log(nodeId, 'node-status', 'completed');
      this.resumeChat();
    });
  }

  private finishData(): void {
    /* n-data 的行已播完、节点进入 waiting；实际完成在 resolveApproval 中 */
  }

  private failReport(): void {
    this.patchNode('n-report', {
      status: 'failed',
      statusReason: 'exit 1：模板变量 summary 缺失',
      endedAt: Date.now(),
    });
    this.log('n-report', 'node-status', 'failed · exit 1');
    // 契约 §5：错误路由边到 n-fail（edge 补丁）
    const e5 = this.edges.get('e5');
    if (e5) this.emit({ type: 'edge', edge: { ...e5, kind: 'error', label: 'exit 1' } });
    this.startScript('n-fail', () => {
      this.patchNode('n-fail', { status: 'completed', endedAt: Date.now(), progress: 1 });
      this.log('n-fail', 'node-status', 'completed');
    });
  }

  private finishChat(): void {
    /* n-chat 头部行已播；余下等 n-data 完成（resumeChat） */
  }

  private resumeChat(): void {
    if (this.approved !== 'approve') return;
    const node = this.nodes.get('n-chat');
    if (!node || node.status !== 'running') return;
    const script = SCRIPTS['n-chat'];
    let t = 0;
    for (let i = 2; i < script.lines.length; i++) {
      const [delay, line] = script.lines[i];
      t += delay;
      this.after(t, () => {
        this.appendLine('n-chat', line);
        this.pushTerm('n-chat');
        this.log('n-chat', 'term', this.stripAnsi(line));
      });
    }
    this.after(t + 200, () => {
      this.patchNode('n-chat', { status: 'completed', endedAt: Date.now(), progress: 1 });
      this.log('n-chat', 'node-status', 'completed');
      this.patchNode('n-coord', { status: 'completed', endedAt: Date.now(), progress: 1 });
      this.runState = 'done';
      this.log(undefined, 'run', '编排完成');
      this.pushGraphMeta();
    });
  }

  /* ---------------- 推送原语 ---------------- */

  private patchNode(id: string, patch: Partial<CanvasNode>): void {
    const prev = this.nodes.get(id);
    if (!prev) return;
    const next = { ...prev, ...patch };
    this.nodes.set(id, next);
    this.emit({ type: 'node', node: next });
  }

  private pushGraph(): void {
    this.emit({
      type: 'graph',
      graph: {
        nodes: [...this.nodes.values()],
        edges: [...this.edges.values()],
        zones: [...this.zones.values()],
        runState: this.runState,
      },
    });
  }

  /** runState 变化时以全量 graph 元信息同步（nodes/edges 未变也走 graph，保持简单） */
  private pushGraphMeta(): void {
    this.pushGraph();
  }

  private appendLine(nodeId: string, line: string): void {
    const buf = this.screen.get(nodeId) ?? [];
    buf.push(line);
    this.screen.set(nodeId, buf);
  }

  private pushTerm(nodeId: string): void {
    if (!this.termSubs.has(nodeId)) return;
    const buf = this.screen.get(nodeId) ?? [];
    // 契约 §3：pane.read ansi 全量快照（前端清空重绘）
    this.emit({ type: 'term', nodeId, ansi: buf.join('\r\n') + '\r\n' });
  }

  private pushTermSnapshots(): void {
    for (const id of this.termSubs) this.pushTerm(id);
  }

  private log(nodeId: string | undefined, kind: string, text: string): void {
    const event: NodeEvent = { id: this.nextEventId++, ts: Date.now(), nodeId, kind, text };
    this.events.push(event);
    this.emit({ type: 'event', event });
  }

  private stripAnsi(s: string): string {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

/* ================= mock workspaces（GET /api/workspaces 的浏览器内回退） ================= */

/** ws-demo 画布页种子图：干净初始态（全 queued/idle），保证 RunBar 演示脚本从头播放 */
function demoGraph(): Graph {
  return {
    nodes: initialNodes(),
    edges: initialEdges(),
    zones: initialZones(),
    runState: 'idle',
  };
}

/** 冻结契约：hello 可带 workspaceId，响应为对应 workspace 全量 graph */
function graphForWorkspace(workspaceId?: string): Graph {
  if (!workspaceId || workspaceId === 'ws-demo') return demoGraph();
  const ws = buildMockWorkspaces().find((w) => w.id === workspaceId);
  return ws ? ws.graph : demoGraph();
}

function buildMockWorkspaces(): WorkspaceSummary[] {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  /* ws-demo 主页预览用「运行中」快照（与画布页干净种子图分离，互不影响） */
  const demoPreview: Graph = {
    nodes: [
      { id: 'n-coord', type: 'coordinator', title: 'Coordinator · 主编排', status: 'running', harness: 'herdr-coordinator', env: 'herdr-local', agentId: 'ag-coord-00', x: 0, y: 240, zoneId: 'z-orch' },
      { id: 'n-env', type: 'operation', title: '环境初始化', status: 'completed', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-env-01', x: 480, y: 0, zoneId: 'z-pipeline' },
      { id: 'n-data', type: 'operation', title: '数据处理', status: 'running', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-data-02', x: 480, y: 360, zoneId: 'z-pipeline' },
      { id: 'n-report', type: 'operation', title: '报告生成', status: 'queued', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-report-03', x: 480, y: 720, zoneId: 'z-output' },
      { id: 'n-fail', type: 'operation', title: '失败兜底 · 告警', status: 'skipped', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-fail-04', x: 960, y: 720, zoneId: 'z-output' },
      { id: 'n-chat', type: 'chat', title: '分析汇报', status: 'waiting', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-chat-05', x: 960, y: 360, zoneId: 'z-output' },
    ],
    edges: initialEdges(),
    zones: initialZones(),
    runState: 'running',
  };

  const researchGraph: Graph = {
    nodes: [
      { id: 'r-coord', type: 'coordinator', title: 'Coordinator · 调研编排', status: 'completed', harness: 'herdr-coordinator', env: 'herdr-local', agentId: 'ag-r-00', x: 0, y: 140, zoneId: 'zr-plan' },
      { id: 'r-search', type: 'operation', title: '资料检索', status: 'completed', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-r-01', x: 460, y: 0, zoneId: 'zr-exec' },
      { id: 'r-write', type: 'artifact', title: '报告撰写', status: 'completed', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-r-02', x: 460, y: 300, zoneId: 'zr-exec' },
    ],
    edges: [
      { id: 're1', source: 'r-coord', target: 'r-search', kind: 'strong' },
      { id: 're2', source: 'r-search', target: 'r-write', kind: 'strong' },
      { id: 're3', source: 'r-coord', target: 'r-write', kind: 'weak', label: '3 msg/min' },
    ],
    zones: [
      { id: 'zr-plan', title: '调研编排' },
      { id: 'zr-exec', title: '执行' },
    ],
    runState: 'done',
  };

  const ingestGraph: Graph = {
    nodes: [
      { id: 'i-coord', type: 'coordinator', title: 'Coordinator · 接入编排', status: 'completed', harness: 'herdr-coordinator', env: 'herdr-local', agentId: 'ag-i-00', x: 0, y: 160, zoneId: 'zi-src' },
      { id: 'i-extract', type: 'operation', title: '数据抽取', status: 'completed', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-i-01', x: 460, y: 0, zoneId: 'zi-src' },
      { id: 'i-load', type: 'operation', title: '加载入仓', status: 'failed', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-i-02', x: 460, y: 340, zoneId: 'zi-dst', statusReason: 'exit 1：目标表锁冲突' },
      { id: 'i-notify', type: 'chat', title: '告警通知', status: 'skipped', harness: 'shell-agent', env: 'herdr-local', agentId: 'ag-i-03', x: 920, y: 340, zoneId: 'zi-dst' },
    ],
    edges: [
      { id: 'ie1', source: 'i-coord', target: 'i-extract', kind: 'strong' },
      { id: 'ie2', source: 'i-extract', target: 'i-load', kind: 'strong' },
      { id: 'ie3', source: 'i-load', target: 'i-notify', kind: 'error', label: 'exit 1' },
    ],
    zones: [
      { id: 'zi-src', title: '接入' },
      { id: 'zi-dst', title: '入仓' },
    ],
    runState: 'done',
  };

  return [
    {
      id: 'ws-demo',
      title: '数据管线演示',
      path: '离线示例 · 未连接本地目录',
      description: '契约 §5 编排脚本演示：环境初始化 → 数据处理（审批）/ 报告生成（失败兜底）→ 分析汇报。',
      createdAt: iso(1000 * 60 * 60 * 24 * 6),
      lastActiveAt: iso(1000 * 60 * 4),
      status: 'running',
      graph: demoPreview,
    },
    {
      id: 'ws-ingest',
      title: '数据接入 PoC',
      path: '离线示例 · 未连接本地目录',
      description: '同项目下的接入链路验证：抽取完成，加载入仓因表锁失败，告警节点被跳过。',
      createdAt: iso(1000 * 60 * 60 * 24 * 3),
      lastActiveAt: iso(1000 * 60 * 60 * 26),
      status: 'failed',
      graph: ingestGraph,
    },
    {
      id: 'ws-research',
      title: '调研助手集群',
      path: '离线示例 · 未连接本地目录',
      description: '三节点调研流水线：检索 → 撰写，Coordinator 弱链接旁听，已完整跑完一轮。',
      createdAt: iso(1000 * 60 * 60 * 24 * 12),
      lastActiveAt: iso(1000 * 60 * 60 * 50),
      status: 'done',
      graph: researchGraph,
    },
  ];
}

/** GET /api/workspaces 的 mock 回退（冻结契约同构；每次调用返回新副本防外部篡改） */
export function mockWorkspaceSummaries(): WorkspaceSummary[] {
  return buildMockWorkspaces();
}

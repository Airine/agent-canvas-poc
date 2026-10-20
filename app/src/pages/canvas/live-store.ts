/**
 * live-store — `/canvas` 数据层：控制面契约的唯一前端实现（api-contract.md v0）
 *
 * - WS `/ws`：连接后发 `hello` → 收全量 `graph`；`node`/`edge` 补丁增量更新；
 *   `term` 快照按节点分发给订阅的活窗组件；`event` 追加进事件日志。
 * - 自动重连：指数退避（1s→2s→4s，封顶 8s），重连成功重新 hello 全量同步。
 * - REST：`run/reset/approval/input` 经此处封装（POST /api/...），`fetchNodeEvents`
 *   对应 GET /api/nodes/:id/events（专注模式只读回放）。
 * - React 绑定：useSyncExternalStore（图快照版本号 + 选中器）。
 * - 后端不在场时（WS 连续握手失败）回退到浏览器内 MockBackend（mock-server.ts，
 *   同一份消息处理器），自证渲染链路；界面上以「本地 mock」徽标明示。
 */
import { useSyncExternalStore } from 'react';
import { MockBackend, mockWorkspaceSummaries } from './mock-server';
import { SessionStore } from './session-store';
import type { ControlPayload } from '../../../api/e/contracts';
import type { BackendApi, CanvasNode, CanvasEdge, CanvasZone, RunState, NodeEvent, ConnState, ClientMessage, ServerMessage, WorkspaceSummary } from './contracts';
export type * from './contracts';


/* ================= LiveStore ================= */

const MAX_EVENTS = 500;

export class LiveStore {
  readonly sessions = new SessionStore();
  backendKind: 'e' | 'herdr' = 'herdr';
  source: 'live' | 'demo' = 'live';
  error: string | null = null;
  readOnly = false;
  private nodeListeners = new Map<string, Set<() => void>>();
  private generation?: string;
  private sequence = 0;
  /** 节点/边以 id 索引；graph 到达或补丁到达时整体 bump 版本 */
  nodes = new Map<string, CanvasNode>();
  edges = new Map<string, CanvasEdge>();
  zones = new Map<string, CanvasZone>();
  runState: RunState = 'idle';
  /** WS event 追加日志（TracePanel / 回放用，append-only） */
  events: NodeEvent[] = [];
  connState: ConnState = 'connecting';
  /** 全量 graph 消息序号（hello 后 / reset 后自增） */
  graphSeq = 0;
  /** 前端发起的 reset 序号（适配层据此重置本地拖拽位置；graph 消息不动拖拽位置） */
  resetSeq = 0;
  /** 前端发起的一键布局序号（适配层据此清拖拽位置缓存并 fitView） */
  layoutSeq = 0;
  /** 目标 workspace（冻结契约：hello 可带 workspaceId，响应为对应 workspace 全量 graph） */
  readonly workspaceId?: string;

  private backend: BackendApi | null = null;
  private listeners = new Set<() => void>();
  private version = 0;

  /** term 快照分发：nodeId → 订阅者（活窗组件挂载时注册） */
  private termSubs = new Map<string, Set<(ansi: string) => void>>();
  /** 每节点最近一次 ansi 快照（快照降级档显示静态末屏用） */
  private termLast = new Map<string, string>();
  private termRefCount = new Map<string, number>();

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private failedHandshakes = 0;
  private disposed = false;

  constructor(workspaceId?: string) {
    this.workspaceId = workspaceId;
    this.connect();
  }

  /* ---------------- 连接管理 ---------------- */

  private wsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  private connect(): void {
    if (this.disposed) return;
    this.setConnState(this.failedHandshakes > 0 ? 'reconnecting' : 'connecting');
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wsUrl());
    } catch {
      this.onHandshakeFail();
      return;
    }
    this.ws = ws;

    /** 握手看门狗：1.5s 未 open 视为失败（有些 dev server 会挂起 upgrade） */
    const openWatchdog = setTimeout(() => {
      if (settled) return;
      settled = true; // 阻止 onclose 重复计数
      this.ws = null; // onclose 看到 this.ws !== ws 直接返回
      try {
        ws.close();
      } catch {
        /* noop */
      }
      this.onHandshakeFail();
    }, 1500);

    /** 协议看门狗：open 后 2s 内未收到 graph 全量 = 对面不是本契约后端 */
    let graphWatchdog: ReturnType<typeof setTimeout> | null = null;

    ws.onopen = () => {
      clearTimeout(openWatchdog);
      this.backend = this.remoteApi(ws);
      ws.send(
        JSON.stringify({
          type: 'hello',
          workspaceId: this.workspaceId,
        } satisfies ClientMessage),
      );
      graphWatchdog = setTimeout(() => {
        settled = true;
        this.ws = null;
        this.backend = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
        this.onHandshakeFail();
      }, 2000);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws || this.disposed) return;
      try {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        if (this.workspaceId && msg.workspaceId !== this.workspaceId) return;
        if (msg.type === 'graph' && msg.generation !== this.generation) { this.generation = msg.generation; this.sequence = 0; }
        if (msg.generation !== undefined) {
          if (msg.generation !== this.generation && msg.type !== 'error') return;
          if (msg.sequence !== undefined && msg.sequence <= this.sequence) return;
          if (msg.sequence !== undefined && msg.sequence > this.sequence + 1 && msg.type !== 'graph' && msg.type !== 'error') {
            this.setConnState('reconnecting');ws.send(JSON.stringify({ type: 'hello', workspaceId: this.workspaceId }));return;
          }
          this.sequence = msg.sequence ?? this.sequence;
        }
        if (msg.type === 'graph') {
          this.error = null;this.setConnState('online');
          if (graphWatchdog !== null) clearTimeout(graphWatchdog);
          if (!settled) {
            settled = true;
            this.failedHandshakes = 0;
            this.reconnectDelay = 1000;
          }
        }
        this.dispatch(msg);
        // hello clears subscriptions server-side, including sequence-gap resync.
        if (msg.type === 'graph' && this.backendKind === 'herdr') {
          for (const [nodeId, count] of this.termRefCount) {
            if (count > 0 && this.nodes.has(nodeId)) this.backend?.send({ type: 'term.subscribe', nodeId });
          }
        }
      } catch {
        /* 忽略坏帧 */
      }
    };
    ws.onclose = () => {
      clearTimeout(openWatchdog);
      if (graphWatchdog !== null) clearTimeout(graphWatchdog);
      if (this.ws !== ws) return;
      this.ws = null;
      this.backend = null;
      if (!settled) this.onHandshakeFail();
      else this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose 统一处理 */
    };
  }

  /** 连续握手失败（后端不在场）→ 回退浏览器内 mock，界面徽标明示 */
  private onHandshakeFail(): void {
    if (this.disposed) return;
    this.failedHandshakes += 1;
    if (this.failedHandshakes >= 2 && this.backendKind !== 'e' && this.source === 'demo' && new URLSearchParams(location.search).get('demo') === '1') {
      const mock = new MockBackend((msg) => this.dispatch(msg), this.workspaceId);
      this.backend = mock.api;
      this.setConnState('mock');
      // 与真实后端同构：连接后首条 hello → 收全量 graph（契约 §3）
      mock.api.send({ type: 'hello', workspaceId: this.workspaceId });
      return;
    }
    this.error = '连接断开，保留最后快照；未切换为演示数据';
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) return;
    this.setConnState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
      this.connect();
    }, this.reconnectDelay);
  }

  private remoteApi(ws: WebSocket): BackendApi {
    return {
      send: (msg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      post: async (path, body) => {
        const res = await fetch(`/api${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? '{}' : JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data as { ok: boolean };
      },
      getNodeEvents: async (nodeId) => {
        const res = await fetch(`/api${this.nodeApiPath(nodeId, 'events')}`);
        const data = await res.json();if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data as NodeEvent[];
      },
      dispose: () => ws.close(),
    };
  }

  /** 契约 §3 server→client 消息统一入口（WS 与 mock 共用） */
  private dispatch(msg: ServerMessage): void {
    switch (msg.type) {
      case 'graph': {
        this.backendKind = msg.backend ?? 'herdr';this.source = msg.source ?? 'demo';this.readOnly = !!msg.archivedAt;
        this.nodes = new Map(msg.graph.nodes.map((n) => [n.id, n]));
        this.edges = new Map(msg.graph.edges.map((e) => [e.id, e]));
        this.zones = new Map((msg.graph.zones ?? []).map((z) => [z.id, z]));
        this.runState = msg.graph.runState;
        this.graphSeq += 1;
        this.emit();
        break;
      }
      case 'session': {
        this.sessions.apply(msg.session);
        break;
      }
      case 'error': { this.error = msg.error;this.setConnState('reconnecting');this.emit();break; }
      case 'node': {
        const prior = this.nodes.get(msg.node.id);
        this.nodes.set(msg.node.id, msg.node);
        const layoutChanged = !prior || prior.x !== msg.node.x || prior.y !== msg.node.y || prior.zoneId !== msg.node.zoneId || prior.type !== msg.node.type;
        if (msg.node.backend === 'e' && !layoutChanged) { for (const fn of this.nodeListeners.get(msg.node.id) ?? []) fn(); }
        else this.emit();
        break;
      }
      case 'edge': {
        this.edges.set(msg.edge.id, msg.edge);
        this.emit();
        break;
      }
      case 'term': {
        this.termLast.set(msg.nodeId, msg.ansi);
        const subs = this.termSubs.get(msg.nodeId);
        if (subs) for (const cb of subs) cb(msg.ansi);
        break;
      }
      case 'event': {
        this.events.push(msg.event);
        if (this.events.length > MAX_EVENTS) {
          this.events = this.events.slice(this.events.length - MAX_EVENTS);
        }
        this.emit();
        break;
      }
    }
  }

  /* ---------------- REST 动作（契约 §2） ---------------- */

  /**
   * scoped 节点端点（冻结契约 v1）：/api/workspaces/:wid/nodes/:nid/<suffix>。
   * 无 workspaceId 时回退旧端点（后端保留为 active-workspace 别名）。
   */
  private nodeApiPath(nodeId: string, suffix: string): string {
    const nid = encodeURIComponent(nodeId);
    return this.workspaceId
      ? `/workspaces/${encodeURIComponent(this.workspaceId)}/nodes/${nid}/${suffix}`
      : `/nodes/${nid}/${suffix}`;
  }

  async run(): Promise<void> {
    await this.backend?.post(this.workspaceId ? `/workspaces/${encodeURIComponent(this.workspaceId)}/run` : '/graph/run');
  }

  async reset(): Promise<void> {
    await this.backend?.post(this.workspaceId ? `/workspaces/${encodeURIComponent(this.workspaceId)}/reset` : '/graph/reset');
    // reset 后 server 推全量 graph；本地事件日志清空保持一致
    this.events = [];
    this.termLast.clear();
    this.resetSeq += 1;
    this.emit();
  }

  /**
   * 一键最优布局（canvas-optimization.md）：后端 dagre + zone 泳道列，
   * 坐标经 node 补丁回推。layoutSeq 供适配层清拖拽缓存 + fitView。
   */
  async autoLayout(): Promise<void> {
    const path = this.workspaceId
      ? `/workspaces/${encodeURIComponent(this.workspaceId)}/layout`
      : '/graph/layout';
    await this.backend?.post(path);
    this.layoutSeq += 1;
    this.emit();
  }

  async sendApproval(nodeId: string, decision: 'approve' | 'reject'): Promise<void> {
    // 冻结契约 v1 decision 词表：approved / rejected / edited
    await this.backend?.post(this.nodeApiPath(nodeId, 'approval'), {
      decision: decision === 'approve' ? 'approved' : 'rejected',
    });
  }

  async sendInput(nodeId: string, text: string): Promise<void> {
    await this.backend?.post(this.nodeApiPath(nodeId, 'input'), { text });
  }

  async sessionAction(nodeId: string, operation: 'messages' | 'abort' | 'approval' | 'stop' | 'resume' | 'configuration' | 'queue', body?: ControlPayload | import('../../../api/e/contracts').QueueMutation | import('../../../api/e/contracts').ConfigurationChange): Promise<unknown> {
    if (this.connState !== 'online') throw new Error('画布离线，操作未发送');
    const res = await fetch(`/api${this.nodeApiPath(nodeId, operation)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const data = await res.json();if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.session) this.sessions.apply(data.session);
    if (operation === 'messages' && ['rejected', 'outcome-unknown'].includes(data.action?.state)) {
      throw new Error(`${data.action.state === 'rejected' ? '运行器拒绝消息' : '发送结果未知，不会自动重发'}${data.action.reason ? `：${data.action.reason}` : ''}`);
    }
    return data;
  }
  async addSession(options: { title?: string; provider?: string; model?: string } = {}): Promise<void> {
    if (!this.workspaceId || this.connState !== 'online') throw new Error('画布尚未连接');
    const res = await fetch(`/api/workspaces/${encodeURIComponent(this.workspaceId)}/sessions`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)});
    const data = await res.json();if(!res.ok)throw new Error(data.error || `HTTP ${res.status}`);
  }
  async saveLayout(positions: Array<{id:string;x:number;y:number}>): Promise<void> {
    if (!this.workspaceId || this.connState !== 'online') return;
    const res=await fetch(`/api/workspaces/${encodeURIComponent(this.workspaceId)}/layout`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({positions})});
    if(!res.ok)throw new Error('布局保存失败');
  }
  async fetchNodeEvents(nodeId: string): Promise<NodeEvent[]> {
    return (await this.backend?.getNodeEvents(nodeId)) ?? [];
  }

  /* ---------------- term 订阅（活窗组件用） ---------------- */

  /**
   * 组件挂载时订阅某节点终端：首个订阅者触发 term.subscribe（契约 §3），
   * 最后一个退订时发 term.unsubscribe。返回退订函数。
   * 配额降级档不调用本函数（不订阅，仅读 termLastSnapshot 静态末屏）。
   */
  subscribeTerm(nodeId: string, cb: (ansi: string) => void): () => void {
    let subs = this.termSubs.get(nodeId);
    if (!subs) {
      subs = new Set();
      this.termSubs.set(nodeId, subs);
    }
    subs.add(cb);
    const count = (this.termRefCount.get(nodeId) ?? 0) + 1;
    this.termRefCount.set(nodeId, count);
    if (count === 1) this.backend?.send({ type: 'term.subscribe', nodeId });
    // 重放最近一帧，避免等新快照期间空白
    const last = this.termLast.get(nodeId);
    if (last !== undefined) cb(last);
    return () => {
      subs.delete(cb);
      const left = (this.termRefCount.get(nodeId) ?? 1) - 1;
      this.termRefCount.set(nodeId, left);
      if (left <= 0 && subs.size === 0) {
        this.termSubs.delete(nodeId);
        this.termRefCount.delete(nodeId);
        this.backend?.send({ type: 'term.unsubscribe', nodeId });
      }
    };
  }

  /** 静态末屏（快照降级档）：最近一次 ansi 快照，未订阅过为 undefined */
  termLastSnapshot(nodeId: string): string | undefined {
    return this.termLast.get(nodeId);
  }

  /* ---------------- 订阅（图状态） ---------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeNode = (nodeId: string, fn: () => void): (() => void) => {
    const list = this.nodeListeners.get(nodeId) ?? new Set();list.add(fn);this.nodeListeners.set(nodeId,list);
    return () => {list.delete(fn);if (!list.size)this.nodeListeners.delete(nodeId);};
  };
  getVersion = (): number => this.version;

  private setConnState(s: ConnState): void {
    if (this.connState === s) return;
    this.connState = s;
    this.emit();
  }

  private emit(): void {
    this.version += 1;
    for (const l of this.listeners) l();
    for (const list of this.nodeListeners.values()) for (const fn of list) fn();
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.backend?.dispose();
    this.ws?.close();
    this.listeners.clear();
    this.termSubs.clear();
  }
}

/* ================= workspace 列表（冻结契约 REST，失败回退 mock） ================= */

export interface WorkspaceListResult {
  workspaces: WorkspaceSummary[];
  /** 与画布页 connState 同语义：后端不在场时明示「本地 mock」 */
  source: 'api' | 'mock';
  error?: string;
}

/**
 * GET /api/workspaces → { workspaces: WorkspaceSummary[] }（冻结契约）。
 * 后端不在场 / 返回非 JSON（如 vite SPA fallback 吐 index.html）→ 回退 mock-server 同契约数据。
 */
export async function fetchWorkspaces(): Promise<WorkspaceListResult> {
  try {
    const view = new URLSearchParams(location.search).get('view');
    const res = await fetch(`/api/workspaces${view === 'examples' || view === 'archived' ? `?view=${view}` : ''}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ctype = res.headers.get('content-type') ?? '';
    if (!ctype.includes('application/json')) throw new Error('non-json response');
    const data = (await res.json()) as { workspaces?: WorkspaceSummary[] };
    if (!Array.isArray(data.workspaces)) throw new Error('bad payload');
    return { workspaces: data.workspaces, source: 'api' };
  } catch (error) {
    if (new URLSearchParams(location.search).get('demo') === '1') return { workspaces: mockWorkspaceSummaries(), source: 'mock' };
    return { workspaces: [], source: 'api', error: `API 离线：${String(error)}` };
  }
}

/** 活跃 workspace 选择：running 优先，否则按 lastActiveAt 最新取第一个 */
export function pickActiveWorkspace(list: WorkspaceSummary[]): WorkspaceSummary | undefined {
  const running = list.find((w) => w.status === 'running');
  if (running) return running;
  return [...list].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))[0];
}

/* ================= React 绑定 ================= */

/** 订阅 store 任意变化（返回版本号），组件内自行从 store 选取数据 */
export function useLiveStore(store: LiveStore): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

/**
 * Append-only 事件流引擎（design.md §8.1）
 *
 * - play / pause / seek(索引) / reset / 速度档 1x 2x 4x
 * - 任意时刻全部节点状态 = 事件序列 [0, index] 的纯函数折叠（buildSnapshot），
 *   实时播放与回放共用同一条管道（§3.3.2 回放=实时管道旁路）。
 */
import {
  createEmptyNodeState,
  type AgentEvent,
  type CanvasEdgeDef,
  type CanvasNodeDef,
  type CanvasSnapshot,
  type NodeState,
} from '../types';
import { MOCK_EDGES, MOCK_EVENTS, MOCK_NODES } from './events';

export type PlaybackSpeed = 1 | 2 | 4;

export interface EngineState {
  /** 当前指针：-1 = 未开始（全部 queued），[0, total-1] = 已应用到的事件下标 */
  index: number;
  total: number;
  playing: boolean;
  speed: PlaybackSpeed;
  /** 当前事件时间轴毫秒（未开始为 0） */
  timeMs: number;
}

/** 纯函数：把事件序列折叠到 upto（含）为止，重建全部节点/边状态 */
export function buildSnapshot(
  events: AgentEvent[],
  nodeDefs: CanvasNodeDef[],
  edgeDefs: CanvasEdgeDef[],
  upto: number,
): CanvasSnapshot {
  const nodes: Record<string, NodeState> = {};
  for (const def of nodeDefs) nodes[def.id] = createEmptyNodeState();
  const edges: CanvasSnapshot['edges'] = {};
  for (const def of edgeDefs) edges[def.id] = { kind: def.kind };

  const end = Math.min(upto, events.length - 1);
  for (let i = 0; i <= end; i++) {
    const ev = events[i];
    switch (ev.kind) {
      case 'node-status': {
        const n = nodes[ev.nodeId];
        if (!n) break;
        n.status = ev.status;
        n.statusReason = ev.reason;
        if (ev.status === 'running' && n.startedAt === undefined) n.startedAt = ev.t;
        if (ev.status === 'completed' || ev.status === 'failed' || ev.status === 'skipped') {
          n.endedAt = ev.t;
          if (n.startedAt === undefined && ev.status !== 'skipped') n.startedAt = ev.t;
          n.artifact.streaming = false;
        }
        break;
      }
      case 'terminal-line': {
        nodes[ev.nodeId]?.terminalLines.push(ev.line);
        break;
      }
      case 'artifact-version': {
        const n = nodes[ev.nodeId];
        if (!n) break;
        n.artifact.versions.push(ev.version);
        n.artifact.current = n.artifact.versions.length - 1;
        n.artifact.streamingText = '';
        n.artifact.streaming = true;
        break;
      }
      case 'artifact-delta': {
        const n = nodes[ev.nodeId];
        if (!n) break;
        n.artifact.streamingText += ev.text;
        n.artifact.streaming = true;
        break;
      }
      case 'chat-message': {
        nodes[ev.nodeId]?.chat.items.push({ type: 'message', message: ev.message });
        break;
      }
      case 'chat-toolcall': {
        nodes[ev.nodeId]?.chat.items.push({ type: 'toolcall', toolCall: ev.toolCall });
        break;
      }
      case 'chat-todos': {
        const n = nodes[ev.nodeId];
        if (n) n.chat.todos = ev.todos;
        break;
      }
      case 'approval-request': {
        const n = nodes[ev.nodeId];
        if (n) n.chat.approval = { reason: ev.reason };
        break;
      }
      case 'approval-resolve': {
        const n = nodes[ev.nodeId];
        if (n?.chat.approval) n.chat.approval.decision = ev.decision;
        break;
      }
      case 'edge-status': {
        if (edges[ev.edgeId]) edges[ev.edgeId] = { kind: ev.edgeKind };
        break;
      }
    }
  }
  return { applied: end + 1, nodes, edges };
}

type Listener = (state: EngineState) => void;

export class EventEngine {
  private readonly events: AgentEvent[];
  private readonly nodeDefs: CanvasNodeDef[];
  private readonly edgeDefs: CanvasEdgeDef[];
  private index = -1;
  private playing = false;
  private speed: PlaybackSpeed = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();

  constructor(
    events: AgentEvent[] = MOCK_EVENTS,
    nodeDefs: CanvasNodeDef[] = MOCK_NODES,
    edgeDefs: CanvasEdgeDef[] = MOCK_EDGES,
  ) {
    this.events = events;
    this.nodeDefs = nodeDefs;
    this.edgeDefs = edgeDefs;
  }

  get total(): number {
    return this.events.length;
  }

  getState = (): EngineState => ({
    index: this.index,
    total: this.events.length,
    playing: this.playing,
    speed: this.speed,
    timeMs: this.index >= 0 ? this.events[this.index].t : 0,
  });

  /** 当前时刻快照（实时） */
  snapshot(): CanvasSnapshot {
    return buildSnapshot(this.events, this.nodeDefs, this.edgeDefs, this.index);
  }

  /** 任意时刻快照（seek / 回放），不产生副作用 */
  snapshotAt(index: number): CanvasSnapshot {
    return buildSnapshot(this.events, this.nodeDefs, this.edgeDefs, index);
  }

  play(): void {
    if (this.playing) return;
    if (this.index >= this.events.length - 1) this.index = -1; // 播到末尾再播 = 重播
    this.playing = true;
    this.emit();
    this.scheduleNext();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.clearTimer();
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** seek 到指定事件下标（含）。播放中 seek = 暂停并跳转（§3.3.2） */
  seek(index: number): void {
    this.pause();
    this.index = Math.max(-1, Math.min(index, this.events.length - 1));
    this.emit();
  }

  reset(): void {
    this.pause();
    this.index = -1;
    this.emit();
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed;
    this.emit();
  }

  /** 模拟「接管终端」：暂停 mock agent 事件注入（§3.3.2 takeover） */
  setInjecting(paused: boolean): void {
    if (paused) this.pause();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  private scheduleNext(): void {
    this.clearTimer();
    if (!this.playing) return;
    const next = this.index + 1;
    if (next >= this.events.length) {
      this.playing = false;
      this.emit();
      return;
    }
    const prevT = this.index >= 0 ? this.events[this.index].t : 0;
    const dt = Math.max(16, (this.events[next].t - prevT) / this.speed);
    this.timer = setTimeout(() => {
      this.index = next;
      this.emit();
      this.scheduleNext();
    }, dt);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    const state = this.getState();
    for (const l of this.listeners) l(state);
  }
}

/**
 * eventbus.ts — append-only event log (in-memory + /tmp/canvas-events.jsonl).
 * Normalized contract Event format: { id, ts, workspaceId, nodeId?, kind, text }.
 */
import fs from 'node:fs';
import type { CanvasEvent } from './types.js';

const LOG_PATH = process.env.CANVAS_EVENTS_LOG || '/tmp/canvas-events.jsonl';

type Listener = (ev: CanvasEvent) => void;

class EventBus {
  private events: CanvasEvent[] = [];
  private listeners = new Set<Listener>();
  private nextId = 1;

  append(e: Omit<CanvasEvent, 'id' | 'ts'> & { ts?: number }): CanvasEvent {
    const ev: CanvasEvent = { id: this.nextId++, ts: e.ts ?? Date.now(), workspaceId: e.workspaceId, nodeId: e.nodeId, kind: e.kind, text: e.text };
    this.events.push(ev);
    try {
      fs.appendFileSync(LOG_PATH, JSON.stringify(ev) + '\n');
    } catch {
      /* best effort */
    }
    for (const l of this.listeners) l(ev);
    return ev;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  forNode(workspaceId: string, nodeId: string): CanvasEvent[] {
    return this.events.filter((e) => e.workspaceId === workspaceId && e.nodeId === nodeId);
  }

  all(): CanvasEvent[] {
    return [...this.events];
  }

  /** Events in the last `windowMs` touching any of the given nodes. */
  ratePerMinute(workspaceId: string, nodeIds: string[], windowMs = 60_000): number {
    const since = Date.now() - windowMs;
    const n = this.events.filter(
      (e) => e.workspaceId === workspaceId && e.ts >= since && e.nodeId && nodeIds.includes(e.nodeId) && e.kind === 'message',
    ).length;
    return Math.round((n / windowMs) * 60_000);
  }

  clear(): void {
    this.events = [];
    this.nextId = 1;
    try {
      fs.writeFileSync(LOG_PATH, '');
    } catch {
      /* best effort */
    }
  }
}

export const eventbus = new EventBus();

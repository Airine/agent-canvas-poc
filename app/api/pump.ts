/**
 * pump.ts — terminal snapshot pump (multi-workspace).
 *
 * For each (workspaceId, nodeId) with WS term subscribers, poll herdr
 * pane.read(format=ansi, source=visible) at 2Hz and push
 * `{type:'term', nodeId, ansi, workspaceId}` only when the content changed.
 * Stops when the node reaches a terminal state (after one final snapshot)
 * or when nobody is subscribed.
 */
import { paneRead } from './herdr-adapter.js';
import { getGraphStore, onAnyPatch } from './graph.js';
import type { ServerMessage } from './types.js';

export interface TermClient {
  send(msg: ServerMessage): void;
}

const POLL_MS = 500; // 2Hz

interface PumpEntry {
  workspaceId: string;
  nodeId: string;
  clients: Set<TermClient>;
  timer: NodeJS.Timeout | null;
  lastText: string | null;
  stopped: boolean;
  polling: boolean;
}

const TERMINAL = ['completed', 'failed', 'skipped'];

function key(workspaceId: string, nodeId: string): string {
  return `${workspaceId}/${nodeId}`;
}

class Pump {
  private entries = new Map<string, PumpEntry>();

  subscribe(workspaceId: string, nodeId: string, client: TermClient): void {
    const k = key(workspaceId, nodeId);
    let e = this.entries.get(k);
    if (!e) {
      e = { workspaceId, nodeId, clients: new Set(), timer: null, lastText: null, stopped: false, polling: false };
      this.entries.set(k, e);
    }
    e.clients.add(client);
    if (e.stopped) {
      // Node already terminal: one-shot final snapshot for the new subscriber.
      void this.pollOnce(e, client);
      return;
    }
    if (!e.timer) {
      void this.pollOnce(e);
      e.timer = setInterval(() => void this.pollOnce(e), POLL_MS);
    }
  }

  unsubscribe(workspaceId: string, nodeId: string, client: TermClient): void {
    const e = this.entries.get(key(workspaceId, nodeId));
    if (!e) return;
    e.clients.delete(client);
    if (e.clients.size === 0) this.stopEntry(e, false);
  }

  unsubscribeAll(client: TermClient): void {
    for (const e of this.entries.values()) {
      if (e.clients.delete(client) && e.clients.size === 0) this.stopEntry(e, false);
    }
  }

  /** Called when a node reaches a terminal state. */
  nodeEnded(workspaceId: string, nodeId: string): void {
    const e = this.entries.get(key(workspaceId, nodeId));
    if (!e || e.stopped) return;
    // one last snapshot, then stop
    void this.pollOnce(e).finally(() => this.stopEntry(e, true));
  }

  stopNode(workspaceId: string, nodeId: string): void {
    const e = this.entries.get(key(workspaceId, nodeId));
    if (e) this.stopEntry(e, true);
  }

  /** Stop every entry of one workspace (coordinator reset), or all of them. */
  stopAll(workspaceId?: string): void {
    for (const e of this.entries.values()) {
      if (workspaceId === undefined || e.workspaceId === workspaceId) this.stopEntry(e, true);
    }
  }

  private stopEntry(e: PumpEntry, keepForLateSubscribers: boolean): void {
    if (e.timer) clearInterval(e.timer);
    e.timer = null;
    if (keepForLateSubscribers) {
      e.stopped = true; // stay in map; new subscribers get one-shot reads
    } else {
      this.entries.delete(key(e.workspaceId, e.nodeId));
    }
  }

  private async pollOnce(e: PumpEntry, only?: TermClient): Promise<void> {
    if (e.polling) return; // avoid overlapping reads
    const node = getGraphStore(e.workspaceId)?.getNode(e.nodeId);
    if (!node?.paneId) return;
    e.polling = true;
    try {
      const r = await paneRead(node.paneId, { source: 'visible', format: 'ansi', lines: 1000 });
      if (r.text !== e.lastText) {
        e.lastText = r.text;
        const msg: ServerMessage = { type: 'term', nodeId: e.nodeId, ansi: r.text, workspaceId: e.workspaceId };
        const targets = only ? [only] : [...e.clients];
        for (const c of targets) c.send(msg);
      } else if (only) {
        only.send({ type: 'term', nodeId: e.nodeId, ansi: r.text, workspaceId: e.workspaceId });
      }
    } catch {
      // pane may be gone (closed after exit); stop quietly
      this.stopEntry(e, true);
    } finally {
      e.polling = false;
    }
  }
}

export const pump = new Pump();

/** Wire terminal-state detection: graph status changes drive pump shutdown. */
export function wirePumpToGraph(): void {
  onAnyPatch((workspaceId, msg) => {
    if (msg.type === 'node' && TERMINAL.includes(msg.node.status)) {
      pump.nodeEnded(workspaceId, msg.node.id);
    }
  });
}

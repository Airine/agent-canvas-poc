/**
 * herdr-adapter.ts — NDJSON socket client for the herdr control socket.
 *
 * Spike findings encoded here (see /mnt/agents/output/spike/REPORT.md):
 *  - One request per connection: the server closes the socket after each
 *    response; reuse causes BrokenPipe. New connection costs ~1ms, no pool.
 *  - events.subscribe is the only long-lived connection; reconnect + resubscribe
 *    on drop (1s backoff).
 *  - pane.report_agent rejects state "done"; reporting "idle" for an agent
 *    without a real process is normalized to done by herdr.
 *  - No streaming output subscription exists; use pane.read polling (pump.ts).
 */
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveHerdrBin(): string {
  if (process.env.HERDR_BIN) return process.env.HERDR_BIN;
  const candidates = [
    path.join(REPO_ROOT, 'bin', 'herdr'),
    path.join(os.homedir(), '.local', 'bin', 'herdr'),
    '/usr/local/bin/herdr',
    '/opt/homebrew/bin/herdr',
  ];
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      /* try next */
    }
  }
  return 'herdr'; // rely on PATH
}
export const HERDR_BIN = resolveHerdrBin();
export const HERDR_SOCKET_PATH =
  process.env.HERDR_SOCKET_PATH ||
  path.join(os.homedir(), '.config', 'herdr', 'herdr.sock');

let reqCounter = 0;

export interface HerdrResponse {
  id?: string;
  result?: unknown;
  error?: { code?: string; message?: string };
  // event envelopes (on subscribe connections)
  event?: string;
  type?: string;
  data?: unknown;
  [k: string]: unknown;
}

export class HerdrError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** One-shot NDJSON call: new connection per request, closed after response. */
export function call(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 10_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `cp:${++reqCounter}`;
    const sock = net.createConnection(HERDR_SOCKET_PATH);
    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        sock.destroy();
        reject(new HerdrError('timeout', `${method} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const fail = (err: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        sock.destroy();
        reject(err);
      }
    };

    sock.on('error', fail);
    sock.on('connect', () => {
      sock.write(JSON.stringify({ id, method, params }) + '\n');
    });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let msg: HerdrResponse;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id !== id) continue; // tolerate stray event lines
        settled = true;
        clearTimeout(timer);
        sock.end();
        if (msg.error) {
          reject(new HerdrError(msg.error.code || 'error', msg.error.message || 'herdr error'));
        } else {
          resolve(msg.result);
        }
        return;
      }
    });
    sock.on('close', () => {
      if (!settled) fail(new HerdrError('closed', `${method}: socket closed before response`));
    });
  });
}

/** CLI fallback (used only when the socket path cannot express an operation). */
export function cli(args: string[], timeoutMs = 15_000): string {
  const r = spawnSync(HERDR_BIN, args, { timeout: timeoutMs, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new HerdrError('cli_error', (r.stderr || r.stdout || '').trim());
  return r.stdout;
}

/** Spawn `bin/herdr server` headless if the control socket is not answering. */
export async function ensureServer(): Promise<void> {
  if (await ping()) return;
  try {
    const logFd = fs.openSync('/tmp/herdr.log', 'a');
    const child = spawn(HERDR_BIN, ['server'], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    // binary may be missing/unexecutable (e.g. non-Linux dev box): swallow the
    // async spawn error and let the ping deadline below report the failure.
    child.on('error', () => {});
    child.unref();
    fs.closeSync(logFd);
  } catch {
    /* fall through to the ping deadline */
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await ping()) return;
  }
  throw new HerdrError('server_start_failed', 'herdr server did not come up within 15s (see /tmp/herdr.log)');
}

async function ping(): Promise<boolean> {
  // 0.9.x calls it session.ping; 0.8.x plain ping. An unknown method makes
  // herdr close the connection right after accept ('closed'), which means the
  // server IS alive — try the next name. Only ECONNREFUSED-ish errors (the
  // call() rejection has no 'closed' payload but a raw syscall message) or
  // timeouts mean the server is truly not answering.
  for (const method of ['session.ping', 'ping']) {
    try {
      await call(method, {}, 1500);
      return true;
    } catch (e) {
      const err = e as HerdrError;
      if (err.code === 'timeout') return false;
      if (err.code === 'closed') continue; // alive but method unknown
      // other codes (ECONNREFUSED, ENOENT...): server not listening
      return fs.existsSync(HERDR_SOCKET_PATH) && (await tryPingFallback());
    }
  }
  return fs.existsSync(HERDR_SOCKET_PATH) && (await tryPingFallback());
}

async function tryPingFallback(): Promise<boolean> {
  // Socket file exists but ping method may not; try a cheap real call.
  try {
    await call('workspace.list', {}, 1500);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Typed convenience wrappers
// ---------------------------------------------------------------------------

// herdr wire shapes use workspace_id/pane_id and wrap results; we normalize.
export interface WorkspaceInfo {
  id: string; // normalized from workspace_id
  label?: string;
  rootPaneId?: string; // from root_pane.pane_id on create
  [k: string]: unknown;
}

export interface TabInfo {
  id: string; // normalized from tab_id
  workspace_id: string;
  rootPaneId?: string; // from root_pane.pane_id when the tab ships a pane
  [k: string]: unknown;
}

export interface PaneInfo {
  id: string; // normalized from pane_id
  workspace_id: string;
  tab_id: string;
  [k: string]: unknown;
}

function normalizePane(p: Record<string, unknown>): PaneInfo {
  return { ...(p as unknown as PaneInfo), id: (p.pane_id as string) ?? (p.id as string) };
}

export interface PaneReadResult {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  source: string;
  format: string;
  text: string;
  truncated: boolean;
  revision: number;
}

export async function workspaceCreate(label: string, cwd?: string): Promise<WorkspaceInfo> {
  const r = (await call('workspace.create', { label, cwd: cwd ?? null, focus: false })) as {
    workspace: Record<string, unknown>;
    root_pane?: Record<string, unknown>;
  };
  return {
    ...r.workspace,
    id: r.workspace.workspace_id as string,
    rootPaneId: r.root_pane?.pane_id as string | undefined,
  } as WorkspaceInfo;
}

export async function workspaceList(): Promise<WorkspaceInfo[]> {
  const r = (await call('workspace.list', {})) as { workspaces?: Array<Record<string, unknown>> };
  return (r.workspaces ?? []).map(
    (w) => ({ ...w, id: w.workspace_id as string }) as WorkspaceInfo,
  );
}

export async function workspaceClose(id: string): Promise<void> {
  await call('workspace.close', { workspace_id: id }).catch(() => {});
}

/** Create a tab inside a herdr workspace (a canvas Zone maps 1:1 to a tab). */
export async function tabCreate(workspaceId: string, title?: string): Promise<TabInfo> {
  // Wire param is `label` (TabCreateParams in herdr-api.schema.json), NOT
  // `title` — herdr 0.9.1 silently ignores unknown fields, so sending `title`
  // "works" but the tab gets an auto-numbered label instead of the zone title.
  const r = (await call('tab.create', {
    workspace_id: workspaceId,
    label: title ?? null,
    focus: false,
  })) as { tab: Record<string, unknown>; root_pane?: Record<string, unknown> };
  const tab = (r.tab ?? (r as unknown as Record<string, unknown>)) as Record<string, unknown>;
  return {
    ...(tab as unknown as TabInfo),
    id: (tab.tab_id as string) ?? (tab.id as string),
    workspace_id: workspaceId,
    rootPaneId: r.root_pane?.pane_id as string | undefined,
  };
}

export async function tabClose(tabId: string): Promise<void> {
  await call('tab.close', { tab_id: tabId }).catch(() => {});
}

export async function paneSplit(
  targetPaneId: string,
  direction: 'right' | 'down',
  cwd?: string,
): Promise<PaneInfo> {
  const r = (await call('pane.split', {
    target_pane_id: targetPaneId,
    direction,
    cwd: cwd ?? null,
    focus: false,
  })) as { pane: Record<string, unknown> };
  return normalizePane(r.pane ?? (r as unknown as Record<string, unknown>));
}

export async function paneClose(paneId: string): Promise<void> {
  await call('pane.close', { pane_id: paneId }).catch(() => {});
}

export async function paneSendInput(paneId: string, text?: string, keys?: string[]): Promise<void> {
  const params: Record<string, unknown> = { pane_id: paneId };
  if (text !== undefined) params.text = text;
  if (keys !== undefined) params.keys = keys;
  await call('pane.send_input', params);
}

export async function paneRead(
  paneId: string,
  opts: { source?: string; format?: string; lines?: number } = {},
): Promise<PaneReadResult> {
  const r = (await call('pane.read', {
    pane_id: paneId,
    source: opts.source ?? 'visible',
    format: opts.format ?? 'ansi',
    lines: opts.lines ?? 1000,
    strip_ansi: false,
  })) as { read: PaneReadResult };
  return r.read ?? (r as unknown as PaneReadResult);
}

export type PaneAgentState = 'idle' | 'working' | 'blocked' | 'unknown';

export async function paneReportAgent(
  paneId: string,
  agent: string,
  state: PaneAgentState,
  message?: string,
): Promise<void> {
  await call('pane.report_agent', {
    pane_id: paneId,
    source: 'agent-canvas',
    agent,
    state,
    message: message ?? null,
  });
}

// ---------------------------------------------------------------------------
// Event subscription: one long-lived connection, 1s reconnect.
// ---------------------------------------------------------------------------

export interface HerdrEvent {
  event: string; // normalized dotted name, e.g. 'pane.exited', 'pane.agent_status_changed'
  data: Record<string, unknown>;
}

const SUBSCRIPTIONS = [
  'pane.exited',
  'pane.closed',
  'pane.created',
  'pane.agent_status_changed',
  'workspace.created',
  'workspace.closed',
  'tab.created',
  'tab.closed',
];

export function subscribeEvents(onEvent: (ev: HerdrEvent) => void): { close: () => void } {
  let closed = false;
  let sock: net.Socket | null = null;
  let buf = '';

  const connect = () => {
    if (closed) return;
    buf = '';
    sock = net.createConnection(HERDR_SOCKET_PATH);
    sock.on('connect', () => {
      sock?.write(
        JSON.stringify({
          id: 'cp:sub',
          method: 'events.subscribe',
          params: { subscriptions: SUBSCRIPTIONS.map((t) => ({ type: t })) },
        }) + '\n',
      );
    });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let msg: HerdrResponse;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 'cp:sub') continue; // subscribe ack
        const ev = normalizeEvent(msg);
        if (ev) onEvent(ev);
      }
    });
    const onDrop = () => {
      sock?.removeAllListeners();
      sock = null;
      if (!closed) setTimeout(connect, 1000);
    };
    sock.on('error', onDrop);
    sock.on('close', onDrop);
  };

  connect();
  return {
    close: () => {
      closed = true;
      sock?.destroy();
    },
  };
}

function normalizeEvent(msg: HerdrResponse): HerdrEvent | null {
  // Two envelope styles: {event: 'pane.agent_status_changed', data} and
  // {event: 'workspace_created', data} / {type: 'pane_exited', ...}.
  const raw = (msg.event || msg.type) as string | undefined;
  if (!raw) return null;
  // underscore style -> dotted: 'pane_exited' -> 'pane.exited',
  // 'pane_agent_status_changed' -> 'pane.agent_status_changed'
  const dotted = raw.includes('.') ? raw : raw.replace('_', '.');
  const data = (msg.data as Record<string, unknown>) ?? (msg as unknown as Record<string, unknown>);
  return { event: dotted, data };
}

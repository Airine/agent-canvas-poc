import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DATA_ROOT } from './e/config.js';
import { getGraphStore } from './graph.js';
import { registry } from './registry.js';

interface Running { child: ChildProcess; url?: string; closed: Promise<void> }
/** Codex owns its threads. Canvas owns card identity, the dedicated home and process. */
export class CodexNativeManager {
  private running = new Map<string, Running>();
  private starting = new Map<string, Promise<{url: string}>>();
  private closing = false;
  status(wid: string, nid: string) {
    this.node(wid, nid);
    const runtime = this.running.get(`${wid}/${nid}`);
    return {url: runtime?.url ? this.publicUrl(wid, nid) : undefined, lifecycle: runtime?.url ? 'ready' : runtime ? 'starting' : 'stopped'};
  }
  private publicUrl(wid: string, nid: string) { return `/native/codex/${encodeURIComponent(wid)}/${encodeURIComponent(nid)}/ui/`; }
  upstream(wid: string, nid: string) {
    this.node(wid, nid); registry.assertWritable(wid);
    const url = this.running.get(`${wid}/${nid}`)?.url;
    if (!url) throw new Error('Codex card is stopped');
    return new URL(url).origin;
  }
  private node(wid: string, nid: string) {
    const node = getGraphStore(wid)?.getNode(nid);
    if (registry.backend(wid) !== 'e' || node?.nativeEngine !== 'codex') throw new Error('Codex card not found');
    return node;
  }
  start(wid: string, nid: string): Promise<{url: string}> {
    this.node(wid, nid); registry.assertWritable(wid);
    if (this.closing) throw new Error('Codex manager is closing');
    const key = `${wid}/${nid}`, existing = this.starting.get(key), current = this.running.get(key);
    if (existing) return existing;
    if (current?.url) return Promise.resolve({url: this.publicUrl(wid, nid)});
    if (this.running.size >= 4) throw new Error('Codex native card limit reached (4)');
    const task = this.launch(wid, nid).finally(() => this.starting.delete(key));
    this.starting.set(key, task); return task;
  }
  private async launch(wid: string, nid: string) {
    const binary = process.env.CODEX_NATIVE_BIN, webview = process.env.CODEX_NATIVE_WEBVIEW;
    if (!binary || !webview || !fs.existsSync(binary) || !fs.existsSync(path.join(webview, 'index.html'))) throw new Error('Codex native assets not configured');
    const root = path.join(DATA_ROOT, 'codex-native', nid), home = path.join(root, 'home');
    fs.mkdirSync(home, {recursive: true, mode: 0o700});
    const provider = this.node(wid, nid).codexProvider ?? 'chatgpt';
    if (!['chatgpt', 'singularity-x'].includes(provider)) throw new Error('Unsupported Codex provider');
    const auth = process.env.CODEX_NATIVE_AUTH_FILE;
    if (provider === 'singularity-x' && fs.existsSync(path.join(home, 'auth.json'))) throw new Error('Custom provider requires a separate home without ChatGPT auth');
    if (provider === 'chatgpt' && auth && !fs.existsSync(path.join(home, 'auth.json'))) {
      // Local reference only. Credentials never cross into the renderer or logs.
      fs.symlinkSync(fs.realpathSync(auth), path.join(home, 'auth.json'));
    }
    const script = fileURLToPath(new URL('../../tools/experiments/codex-native-ui/bridge.py', import.meta.url));
    const args = [script, '--canvas-host', '--port', '0', '--base-path', this.publicUrl(wid, nid).replace(/\/ui\/$/, ''), '--codex', binary, '--webview', webview,
      '--home', home, '--cwd', registry.get(wid)!.path, '--evidence', path.join(root, 'runs', randomUUID()), '--provider', provider];
    for (const port of new Set([process.env.PORT || '3000', process.env.CANVAS_UI_PORT || '5173'])) {
      if (!/^\d+$/.test(port)) throw new Error('Invalid Canvas port');
      args.push('--parent-origin', `http://127.0.0.1:${port}`);
    }
    const key = `${wid}/${nid}`;
    const log = fs.openSync(path.join(root, 'host.log'), 'a', 0o600);
    const child = spawn('python3', args, {stdio: ['ignore', 'pipe', log], env: process.env});
    fs.closeSync(log);
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
    const running: Running = {child, closed}; this.running.set(key, running);
    const update = (state: 'starting' | 'ready' | 'stopped' | 'failed') => {
      getGraphStore(wid)?.patchNode(nid, {sessionState: state, status: state === 'failed' ? 'failed' : 'waiting'});
      registry.persist();
    };
    update('starting');
    child.once('close', () => { if (this.running.get(key) === running) { this.running.delete(key); update('stopped'); } });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Codex native startup timeout')), 30000);
        let buffer = '';
        const done = (error?: Error, value?: string) => { clearTimeout(timer); if (error) reject(error); else resolve(value!); };
        child.once('error', error => done(error));
        child.once('close', () => done(new Error('Codex native host exited; inspect private host.log')));
        child.stdout!.on('data', chunk => {
          buffer += String(chunk);
          if (buffer.length > 8192) return done(new Error('Invalid native host handshake'));
          const line = buffer.split('\n')[0];
          if (!buffer.includes('\n')) return;
          try {
            const result = JSON.parse(line);
            if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(result.url)) throw new Error('Invalid native host URL');
            done(undefined, result.url);
          } catch (error) { done(error as Error); }
        });
      });
      running.url = `${url}/ui/`; update('ready'); return {url: this.publicUrl(wid, nid)};
    } catch (error) { child.kill('SIGTERM'); await closed; update('failed'); throw error; }
  }
  async stop(wid: string, nid: string) {
    this.node(wid, nid);
    const running = this.running.get(`${wid}/${nid}`);
    if (running) {
      const kill = setTimeout(() => running.child.kill('SIGKILL'), 10000);
      running.child.kill('SIGTERM'); await running.closed; clearTimeout(kill);
    }
    return this.status(wid, nid);
  }
  async close() {
    this.closing = true;
    await Promise.all([...this.running.keys()].map(key => { const [wid, nid] = key.split('/'); return this.stop(wid, nid); }));
  }
}
export const codexNative = new CodexNativeManager();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { SESSION_LIFECYCLE_VERSION, type RuntimeStatus } from './contracts.js';
import { PROJECT_ROOT } from '../workspace-paths.js';

export const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA_ROOT = path.resolve(process.env.CANVAS_DATA_DIR || path.join(APP_ROOT, 'api/data'));
export const MAX_SESSIONS = Math.max(1, Math.min(8, Number(process.env.CANVAS_MAX_SESSIONS) || 4));
export function runtimeConfig() {
  const adeRoot = process.env.ADE_ROOT;
  if (!adeRoot || !path.isAbsolute(adeRoot)) throw new Error('ADE_ROOT must point to an installed ADE checkout');
  if (!fs.statSync(PROJECT_ROOT).isDirectory()) throw new Error('project directory unavailable');
  const piBin = process.env.PI_BIN || 'pi';
  return { adeRoot: fs.realpathSync(adeRoot), piBin, cwd: fs.realpathSync(PROJECT_ROOT) };
}
function probe(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); child.kill('SIGTERM'); if (error) reject(error); else resolve(output); };
    const timer = setTimeout(() => finish(new Error(`${path.basename(command)} readiness timeout`)), 15000);
    child.on('error', error => finish(error));
    child.stdout.on('data', chunk => {
      output += String(chunk);
      if (Buffer.byteLength(output) > 4 * 1024 * 1024) return finish(new Error('runtime catalog too large'));
    });
    child.on('exit', code => finish(code ? new Error(`${path.basename(command)} readiness failed (${code})`) : undefined));
    // Consume stderr without exposing model config or credentials.
    child.stderr.resume();
    child.stdin.end();
  });
}
let cached: { at: number; value: RuntimeStatus } | undefined;
let inFlight: Promise<RuntimeStatus> | undefined;
export function runtimeStatus(): Promise<RuntimeStatus> {
  if (cached && Date.now() - cached.at < 15000) return Promise.resolve(cached.value);
  if (inFlight) return inFlight;
  inFlight = check().then(value => { cached = { at: Date.now(), value }; return value; }).finally(() => { inFlight = undefined; });
  return inFlight;
}
async function check(): Promise<RuntimeStatus> {
  const base = { projectRoot: PROJECT_ROOT, maxSessions: MAX_SESSIONS, models: [], sessionLifecycleVersion: SESSION_LIFECYCLE_VERSION };
  try {
    const cfg = runtimeConfig();
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node >=22.13 required');
    const modules = ['packages/e-core/src/socket.ts', 'packages/e-core/src/daemon-bootstrap.ts', 'packages/e-orca-bridge/src/index.ts'];
    const code = `const a=await import(${JSON.stringify(pathToFileURL(path.join(cfg.adeRoot, modules[0])).href)}); const b=await import(${JSON.stringify(pathToFileURL(path.join(cfg.adeRoot, modules[1])).href)}); const c=await import(${JSON.stringify(pathToFileURL(path.join(cfg.adeRoot, modules[2])).href)}); if(!a.CoreSocketClient||!b.canonicalBootstrapJson||!c.OrcaAgentSessionBridge)throw Error('ADE API incompatible');console.log('ready')`;
    await probe(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code]);
    const piVersion = (await probe(cfg.piBin, ['--version'])).trim();
    // --list-models exits without opening a persistent RPC session or prompting.
    const catalog = await probe(cfg.piBin, ['--list-models', '--no-extensions', '--no-skills', '--no-prompt-templates']);
    const models: RuntimeStatus['models'] = catalog.split('\n').flatMap(line => {
      const columns = line.trim().split(/\s+/);
      return columns.length >= 6 && columns[0] !== 'provider' && /^(yes|no)$/.test(columns.at(-1)!)
        ? [{ provider: columns[0], id: columns[1] }] : [];
    });
    return { ...base, models, piVersion, available: true };
  } catch (error) { return { ...base, available: false, reason: error instanceof Error ? error.message : String(error) }; }
}

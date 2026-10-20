import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(app, '.env.e'))) loadEnvFile(path.join(app, '.env.e'));
const production = process.argv.includes('--production');
if (production && (!existsSync(path.join(app, 'dist/index.html')) || !existsSync(path.join(app, 'dist-api/index.js')))) throw new Error('Run npm run build && npm run build:api before start:e');
const apiPort = Number(process.env.API_PORT || 3300), uiPort = Number(process.env.CANVAS_UI_PORT || 5173);
if (!production && apiPort === uiPort) throw new Error('API and Vite ports must differ');
for (const port of production ? [apiPort] : [apiPort, uiPort]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid local port');
  await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', () => reject(new Error(`Port ${port} occupied; refusing to use another workspace service`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const env = { ...process.env, PORT: String(apiPort), API_PORT: String(apiPort), CANVAS_UI_PORT: String(uiPort), CANVAS_BACKEND: 'e' };
const children = [];
let closing = false;
function stop(code = 0) {
  if (closing) return; closing = true; process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); process.exit(code); }, 16000);
  timer.unref();
}
const commands = production ? [['--import', 'tsx', 'dist-api/index.js']] : [['--import', 'tsx', 'api/index.ts'], ['node_modules/vite/bin/vite.js']];
const accessPort = production ? apiPort : uiPort;
for (const args of commands) {
  const child = spawn(process.execPath, args, { cwd: app, env, stdio: 'inherit' });
  children.push(child); child.on('error', error => { console.error(error.message); stop(1); });
  child.once('exit', code => { if (!closing) stop(code ?? 1); });
}
process.once('SIGINT', () => stop()); process.once('SIGTERM', () => stop());
let ready = false;
for (let i = 0; i < 60 && !closing; i++) {
  try {
    const response = await fetch(`http://127.0.0.1:${accessPort}/api/runtime/status`, { signal: AbortSignal.timeout(5000) });
    const status = await response.json();
    if (response.ok && typeof status.available === 'boolean' && typeof status.projectRoot === 'string') {
      console.log(`\nAgent Canvas: http://127.0.0.1:${accessPort}/\nProject: ${status.projectRoot}\nRuntime: ${status.available ? 'ready' : status.reason}`);
      ready = true; break;
    }
  } catch { /* wait for compile/server */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!ready && !closing) { console.error('API/frontend compatibility check timed out'); stop(1); }

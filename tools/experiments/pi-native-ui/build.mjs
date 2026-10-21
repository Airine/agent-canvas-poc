// Build a local fixture against separately acquired upstream sources and app CSS.
// Never copies vendor source or bundles into this repository.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const [sourceArg, depsArg, outputArg, asarPath] = process.argv.slice(2);
if (!asarPath) throw new Error('Usage: node build.mjs UPSTREAM_SOURCE DEPS_DIR OUTPUT_DIR APP_ASAR');
const source = resolve(sourceArg), deps = resolve(depsArg), output = resolve(outputArg);
const here = dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes('--live');
const require = createRequire(join(deps, 'package.json'));
const { build } = require('esbuild');
const asar = require('@electron/asar');
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
if (commit !== 'cb88131b34680afd45d931a37d4bd0a7893f29ed') throw new Error('Expected PI Desktop v0.20.1 sources');
if (execFileSync('git', ['-C', source, 'status', '--porcelain'], {encoding: 'utf8'}).trim()) throw new Error('Upstream source must be unmodified');
const installed = JSON.parse(asar.extractFile(asarPath, 'package.json'));
if (installed.version !== '0.20.1') throw new Error('Installed stylesheet version does not match source');
await mkdir(join(output, 'assets'), {recursive: true});
const all = asar.listPackage(asarPath).map(path => path.replace(/^\//, ''));
const cssPaths = all.filter(path => path.startsWith('out/renderer/assets/') && path.endsWith('.css'))
  .sort((a, b) => Number(b.includes('/index-')) - Number(a.includes('/index-')));
if (!cssPaths.length) throw new Error('Original renderer CSS not found');
for (const path of all.filter(path => path.startsWith('out/renderer/assets/') && /\.(css|woff2?|ttf|svg|png|webp)$/.test(path))) {
  await writeFile(join(output, 'assets', path.split('/').pop()), asar.extractFile(asarPath, path));
}
const result = await build({
  entryPoints: [live ? join(here, '../../../app/native/pi.tsx') : join(here, 'fixture.tsx')], outfile: join(output, 'fixture.js'),
  bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', metafile: true,
  define: {'process.env.NODE_ENV': '"production"', 'import.meta.env': '{"DEV":false,"MODE":"production"}'},
  loader: {'.css': 'empty', '.svg': 'file', '.png': 'file', '.woff2': 'file'},
  nodePaths: [join(deps, 'node_modules')],
  alias: {react: join(deps, 'node_modules/react'), 'react-dom': join(deps, 'node_modules/react-dom'),
    '@upstream': join(source, 'apps/desktop/src')},
  plugins: [{name: 'upstream-workspace', setup(build) {
    build.onResolve({filter: /^@pi-desktop\//}, ({path}) => {
      const [, pkg, ...rest] = path.split('/');
      const base = join(source, 'packages', pkg, 'src', rest.join('/'));
      const resolved = [base + '.ts', join(base, 'index.ts')].find(existsSync);
      if (!resolved) throw new Error(`No source entry for ${path}`);
      return {path: resolved};
    });
    build.onResolve({filter: /\?url$/}, ({path, resolveDir}) => ({
      path: resolve(resolveDir, path.slice(0, -4)), namespace: 'url-asset',
    }));
    build.onLoad({filter: /.*/, namespace: 'url-asset'}, async ({path}) => ({contents: await readFile(path), loader: 'file'}));
  }}],
});
const prefix = live ? '/native/pi' : '';
await writeFile(join(output, 'ui.html'), `<!doctype html><html><head><meta charset="utf-8">
${cssPaths.map(path => `<link rel="stylesheet" href="${prefix}/assets/${path.split('/').pop()}">`).join('\n')}
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#root{height:calc(100% - 54px);position:relative}
.fixture-bar{height:54px;padding:7px 12px;box-sizing:border-box;background:${live ? '#f6f6f6' : '#fff8df'};border-bottom:1px solid #e5e7eb;font:11px system-ui;color:#4b5563}
.fixture-bar button{border:1px solid #c2b484;background:white;padding:3px 7px;border-radius:5px;margin-right:8px}</style>
</head><body><div class="fixture-bar">${live ? '<span id="native-lifecycle">Connecting to e/Pi</span> <button id="native-resume" hidden>Restore session</button><button id="native-stop" hidden>Stop session</button><div id="native-status" role="status"></div>' : '<button id="approval-fixture">Show fixture approval</button><span id="fixture-status">UI fixture only. No real agent.</span>'}</div><div id="root"></div><script type="module" src="${prefix}/fixture.js"></script></body></html>`);
await copyFile(join(here, 'card.html'), join(output, 'index.html'));
await copyFile(join(source, 'LICENSE'), join(output, 'UPSTREAM-LICENSE'));
const inputs = Object.keys(result.metafile.inputs);
await writeFile(join(output, 'build-evidence.json'), JSON.stringify({sourceCommit: commit,
  installedVersion: installed.version, inputModules: inputs.length,
  upstreamModules: inputs.filter(path => path.includes('agent-canvas-pi-native-ui-source')).length,
  stylesheetFiles: cssPaths, hostRuntimeConnected: live}, null, 2));
console.log(`Built ${inputs.length} modules into ${output}`);

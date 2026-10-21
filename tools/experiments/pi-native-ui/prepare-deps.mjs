// Separate, browser-only build dependencies; no Electron or agent runtime install.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const [source, destination] = process.argv.slice(2);
if (!destination) throw new Error('Usage: node prepare-deps.mjs UPSTREAM_SOURCE DEPS_DIR');
const desktop = JSON.parse(await readFile(join(source, 'apps/desktop/package.json')));
const shared = JSON.parse(await readFile(join(source, 'packages/shared/package.json')));
const names = ['react', 'react-dom', 'react-i18next', 'i18next', 'zustand', 'dompurify', 'katex',
  'lucide-react', 'mermaid', 'pinyin-pro', 'react-markdown', 'rehype-katex', 'rehype-raw',
  'rehype-sanitize', 'remark-gfm', 'remark-math', 'remark-parse', 'shiki', 'unified'];
const dependencies = Object.fromEntries(names.map(name => [name, desktop.devDependencies[name]]));
Object.assign(dependencies, {esbuild: '^0.25.0', typebox: shared.dependencies.typebox, '@electron/asar': '^3.4.1'});
await mkdir(destination, {recursive: true});
await writeFile(join(destination, 'package.json'), JSON.stringify({private: true, dependencies}, null, 2));
console.log(`Dependency manifest: ${resolve(destination)}/package.json`);
console.log('Install separately with npm install --ignore-scripts --no-audit --no-fund --prefix DEPS_DIR.');

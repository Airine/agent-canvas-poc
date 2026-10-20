import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseWiki, stringifyWiki } from './wiki.mjs';
import { rewriteLinks } from './content-links.mjs';

const site = path.resolve(import.meta.dirname, '..');
const architecture = path.resolve(site, '../docs/architecture');
const wiki = path.join(architecture, 'wiki');
const target = path.join(site, 'content/docs');
const files = readdirSync(wiki, { recursive: true }).filter(f => f.endsWith('.md')).sort();
const known = new Set(files);

// Do not silently bless stale prose or stale architecture diagrams during build.
execFileSync(process.execPath, [path.join(architecture, 'verify.mjs')], { stdio: 'inherit' });
rmSync(target, { recursive: true, force: true });
for (const file of files) {
  const { data, content } = parseWiki(readFileSync(path.join(wiki, file), 'utf8'));
  if (!data.title || !data.description) throw new Error(`${file}: title and description are required`);
  const body = rewriteLinks(content, file, known).replace(/^# [^\n]+\n/, '');
  const dest = path.join(target, file);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, stringifyWiki(body, data));
}
writeFileSync(path.join(target, 'meta.json'), JSON.stringify({ title: '开发者文档', pages: ['index', 'getting-started', 'repository-layout', 'system', 'data-flow', 'modules', 'review', 'unused-files', 'health', 'maintenance', 'entrypoints'] }, null, 2));
writeFileSync(path.join(target, 'modules/meta.json'), JSON.stringify({ title: '模块指南', pages: ['frontend-shell', 'canvas', 'chat-ui', 'control-plane', 'e-runtime', 'e-approvals', 'message-content', 'herdr', 'prototypes', 'ui-primitives', 'development', 'documentation', 'research'] }, null, 2));
mkdirSync(path.join(site, 'public'), { recursive: true });
cpSync(path.join(architecture, 'architecture.html'), path.join(site, 'public/architecture.html'));
console.log(`Prepared ${files.length} pages from the architecture wiki (single source of truth).`);

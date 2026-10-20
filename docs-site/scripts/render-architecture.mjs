import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseWiki } from './wiki.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const arch = path.join(root, 'docs/architecture');
const wikiRoot = path.join(arch, 'wiki');
const wiki = Object.fromEntries(readdirSync(wikiRoot, { recursive: true }).filter(f => f.endsWith('.md')).sort().map(f => [f, readFileSync(path.join(wikiRoot, f), 'utf8')]));
const pages = Object.fromEntries(Object.entries(wiki).map(([f, text]) => [f, parseWiki(text)]));
const map = JSON.parse(readFileSync(path.join(arch, 'reports/code-map.json'), 'utf8'));
const health = JSON.parse(readFileSync(path.join(arch, 'reports/health.json'), 'utf8'));
const modulePages = Object.entries(pages).filter(([f]) => f.startsWith('modules/'));
const idOf = f => path.basename(f, '.md');
const claims = (file, cover) => file === cover || file.startsWith(cover.endsWith('/') ? cover : `${cover}/`);
const owner = file => modulePages.find(([, p]) => p.data.covers?.some(c => claims(file, c)))?.[0];
const edges = new Map();
for (const [file, record] of Object.entries(map.files)) {
  const from = owner(file);
  for (const dependency of record.imports ?? []) {
    const to = owner(dependency);
    if (!from || !to || from === to) continue;
    const key = `${idOf(from)}:${idOf(to)}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
}
const layout = {
  'frontend-shell': ['browser', 1, 1, 'globe'],
  canvas: ['browser', 4, 1, 'grid'],
  'chat-ui': ['browser', 4, 4.2, 'chat'],
  'ui-primitives': ['browser', 1, 7.4, 'layers'],
  prototypes: ['browser', 1, 4.2, 'cube'],
  'control-plane': ['host', 9.5, 1, 'gateway'],
  herdr: ['host', 12.5, 4.2, 'server'],
  collaboration: ['host', 12.5, 7.4, 'chat'],
  development: ['host', 9.5, 7.4, 'wrench'],
  'e-runtime': ['session', 18, 1, 'cpu'],
  'e-approvals': ['session', 21, 4.2, 'shield'],
  'message-content': ['session', 18, 7.4, 'file'],
};
const flows = pages['data-flow.md'].data.flows;
const touched = new Set([...edges.keys()].flatMap(k => k.split(':')).concat(flows.flatMap(f => f.steps.flatMap(s => [s.from, s.to]))));
const nodes = modulePages.filter(([f]) => touched.has(idOf(f)) && layout[idOf(f)]).map(([file, page]) => {
  const code = idOf(file), [district, x, y, icon] = layout[code];
  const owned = Object.keys(map.files).filter(f => owner(f) === file);
  const marks = [];
  if (health.dead.some(d => owned.includes(d.file))) marks.push('dead');
  if (health.cycles.some(c => c.files.some(f => owned.includes(f)))) marks.push('cycles');
  if (health.hotspots.some(d => owned.includes(d.file))) marks.push('hotspot');
  if (health.breaks.some(d => owned.includes(d.file))) marks.push('breaks');
  return { code, name: page.data.title, short: page.data.title.slice(0, 6), district, x, y, icon, h: ['control-plane', 'e-runtime'].includes(code) ? 1.6 : .8, form: ['control-plane', 'e-runtime'].includes(code) ? 'tall' : 'box', page: file, sources: page.data.sources.map(s => s.split(' ')[0]), ...(marks.length ? { health: marks } : {}) };
});
// The external boundary is stated in system.md and called by the worker;
// template-string dynamic imports cannot be inferred from the static map.
nodes.push({ code: 'external-runtime', name: 'ADE / Pi', short: 'ADE / Pi', district: 'session', x: 21, y: 1, icon: 'plug', h: .8, form: 'external', sources: ['app/scripts/e-runtime-worker.mts'] });
const districts = [
  { id: 'browser', label: '浏览器', icon: 'globe', r: [0, 0, 6.5, 13], page: 'system.md#进程边界' },
  { id: 'host', label: '本地控制面', icon: 'server', r: [8.5, 0, 6.5, 13], page: 'modules/control-plane.md' },
  { id: 'session', label: '会话运行时', icon: 'cpu', r: [17, 0, 6.5, 13], page: 'modules/e-runtime.md' },
];

// Visibility-graph routing avoids drawing edges through unrelated buildings.
// This is presentation geometry only; no semantic edges are invented.
function route(from, to) {
  const start = nodes.find(n => n.code === from), end = nodes.find(n => n.code === to);
  const obstacles = nodes.filter(n => n !== start && n !== end).map(n => [n.x - .12, n.y - .12, n.x + 1.22, n.y + 1.22]);
  const a = [start.x + .55, start.y + .55], b = [end.x + .55, end.y + .55];
  function blocked(p, q) {
    return obstacles.some(([x0, y0, x1, y1]) => {
      let lo = 0, hi = 1;
      for (const [origin, delta, min, max] of [[p[0], q[0] - p[0], x0, x1], [p[1], q[1] - p[1], y0, y1]]) {
        if (Math.abs(delta) < 1e-9) { if (origin <= min || origin >= max) return false; }
        else { const t1 = (min - origin) / delta, t2 = (max - origin) / delta; lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2)); }
      }
      return lo < hi;
    });
  }
  if (!blocked(a, b)) return [];
  const points = [a, b, ...obstacles.flatMap(([x0, y0, x1, y1]) => [[x0 - .1, y0 - .1], [x1 + .1, y0 - .1], [x0 - .1, y1 + .1], [x1 + .1, y1 + .1]])];
  const distances = points.map(() => Infinity), previous = [], done = new Set(); distances[0] = 0;
  while (done.size < points.length) {
    let at = -1;
    for (let i = 0; i < points.length; i++) if (!done.has(i) && (at < 0 || distances[i] < distances[at])) at = i;
    if (!Number.isFinite(distances[at])) throw new Error(`No diagram route: ${from} -> ${to}`);
    if (at === 1) break;
    done.add(at);
    for (let i = 0; i < points.length; i++) {
      if (done.has(i) || blocked(points[at], points[i])) continue;
      const distance = distances[at] + Math.hypot(points[i][0] - points[at][0], points[i][1] - points[at][1]);
      if (distance < distances[i]) { distances[i] = distance; previous[i] = at; }
    }
  }
  const via = []; for (let at = previous[1]; at !== 0; at = previous[at]) via.unshift(points[at]);
  return via;
}
const codes = new Set(nodes.map(n => n.code));
const links = [...edges.entries()].map(([key, count]) => { const [from, to] = key.split(':'); return { from, to, label: `${count} 处静态导入` }; }).filter(l => codes.has(l.from) && codes.has(l.to)).map(l => ({ ...l, via: route(l.from, l.to) }));
const counters = {};
const doorplates = Object.fromEntries(nodes.map(n => [n.code, `${n.district[0].toUpperCase()}${counters[n.district] = (counters[n.district] ?? 0) + 1}`]));
const data = {
  meta: { title: 'Agent Canvas', headline: pages['system.md'].data.description, lang: 'zh', stats: [['源码', String(health.files)], ['行数', String(Object.values(map.files).reduce((sum, f) => sum + (f.loc ?? 0), 0))], ['模块', String(modulePages.length)]], sources: ['docs/architecture/wiki/system.md'] },
  wiki, files: Object.fromEntries(Object.entries(map.files).map(([f, d]) => [f, d.loc ?? 0])),
  health: { files: health.files, dead: health.dead.length, suspects: health.suspects.length, deadExports: health.deadExports, cycles: health.cycles.length, breaks: health.breaks.length },
  districts,
  nodes: nodes.map(n => ({ ...n, code: doorplates[n.code] })),
  links: links.map(l => ({ ...l, from: doorplates[l.from], to: doorplates[l.to] })),
  flows: flows.map(f => ({ ...f, steps: f.steps.map(s => ({ ...s, from: doorplates[s.from], to: doorplates[s.to], via: route(s.from, s.to) })) })),
};
const digest = execFileSync(process.execPath, [path.join(arch, 'verify.mjs'), '--digest'], { encoding: 'utf8' }).trim();
const template = readFileSync(path.join(arch, 'templates/architecture.html'), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
writeFileSync(path.join(arch, 'data.json'), JSON.stringify(data, null, 2) + '\n');
writeFileSync(path.join(arch, 'architecture.html'), template.replaceAll('__TITLE__', 'Agent Canvas').replaceAll('__WIKI_DIGEST__', digest).replace('__ARCH_DATA__', () => json));
console.log(`Rendered ${nodes.length} nodes, ${links.length} import relationships and ${flows.length} flows from ${Object.keys(wiki).length} wiki pages.`);

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stringifyWiki } from './wiki.mjs';
import { createHash } from 'node:crypto';
import { reconcileUnusedReview } from './unused-review.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/architecture/reports');
mkdirSync(out, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const map = JSON.parse(execFileSync(process.execPath, [path.join(import.meta.dirname, 'code-map.mjs'), root, 'app/', 'tools/legacy/render-preview/'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
delete map.root; // Portable evidence: no developer-specific absolute paths.
writeFileSync(path.join(out, 'code-map.json'), JSON.stringify(map, null, 2) + '\n');

// The mandated Knip 5 command is attempted verbatim. Current Knip 5 does not
// accept "cycles"; retain the failure, then use its supported issue types.
const runKnip = (types) => spawnSync('npx', ['-y', 'knip@5', '--reporter', 'json', '--include', types], { cwd: path.join(root, 'app'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
const mandated = runKnip('files,exports,cycles');
const compatible = mandated.status === 0 || mandated.stdout.trim().startsWith('{') ? mandated : runKnip('files,exports');
let knip;
try { knip = JSON.parse(compatible.stdout); } catch { knip = null; }
writeFileSync(path.join(out, 'knip.json'), JSON.stringify({ command: 'npx -y knip@5 --reporter json --include files,exports,cycles', status: mandated.status, stderr: mandated.stderr, fallback: 'npx -y knip@5 --reporter json --include files,exports', fallbackStatus: compatible.status, fallbackError: compatible.error?.message ?? compatible.stderr, result: knip }, null, 2) + '\n');

const dead = [], suspects = [];
const ledgerPath = path.join(root, 'docs/architecture/unused-file-review.json');
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : undefined;
const unusedReview = knip && ledger ? reconcileUnusedReview(
  ledger.records,
  new Set(knip.files.map(f => `app/${f}`)),
  file => existsSync(path.join(root, file)) ? createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') : undefined,
) : [];
const countReview = status => unusedReview.filter(item => item.status === status).length;
const reviewNote = unusedReview.length
  ? `\n\n${ledger.reviewedAt} 的 ${unusedReview.length} 项人工复核：${countReview('removed')} 个文件已删除；${countReview('retain-uncommitted')} 个保留未提交内容、${countReview('retain-dependency')} 个保留其依赖，均仍计入未使用候选。${countReview('changed')} 项内容或存在状态改变，需要重新复核；${countReview('now-referenced')} 项不再由 Knip 报未使用。逐项证据与职责见[未使用文件复核](unused-files.md)。`
  : '';
for (const f of knip?.files ?? []) {
  const file = `app/${f}`;
  const name = path.basename(f), base = name.replace(/\.[^.]+$/, '');
  const result = spawnSync('rg', ['-l', '-F', '-e', name, '-e', base, '--glob', '!docs/architecture/**', '--glob', '!docs-site/**', '--glob', '!**/package-lock.json', '--glob', '!**/bun.lock', '.'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const refs = result.stdout.trim().split('\n').map(p => p.replace(/^\.\//, '')).filter(p => p && p !== file);
  // TypeScript resolves sidecar declarations by filename, not an import string.
  if (/\.d\.[cm]?ts$/.test(file)) {
    const implementation = file.replace(/\.d\.mts$/, '.mjs').replace(/\.d\.cts$/, '.cjs').replace(/\.d\.ts$/, '.js');
    if (existsSync(path.join(root, implementation))) refs.push(`${implementation}（同名类型声明，由 TypeScript 自动解析）`);
  }
  // rg may traverse files concurrently; stable order keeps generated prose deterministic.
  refs.sort();
  (refs.length ? suspects : dead).push({ file, refs });
}

// Tarjan SCC over the deterministic oxc graph. Type-only imports are retained.
let next = 0;
const state = new Map(), stack = [], components = [];
function visit(file) {
  const item = { index: next, low: next++, stacked: true }; state.set(file, item); stack.push(file);
  for (const dep of map.files[file].imports ?? []) {
    if (!map.files[dep]) continue;
    if (!state.has(dep)) { visit(dep); item.low = Math.min(item.low, state.get(dep).low); }
    else if (state.get(dep).stacked) item.low = Math.min(item.low, state.get(dep).index);
  }
  if (item.low !== item.index) return;
  const component = []; let popped;
  do { popped = stack.pop(); state.get(popped).stacked = false; component.push(popped); } while (popped !== file);
  if (component.length > 1 || map.files[file].imports?.includes(file)) components.push(component.sort());
}
Object.keys(map.files).forEach(f => { if (!state.has(f)) visit(f); });
const cycles = components.map(files => {
  const allowed = new Set(files), start = files[0];
  function find(current, trail) {
    for (const next of map.files[current].imports ?? []) {
      if (!allowed.has(next)) continue;
      if (next === start) return [...trail, start];
      if (!trail.includes(next)) { const found = find(next, [...trail, next]); if (found) return found; }
    }
  }
  return { files, path: find(start, [start]) };
});

const churn = new Map();
for (const file of git('log', '--since=12 months ago', '--name-only', '--pretty=format:').split('\n').filter(Boolean)) churn.set(file, (churn.get(file) ?? 0) + 1);
const hotspots = Object.entries(map.files).filter(([f, data]) => existsSync(path.join(root, f)) && data.loc && churn.has(f)).map(([file, data]) => ({ file, changes: churn.get(file), lines: data.loc, score: churn.get(file) * data.loc })).sort((a, b) => b.score - a.score).slice(0, 10);
const breaks = Object.entries(map.files).flatMap(([file, data]) => [ ...(data.error ? [{ file, detail: data.error }] : []), ...(data.unresolved ?? []).map(detail => ({ file, detail })) ]);
const imported = new Set(Object.values(map.files).flatMap(f => f.imports ?? []));
const entries = Object.keys(map.files).filter(f => !imported.has(f)).map(file => {
  let kind = '非入口：未接入文件或可复用组件，结合死代码复核，不推断运行能力';
  if (file === 'app/src/main.tsx') kind = '真实入口：浏览器启动 → 路由 → 工作区/画布，见数据流「浏览器入口」';
  else if (file === 'app/api/index.ts') kind = '真实入口：HTTP / WebSocket 控制面，见数据流「控制面入口」';
  else if (file === 'app/scripts/dev-e.mjs') kind = '真实入口：开发/生产启动器，见数据流「启动与退出」';
  else if (file === 'app/scripts/e-runtime-worker.mts') kind = '真实入口：父进程 fork 的 IPC worker，见数据流「会话进程」';
  else if (file === 'app/scripts/canvas-tools.mjs') kind = '真实入口：由会话 worker 生成的扩展显式加载，走私有 FD 与 e 审批，见数据流「Agent 协作」';
  else if (file === 'app/scripts/collaboration-inspect.mjs') kind = '只读入口：打印版本匹配的 Skill / 契约 / manifest，不启动会话或发送消息';
  else if (file === 'app/scripts/demo-quant-canvas/run.mjs') kind = '示例入口：离线量化研究模拟，显式运行，不连接模型或券商';
  else if (/test[/. -]|\.test\.|\.spec\./.test(file)) kind = '测试入口：由测试运行器或显式命令执行，不是产品服务';
  else if (file.startsWith('tools/legacy/render-preview/')) kind = '历史验证脚本：显式运行才访问 HTTP / WS，见数据流「历史工具」';
  else if (/config\.|tailwind|postcss|eslint/.test(file)) kind = '非入口：构建或检查配置，由对应工具加载';
  return { file, kind };
});
const report = { unusedReview, head: git('rev-parse', 'HEAD'), files: Object.keys(map.files).length, dead, suspects, deadExports: (knip?.issues ?? []).reduce((sum, i) => sum + (i.exports?.length ?? 0), 0), cycles, hotspots, breaks, entries };
writeFileSync(path.join(out, 'health.json'), JSON.stringify(report, null, 2) + '\n');
const list = (items) => items.length ? items.map(x => `- \`${x.file}\`${x.refs?.length ? `：引用痕迹见 ${x.refs.slice(0, 5).map(f => `\`${f}\``).join('、')}；静态未使用不等于可删除。` : '：Knip 报告未使用，文件名与基础名全仓搜索未找到其他引用；删除前仍需确认外部脚本入口。'}`).join('\n') : '本次未发现符合此分类的文件。';
const health = `# 代码体检\n\n本页由 \`npm --prefix docs-site run architecture:analyze\` 再生。范围为当前工作区（包含未跟踪、未忽略文件），共 ${report.files} 个 JS/TS 源文件。历史 churn 仅来自已提交记录，不代表未提交代码的风险大小。原始结果位于 \`docs/architecture/reports/\`。\n\n## 死代码${reviewNote}\n\n${knip ? `Knip 报告 ${knip.files.length} 个未使用文件、${report.deadExports} 个未使用导出。经过文件名和基础名的全仓字符串搜索，${dead.length} 个没有引用痕迹，${suspects.length} 个保留为疑似；分析脚本本身不删除文件，人工清理见复核记录。` : '未运行成功：Knip 没有返回可解析的报告，详见 reports/knip.json。'}\n\n${list(dead)}\n\n### 疑似（存在动态引用痕迹，需人工确认）\n\n字符串痕迹可能来自文档、CSS 或通用名称，并不证明运行时使用；人工保留原因见上方逐项复核。\n\n${list(suspects)}\n\n## 循环依赖\n\n规定命令 \`npx -y knip@5 --reporter json --include files,exports,cycles\` 返回 \`Invalid issue type: cycles\`。死文件/导出改用支持的 \`files,exports\`；循环使用 oxc 导入图上的 Tarjan 强连通分量复核，不把命令失败当作零循环。\n\n${cycles.length ? cycles.map((c, i) => `### 循环分量 ${i + 1}\n\n一条闭合路径：${c.path.map(f => `\`${f}\``).join(' → ')}。\n\n该分量包含：${c.files.map(f => `\`${f}\``).join('、')}。类型导入也在图中，需要结合实际初始化判断运行风险。`).join('\n\n') : '本次静态图没有多节点循环分量或自环。模板字符串动态导入不在此结论范围内。'}\n\n## 高危热点\n\n按 \`git log --since="12 months ago" --name-only --pretty=format:\` 的改动次数乘当前行数排序；这是审查优先级信号，不是已确认缺陷。\n\n| 文件 | 12 个月改动次数 | 行数 | 乘积 |\n| --- | ---: | ---: | ---: |\n${hotspots.map(h => `| \`${h.file}\` | ${h.changes} | ${h.lines} | ${h.score} |`).join('\n')}\n\n## 断点\n\n${breaks.length ? breaks.map(b => `- \`${b.file}\`：\`${b.detail}\`。请复核该导入是否依赖工具特定解析。`).join('\n') : 'oxc 未报告解析失败或无法解析的相对导入。别名按 tsconfig 自动解析；依赖包与仓库外 ADE 路径不当作仓内断链。'}\n\n模板字符串动态导入对静态解析不可见（不进 imports 也不进 unresolved），靠死文件复核与边界回报兜底。\n\n零入度文件的逐项裁决见[入口对账](entrypoints.md)，人工 Review 见[代码审查](review.md)。\n`;
writeFileSync(path.join(root, 'docs/architecture/wiki/health.md'), stringifyWiki(health, { title: '代码体检', description: '未使用文件、循环依赖、历史热点和静态解析断点。', generated: 'npm --prefix docs-site run architecture:analyze', 'generated-at': report.head }));
const entryBody = `# 入口对账\n\n依赖图按工作区当前内容生成；零入度只说明没有仓内静态导入者，不能单凭这一点删除文件。下表逐项分类。\n\n| 文件 | 裁决 |\n| --- | --- |\n${entries.map(e => `| \`${e.file}\` | ${e.kind} |`).join('\n')}\n\nPython 与 shell 不属于 JS/TS 解析范围：\`tools/legacy/spike/*.py\` 和 \`tools/legacy/render-preview/*.py\` 是手工验证入口；\`app/scripts/agents/*.sh\` 由 herdr 节点配置触发。其流程见[数据流](data-flow.md)。不存在本仓新增的 HTTP 定时任务或外部队列消费者；待发消费和轮询属于已有进程内部。\n\n文档站另有框架入口：\`docs-site/app/page.tsx\` 首页、\`app/docs/[[...slug]]/page.tsx\` 文档、\`app/api/search/route.ts\` 搜索；这里的 \`app/\` 均相对文档站。生成与校验脚本均为显式 npm 命令，见[文档站模块](modules/documentation.md)。\n`;
writeFileSync(path.join(root, 'docs/architecture/wiki/entrypoints.md'), stringifyWiki(entryBody, { title: '入口对账', description: '逐项裁决静态图的零入度候选，区分运行入口、工具配置和未接入代码。', generated: 'npm --prefix docs-site run architecture:analyze', 'generated-at': report.head }));
console.log(`Analyzed ${report.files} files: ${dead.length} unreferenced candidates, ${suspects.length} suspects, ${cycles.length} cycle components, ${breaks.length} breaks.`);

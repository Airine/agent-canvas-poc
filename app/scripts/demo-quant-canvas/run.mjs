#!/usr/bin/env node
// Quant multi-agent collaboration demo for Agent Canvas.
//
// This runs a *local simulation* of the Canvas protocol (publish / read / send /
// consume / pause / resume / budgets / approvals) around a real, deterministic
// synthetic quant pipeline. It never places orders, never uses real tickers and
// never talks to a broker or an LLM.
//
//   node app/scripts/demo-quant-canvas/run.mjs [--out <dir>]

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Canvas, CanvasError } from './lib/canvas.mjs';
import { createMarket } from './lib/market.mjs';
import { backtest, buildExecutionPlan, factorSnapshot, prepareSeries } from './lib/strategy.mjs';

const KIND_LABEL = {
  approval: 'APV',
  denied: 'DENY',
  publish: 'PUB',
  read: 'READ',
  send: 'SEND',
  consume: 'CONSUME',
  pause: 'PAUSE',
  resume: 'RESUME',
  resume_queue: 'QUEUE',
  note: 'NOTE',
  block: 'BLOCK',
};

const pct = (value, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const num = (value, digits = 2) => value.toFixed(digits);
const money = (value) => `¥${Math.round(value).toLocaleString('en-US')}`;
const table = (headers, rows) =>
  `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n')}`;

function parseArgs(argv) {
  const index = argv.indexOf('--out');
  if (index === -1) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return join(tmpdir(), `quant-canvas-demo-${stamp}`);
  }
  return resolve(argv[index + 1] ?? '');
}

const outDir = parseArgs(process.argv.slice(2));
mkdirSync(join(outDir, 'artifacts'), { recursive: true });

let clock = Date.UTC(2024, 5, 28, 1, 30, 0);
const canvas = new Canvas({
  now: () => (clock += 3000),
  onEvent: (event) => {
    const seq = String(event.seq).padStart(2, '0');
    const label = (KIND_LABEL[event.kind] ?? event.kind).padEnd(7);
    const actor = event.actor.padEnd(6);
    console.log(`  #${seq}  ${label}  ${actor}  ${event.text}`);
  },
});

const PM = canvas.register({ name: '组合经理', role: 'orchestrator / PM' });
const DATA = canvas.register({ name: '数据与因子', role: 'data + factor research' });
const BT = canvas.register({ name: '策略回测', role: 'backtest' });
const RISK = canvas.register({ name: '风控合规', role: 'independent risk' });
const EXEC = canvas.register({ name: '交易执行', role: 'paper execution' });
const AGENTS = [PM, DATA, BT, RISK, EXEC];

// ---------------------------------------------------------------------------
// Human approval policy. Manual mode: every Canvas tool call waits for a human.
// The only denial models a compliance rule, not a UI failure.
// ---------------------------------------------------------------------------
const approvals = [];
function humanPolicy({ tool, detail }) {
  if (tool === 'canvas_publish' && /(acct|broker_account|账户号)/i.test(detail.content ?? '')) {
    return {
      approved: false,
      code: 'SENSITIVE_PAYLOAD',
      reason: '产物含券商账户标识；先脱敏再发布',
    };
  }
  return { approved: true };
}
function ask(tool, actor, detail = {}) {
  const decision = canvas.approve({ tool, actor, detail, policy: humanPolicy });
  approvals.push({ tool, actor: actor.name, approved: decision.approved });
  if (!decision.approved) throw new CanvasError(decision.code, decision.reason);
  return decision;
}
function publish(actor, title, content) {
  return canvas.publish(actor, { title, content }, ask('canvas_publish', actor, { title, content }));
}
function read(actor, target, artifactId) {
  return canvas.read(actor, target, artifactId, ask('canvas_read', actor, { target: target.ref, artifactId }));
}
function send(actor, target, message, chainId, hop) {
  return canvas.send(actor, target, message, { chainId, hop }, ask('canvas_send', actor, { target: target.ref, message }));
}
function turn(agent, note) {
  canvas.consume(agent);
  if (note) canvas.log('note', agent, note);
}

// ---------------------------------------------------------------------------
// Market + research facts (computed before the collaboration starts; agents
// only see what they read or receive).
// ---------------------------------------------------------------------------
const market = createMarket();
const series = prepareSeries(market);
const asOf = market.days - 1;
const asOfDate = market.dates[asOf];
clock = Date.parse(`${asOfDate}T01:30:00Z`);
const CAPITAL = 10_000_000;
const MANDATE = { maxVol: 0.1, maxDrawdown: -0.15, maxName: 0.4 };

const snapshot = factorSnapshot(market, series, asOf);
const baseParams = { volTarget: 0.12, nameCap: 0.4, topK: 2, excludeStale: false, ddBrake: false };
const base = backtest(market, series, baseParams);
const revisedParams = { volTarget: 0.08, nameCap: 0.3, topK: 2, excludeStale: true, ddBrake: true };
const revised = backtest(market, series, revisedParams);

console.log('\n=== 量化交易 · Canvas 多 Agent 协作 Demo（本地模拟，纸面） ===');
console.log(`市场：合成日线 ${market.days} 天（${market.dates[0]} → ${asOfDate}），6 个合成标的`);
for (const agent of AGENTS) console.log(`  ${agent.name.padEnd(5)} ${agent.ref}  (${agent.role})`);
console.log('');

// ---------------------------------------------------------------------------
// Act 0 — PM publishes the task card and delegates research.
// ---------------------------------------------------------------------------
turn(PM);
const taskCard = publish(
  PM,
  '任务卡：动量组合季度复审',
  `# 任务卡 · 动量组合季度复审
- 发起：${PM.name}（${PM.ref}）
- 截止数据日：${asOfDate}
- 模式：**纸面研究**，禁止实盘下单，不接券商
- 资金：${money(CAPITAL)}
- 硬约束：年化波动 ≤ ${pct(MANDATE.maxVol)}；最大回撤 ≥ ${pct(MANDATE.maxDrawdown)}；单票 ≤ ${pct(MANDATE.maxName, 0)}；仅做多
- 数据：确定性合成行情，非真实标的，不构成投资建议
- 流程：因子快照 → 基线回测 → 独立风控复核 → 修订回测 → 纸面执行计划 → 风控签核

## 交付要求
1. 每个结论附日期、参数和可复核数字。
2. 过期或损坏的数据必须显式标注，不得静默前向填充。
3. 风控结论必须独立给出 REJECT / APPROVE，不得复述回测口径代替校验。
4. 任何产物通过 Canvas 发布；关键交接用消息说明缺口，不互相“收到”。`,
);
send(PM, DATA, `请读 ${taskCard.id} 后产出因子快照：63 日动量（跳过最近 5 日）、20 日波动、数据质量。只做研究，不生成订单。`, 'c1', 1);

// ---------------------------------------------------------------------------
// Act 1 — Data agent reads the card, publishes the snapshot with a data flag.
// ---------------------------------------------------------------------------
turn(DATA);
read(DATA, PM, taskCard.id);
const factorTable = table(
  ['资产', '动量 63d', '年化波动 20d', '风险调整分', '陈旧天数', '可交易'],
  snapshot.rows.map((row) => [
    row.id,
    pct(row.momentum63),
    pct(row.volatility20),
    num(row.score),
    row.staleDays,
    row.tradable ? '是' : '**否**',
  ]),
);
const damaged = snapshot.rows.find((row) => row.staleDays > 0);
assert.ok(damaged, 'demo expects one damaged symbol');
const factorArtifact = publish(
  DATA,
  '因子快照',
  `# 因子快照 · ${snapshot.date}
- 来源：${taskCard.id}（${PM.name}）
- 窗口：63 日动量，跳过最近 5 日；20 日已实现波动（年化）
- 可交易规则：陈旧天数 = 0，波动 > 4%，动量 > 0
- 排序：风险调整分 = 动量 / 波动

${factorTable}

## 数据质量
- **${damaged.id}**：最近 ${damaged.staleDays} 个交易日收盘价前向填充，成交量为 0。数据质量不合格，**禁止用于新开仓**。
- 其余标的：收盘价与成交量完整。
- 方法备注：${damaged.id} 的分数字面值最高，但其中含前向填充价格，不能当作可交易信号。

## 交接
可供回测的候选（按分数）：${snapshot.rows.filter((row) => row.tradable).map((row) => row.id).join('、')}。
${BT.name} 可基于本快照重跑，但基线若使用 ${damaged.id}，必须在报告中标注该数据缺陷。`,
);
send(DATA, PM, `${factorArtifact.id} 已发布。${damaged.id} 陈旧 ${damaged.staleDays} 日且零成交，不能新开仓；其余 4 个标的可用。`, 'c1', 2);

// ---------------------------------------------------------------------------
// Act 2 — Baseline backtest. PM asks for it after reading the snapshot.
// ---------------------------------------------------------------------------
turn(PM);
read(PM, DATA, factorArtifact.id);
send(
  PM,
  BT,
  `读 ${factorArtifact.id}，按 ${taskCard.id} 跑基线：波动目标 12%、单票上限 40%、不过滤陈旧数据、无回撤制动、周频调仓、成本 8bp + 滑点 5bp。报告需含波动、最大回撤、换手、VaR/CVaR 与期末目标权重。`,
  'c2',
  1,
);

turn(BT);
read(BT, DATA, factorArtifact.id);
read(BT, PM, taskCard.id);
const baseArtifact = publish(
  BT,
  '基线回测报告 v1',
  `# 基线回测报告 v1
- 输入：${taskCard.id}、${factorArtifact.id}
- 样本：${base.curve[0].date} → ${base.curve.at(-1).date}（${num(base.metrics.years)} 年）
- 参数：波动目标 ${pct(baseParams.volTarget, 0)}；单票上限 ${pct(baseParams.nameCap, 0)}；每周调仓；成本 8bp + 滑点 5bp；未过滤陈旧数据；无回撤制动
- 数据缺陷：按要求保留了 ${damaged.id}（调仓日历史有效）

${table(
  ['指标', '基线 v1'],
  [
    ['年化收益 CAGR', pct(base.metrics.cagr)],
    ['年化波动', pct(base.metrics.annualVol)],
    ['Sharpe（rf=0）', num(base.metrics.sharpe)],
    ['最大回撤', pct(base.metrics.maxDrawdown)],
    ['年化换手', `${num(base.metrics.annualTurnover)}x`],
    ['日 VaR 95%', pct(base.metrics.var95)],
    ['日 CVaR 95%', pct(base.metrics.cvar95)],
  ],
)}

## 期末目标权重
${Object.entries(base.finalWeights).map(([id, weight]) => `- ${id}：${pct(weight)}`).join('\n')}

## 观察
- 年化波动 ${pct(base.metrics.annualVol)}，已高于任务卡的 ${pct(MANDATE.maxVol)}。
- 最大回撤 ${pct(base.metrics.maxDrawdown)}，超过任务卡的 ${pct(MANDATE.maxDrawdown)} 限额（绝对值）。
- 年化换手 ${num(base.metrics.annualTurnover)}x，对成本假设敏感。
- 本报告只陈述回测事实，不判断是否可上线。`,
);
send(BT, PM, `${baseArtifact.id} 已发布：波动 ${pct(base.metrics.annualVol)}、回撤 ${pct(base.metrics.maxDrawdown)}，均超任务卡；请风控独立复核。`, 'c2', 2);

// ---------------------------------------------------------------------------
// Act 3 — Risk rejects. It first tries to publish a broker account number and
// is blocked by approval; then it republishes a redacted memo.
// ---------------------------------------------------------------------------
turn(PM);
read(PM, BT, baseArtifact.id);
send(PM, RISK, `请独立复核 ${factorArtifact.id} 与 ${baseArtifact.id}，对照 ${taskCard.id} 的硬约束。给出 REJECT/APPROVE 和最小修改集；不要复述回测口径代替校验。`, 'c3', 1);

turn(RISK);
read(RISK, DATA, factorArtifact.id);
read(RISK, BT, baseArtifact.id);

const riskChecks = [
  ['年化波动', pct(base.metrics.annualVol), `≤ ${pct(MANDATE.maxVol)}`, base.metrics.annualVol <= MANDATE.maxVol],
  ['最大回撤', pct(base.metrics.maxDrawdown), `≥ ${pct(MANDATE.maxDrawdown)}`, base.metrics.maxDrawdown >= MANDATE.maxDrawdown],
  [
    '最大单票',
    pct(Math.max(...Object.values(base.finalWeights))),
    `≤ ${pct(MANDATE.maxName, 0)}`,
    Math.max(...Object.values(base.finalWeights)) <= MANDATE.maxName,
  ],
  ['数据完整性', `${damaged.id} 陈旧 ${damaged.staleDays} 日`, '陈旧 = 0', false],
  ['换手/成本', `${num(base.metrics.annualTurnover)}x`, '观察项', true],
];
const failures = riskChecks.filter(([, , , pass]) => !pass);
assert.ok(failures.length >= 2, 'baseline should breach at least two limits');

const memoBody = `# 风控意见 v1 · REJECT
- 输入：${factorArtifact.id}、${baseArtifact.id}
- 复核日：${asOfDate}
- 立场：独立校验任务卡硬约束，不采用回测方的“可接受”判断

${table(
  ['检查项', '实测', '限额', '结果'],
  riskChecks.map(([name, actual, limit, pass]) => [name, actual, limit, pass ? 'PASS' : '**FAIL**']),
)}

## 结论
**REJECT**：基线不满足 ${failures.length} 项硬约束，且 ${damaged.id} 的价格为前向填充。

## 最小修改集（缺一不可）
1. 波动目标从 12% 下调到 8%。
2. 单票上限从 40% 下调到 30%。
3. 禁止陈旧数据入选（${damaged.id} 当前陈旧 ${damaged.staleDays} 日）；执行前按最新快照再次校验。
4. 增加回撤制动：组合净值低于 50 日均线时，目标仓位乘 0.5。
5. 重跑后提交新回测；签核前不得生成或提交任何订单。

## 备注
- 券商账户：**已脱敏**
- 本意见只覆盖纸面研究，不构成实盘授权。`;

let blocked = null;
try {
  publish(RISK, '风控意见 v1（未脱敏草稿）', memoBody.replace('**已脱敏**', 'acct=6222-****-9182'));
} catch (error) {
  blocked = error;
  assert.equal(error.code, 'SENSITIVE_PAYLOAD');
}
assert.ok(blocked, 'the unredacted memo must be denied');
const riskArtifact = publish(RISK, '风控意见 v1', memoBody);
send(RISK, PM, `${riskArtifact.id} 已发布：REJECT，${failures.length} 项硬约束不通过。按最小修改集重跑后再提交；签核前禁止下单。`, 'c3', 2);

// Explicit user pause: the risk session is closed for the audit gap.
canvas.pause(RISK);

// ---------------------------------------------------------------------------
// Act 4 — PM revises parameters and asks for a rerun. BT reads the risk memo.
// ---------------------------------------------------------------------------
turn(PM);
read(PM, RISK, riskArtifact.id);
send(
  PM,
  BT,
  `按 ${riskArtifact.id} 的四项修改重跑：波动目标 8%、单票 30%、禁止陈旧数据入选（${damaged.id} 当前陈旧 ${damaged.staleDays} 日）、净值低于 50 日均线时仓位乘 0.5。其他参数与 v1 相同。请给出 v2 和新目标权重。`,
  'c4',
  1,
);

turn(BT);
read(BT, RISK, riskArtifact.id);
const revisedArtifact = publish(
  BT,
  '修订回测报告 v2',
  `# 修订回测报告 v2
- 输入：${baseArtifact.id}、${riskArtifact.id}
- 参数：波动目标 ${pct(revisedParams.volTarget, 0)}；单票上限 ${pct(revisedParams.nameCap, 0)}；排除陈旧数据（${damaged.id} 在最近调仓日仍有效，故期末目标仍含该标的）；净值 < 50 日均线时仓位 × 0.5；成本口径同 v1
- 样本：${revised.curve[0].date} → ${revised.curve.at(-1).date}

${table(
  ['指标', '基线 v1', '修订 v2', '任务卡'],
  [
    ['年化波动', pct(base.metrics.annualVol), pct(revised.metrics.annualVol), `≤ ${pct(MANDATE.maxVol)}`],
    ['最大回撤', pct(base.metrics.maxDrawdown), pct(revised.metrics.maxDrawdown), `≥ ${pct(MANDATE.maxDrawdown)}`],
    ['Sharpe（rf=0）', num(base.metrics.sharpe), num(revised.metrics.sharpe), '—'],
    ['年化换手', `${num(base.metrics.annualTurnover)}x`, `${num(revised.metrics.annualTurnover)}x`, '—'],
    ['年化收益', pct(base.metrics.cagr), pct(revised.metrics.cagr), '—'],
  ],
)}

## 期末目标权重（调仓日有效）
${Object.entries(revised.finalWeights).map(([id, weight]) => `- ${id}：${pct(weight)}`).join('\n')}

## 执行前提示
- 调仓日 ${revised.rebalances.at(-1).date} 时 ${damaged.id} 数据仍有效，故目标权重含该标的。
- 截至 ${asOfDate}，${damaged.id} 已陈旧 ${damaged.staleDays} 日；执行方必须按最新快照剔除并说明替代逻辑。
- 回撤制动会让实际波动低于目标（本样本 ${pct(revised.metrics.annualVol)} vs ${pct(revisedParams.volTarget, 0)}），这是产品取舍，不是计算错误。`,
);
send(BT, PM, `${revisedArtifact.id} 已发布：波动 ${pct(revised.metrics.annualVol)}、回撤 ${pct(revised.metrics.maxDrawdown)}，硬约束通过。目标权重含 ${damaged.id}，执行前需重新校验数据。`, 'c4', 2);

// ---------------------------------------------------------------------------
// Act 5 — Execution desk builds the paper order plan. It must notice that the
// target weight list is stale and substitute a candidate from the snapshot.
// ---------------------------------------------------------------------------
turn(PM);
read(PM, BT, revisedArtifact.id);
send(
  PM,
  EXEC,
  `读 ${revisedArtifact.id}、${factorArtifact.id}、${riskArtifact.id}，生成纸面执行计划：资金 ${money(CAPITAL)}、ADV 参与率上限 8%、成本明细。执行前按最新快照剔除陈旧标的；不得实盘，不得连券商。`,
  'c5',
  1,
);

turn(EXEC);
read(EXEC, BT, revisedArtifact.id);
read(EXEC, DATA, factorArtifact.id);
read(EXEC, RISK, riskArtifact.id);

const target = { ...revised.finalWeights };
const staleHolding = snapshot.rows.find((row) => target[row.id] && row.staleDays > 0);
assert.ok(staleHolding, 'execution must find a stale holding');
const substitute = snapshot.rows.find((row) => row.tradable && !target[row.id] && row.staleDays === 0);
assert.ok(substitute, 'execution needs a substitute');
const droppedWeight = target[staleHolding.id];
delete target[staleHolding.id];
target[substitute.id] = (target[substitute.id] ?? 0) + droppedWeight;
const maxTargetWeight = Math.max(...Object.values(target));
assert.ok(maxTargetWeight <= revisedParams.nameCap + 1e-9, 'substitution must respect the name cap');

const execution = buildExecutionPlan({
  market,
  series,
  weights: target,
  capital: CAPITAL,
  asOf,
  maxParticipation: 0.08,
});
const orderRows = execution.orders.map((order) => [
  order.id,
  pct(target[order.id]),
  order.shares.toLocaleString('en-US'),
  money(order.notional),
  `${pct(order.participation)} (${order.slices} 日)`,
  money(order.estimatedCost),
]);
const executionArtifact = publish(
  EXEC,
  '纸面执行计划（待签核）',
  `# 纸面执行计划 · 待风控签核
- 输入：${revisedArtifact.id}、${factorArtifact.id}、${riskArtifact.id}
- 资本：${money(CAPITAL)}；参考日：${asOfDate}；模式：**纸面，未下单，无券商连接**

## 数据闸门
- ${staleHolding.id} 在目标权重中占 ${pct(droppedWeight)}，但最新快照陈旧 ${staleHolding.staleDays} 日 → **移除**。
- 按 ${factorArtifact.id} 的分数选择 ${substitute.id}（${substitute.tradable ? '可交易' : '不可交易'}）承接 ${pct(droppedWeight)}。
- 替代后最大单票 ${pct(maxTargetWeight)} ≤ ${pct(revisedParams.nameCap, 0)}，通过。

${table(['资产', '目标权重', '股数（100 股整数倍）', '名义金额', 'ADV 参与率', '预估成本'], orderRows)}

- 合计名义：${money(execution.grossNotional)}；现金：${money(execution.cash)}；预估成本：${money(execution.estimatedCost)}
- 成本口径：5bp + 10bp × √参与率；每个订单拆分为 ${execution.maxParticipation * 100}% ADV 以内的切片。
- 约束：单票 ≤ ${pct(revisedParams.nameCap, 0)}；参与率 ≤ ${pct(execution.maxParticipation, 0)}；仅做多。
- 状态：**未提交**。等待 ${RISK.name} 签核，签核前不产生任何外部副作用。`,
);
send(EXEC, PM, `${executionArtifact.id} 已发布：${execution.orders.length} 笔，名义 ${money(execution.grossNotional)}，预估成本 ${money(execution.estimatedCost)}。剔除 ${staleHolding.id}，用 ${substitute.id} 替代。等待风控签核，未下单。`, 'c5', 2);

// ---------------------------------------------------------------------------
// Act 6 — Sign-off while the risk session is paused. The message is only
// queued. PM must not treat "pending/paused" as approval.
// ---------------------------------------------------------------------------
turn(PM);
read(PM, EXEC, executionArtifact.id);
const signoffRequest = send(
  PM,
  RISK,
  `请复核 ${executionArtifact.id} 与 ${riskArtifact.id}：剔除陈旧标的与替代逻辑是否合规？给出签核或拒绝；按纸面模式，不实盘。`,
  'c6',
  1,
);
assert.equal(signoffRequest.state, 'paused', 'paused target must not accept immediate delivery');
canvas.log('note', null, '风控会话处于 paused：消息仅入队，未消费；PM 不得把入队当作签核');

canvas.resume(RISK);
canvas.resumeQueue(RISK);
turn(RISK);
read(RISK, EXEC, executionArtifact.id);

const haircut = 0.8;
const signoffArtifact = publish(
  RISK,
  '风控签核',
  `# 风控签核 · APPROVED_WITH_HAIRCUT
- 复核：${executionArtifact.id}、${riskArtifact.id}
- 替代逻辑：剔除陈旧 ${staleHolding.id}，改用 ${substitute.id}，方向合规。
- ${damaged.id} 不因“分数最高”恢复可交易资格；数据恢复需新快照与新复核。

## 签核条件
1. 总名义金额 × **${pct(haircut, 0)}**（折算后约 ${money(execution.grossNotional * haircut)}）。
2. 单票占比不变，仍 ≤ ${pct(revisedParams.nameCap, 0)}；切片参与率仍 ≤ ${pct(execution.maxParticipation, 0)}。
3. 仅纸面；仅本次调仓有效；下一调仓日前必须用新数据重新校验。
4. 若实际波动因回撤制动显著低于目标，需产品方书面确认，不由交易端自行加杠杆。

结论：**可以生成折算后的纸面计划；未授权实盘。**`,
);
send(RISK, PM, `${signoffArtifact.id}：APPROVED_WITH_HAIRCUT，总名义 × ${pct(haircut, 0)}；条件已列明。未授权实盘。`, 'c6', 2);

turn(PM);
read(PM, RISK, signoffArtifact.id);
send(PM, RISK, `折算后成本是否仍按 5bp + 冲击成本口径？请确认是否需要在下一调仓日重算。`, 'c6', 3);
turn(RISK);
send(RISK, PM, `按同一口径重算，不需要额外调整；下一调仓日必须重算并重新签核。`, 'c6', 4);

turn(PM);
let budgetBlocked = null;
try {
  send(PM, RISK, `再确认一次：如果 ${damaged.id} 数据恢复，能否直接恢复权重？`, 'c6', 5);
} catch (error) {
  budgetBlocked = error;
  assert.equal(error.code, 'BUDGET_EXHAUSTED');
  canvas.log('block', PM, `${error.code}: ${error.message}`);
}
assert.ok(budgetBlocked, 'the 5th hop must be refused');

// ---------------------------------------------------------------------------
// Act 7 — Final paper plan after haircut; PM summary. No order leaves the box.
// ---------------------------------------------------------------------------
const finalPlan = buildExecutionPlan({
  market,
  series,
  weights: target,
  capital: CAPITAL,
  asOf,
  maxParticipation: 0.08,
  haircut,
});
const finalRows = finalPlan.orders.map((order) => [
  order.id,
  order.shares.toLocaleString('en-US'),
  money(order.notional),
  `${pct(order.participation)} / ${order.slices} 日`,
  money(order.estimatedCost),
]);
const summaryArtifact = publish(
  PM,
  '组合经理决策摘要',
  `# 组合经理决策摘要 · ${asOfDate}
- 状态：**纸面流程完成，未提交任何订单，未连接券商**
- 最终规模：总名义 ${money(finalPlan.grossNotional)}（${pct(finalPlan.grossNotional / CAPITAL)} 资金），现金 ${money(finalPlan.cash)}
- 预估成本：${money(finalPlan.estimatedCost)}
- 最终波动/回撤（修订回测）：${pct(revised.metrics.annualVol)} / ${pct(revised.metrics.maxDrawdown)}
- 数据闸门：${staleHolding.id} 剔除，${substitute.id} 替代
- 风控：APPROVED_WITH_HAIRCUT（×${pct(haircut, 0)}）

${table(['资产', '股数', '名义金额', '参与率 / 切片', '预估成本'], finalRows)}

## 人类待办（不由 Agent 代办）
1. 是否批准实盘：需人工最终授权；本 Demo 不提供下单能力。
2. 确认波动目标：回撤制动使实际波动 ${pct(revised.metrics.annualVol)} 低于目标 ${pct(revisedParams.volTarget, 0)}，是否调整由产品方决定。
3. ${damaged.id} 数据恢复后需新快照、新回测、新风控签核，不能沿用本次签核。
4. 本次 Agent 消息链已用满 4 跳，后续问题需由人类开启新任务。

## 协作事实
- 产物：本摘要发布后共 ${canvas.artifacts.length + 1} 个；读取 ${canvas.reads.length} 次；发送 ${canvas.messages.length} 条；其中 1 条在目标暂停时仅入队。
- 所有产物不可变；全部 Canvas 工具调用走人工审批；1 次因敏感字段被拒绝。
- 数据为合成数据，非投资建议。`,
);

// ---------------------------------------------------------------------------
// Act 8 — A new human task after the chain budget closed. The Coordinator asks
// for a volatility-budget sensitivity and keeps the signed plan frozen.
// ---------------------------------------------------------------------------
canvas.log('note', null, '用户开启新任务：波动预算取舍（新链 c7；预算只在人类新任务时重置）');
canvas.newRun();

turn(PM);
send(
  PM,
  BT,
  `新任务，不改变 ${signoffArtifact.id} 对本次计划的签核：对波动目标 7/8/9/10/11/12% 做敏感性（单票 30%、排除陈旧数据、回撤制动开、成本同 v1），给出实现波动、最大回撤、年化收益、换手。`,
  'c7',
  1,
);

turn(BT);
const sweepTargets = [0.07, 0.08, 0.09, 0.1, 0.11, 0.12];
const sweep = sweepTargets.map((volTarget) => ({
  volTarget,
  ...backtest(market, series, { ...revisedParams, volTarget }).metrics,
}));
for (const row of sweep) {
  assert.ok(row.annualVol <= MANDATE.maxVol, `sweep ${row.volTarget} must satisfy the vol mandate`);
  assert.ok(row.maxDrawdown >= MANDATE.maxDrawdown, `sweep ${row.volTarget} must satisfy the DD mandate`);
}
const sweepArtifact = publish(
  BT,
  '波动预算敏感性',
  `# 波动预算敏感性 · 新任务
- 触发：${summaryArtifact.id} 人类待办第 2 项
- 基准：单票 30%、排除陈旧数据、回撤制动开、周频、成本 8bp + 滑点 5bp
- 说明：实现波动低于目标，因为回撤制动与单票上限会压低实际暴露

${table(
  ['目标波动', '实现波动', '最大回撤', '年化收益', '年化换手', '任务卡'],
  sweep.map((row) => [
    pct(row.volTarget, 0),
    pct(row.annualVol),
    pct(row.maxDrawdown),
    pct(row.cagr),
    `${num(row.annualTurnover)}x`,
    row.annualVol <= MANDATE.maxVol && row.maxDrawdown >= MANDATE.maxDrawdown ? '通过' : '**越线**',
  ]),
)}

## 读数
- 目标 10% 时实现波动 ${pct(sweep.find((row) => row.volTarget === 0.1).annualVol)}、回撤 ${pct(
    sweep.find((row) => row.volTarget === 0.1).maxDrawdown,
  )}，仍留约 ${pct(MANDATE.maxVol - sweep.find((row) => row.volTarget === 0.1).annualVol)} 波动余量。
- 目标 12% 时回撤 ${pct(sweep.at(-1).maxDrawdown)}，接近任务卡 ${pct(MANDATE.maxDrawdown)}，安全边际最薄。
- 本表只提供选择依据，不改变任何已签核参数。`,
);
send(BT, PM, `${sweepArtifact.id} 已发布：10% 目标实现 ${pct(sweep.find((row) => row.volTarget === 0.1).annualVol)} / 回撤 ${pct(sweep.find((row) => row.volTarget === 0.1).maxDrawdown)}；12% 目标接近回撤上限。`, 'c7', 2);

turn(PM);
read(PM, BT, sweepArtifact.id);
send(
  PM,
  RISK,
  `请对 ${sweepArtifact.id} 做建议性复核：下一周期用 10% 目标是否越过任务卡？只给建议，不得修改 ${signoffArtifact.id} 对本次计划的签核。`,
  'c7',
  3,
);

turn(RISK);
read(RISK, BT, sweepArtifact.id);
const preferred = sweep.find((row) => row.volTarget === 0.1);
const riskSweepArtifact = publish(
  RISK,
  '风控复核：波动预算（建议性）',
  `# 风控复核 · 波动预算
- 输入：${sweepArtifact.id}
- 范围：**建议性**；不改变 ${signoffArtifact.id} 对本次纸面计划的签核
- 任务卡：波动 ≤ ${pct(MANDATE.maxVol)}，回撤 ≥ ${pct(MANDATE.maxDrawdown)}

## 校验
- 7%–12% 目标均未越过任务卡（已含回撤制动与单票 30% 上限）。
- 12% 目标：实现波动 ${pct(sweep.at(-1).annualVol)}、回撤 ${pct(sweep.at(-1).maxDrawdown)}，距回撤限额仅 ${pct(
    sweep.at(-1).maxDrawdown - MANDATE.maxDrawdown,
  )}，不建议采用。
- 10% 目标：实现波动 ${pct(preferred.annualVol)}、回撤 ${pct(preferred.maxDrawdown)}，保留 ${pct(
    MANDATE.maxVol - preferred.annualVol,
  )} 波动余量。

## 结论
下一周期可考虑将目标上限设为 **10%**，但必须满足：
1. 实现波动突破 10% 或回撤低于 -12% 时自动降仓并人工复核。
2. 每次调仓重新校验数据与签核，不沿用本次签核。
3. 实盘仍需人类授权；本意见不构成实盘批准。`,
);
send(RISK, PM, `${riskSweepArtifact.id}：建议下一周期上限 10%，12% 目标安全边际过薄；本次签核不变。`, 'c7', 4);

turn(PM);
read(PM, RISK, riskSweepArtifact.id);
const decisionArtifact = publish(
  PM,
  'Coordinator 决策建议',
  `# Coordinator 决策建议 · 新任务
- 背景：${summaryArtifact.id} 人类待办第 2 项（波动目标取舍）
- 输入：${sweepArtifact.id}、${riskSweepArtifact.id}
- 边界：新链 c7，仅因人类新任务重置发送预算；不回溯修改 ${signoffArtifact.id}

## 决策
1. **本次纸面计划冻结**：维持 ${signoffArtifact.id} 的 8% 目标与 80% 折算，不追单、不改单。
2. **下一周期提议**：目标波动 10%、单票 30%、回撤制动开；实现波动约 ${pct(
    preferred.annualVol,
  )}，回撤约 ${pct(preferred.maxDrawdown)}。
3. **风险触发线**：实现波动 > 10% 或回撤 < -12% 时降仓并重新签核。

## 需要人类确认
- 是否接受下一周期 10% 的风险预算；接受后才生成新回测与新执行计划。
- 本建议不授权实盘，也不改变本轮已签核的纸面订单。

## 协作状态
- 新链 4 跳内完成：PM → 回测 → PM → 风控 → PM。
- 产物 ${canvas.artifacts.length + 1} 个；全程人工审批；无新增外部副作用。`,
);
assert.ok(decisionArtifact.id !== signoffArtifact.id);

// ---------------------------------------------------------------------------
// Invariants and evidence.
// ---------------------------------------------------------------------------
assert.ok(revised.metrics.annualVol <= MANDATE.maxVol, 'revised vol must satisfy mandate');
assert.ok(revised.metrics.maxDrawdown >= MANDATE.maxDrawdown, 'revised drawdown must satisfy mandate');
assert.ok(base.metrics.annualVol > MANDATE.maxVol, 'baseline must breach vol');
assert.ok(base.metrics.maxDrawdown < MANDATE.maxDrawdown, 'baseline must breach drawdown');
assert.ok(signoffRequest.state === 'consumed', 'queued sign-off must be consumed after resume');
for (const artifact of canvas.artifacts) {
  assert.ok(Object.isFrozen(artifact), 'artifacts are immutable');
  assert.ok(artifact.bytes <= 16 * 1024 && artifact.chars <= 12000, 'artifact limits');
}
assert.ok(!canvas.artifacts.some((artifact) => /acct=/.test(artifact.content)), 'unredacted memo must not exist');
for (const order of finalPlan.orders) {
  assert.ok(order.notional / CAPITAL <= revisedParams.nameCap + 1e-9, 'per-name cap after haircut');
  assert.ok(order.participation / order.slices <= execution.maxParticipation + 1e-9, 'slice participation cap');
}

const edges = canvas.edges();
const transcript = [
  '# 量化交易 · Canvas 多 Agent 协作实录（本地模拟）',
  '',
  `- 数据日：${asOfDate}`,
  `- 模式：纸面研究；合成数据；未下单；非投资建议`,
  `- Agent：${AGENTS.map((agent) => `${agent.name} ${agent.ref}`).join('；')}`,
  '',
  '## 通信与审批时间线',
  '',
  '```text',
  ...canvas.events.map(
    (event) =>
      `#${String(event.seq).padStart(2, '0')} ${(KIND_LABEL[event.kind] ?? event.kind).padEnd(7)} ${event.actor.padEnd(
        6,
      )} ${event.text}`,
  ),
  '```',
  '',
  '## 产物清单（不可变，按 SHA-256）',
  '',
  table(
    ['ID', '发布者', '标题', '字节', 'SHA-256'],
    canvas.artifacts.map((artifact) => [
      artifact.id,
      canvas.agents.get(artifact.from).name,
      artifact.title,
      artifact.bytes,
      artifact.sha256.slice(0, 16),
    ]),
  ),
  '',
  '## 通信边（仅由实际读取/发送产生）',
  '',
  table(
    ['发起方', '目标', '类型', '次数', '最近状态'],
    edges.map((edge) => [edge.fromName, edge.toName, edge.kind, edge.count, edge.last]),
  ),
  '',
  '## 关键指标',
  '',
  table(
    ['指标', '基线 v1', '修订 v2', '任务卡'],
    [
      ['年化波动', pct(base.metrics.annualVol), pct(revised.metrics.annualVol), `≤ ${pct(MANDATE.maxVol)}`],
      ['最大回撤', pct(base.metrics.maxDrawdown), pct(revised.metrics.maxDrawdown), `≥ ${pct(MANDATE.maxDrawdown)}`],
      ['年化收益', pct(base.metrics.cagr), pct(revised.metrics.cagr), '—'],
      ['年化换手', `${num(base.metrics.annualTurnover)}x`, `${num(revised.metrics.annualTurnover)}x`, '—'],
    ],
  ),
  '',
  '## 最终纸面计划',
  '',
  table(['资产', '股数', '名义金额', '参与率 / 切片', '预估成本'], finalRows),
  '',
  `合计名义 ${money(finalPlan.grossNotional)}；现金 ${money(finalPlan.cash)}；预估成本 ${money(finalPlan.estimatedCost)}。`,
  '',
  '## 产物全文',
  '',
  ...canvas.artifacts.flatMap((artifact) => [
    `### ${artifact.id} · ${artifact.title}`,
    '',
    `> 发布者：${canvas.agents.get(artifact.from).name} · SHA-256：${artifact.sha256}`,
    '',
    artifact.content,
    '',
    '---',
    '',
  ]),
  '## 说明',
  '',
  '- 这是对 Canvas 工具语义的本地模拟，不是真实多进程 Pi 会话；真实工具为 canvas_agents / canvas_read / canvas_publish / canvas_send。',
  '- 入队不等于消费，消费不等于采纳；暂停目标不会自动唤醒，恢复会话与恢复待发是两个动作。',
  '- 审批、链预算与产物上限来自 docs/canvas-collaboration.md 的合同。',
  '',
].join('\n');

writeFileSync(join(outDir, 'transcript.md'), transcript);
writeFileSync(
  join(outDir, 'edges.json'),
  `${JSON.stringify({ agents: AGENTS, artifacts: canvas.artifacts.map(({ content, ...rest }) => rest), edges, messages: canvas.messages, reads: canvas.reads }, null, 2)}\n`,
);
writeFileSync(
  join(outDir, 'metrics.json'),
  `${JSON.stringify(
    {
      asOfDate,
      baseline: { params: baseParams, metrics: base.metrics, finalWeights: base.finalWeights },
      revised: { params: revisedParams, metrics: revised.metrics, finalWeights: revised.finalWeights },
      execution: { targetWeights: target, haircut, grossNotional: finalPlan.grossNotional, estimatedCost: finalPlan.estimatedCost },
    },
    null,
    2,
  )}\n`,
);
for (const artifact of canvas.artifacts) {
  writeFileSync(join(outDir, 'artifacts', `${artifact.id}.md`), artifact.content);
}

console.log('\n=== 结果 ===');
console.log(`基线 v1：波动 ${pct(base.metrics.annualVol)}，最大回撤 ${pct(base.metrics.maxDrawdown)} → 风控 REJECT`);
console.log(`修订 v2：波动 ${pct(revised.metrics.annualVol)}，最大回撤 ${pct(revised.metrics.maxDrawdown)} → 通过`);
console.log(`最终纸面：名义 ${money(finalPlan.grossNotional)}，成本 ${money(finalPlan.estimatedCost)}，未下单`);
console.log(`协作：产物 ${canvas.artifacts.length}，读取 ${canvas.reads.length}，发送 ${canvas.messages.length}，通信边 ${edges.length}`);
console.log(`输出：${outDir}`);
console.log('提醒：合成数据 + 纸面模拟，不构成投资建议。\n');

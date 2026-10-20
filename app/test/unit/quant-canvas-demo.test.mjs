import test from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../../scripts/demo-quant-canvas/lib/canvas.mjs';
import { createMarket } from '../../scripts/demo-quant-canvas/lib/market.mjs';
import { backtest, buildExecutionPlan, factorSnapshot, prepareSeries } from '../../scripts/demo-quant-canvas/lib/strategy.mjs';

const approved = { approved: true };

test('quant demo is deterministic; baseline breaches the mandate and the revised run passes', () => {
  const first = createMarket();
  const second = createMarket();
  assert.deepEqual(
    first.symbols.map((symbol) => symbol.close.at(-1)),
    second.symbols.map((symbol) => symbol.close.at(-1)),
  );

  const series = prepareSeries(first);
  const snapshot = factorSnapshot(first, series, first.days - 1);
  const damaged = snapshot.rows.find((row) => row.id === 'FFF');
  assert.ok(damaged.staleDays > 0);
  assert.equal(damaged.tradable, false);
  assert.equal(snapshot.rows.filter((row) => row.tradable).length, 4);

  const baseline = backtest(first, series, { volTarget: 0.12, nameCap: 0.4, topK: 2 });
  assert.ok(baseline.metrics.annualVol > 0.1, 'baseline must exceed the 10% vol mandate');
  assert.ok(baseline.metrics.maxDrawdown < -0.15, 'baseline must exceed the 15% drawdown mandate');

  const revised = backtest(first, series, {
    volTarget: 0.08,
    nameCap: 0.3,
    topK: 2,
    excludeStale: true,
    ddBrake: true,
  });
  assert.ok(revised.metrics.annualVol <= 0.1);
  assert.ok(revised.metrics.maxDrawdown >= -0.15);
});

test('execution removes a stale holding, substitutes an eligible name and respects caps', () => {
  const market = createMarket();
  const series = prepareSeries(market);
  const asOf = market.days - 1;
  const snapshot = factorSnapshot(market, series, asOf);
  const revised = backtest(market, series, {
    volTarget: 0.08,
    nameCap: 0.3,
    topK: 2,
    excludeStale: true,
    ddBrake: true,
  });

  const target = { ...revised.finalWeights };
  const stale = snapshot.rows.find((row) => target[row.id] && row.staleDays > 0);
  assert.ok(stale);
  const substitute = snapshot.rows.find((row) => row.tradable && !target[row.id]);
  assert.ok(substitute);
  target[substitute.id] = (target[substitute.id] ?? 0) + target[stale.id];
  delete target[stale.id];

  const plan = buildExecutionPlan({ market, series, weights: target, capital: 10_000_000, asOf, haircut: 0.8 });
  assert.ok(plan.orders.length > 0);
  for (const order of plan.orders) {
    assert.ok(order.notional / 10_000_000 <= 0.3 + 1e-9);
    assert.ok(order.participation / order.slices <= 0.08 + 1e-9);
    assert.ok(order.shares % 100 === 0);
  }
  assert.ok(plan.grossNotional + plan.cash <= 10_000_000 + 1e-6);
});

test('volatility budget sweep keeps every option inside the mandate', () => {
  const market = createMarket();
  const series = prepareSeries(market);
  const options = [0.07, 0.08, 0.09, 0.1, 0.11, 0.12].map((volTarget) => ({
    volTarget,
    ...backtest(market, series, { volTarget, nameCap: 0.3, topK: 2, excludeStale: true, ddBrake: true }).metrics,
  }));
  for (const option of options) {
    assert.ok(option.annualVol <= 0.1);
    assert.ok(option.maxDrawdown >= -0.15);
  }
  const preferred = options.find((option) => option.volTarget === 0.1);
  assert.ok(preferred.annualVol < 0.08);
  assert.ok(preferred.maxDrawdown > -0.12);
  assert.ok(options.at(-1).maxDrawdown < preferred.maxDrawdown);
});

test('canvas contract: paused queue, separate resume, immutable artifacts and hop budget', () => {
  const canvas = new Canvas();
  const a = canvas.register({ name: 'A' });
  const b = canvas.register({ name: 'B' });
  canvas.pause(b);

  const queued = canvas.send(a, b, 'sign off', { chainId: 'c', hop: 1 }, approved);
  assert.equal(queued.state, 'paused');
  assert.deepEqual(canvas.consume(b), []);

  canvas.resume(b);
  assert.equal(queued.state, 'paused', 'resuming the session must not release the queue');
  canvas.resumeQueue(b);
  assert.equal(queued.state, 'pending');
  assert.equal(canvas.consume(b).length, 1);
  assert.equal(queued.state, 'consumed');

  const artifact = canvas.publish(a, { title: 't', content: 'immutable' }, approved);
  assert.ok(Object.isFrozen(artifact));
  assert.equal(artifact.sha256.length, 64);
  const read = canvas.read(b, a, artifact.id, approved);
  assert.equal(read.content, 'immutable');
  assert.throws(() => canvas.read(b, b, artifact.id, approved), /self-read/);
  assert.throws(() => canvas.publish(a, { title: 't', content: 'x'.repeat(17000) }, approved), /too large/);

  assert.throws(() => canvas.send(a, b, 'fifth', { chainId: 'c', hop: 5 }, approved), /exceed 4 hops/);
  const edges = canvas.edges();
  assert.equal(edges.find((edge) => edge.kind === 'read')?.count, 1);
  assert.equal(edges.find((edge) => edge.kind === 'send')?.count, 1);
});

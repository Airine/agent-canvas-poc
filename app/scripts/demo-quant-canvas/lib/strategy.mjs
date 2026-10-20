// Small, dependency-free research engine. It is intentionally simple: the demo
// is about the collaboration protocol, not about claiming alpha.

import { logReturns, quantile, sma, stdev } from './market.mjs';

const TRADING_DAYS = 252;

export function prepareSeries(market) {
  return market.symbols.map((symbol) => ({
    id: symbol.id,
    name: symbol.name,
    close: symbol.close,
    volume: symbol.volume,
    stale: symbol.stale,
    returns: logReturns(symbol.close),
  }));
}

export function factorSnapshot(market, series, asOf) {
  const rows = [];
  for (const symbol of series) {
    if (asOf < 64) continue;
    const close = symbol.close;
    const momentum = close[asOf - 5] / close[asOf - 63] - 1;
    const daily = [];
    for (let i = asOf - 19; i <= asOf; i += 1) daily.push(symbol.returns[i]);
    const volatility = stdev(daily) * Math.sqrt(TRADING_DAYS);
    const staleDays = symbol.stale.slice(asOf - 4, asOf + 1).filter(Boolean).length;
    rows.push({
      id: symbol.id,
      name: symbol.name,
      last: close[asOf],
      momentum63: momentum,
      volatility20: volatility,
      score: volatility > 0 ? momentum / volatility : 0,
      staleDays,
      tradable: staleDays === 0 && volatility > 0.04 && momentum > 0,
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return { asOf, date: market.dates[asOf], rows };
}

function selectWeights(snapshot, series, params) {
  const { topK, nameCap, volTarget, excludeStale } = params;
  const eligible = snapshot.rows
    .filter((row) => row.tradable && (!excludeStale || row.staleDays === 0))
    .slice(0, topK);
  if (eligible.length === 0) return { weights: {}, forecastVol: 0, picks: [] };

  const inverse = eligible.map((row) => 1 / row.volatility20);
  const inverseSum = inverse.reduce((sum, value) => sum + value, 0);
  const weights = new Map(eligible.map((row, index) => [row.id, inverse[index] / inverseSum]));

  // Water-fill the single-name cap, redistributing the excess proportionally.
  for (let pass = 0; pass < 12; pass += 1) {
    const capped = [...weights].filter(([, weight]) => weight > nameCap + 1e-12);
    if (capped.length === 0) break;
    let excess = 0;
    for (const [id, weight] of capped) {
      excess += weight - nameCap;
      weights.set(id, nameCap);
    }
    const open = [...weights].filter(([, weight]) => weight < nameCap - 1e-12);
    const openSum = open.reduce((sum, [, weight]) => sum + weight, 0);
    if (openSum <= 0) break;
    for (const [id, weight] of open) weights.set(id, weight + excess * (weight / openSum));
  }

  const covariance = covarianceMatrix(series, eligible.map((row) => row.id), snapshot.asOf, 60);
  const forecastVol = portfolioVol(eligible.map((row) => weights.get(row.id)), covariance);
  const scale = forecastVol > 0 ? Math.min(1, volTarget / forecastVol) : 0;
  const scaled = {};
  for (const row of eligible) scaled[row.id] = weights.get(row.id) * scale;
  return { weights: scaled, forecastVol: forecastVol * scale, picks: eligible.map((row) => row.id) };
}

function covarianceMatrix(series, ids, asOf, window) {
  const byId = new Map(series.map((symbol) => [symbol.id, symbol.returns]));
  const columns = ids.map((id) => {
    const values = [];
    for (let i = asOf - window + 1; i <= asOf; i += 1) values.push(byId.get(id)[i] ?? 0);
    return values;
  });
  const means = columns.map((column) => column.reduce((sum, value) => sum + value, 0) / column.length);
  return columns.map((left, i) =>
    columns.map((right, j) => {
      let sum = 0;
      for (let t = 0; t < left.length; t += 1) sum += (left[t] - means[i]) * (right[t] - means[j]);
      return sum / (left.length - 1);
    }),
  );
}

function portfolioVol(weights, covariance) {
  let variance = 0;
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) variance += weights[i] * weights[j] * covariance[i][j];
  }
  return Math.sqrt(Math.max(0, variance) * TRADING_DAYS);
}

export function backtest(market, series, params) {
  const {
    topK = 2,
    nameCap = 0.4,
    volTarget = 0.12,
    excludeStale = false,
    ddBrake = false,
    costBps = 8,
    slippageBps = 5,
    rebalanceEvery = 5,
    startIndex = 70,
  } = params;

  const equity = [1];
  const curve = [{ date: market.dates[startIndex], equity: 1, drawdown: 0 }];
  const rebalances = [];
  let weights = {};
  let turnoverTotal = 0;
  const costRate = (costBps + slippageBps) / 10000;

  for (let day = startIndex; day < market.days - 1; day += 1) {
    const shouldRebalance = (day - startIndex) % rebalanceEvery === 0;
    let costFactor = 1;
    if (shouldRebalance) {
      const snapshot = factorSnapshot(market, series, day);
      const selected = selectWeights(snapshot, series, { topK, nameCap, volTarget, excludeStale });
      let target = selected.weights;

      if (ddBrake && equity.length >= 50) {
        const trailing = equity.slice(-50);
        const average = trailing.reduce((sum, value) => sum + value, 0) / trailing.length;
        if (equity[equity.length - 1] < average) target = scaleWeights(target, 0.5);
      }

      let turnover = 0;
      const ids = new Set([...Object.keys(weights), ...Object.keys(target)]);
      for (const id of ids) turnover += Math.abs((target[id] ?? 0) - (weights[id] ?? 0));
      turnoverTotal += turnover;
      costFactor = 1 - turnover * costRate;
      weights = target;
      rebalances.push({ date: market.dates[day], weights: { ...target }, turnover });
    }

    const next = day + 1;
    let portfolioReturn = 0;
    for (const [id, weight] of Object.entries(weights)) {
      const symbol = series.find((item) => item.id === id);
      portfolioReturn += weight * (symbol.returns[next] ?? 0);
    }
    const previous = equity[equity.length - 1];
    const current = previous * costFactor * (1 + portfolioReturn);
    equity.push(current);
    curve.push({ date: market.dates[next], equity: current, drawdown: 0 });
  }

  let peak = -Infinity;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    point.drawdown = point.equity / peak - 1;
  }

  const daily = [];
  for (let i = 1; i < curve.length; i += 1) daily.push(curve[i].equity / curve[i - 1].equity - 1);
  const years = daily.length / TRADING_DAYS;
  const cagr = (curve[curve.length - 1].equity / curve[0].equity) ** (1 / years) - 1;
  const annualVol = stdev(daily) * Math.sqrt(TRADING_DAYS);
  const maxDrawdown = Math.min(...curve.map((point) => point.drawdown));
  const var95 = quantile(daily, 0.05);
  const tail = daily.filter((value) => value <= var95);
  const cvar95 = tail.reduce((sum, value) => sum + value, 0) / Math.max(1, tail.length);

  return {
    params,
    curve,
    daily,
    rebalances,
    finalWeights: weights,
    metrics: {
      cagr,
      annualVol,
      sharpe: annualVol > 0 ? cagr / annualVol : 0,
      maxDrawdown,
      var95,
      cvar95,
      annualTurnover: years > 0 ? turnoverTotal / years : 0,
      years,
      endingEquity: curve[curve.length - 1].equity,
    },
    lastDate: market.dates[market.days - 1],
  };
}

function scaleWeights(weights, factor) {
  const scaled = {};
  for (const [id, weight] of Object.entries(weights)) scaled[id] = weight * factor;
  return scaled;
}

export function buildExecutionPlan({ market, series, weights, capital, asOf, maxParticipation = 0.08, haircut = 1 }) {
  const orders = [];
  let grossNotional = 0;
  let estimatedCost = 0;
  for (const [id, weight] of Object.entries(weights)) {
    const symbol = series.find((item) => item.id === id);
    const price = symbol.close[asOf];
    const budget = weight * capital * haircut;
    let shares = Math.floor(budget / price / 100) * 100;
    if (shares <= 0) continue;
    const notional = shares * price;
    let advNotional = 0;
    let count = 0;
    for (let i = asOf - 19; i <= asOf; i += 1) {
      if (symbol.volume[i] > 0) {
        advNotional += symbol.volume[i] * symbol.close[i];
        count += 1;
      }
    }
    advNotional = count > 0 ? advNotional / count : 0;
    const rawParticipation = advNotional > 0 ? notional / advNotional : 1;
    const impactBps = 10 * Math.sqrt(Math.max(rawParticipation, 1e-6));
    const orderCost = notional * ((5 + impactBps) / 10000);
    orders.push({
      id,
      price,
      shares,
      notional,
      referencePrice: symbol.close[asOf - 1],
      advNotional,
      participation: rawParticipation,
      slices: Math.max(1, Math.ceil(rawParticipation / maxParticipation)),
      estimatedCost: orderCost,
    });
    grossNotional += notional;
    estimatedCost += orderCost;
  }
  return {
    orders,
    grossNotional,
    cash: capital * haircut - grossNotional,
    estimatedCost,
    haircut,
    maxParticipation,
  };
}

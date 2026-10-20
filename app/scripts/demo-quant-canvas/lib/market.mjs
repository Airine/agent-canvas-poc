// Deterministic synthetic market data. No network, no real tickers, no broker.
// The series is shaped so a 12% vol-target strategy breaches a 10% vol mandate,
// which gives the Risk agent something real to reject.

export const UNIVERSE = [
  { id: 'AAA', name: '合成资产 AAA', drift: 0.00035, beta: 1.15, idio: 0.008, adv: 9.0e7 },
  { id: 'BBB', name: '合成资产 BBB', drift: 0.00018, beta: 0.9, idio: 0.010, adv: 6.0e7 },
  { id: 'CCC', name: '合成资产 CCC', drift: 0.00045, beta: 1.3, idio: 0.014, adv: 4.0e7 },
  { id: 'DDD', name: '合成资产 DDD', drift: 0.00010, beta: 0.7, idio: 0.007, adv: 1.1e8 },
  { id: 'EEE', name: '合成资产 EEE', drift: 0.00025, beta: 1.0, idio: 0.011, adv: 5.5e7 },
  // FFF is deliberately damaged: last 3 closes are carried forward with zero volume.
  { id: 'FFF', name: '合成资产 FFF', drift: 0.00060, beta: 0.85, idio: 0.009, adv: 2.0e7, damaged: true },
];

const REGIMES = [
  { mu: 0.0007, sigma: 0.010, len: 130 },
  { mu: 0.0001, sigma: 0.012, len: 110 },
  { mu: -0.0016, sigma: 0.021, len: 90 },
  { mu: 0.0005, sigma: 0.011, len: 140 },
  { mu: -0.0006, sigma: 0.017, len: 80 },
  { mu: 0.0009, sigma: 0.010, len: 210 },
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng) {
  const u = Math.max(rng(), Number.EPSILON);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function createMarket({ days = 760, seed = 20240628 } = {}) {
  const rng = mulberry32(seed);
  const dates = [];
  const cursor = new Date(Date.UTC(2023, 0, 2));
  while (dates.length < days) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const regimeOfDay = [];
  let regimeIndex = 0;
  let left = 0;
  for (let i = 0; i < days; i += 1) {
    if (left === 0) {
      const regime = REGIMES[Math.min(regimeIndex, REGIMES.length - 1)];
      left = regime.len;
      regimeIndex += 1;
    }
    regimeOfDay.push(REGIMES[Math.min(regimeIndex - 1, REGIMES.length - 1)]);
    left -= 1;
  }

  const marketShocks = [];
  const idioShocks = new Map(UNIVERSE.map((asset) => [asset.id, []]));
  for (let i = 0; i < days; i += 1) {
    const regime = regimeOfDay[i];
    marketShocks.push({ mu: regime.mu, sigma: regime.sigma, z: gauss(rng) });
    for (const asset of UNIVERSE) idioShocks.get(asset.id).push(gauss(rng));
  }

  const symbols = UNIVERSE.map((asset, column) => {
    const close = [];
    const volume = [];
    const stale = new Array(days).fill(false);
    let price = 28 + column * 13;
    for (let i = 0; i < days; i += 1) {
      const shock = marketShocks[i];
      const logReturn =
        asset.drift + asset.beta * (shock.mu + shock.sigma * shock.z) + asset.idio * idioShocks.get(asset.id)[i];
      price *= Math.exp(logReturn);
      close.push(round(price, 4));
      volume.push(Math.round(asset.adv / price * (0.6 + rng() * 0.9)));
    }
    if (asset.damaged) {
      for (let i = days - 3; i < days; i += 1) {
        close[i] = close[i - 1];
        volume[i] = 0;
        stale[i] = true;
      }
    }
    return { ...asset, close, volume, stale };
  });

  return { days, seed, dates, symbols, regimeOfDay };
}

export function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function logReturns(closes) {
  const out = [null];
  for (let i = 1; i < closes.length; i += 1) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

export function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function sma(values, index, window) {
  if (index + 1 < window) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i += 1) sum += values[i];
  return sum / window;
}

export function quantile(values, probability) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] * (1 - rest) + sorted[base + 1] * rest;
}

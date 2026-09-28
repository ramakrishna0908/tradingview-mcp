/**
 * Indicator maths over closed candles.
 *
 * Every function takes bars oldest-first and returns null rather than a
 * fallback when there is not enough history. A short series must surface as
 * "not enough data" upstream, because an SMA200 computed from 60 bars is not a
 * weaker signal — it is a different number wearing the same name.
 */

const closes = (bars) => bars.map((b) => b.c).filter((v) => v != null);

export function sma(bars, period) {
  const c = closes(bars);
  if (c.length < period) return null;
  const slice = c.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(bars, period) {
  const c = closes(bars);
  if (c.length < period) return null;
  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` values so the series does not
  // inherit the first close as its whole history.
  let value = c.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < c.length; i++) value = c[i] * k + value * (1 - k);
  return value;
}

/** Wilder's RSI, the definition charting packages use. */
export function rsi(bars, period = 14) {
  const c = closes(bars);
  if (c.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = c[i] - c[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

/** Wilder's ATR. */
export function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1], b = bars[i];
    if ([p.c, b.h, b.l].some((v) => v == null)) continue;
    tr.push(Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c)));
  }
  if (tr.length < period) return null;
  let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) value = (value * (period - 1) + tr[i]) / period;
  return value;
}

/** Chaikin Money Flow: volume-weighted, so a flat range with no volume is null. */
export function cmf(bars, period = 20) {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  let mfv = 0, vol = 0;
  for (const b of slice) {
    if ([b.h, b.l, b.c, b.v].some((v) => v == null)) continue;
    const span = b.h - b.l;
    const multiplier = span === 0 ? 0 : ((b.c - b.l) - (b.h - b.c)) / span;
    mfv += multiplier * b.v;
    vol += b.v;
  }
  return vol > 0 ? mfv / vol : null;
}

export function bollinger(bars, period = 20, mult = 2) {
  const c = closes(bars);
  if (c.length < period) return { basis: null, upper: null, lower: null };
  const slice = c.slice(-period);
  const basis = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - basis) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { basis, upper: basis + mult * sd, lower: basis - mult * sd };
}

/**
 * Slope of an SMA over `lookback` bars, as a percentage of its own level so
 * the number is comparable between a $15 stock and a $1,700 one.
 */
export function smaSlope(bars, period, lookback = 10) {
  if (bars.length < period + lookback) return null;
  const now = sma(bars, period);
  const then = sma(bars.slice(0, bars.length - lookback), period);
  if (now == null || then == null || then === 0) return null;
  return ((now - then) / then) * 100;
}

/**
 * CMF now versus CMF `lookback` bars ago. The spec treats the snapshot and the
 * trend as separate inputs, so both are returned and neither is derived from
 * the other.
 */
export function cmfTrend(bars, { period = 20, lookback = 5 } = {}) {
  const current = cmf(bars, period);
  const previous = bars.length > lookback ? cmf(bars.slice(0, bars.length - lookback), period) : null;
  if (current == null || previous == null) {
    return { current, previous, delta: null, direction: null, complete: false };
  }
  const delta = current - previous;
  // A band rather than a bare sign: CMF wobbles a little every session and a
  // 0.001 move is not a change in participation.
  const direction = delta > 0.02 ? 'improving' : delta < -0.02 ? 'deteriorating' : 'flat';
  return { current, previous, delta, direction, complete: true };
}

/** Percentage distance of price from a level; null-safe. */
export function distancePct(price, level) {
  if (price == null || level == null || level === 0) return null;
  return ((price - level) / level) * 100;
}

/**
 * Where price sits against the daily moving-average stack. Each field is a
 * plain statement of fact; the interpretation happens in the bias layer.
 */
export function maStructure(bars) {
  const price = bars.length ? bars[bars.length - 1].c : null;
  const sma50 = sma(bars, 50);
  const sma200 = sma(bars, 200);
  const ema21 = ema(bars, 21);
  return {
    price,
    sma50, sma200, ema21,
    sma50Slope: smaSlope(bars, 50, 10),
    aboveSma200: price != null && sma200 != null ? price > sma200 : null,
    aboveSma50: price != null && sma50 != null ? price > sma50 : null,
    aboveEma21: price != null && ema21 != null ? price > ema21 : null,
    goldenCross: sma50 != null && sma200 != null ? sma50 > sma200 : null,
    distanceToEma21Pct: distancePct(price, ema21),
    distanceToSma200Pct: distancePct(price, sma200),
  };
}

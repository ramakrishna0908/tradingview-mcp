/**
 * Price structure: swing points, break of structure, change of character,
 * fair value gaps and liquidity sweeps.
 *
 * Deterministic and timeframe-agnostic — the same code reads a 15m series for
 * an intraday trigger and a weekly series for a swing thesis. The caller
 * decides which timeframe means what; nothing here assumes a horizon.
 *
 * Only closed bars should be passed in. A swing high cannot be confirmed by a
 * candle that is still trading, and a break of structure called from a live
 * candle un-breaks itself as often as not.
 */

/**
 * Pivot highs and lows. A bar is a swing high when no bar within `lookback` on
 * either side traded higher; the last `lookback` bars can therefore never be
 * swing points, which is correct — their right shoulder has not formed yet.
 */
export function swingPoints(bars, lookback = 3) {
  const highs = [], lows = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const b = bars[i];
    if (b.h == null || b.l == null) continue;
    let isHigh = true, isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j].h >= b.h) isHigh = false;
      if (bars[j].l <= b.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ index: i, t: b.t, price: b.h });
    if (isLow) lows.push({ index: i, t: b.t, price: b.l });
  }
  return { highs, lows };
}

/** Label each swing against the one before it: HH/LH for highs, HL/LL for lows. */
export function labelSwings({ highs, lows }) {
  const label = (points, hi) => points.map((p, i) => {
    if (i === 0) return { ...p, label: null };
    const prev = points[i - 1].price;
    if (hi) return { ...p, label: p.price > prev ? 'HH' : 'LH' };
    return { ...p, label: p.price > prev ? 'HL' : 'LL' };
  });
  return { highs: label(highs, true), lows: label(lows, false) };
}

/**
 * Trend from the last two confirmed swings on each side. Requiring both a
 * rising high and a rising low keeps a single spike from reading as an uptrend.
 */
export function trendFromSwings(labelled) {
  const h = labelled.highs.slice(-2), l = labelled.lows.slice(-2);
  if (h.length < 2 || l.length < 2) return { trend: null, reason: 'not enough confirmed swings' };
  const higherHigh = h[1].price > h[0].price;
  const higherLow = l[1].price > l[0].price;
  const lowerHigh = h[1].price < h[0].price;
  const lowerLow = l[1].price < l[0].price;
  if (higherHigh && higherLow) return { trend: 'up', structure: 'HH/HL' };
  if (lowerHigh && lowerLow) return { trend: 'down', structure: 'LH/LL' };
  return { trend: 'range', structure: higherHigh || higherLow ? 'mixed' : 'range' };
}

/**
 * Break of structure and change of character, in order.
 *
 * A BOS continues the prevailing direction; the first break the other way is a
 * CHoCH. Both require a CLOSE beyond the level — an intrabar wick through a
 * swing is a sweep, handled separately, and conflating the two is how a report
 * ends up calling a stop-run a breakout.
 */
export function structureEvents(bars, lookback = 3) {
  const { highs, lows } = swingPoints(bars, lookback);
  const events = [];
  let direction = null;

  const all = [...highs.map((p) => ({ ...p, side: 'high' })), ...lows.map((p) => ({ ...p, side: 'low' }))]
    .sort((a, b) => a.index - b.index);

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (bar.c == null) continue;
    const priorHigh = [...all].reverse().find((p) => p.side === 'high' && p.index < i - lookback);
    const priorLow = [...all].reverse().find((p) => p.side === 'low' && p.index < i - lookback);
    if (priorHigh && bar.c > priorHigh.price) {
      const kind = direction === 'down' ? 'bullish_choch' : 'bullish_bos';
      if (events[events.length - 1]?.level !== priorHigh.price) {
        events.push({ index: i, t: bar.t, kind, level: priorHigh.price, close: bar.c });
        direction = 'up';
      }
    } else if (priorLow && bar.c < priorLow.price) {
      const kind = direction === 'up' ? 'bearish_choch' : 'bearish_bos';
      if (events[events.length - 1]?.level !== priorLow.price) {
        events.push({ index: i, t: bar.t, kind, level: priorLow.price, close: bar.c });
        direction = 'down';
      }
    }
  }
  return { events, last: events[events.length - 1] ?? null, direction };
}

/**
 * Three-bar fair value gaps, newest last, with how much has since been filled.
 * A fully filled gap is kept: "this level was already traded back through" is
 * information, not noise.
 */
export function fairValueGaps(bars) {
  const gaps = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const a = bars[i - 1], c = bars[i + 1];
    if ([a.h, a.l, c.h, c.l].some((v) => v == null)) continue;
    if (a.h < c.l) gaps.push({ index: i, t: bars[i].t, bias: 'bullish', bottom: a.h, top: c.l });
    else if (a.l > c.h) gaps.push({ index: i, t: bars[i].t, bias: 'bearish', bottom: c.h, top: a.l });
  }
  return gaps.map((g) => {
    const after = bars.slice(g.index + 2);
    const size = g.top - g.bottom;
    let filled = 0;
    for (const b of after) {
      if (b.l == null || b.h == null) continue;
      const overlap = Math.min(g.top, b.h) - Math.max(g.bottom, b.l);
      if (overlap > 0) filled = Math.max(filled, overlap);
    }
    return { ...g, size, fillPct: size > 0 ? Math.min(1, filled / size) : 1 };
  });
}

/**
 * Liquidity sweep: a bar takes out a prior swing level with its wick but closes
 * back on the original side. That failure to hold is the signal — a sweep below
 * support that closes back above it is the reclaim the intraday rules ask for.
 */
export function liquiditySweeps(bars, lookback = 3, within = 10) {
  const { highs, lows } = swingPoints(bars, lookback);
  const out = [];
  const recent = bars.length - within;
  for (let i = Math.max(lookback, recent); i < bars.length; i++) {
    const b = bars[i];
    if ([b.h, b.l, b.c].some((v) => v == null)) continue;
    const priorHigh = [...highs].reverse().find((p) => p.index < i - lookback);
    const priorLow = [...lows].reverse().find((p) => p.index < i - lookback);
    if (priorHigh && b.h > priorHigh.price && b.c < priorHigh.price) {
      out.push({ index: i, t: b.t, kind: 'sweep_high', level: priorHigh.price, close: b.c });
    }
    if (priorLow && b.l < priorLow.price && b.c > priorLow.price) {
      out.push({ index: i, t: b.t, kind: 'sweep_low', level: priorLow.price, close: b.c });
    }
  }
  return out;
}

/**
 * Nearest support and resistance from confirmed swings, plus any levels the
 * caller supplies (opening range, previous day, VWAP). Deduplicated within a
 * small band so a cluster of touches at one price reports as one level.
 */
export function keyLevels(bars, price, extra = [], lookback = 3) {
  const { highs, lows } = swingPoints(bars, lookback);
  const levels = [
    ...highs.map((p) => ({ price: p.price, kind: 'swing high' })),
    ...lows.map((p) => ({ price: p.price, kind: 'swing low' })),
    ...extra.filter((e) => e.price != null),
  ];
  const band = price ? price * 0.0015 : 0;
  const merged = [];
  for (const l of levels.sort((a, b) => a.price - b.price)) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(l.price - last.price) <= band) continue;
    merged.push(l);
  }
  return {
    resistance: merged.filter((l) => price != null && l.price > price).slice(0, 4),
    support: merged.filter((l) => price != null && l.price < price).reverse().slice(0, 4),
  };
}

/** Everything above for one series, in one call. */
export function analyzeStructure(bars, { lookback = 3, price = null, extraLevels = [] } = {}) {
  const swings = labelSwings(swingPoints(bars, lookback));
  const trend = trendFromSwings(swings);
  const { events, last } = structureEvents(bars, lookback);
  const close = price ?? (bars.length ? bars[bars.length - 1].c : null);
  return {
    bars: bars.length,
    swings,
    ...trend,
    events: events.slice(-6),
    lastEvent: last,
    fvg: fairValueGaps(bars).slice(-6),
    sweeps: liquiditySweeps(bars, lookback),
    levels: keyLevels(bars, close, extraLevels, lookback),
  };
}

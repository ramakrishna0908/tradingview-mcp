/**
 * Synthetic market data shaped exactly like the live feeds.
 *
 * Built so the expected answers are known in advance: a name whose opening
 * range, trend and flow are constructed on purpose can be asserted against,
 * which a live snapshot never can.
 */

const DAY = 86400;

/** 09:30 ET on the given UTC day, as a unix second. */
export function sessionStart(dayUtcMidnight) {
  return dayUtcMidnight + 13.5 * 3600; // 09:30 EDT = 13:30 UTC
}

export function dailySeries(symbol, { bars = 420, start = 100, drift = 0.25, noise = 0, endTime }) {
  const out = [];
  for (let i = 0; i < bars; i++) {
    const c = start + i * drift + (noise ? Math.sin(i / 3) * noise : 0);
    out.push({ t: endTime - (bars - 1 - i) * DAY, o: c - 0.1, h: c + 1, l: c - 1, c, v: 1_000_000 + i * 10 });
  }
  return out;
}

/**
 * One session of 15m bars plus prior days, with an opening range placed where
 * the test wants it. `breakout` decides whether price ends above the range.
 */
export function intradaySeries({ start, orHigh, orLow, closeAt, priorDays = 12, step = 900, sessionBars = 26 }) {
  const out = [];
  for (let d = priorDays; d >= 1; d--) {
    const base = start - d * DAY;
    for (let i = 0; i < sessionBars; i++) {
      const c = orLow + ((i % 5) * (orHigh - orLow)) / 5;
      out.push({ t: base + i * step, o: c, h: c + 0.4, l: c - 0.4, c, v: 200_000 });
    }
  }
  // Today: the first two bars define the opening range exactly.
  out.push({ t: start, o: orLow, h: orHigh, l: orLow, c: (orHigh + orLow) / 2, v: 900_000 });
  out.push({ t: start + step, o: (orHigh + orLow) / 2, h: orHigh - 0.1, l: orLow + 0.1, c: closeAt > orHigh ? orHigh - 0.2 : orLow + 0.2, v: 500_000 });
  // Then bars walking toward closeAt.
  for (let i = 2; i < 8; i++) {
    const frac = (i - 1) / 6;
    const c = (orHigh + orLow) / 2 + (closeAt - (orHigh + orLow) / 2) * frac;
    out.push({ t: start + i * step, o: c, h: Math.max(c, closeAt) + 0.3, l: Math.min(c, orLow) - 0.1, c, v: 400_000 });
  }
  return out;
}

export function hourlySeries({ endTime, bars = 400, start = 100, drift = 0.05 }) {
  const out = [];
  for (let i = 0; i < bars; i++) {
    const c = start + i * drift;
    out.push({ t: endTime - (bars - 1 - i) * 3600, o: c - 0.05, h: c + 0.6, l: c - 0.6, c, v: 120_000 });
  }
  return out;
}

export function chartJson(bars, { regularStart, regularEnd, timezone = 'America/New_York', previousClose = null }) {
  return {
    chart: {
      result: [{
        meta: {
          exchangeTimezoneName: timezone,
          chartPreviousClose: previousClose ?? bars[0]?.c ?? null,
          currentTradingPeriod: regularStart ? { regular: { start: regularStart, end: regularEnd } } : undefined,
        },
        timestamp: bars.map((b) => b.t),
        indicators: {
          quote: [{
            open: bars.map((b) => b.o), high: bars.map((b) => b.h),
            low: bars.map((b) => b.l), close: bars.map((b) => b.c), volume: bars.map((b) => b.v),
          }],
        },
      }],
    },
  };
}

/** A chain with a 0DTE and a ~109 DTE expiry, liquid unless told otherwise. */
export function optionJson(symbol, spot, { todayIso, farIso, liquid = true } = {}) {
  const osi = (d, type, strike) => `${symbol}${d.slice(2).replace(/-/g, '')}${type}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
  const mk = (d, type, strike, bid, ask, iv, delta) => ({
    option: osi(d, type, strike), bid, ask, iv, delta,
    gamma: 0.01, theta: -0.05, vega: 0.1,
    open_interest: liquid ? 20000 : 5, volume: liquid ? 50000 : 1,
  });
  const contracts = [];
  for (const d of [todayIso, farIso]) {
    for (const k of [spot - 10, spot, spot + 10]) {
      const wide = !liquid;
      contracts.push(mk(d, 'C', k, wide ? 1 : 4.9, wide ? 3 : 5.0, 0.35, k <= spot ? 0.6 : 0.4));
      contracts.push(mk(d, 'P', k, wide ? 1 : 4.8, wide ? 3 : 4.9, 0.36, k >= spot ? -0.6 : -0.4));
    }
  }
  return { timestamp: '2026-09-28 14:10:00', data: { symbol, current_price: spot, options: contracts } };
}

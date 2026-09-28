// Pacing exists to be kind to live endpoints; against a mock it only makes
// the suite slow, so it is disabled before the data layer is imported.
process.env.DESK_REQUEST_GAP_MS = '0';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sessionSlices, rangeOf, vwap, relativeVolume, fetchBars, parseOsi } from '../src/desk/data.js';
import { buildTradePlan } from '../src/desk/risk.js';
import { classifyIntradaySetup, intradayConfirmation, resolveStatus, pullbackZone } from '../src/desk/setups.js';
import { gradeContract, daysToExpiry, selectExpiry, pickByDelta } from '../src/desk/options.js';
import { runDesk } from '../src/desk/index.js';
import { chartJson, optionJson, dailySeries, intradaySeries, hourlySeries, sessionStart } from './desk-fixtures.js';

// A fixed "now": 10:10 ET on Monday 28 September 2026.
const DAY_UTC = Math.floor(Date.UTC(2026, 8, 28) / 1000);
const START = sessionStart(DAY_UTC);
const NOW = new Date((START + 40 * 60) * 1000);     // 10:10 ET
const REG_END = START + 6.5 * 3600;

/** A sweep stage-1 payload, so tests never depend on a report on disk. */
function makeSweep(symbols) {
  return {
    reportDate: '2026-09-28',
    rows: symbols.map((symbol, i) => ({
      symbol,
      sector: i < 3 ? 'Semiconductors' : 'Healthcare',
      group: 'main',
      price: 120,
      changePct: 2.1,
      rsi: 62, rsiMa: 58,
      cmf: 0.18,
      flow: { current: 0.18, previous: 0.10, delta: 0.08, direction: 'improving', complete: true },
      atr: 3,
      bb: { lower: 100, basis: 118, upper: 136 },
      cloud: 'above_cloud',
      structure: 'HH-up',
      score: 2.5,
      source: 'daily sweep',
    })),
  };
}

function makeFetch({ liquid = true, counter = null } = {}) {
  return async (url) => {
    if (counter) {
      const host = new URL(url).hostname.includes('cboe') ? 'cboe' : 'yahoo';
      counter[host] = (counter[host] ?? 0) + 1;
    }
    const u = new URL(url);
    if (u.hostname.includes('cboe')) {
      const symbol = u.pathname.split('/').pop().replace('.json', '');
      return json(optionJson(symbol, 120, { todayIso: '2026-09-28', farIso: '2027-01-15', liquid }));
    }
    const symbol = decodeURIComponent(u.pathname.split('/').pop());
    const interval = u.searchParams.get('interval');
    if (interval === '1d') {
      const bars = dailySeries(symbol, { bars: 420, start: 20, drift: 0.25, endTime: DAY_UTC - DAY_UTC % 86400 });
      return json(chartJson(bars, { regularStart: START, regularEnd: REG_END, previousClose: bars.at(-2).c }));
    }
    if (interval === '1h') {
      return json(chartJson(hourlySeries({ endTime: START, bars: 400, start: 100, drift: 0.05 }), { regularStart: START, regularEnd: REG_END }));
    }
    // 15m: opening range 118-122, price pushing to 124 (above the range).
    const bars = intradaySeries({ start: START, orHigh: 122, orLow: 118, closeAt: 124 });
    return json(chartJson(bars, { regularStart: START, regularEnd: REG_END, previousClose: 119 }));
  };
}
const json = (body) => ({ ok: true, status: 200, json: async () => body });

describe('opening range and the live candle', () => {
  test('the range is exactly the 09:30-10:00 bars, and only closed ones', async () => {
    const series = await fetchBars('AAA', { interval: '15m', range: '1mo', prePost: true, fetchImpl: makeFetch(), now: NOW });
    const slices = sessionSlices(series);
    assert.equal(slices.regularStart, START);
    assert.equal(slices.openingRange.length, 2, 'two 15m bars span 09:30-10:00');
    const or = rangeOf(slices.openingRange);
    assert.equal(or.high, 122);
    assert.equal(or.low, 118);
  });

  test('a bar that has not finished is never marked closed', async () => {
    const series = await fetchBars('AAA', { interval: '15m', range: '1mo', prePost: true, fetchImpl: makeFetch(), now: NOW });
    const openBars = series.bars.filter((b) => !b.closed);
    for (const b of openBars) {
      assert.ok(b.t + 900 > Math.floor(NOW.getTime() / 1000), 'an unclosed bar must still be in progress');
    }
    for (const b of series.closedBars) assert.ok(b.t + 900 <= Math.floor(NOW.getTime() / 1000));
  });

  test('VWAP uses the regular session only', async () => {
    const series = await fetchBars('AAA', { interval: '15m', range: '1mo', prePost: true, fetchImpl: makeFetch(), now: NOW });
    const slices = sessionSlices(series);
    const v = vwap(slices.rth);
    assert.ok(v > 100 && v < 140, `VWAP ${v} should sit inside the session range`);
  });

  test('relative volume compares like for like and reports why when it cannot', () => {
    const empty = relativeVolume({ interval: '15m', bars: [], meta: { regularStart: null, regularEnd: null } });
    assert.equal(empty.rvol, null);
    assert.match(empty.reason, /session boundaries/);
  });
});

describe('risk model', () => {
  test('reward-to-risk below the floor is not actionable', () => {
    const plan = buildTradePlan({
      direction: 'bullish', price: 100, trigger: 100, atr: 2,
      levels: { support: [{ price: 98, kind: 'swing low' }], resistance: [{ price: 101, kind: 'swing high' }] },
    });
    assert.equal(plan.actionable, false);
  });

  test('a projected target can never make a setup actionable', () => {
    const plan = buildTradePlan({
      direction: 'bullish', price: 100, trigger: 100, atr: 2,
      levels: { support: [{ price: 98, kind: 'swing low' }], resistance: [] },
    });
    assert.equal(plan.targets[0].projected, true);
    assert.equal(plan.actionable, false, 'an ATR projection is context, not a qualification');
    assert.match(plan.reason, /no structural level ahead/i);
  });

  test('every actionable plan carries entry, invalidation and a target', () => {
    const plan = buildTradePlan({
      direction: 'bullish', price: 100, trigger: 100, atr: 2,
      levels: { support: [{ price: 99, kind: 'swing low' }], resistance: [{ price: 110, kind: 'swing high' }] },
    });
    assert.equal(plan.actionable, true);
    assert.ok(plan.entry.low != null && plan.entry.high != null);
    assert.ok(plan.invalidation != null);
    assert.ok(plan.targets.length >= 1 && plan.targets[0].price != null);
    assert.ok(plan.rr >= 2);
    assert.ok(plan.risk > 0);
  });
});

describe('confirmation discipline', () => {
  test('no closed 15m candle means no confirmation', () => {
    const c = intradayConfirmation({ closed15m: [], direction: 'bullish', or: { high: 122, low: 118 } });
    assert.equal(c.confirmed, false);
    assert.equal(c.incomplete, true);
  });

  test('a pending trigger states the exact condition and level', () => {
    const c = intradayConfirmation({
      closed15m: [{ t: START, c: 120 }], direction: 'bullish',
      or: { high: 122, low: 118 }, vwap: 119, structure15m: { lastEvent: null, sweeps: [] },
    });
    assert.equal(c.confirmed, false);
    assert.equal(c.trigger, 122);
    assert.match(c.condition, /must CLOSE above 122/);
  });

  test('price beyond the level is not enough without structure', () => {
    const c = intradayConfirmation({
      closed15m: [{ t: START, c: 125 }], direction: 'bullish',
      or: { high: 122, low: 118 }, vwap: 119, structure15m: { lastEvent: null, sweeps: [] },
    });
    assert.equal(c.confirmed, false, 'a close through the level still needs a break of structure or a reclaim');
  });

  test('a failed breakout outranks a breakout on the same bar', () => {
    const r = classifyIntradaySetup({
      structure1h: { trend: 'up', sweeps: [{ kind: 'sweep_high', level: 122 }], lastEvent: { kind: 'bullish_bos' } },
      price: 120, or: { high: 122, low: 118 }, vwap: 119, atr1h: 1,
    });
    assert.equal(r.setup, 'FAILED BREAKOUT');
    assert.equal(r.direction, 'bearish');
  });
});

describe('status gating', () => {
  const confirmed = { confirmed: true, condition: 'trigger met' };
  const plan = { actionable: true, reason: null };

  test('CONFIRMED requires every gate, not just the trigger', () => {
    assert.equal(resolveStatus({ setup: 'BREAKOUT', confirmation: confirmed, plan, optionsGrade: 'GOOD', flowComplete: true, horizon: 'intraday' }).status, 'CONFIRMED');
  });

  test('missing flow data caps the status at WATCH', () => {
    const s = resolveStatus({ setup: 'BREAKOUT', confirmation: confirmed, plan, optionsGrade: 'GOOD', flowComplete: false, horizon: 'intraday' });
    assert.equal(s.status, 'WATCH');
    assert.match(s.reason, /FLOW DATA INCOMPLETE/);
  });

  test('illiquid options cap the status at WATCH', () => {
    assert.equal(resolveStatus({ setup: 'BREAKOUT', confirmation: confirmed, plan, optionsGrade: 'POOR', flowComplete: true, horizon: 'intraday' }).status, 'WATCH');
  });

  test('an unworkable plan is NO TRADE regardless of confirmation', () => {
    const s = resolveStatus({ setup: 'BREAKOUT', confirmation: confirmed, plan: { actionable: false, reason: 'poor R:R' }, optionsGrade: 'GOOD', flowComplete: true, horizon: 'intraday' });
    assert.equal(s.status, 'NO TRADE');
  });

  test('swing statuses carry their own prefix', () => {
    assert.equal(resolveStatus({ setup: 'TREND PULLBACK', confirmation: confirmed, plan, optionsGrade: 'GOOD', flowComplete: true, horizon: 'swing' }).status, 'SWING CONFIRMED');
  });
});

describe('options', () => {
  test('DTE and the 90-120 window', () => {
    const today = new Date('2026-09-28T14:00:00Z');
    assert.equal(daysToExpiry('2027-01-15', today), 109);
    const chain = { expiries: ['2026-09-28', '2026-10-16', '2027-01-15'], contracts: [] };
    assert.equal(selectExpiry(chain, { minDte: 90, maxDte: 120, today }).expiry, '2027-01-15');
    assert.equal(selectExpiry(chain, { minDte: 0, maxDte: 2, today }).expiry, '2026-09-28');
  });

  test('a wide spread grades POOR and says why', () => {
    const g = gradeContract({ expiry: '2027-01-15', type: 'call', strike: 100, bid: 1, ask: 3, mid: 2, iv: 0.4, openInterest: 50, volume: 1 });
    assert.equal(g.grade, 'POOR');
    assert.match(g.reasons.join(' '), /spread/i);
  });

  test('IV Rank is reported as unavailable rather than invented', () => {
    const g = gradeContract({ expiry: '2027-01-15', type: 'call', strike: 100, bid: 4.9, ask: 5, mid: 4.95, iv: 0.35, openInterest: 20000, volume: 5000 });
    assert.equal(g.ivRank.value, null);
    assert.match(g.ivRank.note, /history/i);
  });

  test('the swing pick respects the 0.55-0.70 delta band', () => {
    const chain = { contracts: [
      { expiry: '2027-01-15', type: 'call', strike: 90, delta: 0.85, openInterest: 900 },
      { expiry: '2027-01-15', type: 'call', strike: 100, delta: 0.60, openInterest: 500 },
      { expiry: '2027-01-15', type: 'call', strike: 110, delta: 0.30, openInterest: 900 },
    ] };
    assert.equal(pickByDelta(chain, '2027-01-15', 'call').strike, 100);
  });
});

describe('swing rules', () => {
  test('the pullback zone is the 21 EMA plus or minus a quarter ATR', () => {
    assert.deepEqual(pullbackZone(200, 8), { low: 198, high: 202 });
  });
});

describe('full run', () => {
  test('produces both horizons, honours the funnel and never contradicts itself', async () => {
    const symbols = ['AAA', 'BBB', 'CCC', 'DDD'];
    const universe = symbols.map((s, i) => ({ symbol: s, sector: i < 2 ? 'Semiconductors' : 'Healthcare' }));
    const model = await runDesk({ fetchImpl: makeFetch(), now: NOW, universe, sweepRows: makeSweep(symbols) });

    assert.equal(model.reportType, 'DESK');
    assert.equal(model.date, '2026-09-28');
    assert.ok(model.market.intraday.regime, 'an intraday regime is always stated');
    assert.ok(model.market.swing.regime, 'a swing regime is always stated');
    assert.equal(model.freshness.openingRangeWindow, '09:30–10:00 ET');
    assert.match(model.freshness.note, /may change after publication/);

    // The funnel never promotes more than the cap.
    assert.ok(model.intraday.top.length <= 5);
    assert.ok(model.swing.top.length <= 5);
    assert.ok(model.intraday.candidates.length <= 12);

    // Every promoted setup is fully specified.
    for (const r of [...model.intraday.top, ...model.swing.top]) {
      assert.ok(r.plan.entry.low != null, `${r.symbol} entry`);
      assert.ok(r.plan.invalidation != null, `${r.symbol} invalidation`);
      assert.ok(r.plan.targets.length >= 1, `${r.symbol} target`);
      assert.ok(r.plan.rr >= 2, `${r.symbol} R:R ${r.plan.rr}`);
      assert.ok(r.status, `${r.symbol} status`);
      assert.ok(r.label.startsWith('INTRADAY') || r.label.startsWith('SWING'), `${r.symbol} labelled by horizon`);
    }

    // No CONFIRMED without a closed-candle trigger.
    for (const r of model.intraday.candidates) {
      if (r.status === 'CONFIRMED') {
        assert.equal(r.confirmation.confirmed, true, `${r.symbol} CONFIRMED needs a met trigger`);
        assert.ok(r.confirmation.basis?.closedAt != null, `${r.symbol} trigger must cite a closed candle`);
      }
    }

    // The sweep covers the whole universe, deep work only the shortlist.
    assert.equal(model.sweep.length, universe.length);
    assert.ok(model.intraday.candidates.length <= universe.length);
  });

  test('stage 1 spends no requests on names the funnel will discard', async () => {
    // Twenty names, of which the fixture sweep makes every one a candidate;
    // the funnel caps the shortlist at twelve, so bars are fetched for twelve
    // rather than twenty. Without the sweep this would be twenty daily fetches
    // before a single name had been rejected.
    const symbols = Array.from({ length: 20 }, (_, i) => `S${String(i).padStart(2, '0')}`);
    const universe = symbols.map((s) => ({ symbol: s, sector: 'Semiconductors' }));
    const counter = {};
    const model = await runDesk({
      fetchImpl: makeFetch({ counter }), now: NOW, universe, sweepRows: makeSweep(symbols),
    });

    assert.equal(model.sweep.length, 20, 'the full universe is still reported');
    assert.ok(model.intraday.candidates.length <= 12, 'shortlist is capped');

    // Index instruments cost 2 requests each; everything else is survivors.
    const indexCalls = 8 * 2;
    const perSurvivor = counter.yahoo - indexCalls;
    assert.ok(perSurvivor > 0);
    assert.ok(
      perSurvivor < 20 * 4,
      `survivor fetches (${perSurvivor}) must be far below what scanning all 20 names deeply would cost`,
    );
  });

  test('a missing sweep degrades to bars rather than using stale measurements', async () => {
    const symbols = ['AAA', 'BBB'];
    const universe = symbols.map((s) => ({ symbol: s, sector: 'Semiconductors' }));
    // `false` states there is no sweep, rather than letting the run find the
    // real report that happens to sit on disk for this date.
    const model = await runDesk({ fetchImpl: makeFetch(), now: NOW, universe, sweepRows: false });
    assert.equal(model.sweep.length, 2);
    assert.ok(model.errors.sweep, 'the fallback is recorded rather than hidden');
    assert.match(model.errors.sweep, /fell back/i);
  });

  test('illiquid options keep a setup out of CONFIRMED', async () => {
    const symbols = ['AAA', 'BBB'];
    const universe = symbols.map((s) => ({ symbol: s, sector: 'Semiconductors' }));
    const model = await runDesk({ fetchImpl: makeFetch({ liquid: false }), now: NOW, universe, sweepRows: makeSweep(symbols) });
    for (const r of model.intraday.candidates) {
      if (r.options?.grade === 'POOR') assert.notEqual(r.status, 'CONFIRMED');
    }
  });
});

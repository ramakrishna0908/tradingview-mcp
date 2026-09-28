/**
 * The 10:10 ET decision-support run.
 *
 * One pass, two horizons, and a funnel that spends its expensive calls only on
 * names that survived a cheap filter:
 *
 *   56 names -> daily context + flow + sector      (cheap, every name)
 *            -> ~12 intraday and ~12 swing candidates, chosen separately
 *            -> 1H/15m/opening range/VWAP/RVOL/options   (intraday survivors)
 *            -> daily/4H structure/options 90-120 DTE     (swing survivors)
 *            -> 2-5 of each, or fewer when nothing qualifies
 *
 * Producing no setups is a valid outcome. The funnel exists to reject, and a
 * morning with nothing worth trading should say so rather than promote the
 * least-bad candidate.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchBars, fetchOptionChain, sessionSlices, rangeOf, vwap, relativeVolume, aggregate, pool } from './data.js';
import { atr, cmf, cmfTrend, maStructure, rsi, bollinger } from './indicators.js';
import { analyzeStructure } from './structure.js';
import { INDEX_SET, readInstrument, intradayRegime, swingRegime, breadth } from './regime.js';
import { sectorRotation } from './sectors.js';
import { intradayShortlist, swingShortlist } from './funnel.js';
import { classifyIntradaySetup, intradayConfirmation, classifySwingSetup, swingConfirmation, resolveStatus, horizonLabel } from './setups.js';
import { buildTradePlan, targetVsExpectedMove } from './risk.js';
import { assessOptions } from './options.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

export const MODEL_VERSION = 1;

/** Kept low on purpose: the data sources rate limit an impatient caller. */
const CHEAP_CONCURRENCY = 2;
const DEEP_CONCURRENCY = 2;
const TOP_SETUPS = 5;

export function loadUniverse() {
  const raw = JSON.parse(readFileSync(join(REPO, 'config', 'desk-universe.json'), 'utf8'));
  return raw.universe;
}

const etStamp = (d) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
}).format(d);
const etTime = (t) => (t == null ? null : new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(t * 1000)));
const etDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

/** Daily and weekly context for one name. The cheap stage, run on all 56. */
async function cheapRead(entry, { fetchImpl, now }) {
  const daily = await fetchBars(entry.symbol, { interval: '1d', range: '2y', fetchImpl, now });
  const closed = daily.closedBars;
  const weeklyBars = aggregate(closed, 5);
  const price = closed.length ? closed[closed.length - 1].c : null;
  const previousClose = closed.length > 1 ? closed[closed.length - 2].c : null;
  return {
    symbol: entry.symbol,
    sector: entry.sector,
    price,
    previousClose,
    changePct: price != null && previousClose ? Number((((price - previousClose) / previousClose) * 100).toFixed(2)) : null,
    dailyBars: closed,
    weeklyBars,
    daily: {
      ma: maStructure(closed),
      rsi: rsi(closed),
      atr: atr(closed),
      cmf: cmf(closed),
      cmfTrend: cmfTrend(closed),
      bollinger: bollinger(closed),
      lastBar: closed.length ? closed[closed.length - 1].t : null,
      structure: analyzeStructure(closed, { lookback: 3 }),
    },
    weekly: {
      ma: maStructure(weeklyBars),
      rsi: rsi(weeklyBars),
      structure: analyzeStructure(weeklyBars, { lookback: 2 }),
      lastBar: weeklyBars.length ? weeklyBars[weeklyBars.length - 1].t : null,
    },
  };
}

/** The expensive intraday pass, run only on shortlisted names. */
async function intradayRead(row, { fetchImpl, now }) {
  const gaps = [];
  const fifteen = await fetchBars(row.symbol, { interval: '15m', range: '1mo', prePost: true, fetchImpl, now });
  const slices = sessionSlices(fifteen);
  const or = rangeOf(slices.openingRange);
  const pre = rangeOf(slices.premarket);
  const sessionVwap = vwap(slices.rth);
  const rv = relativeVolume(fifteen);
  if (rv.rvol == null) gaps.push(`relative volume unavailable (${rv.reason})`);
  if (or.high == null) gaps.push('opening range incomplete');

  const hourly = await fetchBars(row.symbol, { interval: '1h', range: '3mo', fetchImpl, now });
  const closed15 = fifteen.closedBars.filter((b) => slices.regularStart == null || b.t >= slices.regularStart - 5 * 86400);
  const live = fifteen.bars[fifteen.bars.length - 1] ?? null;
  const price = live?.c ?? row.price;

  const extra = [
    { price: or.high, kind: 'opening-range high' },
    { price: or.low, kind: 'opening-range low' },
    { price: sessionVwap, kind: 'session VWAP' },
    { price: pre.high, kind: 'premarket high' },
    { price: pre.low, kind: 'premarket low' },
  ];
  const structure1h = analyzeStructure(hourly.closedBars, { lookback: 3, price, extraLevels: extra });
  const structure15m = analyzeStructure(closed15, { lookback: 2, price, extraLevels: extra });
  const atr1h = atr(hourly.closedBars);
  const atr15 = atr(closed15);

  const classified = classifyIntradaySetup({ structure1h, price, or, vwap: sessionVwap, premarket: pre, atr1h });
  const confirmation = intradayConfirmation({
    closed15m: closed15.filter((b) => slices.regularStart != null && b.t >= slices.regularStart),
    direction: classified.direction, or, vwap: sessionVwap, premarket: pre, structure15m,
  });
  if (confirmation.incomplete) gaps.push('no closed 15m candle in this session yet');

  // Intraday risk uses intraday structure and intraday ATR. Feeding the daily
  // ATR here would place a 0DTE stop a full day's range away.
  const plan = classified.direction
    ? buildTradePlan({
        direction: classified.direction, price, trigger: confirmation.trigger,
        levels: structure15m.levels, atr: atr15 ?? atr1h, horizon: 'intraday',
      })
    : null;

  return {
    ...row, price,
    openingRange: { ...or, bars: slices.openingRange.length, window: '09:30–10:00 ET' },
    premarket: pre,
    previousDay: rangeOf(fifteen.bars.filter((b) => slices.regularStart != null && b.t < slices.regularStart && b.t >= slices.regularStart - 86400)),
    vwap: sessionVwap,
    aboveVwap: sessionVwap != null && price != null ? price > sessionVwap : null,
    orPosition: or.high != null && price != null ? (price > or.high ? 'above ORH' : price < or.low ? 'below ORL' : 'inside range') : null,
    rvol: rv.rvol, rvolDetail: rv,
    atr15m: atr15, atr1h,
    structure1h, structure15m,
    setup: classified.setup, direction: classified.direction, setupReasons: classified.reasons,
    confirmation, plan, dataGaps: gaps,
    lastClosed15m: fifteen.closedBars.length ? fifteen.closedBars[fifteen.closedBars.length - 1].t : null,
    liveBarExcluded: live && !live.closed ? live.t : null,
  };
}

/** The expensive swing pass. Daily and 4H only — no intraday input reaches it. */
async function swingRead(row, { fetchImpl, now }) {
  const gaps = [];
  const hourly = await fetchBars(row.symbol, { interval: '1h', range: '2y', fetchImpl, now });
  const fourHour = aggregate(hourly.closedBars, 4);
  if (fourHour.length < 30) gaps.push('4H history short');

  const structure4h = analyzeStructure(fourHour, { lookback: 3, price: row.price });
  const dailyStructure = row.daily.structure;
  const classified = classifySwingSetup({
    ma: row.daily.ma, atrDaily: row.daily.atr, dailyStructure,
    weeklyTrend: row.weekly.structure?.trend, price: row.price,
  });
  const confirmation = swingConfirmation({ structure4h, direction: classified.direction });

  // Swing risk uses daily structure and the daily ATR, per the spec's rule that
  // the two horizons never borrow each other's invalidation.
  const plan = classified.direction
    ? buildTradePlan({
        direction: classified.direction, price: row.price,
        trigger: classified.zone ? (classified.direction === 'bullish' ? classified.zone.high : classified.zone.low) : null,
        levels: dailyStructure.levels, atr: row.daily.atr, horizon: 'swing', minRR: 2,
      })
    : null;

  return {
    ...row, structure4h, dailyStructure,
    setup: classified.setup, direction: classified.direction, setupReasons: classified.reasons,
    pullbackZone: classified.zone, confirmation, plan, dataGaps: gaps,
    lastDailyBar: row.daily.lastBar, lastWeeklyBar: row.weekly.lastBar,
    last4hBar: fourHour.length ? fourHour[fourHour.length - 1].t : null,
  };
}

/** Options for one name, both horizons, from a single chain fetch. */
async function optionsFor(row, direction, { fetchImpl, now }) {
  try {
    const chain = await fetchOptionChain(row.symbol, { fetchImpl });
    return assessOptions(chain, { spot: row.price, dailyBars: row.dailyBars ?? [], direction, today: now });
  } catch (err) {
    return {
      error: err.message,
      intraday: { grade: 'N/A', reasons: [`Option chain unavailable: ${err.message}`], complete: false, ivRank: { value: null } },
      swing: { grade: 'N/A', reasons: [`Option chain unavailable: ${err.message}`], complete: false, ivRank: { value: null } },
    };
  }
}

export async function runDesk({ fetchImpl = fetch, now = new Date(), universe = loadUniverse(), log = () => {}, previousSectors = null } = {}) {
  const startedAt = new Date(now);
  const errors = {};

  log(`reading ${INDEX_SET.length} index instruments`);
  const { results: indexResults, errors: indexErrors } = await pool(
    INDEX_SET, (inst) => readInstrument(inst, { fetchImpl, now }), { concurrency: CHEAP_CONCURRENCY },
  );
  const instruments = INDEX_SET.map((i) => indexResults.get(i)).filter(Boolean);
  for (const [inst, msg] of indexErrors) errors[inst.symbol] = msg;

  const intraRegime = intradayRegime(instruments);
  const swRegime = swingRegime(instruments);
  const spy = instruments.find((i) => i.key === 'spy');
  const benchmarkChangePct = spy?.daily?.price != null && spy?.daily?.previousClose
    ? ((spy.daily.price - spy.daily.previousClose) / spy.daily.previousClose) * 100 : null;

  log(`cheap scan across ${universe.length} names`);
  const { results: cheapResults, errors: cheapErrors } = await pool(
    universe, (e) => cheapRead(e, { fetchImpl, now }), { concurrency: CHEAP_CONCURRENCY },
  );
  for (const [e, msg] of cheapErrors) errors[e.symbol] = msg;
  const rows = universe.map((e) => cheapResults.get(e)).filter(Boolean);
  if (!rows.length) throw new Error('no universe rows could be read');

  const sectors = sectorRotation(rows, { benchmarkChangePct, previous: previousSectors });
  const marketBreadth = breadth(rows);

  const intraCandidates = intradayShortlist(rows, { sectorTable: sectors, regime: intraRegime.regime });
  const swingCandidates = swingShortlist(rows, { sectorTable: sectors });
  log(`shortlists: ${intraCandidates.length} intraday, ${swingCandidates.length} swing`);

  log('intraday deep pass');
  const { results: intraDeep, errors: intraErrs } = await pool(
    intraCandidates, (r) => intradayRead(r, { fetchImpl, now }), { concurrency: DEEP_CONCURRENCY },
  );
  for (const [r, msg] of intraErrs) errors[`${r.symbol} intraday`] = msg;

  log('swing deep pass');
  const { results: swingDeep, errors: swingErrs } = await pool(
    swingCandidates, (r) => swingRead(r, { fetchImpl, now }), { concurrency: DEEP_CONCURRENCY },
  );
  for (const [r, msg] of swingErrs) errors[`${r.symbol} swing`] = msg;

  // One chain per name covers both horizons.
  const needChains = [...new Set([
    ...intraCandidates.map((r) => r.symbol),
    ...swingCandidates.map((r) => r.symbol),
  ])];
  log(`option chains for ${needChains.length} names`);
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const directionFor = (sym) => {
    const i = intraCandidates.find((r) => r.symbol === sym);
    const s = swingCandidates.find((r) => r.symbol === sym);
    return i?.direction ?? s?.swingDirection ?? 'bullish';
  };
  const { results: chainResults } = await pool(
    needChains, (sym) => optionsFor(bySymbol.get(sym), directionFor(sym), { fetchImpl, now }), { concurrency: DEEP_CONCURRENCY },
  );

  const intraday = intraCandidates.map((c) => intraDeep.get(c)).filter(Boolean).map((r) => {
    const opts = chainResults.get(r.symbol) ?? null;
    const grade = opts?.intraday?.grade ?? 'N/A';
    const emCheck = r.plan ? targetVsExpectedMove(r.plan, opts?.intraday?.expectedMove, r.price) : null;
    const gaps = [...r.dataGaps];
    if (emCheck?.withinExpectedMove === false) gaps.push('target sits beyond the expected move priced by the chain');
    const status = resolveStatus({
      setup: r.setup, confirmation: r.confirmation, plan: r.plan, optionsGrade: grade,
      flowComplete: r.daily?.cmfTrend?.complete === true, dataGaps: gaps, horizon: 'intraday',
    });
    return { ...r, options: opts?.intraday ?? null, expectedMoveCheck: emCheck, ...status, label: horizonLabel('intraday', r.direction, status.status) };
  });

  const swing = swingCandidates.map((c) => swingDeep.get(c)).filter(Boolean).map((r) => {
    const opts = chainResults.get(r.symbol) ?? null;
    const grade = opts?.swing?.grade ?? 'N/A';
    const status = resolveStatus({
      setup: r.setup, confirmation: r.confirmation, plan: r.plan, optionsGrade: grade,
      flowComplete: r.daily?.cmfTrend?.complete === true, dataGaps: r.dataGaps, horizon: 'swing',
    });
    return { ...r, options: opts?.swing ?? null, ...status, label: horizonLabel('swing', r.direction, status.status) };
  });

  const rank = (r) => (r.status.includes('CONFIRMED') ? 0 : r.status.includes('WATCH') ? 1 : 2);
  const order = (a, b) => rank(a) - rank(b) || (b.plan?.rr ?? 0) - (a.plan?.rr ?? 0);
  const topIntraday = [...intraday].sort(order).filter((r) => r.plan?.actionable).slice(0, TOP_SETUPS);
  const topSwing = [...swing].sort(order).filter((r) => r.plan?.actionable).slice(0, TOP_SETUPS);

  // Where the two horizons disagree, both answers stand.
  const conflicts = [];
  for (const i of intraday) {
    const s = swing.find((x) => x.symbol === i.symbol);
    if (!s || !i.direction || !s.direction) continue;
    if (i.direction !== s.direction) {
      conflicts.push({
        symbol: i.symbol,
        intraday: { direction: i.direction, status: i.status, reason: i.setupReasons?.[0] ?? null },
        swing: { direction: s.direction, status: s.status, reason: s.setupReasons?.[0] ?? null },
        explanation: `Short-term ${i.direction === 'bearish' ? 'weakness' : 'strength'} on the 15m/1H picture does not change the ${s.direction} weekly and daily thesis. The two horizons are assessed independently.`,
      });
    }
  }

  return {
    modelVersion: MODEL_VERSION,
    reportType: 'DESK',
    date: etDate(startedAt),
    generatedAt: startedAt.toISOString(),
    generatedAtEt: etStamp(startedAt),
    horizons: {
      intraday: { label: 'INTRADAY / 0DTE', holding: 'Minutes to approximately one trading day', timeframes: 'Daily → 1H → 15m (5m optional)', reportType: '10:10 AM ET morning execution snapshot' },
      swing: { label: 'SWING / 90–120 DTE', holding: 'Several weeks to approximately three months', timeframes: 'Weekly → Daily → 4H' },
    },
    market: {
      intraday: intraRegime,
      swing: swRegime,
      breadth: marketBreadth,
      instruments: instruments.map((i) => ({
        key: i.key, symbol: i.symbol, label: i.label,
        price: i.intraday?.price ?? i.daily?.price ?? null,
        changePct: i.daily?.previousClose && (i.intraday?.price ?? i.daily?.price) != null
          ? Number(((((i.intraday?.price ?? i.daily.price) - i.daily.previousClose) / i.daily.previousClose) * 100).toFixed(2)) : null,
        vwap: i.intraday?.vwap ?? null,
        openingRange: i.intraday?.openingRange ?? null,
        premarket: i.intraday?.premarket ?? null,
        previousDay: i.intraday?.previousDay ?? null,
        gapPct: i.intraday?.gapPct != null ? Number(i.intraday.gapPct.toFixed(2)) : null,
        aboveSma200: i.daily?.ma?.aboveSma200 ?? null,
        errors: i.errors,
      })),
    },
    sectors,
    intraday: { candidates: intraday, top: topIntraday },
    swing: { candidates: swing, top: topSwing },
    conflicts,
    sweep: rows.map((r) => ({
      symbol: r.symbol, sector: r.sector, price: r.price, changePct: r.changePct,
      rsi: r.daily.rsi != null ? Number(r.daily.rsi.toFixed(1)) : null,
      cmf: r.daily.cmf != null ? Number(r.daily.cmf.toFixed(3)) : null,
      cmfTrend: r.daily.cmfTrend.direction,
      structure: r.daily.structure.structure ?? r.daily.structure.trend,
      aboveSma200: r.daily.ma.aboveSma200, aboveSma50: r.daily.ma.aboveSma50, aboveEma21: r.daily.ma.aboveEma21,
      sma50Slope: r.daily.ma.sma50Slope != null ? Number(r.daily.ma.sma50Slope.toFixed(2)) : null,
    })),
    freshness: {
      note: 'Single intraday snapshot generated around 10:10 AM ET. Conditions may change after publication.',
      reportSnapshot: startedAt.toISOString(),
      openingRangeWindow: '09:30–10:00 ET',
      lastClosed15m: etTime(intraday.find((r) => r.lastClosed15m)?.lastClosed15m ?? null),
      lastDailyBar: rows[0]?.daily?.lastBar ? etTime(rows[0].daily.lastBar) : null,
      lastWeeklyBar: rows[0]?.weekly?.lastBar ? etTime(rows[0].weekly.lastBar) : null,
      liveBarExcluded: true,
    },
    errors,
  };
}

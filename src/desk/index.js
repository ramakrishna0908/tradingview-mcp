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
import { rowsFromSweep } from './sweep.js';
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

/**
 * True when the run is far enough from the 10:10 slot that the intraday half
 * should say so. The opening range is fixed at 09:30-10:00 whenever the report
 * runs, but a snapshot taken hours later describes a session that has moved on.
 */
function offSchedule(d, toleranceMinutes = 45) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return Math.abs((hour * 60 + minute) - (10 * 60 + 10)) > toleranceMinutes;
}

/**
 * Daily and weekly bars for one name.
 *
 * Run only on names that survived the cheap filter. This is where the exact
 * moving-average stack, ATR and a dependable money-flow trend come from — the
 * figures that gate a status, as opposed to the ones that merely rank a
 * shortlist. Fetching it for all 56 would cost 56 requests against a feed that
 * rate limits a burst, to refine names that are about to be discarded.
 */
async function enrich(row, { fetchImpl, now }) {
  const daily = await fetchBars(row.symbol, { interval: '1d', range: '2y', fetchImpl, now });
  // Fetched once here and shared: the intraday pass wants recent 1H structure
  // and the swing pass aggregates the same series into 4H. A name on both
  // shortlists otherwise paid for the identical bars twice.
  const hourly = await fetchBars(row.symbol, { interval: '1h', range: '2y', fetchImpl, now });
  const closed = daily.closedBars;
  const weeklyBars = aggregate(closed, 5);
  const lastClose = closed.length ? closed[closed.length - 1].c : null;
  return {
    ...row,
    // The sweep's price is its own snapshot; the daily close is the reference
    // for swing work. Intraday overwrites this again with the live print.
    price: row.price ?? lastClose,
    dailyClose: lastClose,
    dailyBars: closed,
    weeklyBars,
    hourlyBars: hourly.closedBars,
    daily: {
      ma: maStructure(closed),
      rsi: rsi(closed),
      atr: atr(closed),
      cmf: cmf(closed),
      // Computed from bars, so it is available even when the sweep had no
      // prior session to difference against.
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

  const hourlyClosed = row.hourlyBars ?? (await fetchBars(row.symbol, { interval: '1h', range: '3mo', fetchImpl, now })).closedBars;
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
  const structure1h = analyzeStructure(hourlyClosed.slice(-500), { lookback: 3, price, extraLevels: extra });
  const structure15m = analyzeStructure(closed15, { lookback: 2, price, extraLevels: extra });
  const atr1h = atr(hourlyClosed.slice(-500));
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
  const hourlyClosed = row.hourlyBars ?? (await fetchBars(row.symbol, { interval: '1h', range: '2y', fetchImpl, now })).closedBars;
  const fourHour = aggregate(hourlyClosed, 4);
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

/** Fields the funnel decided that enrichment must not overwrite. */
function pickFunnelFields(c) {
  return {
    direction: c.direction, swingDirection: c.swingDirection,
    confluence: c.confluence, counterpoints: c.counterpoints,
    swingConfluence: c.swingConfluence, swingCounterpoints: c.swingCounterpoints,
    sectorClass: c.sectorClass, distanceToBasisPct: c.distanceToBasisPct,
  };
}

export async function runDesk({ fetchImpl = fetch, now = new Date(), universe = loadUniverse(), log = () => {}, previousSectors = null, sweepRows = null } = {}) {
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

  // Stage 1 reads the morning sweep rather than the network: it already
  // measured every name, and re-deriving it would cost one request per symbol
  // to rank a list that is about to be cut to twelve.
  const date = etDate(startedAt);
  // `sweepRows: false` is an explicit "there is no sweep", distinct from
  // omitting it, which means "look for one on disk".
  const sweep = sweepRows ?? rowsFromSweep(REPO, date);
  let rows;
  if (sweep?.rows?.length) {
    rows = sweep.rows;
    log(`stage 1 from the ${sweep.reportDate} sweep — ${rows.length} names, no network`);
  } else {
    // No sweep for today: fall back to bars so a missing upstream job degrades
    // the run rather than publishing yesterday's measurements as today's.
    log(`no sweep for ${date}; falling back to daily bars for ${universe.length} names`);
    const { results, errors: cheapErrors } = await pool(
      universe, (e) => enrich({ symbol: e.symbol, sector: e.sector }, { fetchImpl, now }),
      { concurrency: CHEAP_CONCURRENCY },
    );
    for (const [e, msg] of cheapErrors) errors[e.symbol] = msg;
    rows = universe.map((e) => results.get(e)).filter(Boolean).map((r) => ({
      ...r,
      cmf: r.daily.cmf,
      flow: r.daily.cmfTrend,
      bb: r.daily.bollinger,
      cloud: r.daily.ma.aboveSma200 ? 'above_cloud' : 'below_cloud',
      structure: r.daily.structure.trend === 'up' ? 'HH-up' : r.daily.structure.trend === 'down' ? 'LL-down' : 'range',
      rsiMa: null,
      source: 'daily bars',
    }));
    errors.sweep = `No daily sweep found for ${date}; stage 1 fell back to fetching bars.`;
  }
  if (!rows.length) throw new Error('no universe rows could be read');

  const sectors = sectorRotation(rows, { benchmarkChangePct, previous: previousSectors });
  const marketBreadth = breadth(rows);

  const intraCandidates = intradayShortlist(rows, { sectorTable: sectors, regime: intraRegime.regime });
  const swingCandidates = swingShortlist(rows, { sectorTable: sectors });
  log(`shortlists: ${intraCandidates.length} intraday, ${swingCandidates.length} swing`);

  // Bars for the survivors only, fetched once per symbol and shared by both
  // horizons even when a name appears on both lists.
  const survivors = [...new Set([...intraCandidates, ...swingCandidates].map((r) => r.symbol))];
  log(`enriching ${survivors.length} survivors with daily and weekly bars`);
  const bySweepRow = new Map(rows.map((r) => [r.symbol, r]));
  const { results: enriched, errors: enrichErrors } = await pool(
    survivors,
    (sym) => (bySweepRow.get(sym).dailyBars ? bySweepRow.get(sym) : enrich(bySweepRow.get(sym), { fetchImpl, now })),
    { concurrency: CHEAP_CONCURRENCY },
  );
  for (const [sym, msg] of enrichErrors) errors[sym] = msg;
  const merge = (c) => enriched.get(c.symbol) ? { ...c, ...enriched.get(c.symbol), ...pickFunnelFields(c) } : null;

  const intraReady = intraCandidates.map(merge).filter(Boolean);
  const swingReady = swingCandidates.map(merge).filter(Boolean);

  log('intraday deep pass');
  const { results: intraDeep, errors: intraErrs } = await pool(
    intraReady, (r) => intradayRead(r, { fetchImpl, now }), { concurrency: DEEP_CONCURRENCY },
  );
  for (const [r, msg] of intraErrs) errors[`${r.symbol} intraday`] = msg;

  log('swing deep pass');
  const { results: swingDeep, errors: swingErrs } = await pool(
    swingReady, (r) => swingRead(r, { fetchImpl, now }), { concurrency: DEEP_CONCURRENCY },
  );
  for (const [r, msg] of swingErrs) errors[`${r.symbol} swing`] = msg;

  // One chain per name covers both horizons.
  const needChains = [...new Set([
    ...intraReady.map((r) => r.symbol),
    ...swingReady.map((r) => r.symbol),
  ])];
  log(`option chains for ${needChains.length} names`);
  const bySymbol = new Map([...rows, ...intraReady, ...swingReady].map((r) => [r.symbol, r]));
  const directionFor = (sym) => {
    const i = intraReady.find((r) => r.symbol === sym);
    const s = swingReady.find((r) => r.symbol === sym);
    return i?.direction ?? s?.swingDirection ?? 'bullish';
  };
  const { results: chainResults } = await pool(
    needChains, (sym) => optionsFor(bySymbol.get(sym), directionFor(sym), { fetchImpl, now }), { concurrency: DEEP_CONCURRENCY },
  );

  const intraday = intraReady.map((c) => intraDeep.get(c)).filter(Boolean).map((r) => {
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

  const swing = swingReady.map((c) => swingDeep.get(c)).filter(Boolean).map((r) => {
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
    date,
    generatedAt: startedAt.toISOString(),
    generatedAtEt: etStamp(startedAt),
    horizons: {
      intraday: { label: 'INTRADAY / 0DTE', holding: 'Minutes to approximately one trading day', timeframes: 'Daily → 1H → 15m (5m optional)', reportType: `${etStamp(startedAt)} ET execution snapshot` },
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
    // The full table covers every name from the cheap stage. Moving-average
    // columns are filled only for names that earned a bar fetch; the rest are
    // null and render as N/A rather than implying a measurement never taken.
    sweep: rows.map((r) => {
      const deep = enriched?.get?.(r.symbol) ?? null;
      return {
        symbol: r.symbol, sector: r.sector, price: r.price, changePct: r.changePct,
        rsi: r.rsi != null ? Number(r.rsi.toFixed(1)) : null,
        cmf: r.cmf != null ? Number(r.cmf.toFixed(3)) : null,
        cmfTrend: deep?.daily?.cmfTrend?.direction ?? r.flow?.direction ?? null,
        structure: r.structure ?? null,
        cloud: r.cloud ?? null,
        aboveSma200: deep?.daily?.ma?.aboveSma200 ?? null,
        aboveSma50: deep?.daily?.ma?.aboveSma50 ?? null,
        aboveEma21: deep?.daily?.ma?.aboveEma21 ?? null,
        sma50Slope: deep?.daily?.ma?.sma50Slope != null ? Number(deep.daily.ma.sma50Slope.toFixed(2)) : null,
        analysed: Boolean(deep),
      };
    }),
    freshness: {
      // States the time the run actually happened rather than the time it is
      // scheduled for. A launchd job that fires late after the Mac wakes, or a
      // manual run, must not publish a note claiming a 10:10 snapshot.
      note: `Single intraday snapshot generated at ${etStamp(startedAt)} ET. Conditions may change after publication.${offSchedule(startedAt) ? ' This run was taken outside the usual 10:10 AM window, so the opening range and the intraday references it produced are older relative to the session than in a scheduled report.' : ''}`,
      onSchedule: !offSchedule(startedAt),
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

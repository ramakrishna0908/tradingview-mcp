/**
 * Stage 1 from the daily sweep instead of the network.
 *
 * The 9:35 sweep already measures all 56 names — price, RSI, CMF and its
 * delta, ATR, Bollinger basis, cloud position and structure. Re-fetching two
 * years of daily bars for every name to recompute what already exists costs
 * 56 requests against a feed that rate limits a burst, and the funnel's only
 * job at this stage is to choose roughly twelve candidates.
 *
 * So the cheap filter reads the sweep, and daily bars are fetched only for the
 * names that survive it — where the precise moving-average stack actually
 * changes an answer.
 *
 * One value is deliberately ignored: the sweep's `vwap` is anchored to the
 * daily series, not the session. Intraday VWAP is computed from 15m regular
 * session bars in the intraday pass, and conflating the two would put a
 * reference price hundreds of points away from the tape.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReportHtml } from '../social/report-model.js';

/** Same band the computed flow trend uses, so both paths agree. */
const FLOW_BAND = 0.02;

/**
 * The sweep writes the CMF trend as a signed delta and an arrow ("-0.10 ▼"),
 * or "n/a" when it had no prior session to compare against. "n/a" is carried
 * through as incomplete rather than as zero: an unknown flow trend must cap a
 * setup below CONFIRMED, and a silent zero would read as "flat".
 */
export function parseFlowTrend(raw, current) {
  if (raw == null || /n\/?a/i.test(String(raw))) {
    return { current, previous: null, delta: null, direction: null, complete: false };
  }
  const m = /(-?\d+(?:\.\d+)?)/.exec(String(raw));
  if (!m) return { current, previous: null, delta: null, direction: null, complete: false };
  const delta = Number(m[1]);
  return {
    current,
    delta,
    previous: current != null ? Number((current - delta).toFixed(3)) : null,
    direction: delta > FLOW_BAND ? 'improving' : delta < -FLOW_BAND ? 'deteriorating' : 'flat',
    complete: true,
  };
}

/** Locate the sweep for a given New York date. */
export function sweepPath(repo, date) {
  return join(repo, 'docs', 'reports', `daily-${date}.html`);
}

/**
 * Stage-1 rows from the sweep. Returns null when there is no sweep for the
 * date, so the caller can fall back to reading bars rather than publishing a
 * report built on yesterday's measurements.
 */
export function rowsFromSweep(repo, date) {
  const path = sweepPath(repo, date);
  if (!existsSync(path)) return null;
  const model = parseReportHtml(readFileSync(path, 'utf8'), { sourcePath: path });
  if (model.reportDate !== date) return null;

  const rows = model.rows.map((r) => ({
    symbol: r.symbol,
    sector: r.sector,
    group: r.group,
    price: r.price,
    changePct: r.changePct ?? null,
    rsi: r.rsi,
    rsiMa: r.rsiMa,
    cmf: r.cmf,
    flow: parseFlowTrend(r.cmfTrend, r.cmf),
    atr: r.atr,
    bb: { lower: r.bbLower, basis: r.bbBasis, upper: r.bbUpper },
    cloud: r.position,
    structure: r.structure,
    score: r.score,
    source: 'daily sweep',
  }));
  return { rows, reportDate: model.reportDate, dataAsOf: model.dataAsOf ?? null };
}

/**
 * Trend direction from what the sweep measures.
 *
 * The cloud and the swing structure together are the sweep's own read on
 * trend; the moving-average stack is not in it and is not guessed at here.
 * Names that survive get the real SMA/EMA figures computed from bars in the
 * deep pass, which is the only place the distinction changes an answer.
 */
export function sweepDirection(row) {
  const up = row.cloud === 'above_cloud';
  const down = row.cloud === 'below_cloud';
  if (up && row.structure === 'HH-up') return 'bullish';
  if (down && row.structure === 'LL-down') return 'bearish';
  // Above the cloud but not yet making higher highs still counts as
  // constructive when flow agrees; the funnel needs more than one factor
  // before a name is promoted anyway.
  if (up && row.flow.direction === 'improving') return 'bullish';
  if (down && row.flow.direction === 'deteriorating') return 'bearish';
  return null;
}

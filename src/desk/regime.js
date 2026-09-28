/**
 * Market regime, read twice over: once for the session in front of us and once
 * for the next several weeks. They are separate questions with separate
 * inputs, and the report is allowed to answer them differently.
 */
import { fetchBars, sessionSlices, rangeOf, vwap } from './data.js';
import { atr, cmf, cmfTrend, maStructure, rsi } from './indicators.js';
import { aggregate } from './data.js';

/** Yahoo tickers for the instruments the spec names. */
/**
 * `intraday: true` marks the instruments whose session behaviour is actually
 * read — opening range and VWAP. The rest inform the regime through their
 * daily change alone, so fetching intraday bars for them would be a request
 * spent on a number nothing consults.
 */
export const INDEX_SET = Object.freeze([
  { key: 'spy', symbol: 'SPY', label: 'S&P 500 (SPY)', role: 'broad', intraday: true },
  { key: 'qqq', symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)', role: 'growth', intraday: true },
  { key: 'iwm', symbol: 'IWM', label: 'Russell 2000 (IWM)', role: 'smallcap', intraday: true },
  { key: 'smh', symbol: 'SMH', label: 'Semiconductors (SMH)', role: 'semis', intraday: true },
  { key: 'vix', symbol: '^VIX', label: 'Volatility (VIX)', role: 'volatility' },
  { key: 'tnx', symbol: '^TNX', label: 'US 10Y yield', role: 'rates' },
  { key: 'dxy', symbol: 'DX-Y.NYB', label: 'US dollar (DXY)', role: 'dollar' },
  { key: 'oil', symbol: 'USO', label: 'Crude oil (USO)', role: 'energy' },
]);

/** One instrument, both horizons, plus its session reference prices. */
export async function readInstrument(inst, { fetchImpl = fetch, now = new Date() } = {}) {
  const out = { ...inst, errors: [] };
  try {
    const daily = await fetchBars(inst.symbol, { interval: '1d', range: '2y', fetchImpl, now });
    const closed = daily.closedBars;
    out.daily = {
      price: closed.length ? closed[closed.length - 1].c : null,
      previousClose: closed.length > 1 ? closed[closed.length - 2].c : null,
      ma: maStructure(closed),
      rsi: rsi(closed),
      atr: atr(closed),
      cmf: cmf(closed),
      cmfTrend: cmfTrend(closed),
      lastBar: closed.length ? closed[closed.length - 1].t : null,
    };
    out.weekly = (() => {
      const w = aggregate(closed, 5);
      return { ma: maStructure(w), rsi: rsi(w), bars: w.length, lastBar: w.length ? w[w.length - 1].t : null };
    })();
  } catch (err) { out.errors.push(`daily: ${err.message}`); }

  if (!inst.intraday) return out;

  try {
    const intra = await fetchBars(inst.symbol, { interval: '15m', range: '1mo', prePost: true, fetchImpl, now });
    const slices = sessionSlices(intra);
    const or = rangeOf(slices.openingRange);
    const pre = rangeOf(slices.premarket);
    const live = intra.bars[intra.bars.length - 1] ?? null;
    out.intraday = {
      price: live?.c ?? null,
      vwap: vwap(slices.rth),
      openingRange: { high: or.high, low: or.low, bars: slices.openingRange.length },
      premarket: pre,
      sessionStart: slices.regularStart,
      lastClosed15m: intra.closedBars.length ? intra.closedBars[intra.closedBars.length - 1].t : null,
    };
    const prevDayBars = intra.bars.filter((b) => slices.regularStart != null && b.t < slices.regularStart && b.t >= slices.regularStart - 86400);
    out.intraday.previousDay = rangeOf(prevDayBars);
    out.intraday.gapPct = out.daily?.previousClose && out.intraday.price != null
      ? ((out.intraday.price - out.daily.previousClose) / out.daily.previousClose) * 100 : null;
  } catch (err) { out.errors.push(`intraday: ${err.message}`); }

  return out;
}

const above = (i) => i?.intraday?.price != null && i?.intraday?.vwap != null && i.intraday.price > i.intraday.vwap;
const aboveOrh = (i) => i?.intraday?.price != null && i?.intraday?.openingRange?.high != null && i.intraday.price > i.intraday.openingRange.high;
const belowOrl = (i) => i?.intraday?.price != null && i?.intraday?.openingRange?.low != null && i.intraday.price < i.intraday.openingRange.low;

/**
 * Intraday regime from how the equity indices are behaving against their own
 * session references, with VIX as the risk read. Conflicting signals are
 * reported as MIXED rather than resolved — a forced call is worse than none.
 */
export function intradayRegime(instruments) {
  const by = Object.fromEntries(instruments.map((i) => [i.key, i]));
  const equities = ['spy', 'qqq', 'iwm', 'smh'].map((k) => by[k]).filter(Boolean);
  const withData = equities.filter((i) => i.intraday?.price != null);
  if (withData.length < 2) {
    return { regime: 'MIXED', risk: 'unknown', confidence: 'low', notes: ['Too few index quotes to classify the session.'], incomplete: true };
  }
  const aboveVwapCount = withData.filter(above).length;
  const breakingUp = withData.filter(aboveOrh).length;
  const breakingDown = withData.filter(belowOrl).length;
  const notes = [];

  let regime;
  if (aboveVwapCount === withData.length && breakingUp >= 2) { regime = 'TREND UP'; notes.push(`All ${withData.length} major indices are above session VWAP and ${breakingUp} have cleared their opening-range high.`); }
  else if (aboveVwapCount === 0 && breakingDown >= 2) { regime = 'TREND DOWN'; notes.push(`No major index is holding above VWAP and ${breakingDown} have lost their opening-range low.`); }
  else if (breakingUp === 0 && breakingDown === 0) { regime = 'RANGE / CHOP'; notes.push('Every index is still inside its opening range — no directional resolution yet.'); }
  else { regime = 'MIXED'; notes.push(`${aboveVwapCount} of ${withData.length} indices above VWAP, ${breakingUp} breaking out and ${breakingDown} breaking down — the tape disagrees with itself.`); }

  const vix = by.vix;
  const vixChange = vix?.daily?.price != null && vix?.daily?.previousClose != null
    ? ((vix.daily.price - vix.daily.previousClose) / vix.daily.previousClose) * 100 : null;
  let risk = 'mixed';
  if (vixChange != null) {
    if (vixChange < -3 && aboveVwapCount >= 3) { risk = 'risk-on'; notes.push(`VIX is ${vixChange.toFixed(1)}% lower with broad index participation.`); }
    else if (vixChange > 5 && aboveVwapCount <= 1) { risk = 'risk-off'; notes.push(`VIX is ${vixChange.toFixed(1)}% higher while indices sit below VWAP.`); }
    else notes.push(`VIX ${vixChange >= 0 ? '+' : ''}${vixChange.toFixed(1)}% — no decisive risk signal.`);
  } else notes.push('VIX unavailable; risk tone could not be read.');

  // Leadership: small caps and semis carrying, or lagging.
  const lead = [];
  if (by.smh && by.qqq) lead.push({ name: 'Semiconductors vs Nasdaq', leading: relStrength(by.smh, by.qqq) });
  if (by.iwm && by.spy) lead.push({ name: 'Small caps vs S&P', leading: relStrength(by.iwm, by.spy) });

  return { regime, risk, confidence: withData.length === equities.length ? 'normal' : 'low', notes, leadership: lead, vixChangePct: vixChange, indicesAboveVwap: aboveVwapCount, indicesTracked: withData.length };
}

/** Same-session percentage change of a against b; null when either is missing. */
function relStrength(a, b) {
  const pa = changePct(a), pb = changePct(b);
  if (pa == null || pb == null) return null;
  return Number((pa - pb).toFixed(2));
}
function changePct(i) {
  const p = i?.intraday?.price ?? i?.daily?.price;
  const prev = i?.daily?.previousClose;
  return p != null && prev ? ((p - prev) / prev) * 100 : null;
}

/**
 * Swing regime from weekly and daily moving-average structure. Deliberately
 * blind to today's session: a single red morning does not change a
 * three-month environment.
 */
export function swingRegime(instruments) {
  const by = Object.fromEntries(instruments.map((i) => [i.key, i]));
  const equities = ['spy', 'qqq', 'iwm', 'smh'].map((k) => by[k]).filter((i) => i?.daily?.ma);
  if (equities.length < 2) {
    return { regime: 'MIXED', notes: ['Too few indices with sufficient daily history to classify the swing environment.'], incomplete: true };
  }
  const bullish = equities.filter((i) => i.daily.ma.aboveSma200 === true && i.daily.ma.goldenCross === true).length;
  const bearish = equities.filter((i) => i.daily.ma.aboveSma200 === false).length;
  const rising = equities.filter((i) => (i.daily.ma.sma50Slope ?? 0) > 0).length;
  const notes = [`${bullish} of ${equities.length} indices are above their 200 SMA with the 50 above the 200; the 50 SMA is rising on ${rising}.`];

  let regime;
  if (bullish === equities.length && rising >= equities.length - 1) regime = 'BULLISH SWING ENVIRONMENT';
  else if (bearish >= equities.length - 1) regime = 'BEARISH SWING ENVIRONMENT';
  else if (bullish >= 2 && bearish >= 1) regime = 'MIXED';
  else regime = 'DEFENSIVE / CHOP';

  const vix = by.vix?.daily?.price ?? null;
  if (vix != null) notes.push(`VIX at ${vix.toFixed(1)}.`);
  const tnx = by.tnx?.daily;
  if (tnx?.price != null) notes.push(`US 10Y near ${(tnx.price / 10).toFixed(2)}%${tnx.ma?.aboveSma50 === true ? ', above its 50-day average' : tnx.ma?.aboveSma50 === false ? ', below its 50-day average' : ''}.`);
  return { regime, notes, indicesBullish: bullish, indicesTracked: equities.length };
}

/**
 * Breadth across the traded universe, which is a more honest read than the
 * index alone when a handful of megacaps carry the tape.
 */
export function breadth(rows) {
  // Reads the sweep's own columns so breadth covers the whole universe rather
  // than only the names that earned a bar fetch.
  const withMa = rows.filter((r) => r.cloud != null);
  const withFlow = rows.filter((r) => r.flow?.direction);
  if (!withMa.length) return { complete: false, note: 'No universe rows with sufficient history for a breadth read.' };
  const aboveEma21 = rows.filter((r) => r.bb?.basis != null && r.price != null && r.price > r.bb.basis).length;
  const above200 = withMa.filter((r) => r.cloud === 'above_cloud').length;
  const improving = withFlow.filter((r) => r.flow.direction === 'improving').length;
  const deteriorating = withFlow.filter((r) => r.flow.direction === 'deteriorating').length;
  return {
    complete: true,
    universe: rows.length,
    aboveEma21, above200, sample: withMa.length,
    aboveEma21Pct: Number(((aboveEma21 / withMa.length) * 100).toFixed(1)),
    above200Pct: Number(((above200 / withMa.length) * 100).toFixed(1)),
    flowImproving: improving, flowDeteriorating: deteriorating, flowSample: withFlow.length,
  };
}

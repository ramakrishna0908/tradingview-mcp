/**
 * Setup classification, confirmation and status.
 *
 * The two horizons are kept apart deliberately and completely. Intraday reads
 * 1H structure and confirms on closed 15m candles; swing reads weekly/daily
 * structure and confirms on 4H. Nothing in the intraday path may consult a
 * weekly trend to rescue a failed trigger, and nothing in the swing path may
 * be invalidated by a 15m move. Where the two disagree that is reported as a
 * timeframe conflict, not reconciled into one answer.
 */

const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;

// ─── intraday ────────────────────────────────────────────────────────────────

export const INTRADAY_SETUPS = ['PULLBACK', 'BREAKOUT', 'BREAKDOWN', 'CONTINUATION', 'REVERSAL', 'FAILED BREAKOUT', 'FAILED BREAKDOWN', 'RANGE', 'NO SETUP'];

/**
 * Classify the 1H picture against the session's own reference prices.
 *
 * Order matters: a failed breakout is checked before a breakout, because a bar
 * that traded above the opening-range high and came back under it is the
 * opposite signal to one still holding above it, and the cheaper test would
 * label both the same way.
 */
export function classifyIntradaySetup({ structure1h, price, or, vwap: vwapLevel, premarket, atr1h }) {
  const tol = atr1h ? atr1h * 0.15 : (price ?? 0) * 0.001;
  const trend = structure1h?.trend ?? null;
  const lastEvent = structure1h?.lastEvent?.kind ?? null;
  const sweeps = structure1h?.sweeps ?? [];
  const reasons = [];

  const aboveOrh = or?.high != null && price != null && price > or.high;
  const belowOrl = or?.low != null && price != null && price < or.low;
  const insideOr = or?.high != null && or?.low != null && price != null && price <= or.high && price >= or.low;
  const aboveVwap = vwapLevel != null && price != null && price > vwapLevel;

  if (or?.high != null && sweeps.some((s) => s.kind === 'sweep_high' && s.level >= or.high - tol)) {
    reasons.push('Price traded above the opening-range high and closed back inside it.');
    return { setup: 'FAILED BREAKOUT', direction: 'bearish', reasons };
  }
  if (or?.low != null && sweeps.some((s) => s.kind === 'sweep_low' && s.level <= or.low + tol)) {
    reasons.push('Price traded below the opening-range low and closed back inside it.');
    return { setup: 'FAILED BREAKDOWN', direction: 'bullish', reasons };
  }
  if (aboveOrh && aboveVwap) {
    reasons.push('Holding above both the opening-range high and session VWAP.');
    if (lastEvent === 'bullish_bos') reasons.push('1H structure confirmed a break higher.');
    return { setup: trend === 'up' ? 'CONTINUATION' : 'BREAKOUT', direction: 'bullish', reasons };
  }
  if (belowOrl && !aboveVwap) {
    reasons.push('Holding below both the opening-range low and session VWAP.');
    if (lastEvent === 'bearish_bos') reasons.push('1H structure confirmed a break lower.');
    return { setup: trend === 'down' ? 'CONTINUATION' : 'BREAKDOWN', direction: 'bearish', reasons };
  }
  if (trend === 'up' && insideOr && aboveVwap) {
    reasons.push('Uptrend on the 1H holding above VWAP while it works inside the opening range.');
    return { setup: 'PULLBACK', direction: 'bullish', reasons };
  }
  if (trend === 'down' && insideOr && !aboveVwap) {
    reasons.push('Downtrend on the 1H capped below VWAP inside the opening range.');
    return { setup: 'PULLBACK', direction: 'bearish', reasons };
  }
  if (lastEvent === 'bullish_choch') {
    reasons.push('1H change of character to the upside after a lower-high sequence.');
    return { setup: 'REVERSAL', direction: 'bullish', reasons };
  }
  if (lastEvent === 'bearish_choch') {
    reasons.push('1H change of character to the downside after a higher-low sequence.');
    return { setup: 'REVERSAL', direction: 'bearish', reasons };
  }
  if (insideOr) {
    reasons.push('Price is inside the opening range with no directional resolution.');
    return { setup: 'RANGE', direction: null, reasons };
  }
  reasons.push('No alignment between 1H structure, the opening range and VWAP.');
  return { setup: 'NO SETUP', direction: null, reasons };
}

/**
 * The 15m trigger.
 *
 * `confirmed` is true only when a CLOSED 15m candle has already satisfied the
 * rule. Otherwise the exact condition is returned as text for the reader to
 * watch themselves — the report runs once and makes no promise to check again.
 */
export function intradayConfirmation({ closed15m, direction, or, vwap: vwapLevel, premarket, structure15m }) {
  if (!direction) return { confirmed: false, trigger: null, condition: 'No directional setup to confirm.', basis: null };
  if (!closed15m?.length) {
    return { confirmed: false, trigger: null, condition: 'No closed 15-minute candle available yet.', basis: null, incomplete: true };
  }
  const last = closed15m[closed15m.length - 1];
  const long = direction === 'bullish';
  const lastEvent = structure15m?.lastEvent?.kind ?? null;
  const sweeps = structure15m?.sweeps ?? [];

  // Candidate trigger levels, nearest-first: the level a trader would actually
  // watch, in the order the spec lists them.
  const candidates = long
    ? [
        { level: or?.high, label: 'opening-range high' },
        { level: premarket?.high, label: 'premarket high' },
        { level: vwapLevel, label: 'session VWAP' },
      ]
    : [
        { level: or?.low, label: 'opening-range low' },
        { level: premarket?.low, label: 'premarket low' },
        { level: vwapLevel, label: 'session VWAP' },
      ];
  const usable = candidates.filter((c) => c.level != null);
  if (!usable.length) {
    return { confirmed: false, trigger: null, condition: 'No reference level available to define a trigger.', basis: null, incomplete: true };
  }

  // The nearest level still ahead of price defines the pending trigger.
  const ahead = usable.filter((c) => (long ? last.c <= c.level : last.c >= c.level));
  const target = (ahead.length ? ahead : usable).sort((a, b) => Math.abs(a.level - last.c) - Math.abs(b.level - last.c))[0];

  const reclaimed = long
    ? sweeps.some((s) => s.kind === 'sweep_low') && last.c > target.level
    : sweeps.some((s) => s.kind === 'sweep_high') && last.c < target.level;
  const brokeStructure = long ? lastEvent === 'bullish_bos' || lastEvent === 'bullish_choch'
                              : lastEvent === 'bearish_bos' || lastEvent === 'bearish_choch';
  const beyond = long ? last.c > target.level : last.c < target.level;

  if (beyond && (brokeStructure || reclaimed)) {
    return {
      confirmed: true,
      trigger: Number(target.level.toFixed(2)),
      condition: `Closed 15m candle at ${last.c.toFixed(2)} is ${long ? 'above' : 'below'} the ${target.label} at ${target.level.toFixed(2)}, with ${reclaimed ? 'a liquidity sweep and reclaim' : 'a 15m break of structure'}.`,
      basis: { closedAt: last.t, close: last.c, level: Number(target.level.toFixed(2)), label: target.label },
    };
  }

  return {
    confirmed: false,
    trigger: Number(target.level.toFixed(2)),
    condition: `${long ? 'Long' : 'Short'} trigger: a 15m candle must CLOSE ${long ? 'above' : 'below'} ${target.level.toFixed(2)} (${target.label}) and hold on the retest. Last closed 15m was ${last.c.toFixed(2)}.`,
    basis: { closedAt: last.t, close: last.c, level: Number(target.level.toFixed(2)), label: target.label },
  };
}

// ─── swing ───────────────────────────────────────────────────────────────────

export const SWING_SETUPS = ['TREND PULLBACK', 'BREAKOUT RETEST', 'BASE BREAKOUT', 'FAILED BREAKDOWN', 'TREND CONTINUATION', 'REVERSAL', 'NO SETUP'];

/** Pullback zone: 21 EMA plus or minus a quarter ATR, the spec's default. */
export function pullbackZone(ema21, atrDaily, factor = 0.25) {
  if (ema21 == null || atrDaily == null) return null;
  return { low: Number((ema21 - atrDaily * factor).toFixed(2)), high: Number((ema21 + atrDaily * factor).toFixed(2)) };
}

export function classifySwingSetup({ ma, atrDaily, dailyStructure, weeklyTrend, price }) {
  const reasons = [];
  const zone = pullbackZone(ma?.ema21, atrDaily);
  const inZone = zone && price != null && price >= zone.low && price <= zone.high;
  const lastEvent = dailyStructure?.lastEvent?.kind ?? null;
  const bullTrend = ma?.aboveSma200 === true && ma?.goldenCross === true;
  const bearTrend = ma?.aboveSma200 === false && ma?.goldenCross === false;
  const rising = ma?.sma50Slope != null && ma.sma50Slope > 0;

  if (bullTrend && inZone) {
    reasons.push(`Price is inside the 21 EMA ±0.25 ATR pullback zone (${zone.low}–${zone.high}) with the 50 SMA above the 200.`);
    if (weeklyTrend === 'up') reasons.push('Weekly structure is also making higher highs and higher lows.');
    return { setup: 'TREND PULLBACK', direction: 'bullish', zone, reasons };
  }
  if (bearTrend && inZone) {
    reasons.push(`Price is inside the 21 EMA ±0.25 ATR zone (${zone.low}–${zone.high}) with the 50 SMA below the 200.`);
    return { setup: 'TREND PULLBACK', direction: 'bearish', zone, reasons };
  }
  if (bullTrend && lastEvent === 'bullish_bos' && rising) {
    reasons.push('Daily broke structure higher with the 50 SMA rising.');
    return { setup: 'TREND CONTINUATION', direction: 'bullish', zone, reasons };
  }
  if (bullTrend && lastEvent === 'bearish_choch') {
    reasons.push('Daily lost structure while the longer-term trend is still up — a failed breakdown only if it reclaims.');
    return { setup: 'FAILED BREAKDOWN', direction: 'bullish', zone, reasons };
  }
  if (bearTrend && lastEvent === 'bearish_bos') {
    reasons.push('Daily broke structure lower beneath a falling moving-average stack.');
    return { setup: 'TREND CONTINUATION', direction: 'bearish', zone, reasons };
  }
  if (ma?.distanceToEma21Pct != null && Math.abs(ma.distanceToEma21Pct) > 12) {
    reasons.push(`Price is ${ma.distanceToEma21Pct.toFixed(1)}% from its 21 EMA — extended well beyond the preferred entry zone.`);
    return { setup: 'NO SETUP', direction: null, zone, reasons };
  }
  reasons.push('Trend and location do not line up into a defined swing setup.');
  return { setup: 'NO SETUP', direction: null, zone, reasons };
}

/** 4H timing. Refinement only: it can withhold confirmation, never invalidate. */
export function swingConfirmation({ structure4h, direction }) {
  if (!direction) return { confirmed: false, condition: 'No directional swing setup to time.' };
  if (!structure4h || structure4h.bars < 20) {
    return { confirmed: false, condition: '4H history too short to time an entry.', incomplete: true };
  }
  const last = structure4h.lastEvent?.kind ?? null;
  const long = direction === 'bullish';
  const aligned = long
    ? last === 'bullish_bos' || last === 'bullish_choch' || structure4h.trend === 'up'
    : last === 'bearish_bos' || last === 'bearish_choch' || structure4h.trend === 'down';
  return aligned
    ? { confirmed: true, condition: `4H structure agrees (${structure4h.structure ?? structure4h.trend}${last ? `, last event ${last.replace('_', ' ')}` : ''}).` }
    : { confirmed: false, condition: `4H has not turned yet — wait for a ${long ? 'higher low and a break above the last 4H swing high' : 'lower high and a break below the last 4H swing low'}.` };
}

// ─── status ──────────────────────────────────────────────────────────────────

/**
 * Resolve a status from the pieces. Confirmation alone is never enough: a
 * confirmed trigger on an unworkable plan, thin options or missing flow data
 * drops to WATCH or NO TRADE, so the strongest label always implies that
 * every gate was passed rather than just the interesting one.
 */
export function resolveStatus({ setup, confirmation, plan, optionsGrade, flowComplete, dataGaps = [], invalidated = false, horizon }) {
  const prefix = horizon === 'swing' ? 'SWING ' : '';
  if (invalidated) {
    return { status: `${prefix}INVALIDATED`, icon: '🔴', reason: 'A setup condition failed before this snapshot was taken.' };
  }
  if (!setup || setup === 'NO SETUP' || !plan) {
    return { status: `${prefix}NO TRADE`, icon: '⚪', reason: 'No setup with a definable edge.' };
  }
  if (!plan.actionable) {
    return { status: `${prefix}NO TRADE`, icon: '⚪', reason: plan.reason ?? 'Risk model does not support a trade.' };
  }
  if (optionsGrade === 'POOR') {
    return { status: `${prefix}WATCH`, icon: '🟡', reason: 'Technical setup is valid but the options market is too illiquid to express it cleanly.' };
  }
  if (!flowComplete) {
    return { status: `${prefix}WATCH`, icon: '🟡', reason: 'FLOW DATA INCOMPLETE — money-flow trend could not be computed, so confidence is capped.' };
  }
  if (dataGaps.length) {
    return { status: `${prefix}WATCH`, icon: '🟡', reason: `Incomplete inputs: ${dataGaps.join('; ')}.` };
  }
  if (!confirmation?.confirmed) {
    return { status: `${prefix}WATCH`, icon: '🟡', reason: confirmation?.condition ?? 'Trigger has not occurred.' };
  }
  return {
    status: horizon === 'swing' ? 'SWING CONFIRMED' : 'CONFIRMED',
    icon: '🟢',
    reason: confirmation.condition,
  };
}

/** Plain-language horizon labels; never a bare CALL/PUT. */
export function horizonLabel(horizon, direction, status) {
  const side = direction === 'bullish' ? 'BULLISH' : direction === 'bearish' ? 'BEARISH' : 'NEUTRAL';
  const stage = status.includes('CONFIRMED') ? 'CONFIRMED' : status.includes('WATCH') ? 'WATCH' : status.includes('INVALIDATED') ? 'INVALIDATED' : 'NO TRADE';
  return `${horizon === 'swing' ? 'SWING' : 'INTRADAY'} ${side} ${stage}`;
}

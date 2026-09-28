/**
 * Option-chain quality.
 *
 * The question this answers is not "is the chart bullish" but "if the chart
 * thesis is right, is there a contract worth expressing it in". A setup with a
 * clean technical picture and a 30%-wide bid/ask is not a good options trade,
 * and the grading below is what keeps those two judgements separate.
 *
 * One honest limitation, surfaced rather than papered over: a single delayed
 * snapshot carries no IV history, so IV Rank and IV Percentile cannot be
 * computed. Instead of inventing one, the ratio of ATM implied volatility to
 * recent realised volatility is reported under its own name, and IV Rank is
 * reported as unavailable.
 */

const pct = (v) => (v == null ? null : Number(v.toFixed(2)));

export function daysToExpiry(expiry, today) {
  const a = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = expiry.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86_400_000);
}

/** Expiries inside a DTE window, nearest the target first. */
export function selectExpiry(chain, { minDte, maxDte, targetDte, today = new Date() }) {
  const candidates = chain.expiries
    .map((e) => ({ expiry: e, dte: daysToExpiry(e, today) }))
    .filter((x) => x.dte >= minDte && x.dte <= maxDte);
  if (!candidates.length) return null;
  const target = targetDte ?? (minDte + maxDte) / 2;
  return candidates.sort((a, b) => Math.abs(a.dte - target) - Math.abs(b.dte - target))[0];
}

const forExpiry = (chain, expiry, type) => chain.contracts.filter((c) => c.expiry === expiry && c.type === type);

export function atmContract(chain, expiry, type, spot) {
  const list = forExpiry(chain, expiry, type);
  if (!list.length || spot == null) return null;
  return list.reduce((a, b) => (Math.abs(b.strike - spot) < Math.abs(a.strike - spot) ? b : a));
}

/**
 * A directional contract inside a delta band. Ties break on open interest,
 * because between two strikes with the same exposure the liquid one is the one
 * that can actually be exited.
 */
export function pickByDelta(chain, expiry, type, { minDelta = 0.55, maxDelta = 0.70 } = {}) {
  const list = forExpiry(chain, expiry, type)
    .filter((c) => c.delta != null)
    .map((c) => ({ ...c, absDelta: Math.abs(c.delta) }))
    .filter((c) => c.absDelta >= minDelta && c.absDelta <= maxDelta);
  if (!list.length) return null;
  return list.sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))[0];
}

export function spreadPct(contract) {
  if (!contract || contract.mid == null || contract.mid <= 0) return null;
  return ((contract.ask - contract.bid) / contract.mid) * 100;
}

/**
 * Expected move from the ATM straddle: the market's own price for a move of
 * either direction by expiry. Used to sanity-check targets — a target beyond
 * the expected move on a 0DTE contract is a low-probability ask, and the setup
 * should say so rather than quietly print an attractive R:R.
 */
export function expectedMove(chain, expiry, spot) {
  const call = atmContract(chain, expiry, 'call', spot);
  const put = atmContract(chain, expiry, 'put', spot);
  if (!call || !put) return { absolute: null, pct: null, reason: 'no ATM straddle quoted' };
  const absolute = call.mid + put.mid;
  return { absolute, pct: spot ? (absolute / spot) * 100 : null, strike: call.strike };
}

/** Annualised close-to-close realised volatility, for IV context only. */
export function realisedVol(bars, period = 20) {
  const c = bars.map((b) => b.c).filter((v) => v != null).slice(-(period + 1));
  if (c.length < period + 1) return null;
  const rets = [];
  for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

const GOOD = { spread: 5, oi: 1000, volume: 100 };
const OK = { spread: 12, oi: 250, volume: 10 };

/**
 * Grade a contract's tradability. Reasons are returned alongside the grade so
 * the report can say WHY a setup is options-limited rather than showing a bare
 * "POOR" the reader has to take on trust.
 */
export function gradeContract(contract, { realisedVolatility = null } = {}) {
  if (!contract) {
    return { grade: 'N/A', reasons: ['No contract quoted in the requested window.'], complete: false };
  }
  const sp = spreadPct(contract);
  const oi = contract.openInterest ?? null;
  const vol = contract.volume ?? null;
  const reasons = [];
  const missing = [];
  if (sp == null) missing.push('bid/ask');
  if (oi == null) missing.push('open interest');
  if (vol == null) missing.push('contract volume');

  let grade;
  if (sp == null || oi == null) {
    grade = 'N/A';
    reasons.push(`Liquidity cannot be judged: ${missing.join(' and ')} unavailable.`);
  } else if (sp <= GOOD.spread && oi >= GOOD.oi && (vol ?? 0) >= GOOD.volume) {
    grade = 'GOOD';
    reasons.push(`Spread ${sp.toFixed(1)}% of mid, open interest ${oi.toLocaleString()}, volume ${(vol ?? 0).toLocaleString()}.`);
  } else if (sp <= OK.spread && oi >= OK.oi) {
    grade = 'ACCEPTABLE';
    reasons.push(`Spread ${sp.toFixed(1)}% of mid with open interest ${oi.toLocaleString()}.`);
    if ((vol ?? 0) < OK.volume) reasons.push('Light traded volume today; fills may be slow.');
  } else {
    grade = 'POOR';
    if (sp > OK.spread) reasons.push(`Bid/ask is ${sp.toFixed(1)}% of mid — the spread alone is a material cost.`);
    if (oi < OK.oi) reasons.push(`Open interest ${oi?.toLocaleString() ?? 'n/a'} is thin for a clean exit.`);
  }

  const iv = contract.iv;
  const ivContext = iv != null && realisedVolatility
    ? { impliedVol: pct(iv * 100), realisedVol20d: pct(realisedVolatility * 100), ratio: Number((iv / realisedVolatility).toFixed(2)) }
    : { impliedVol: iv != null ? pct(iv * 100) : null, realisedVol20d: null, ratio: null };
  if (ivContext.ratio != null && ivContext.ratio >= 1.4) {
    reasons.push(`Implied volatility is ${ivContext.ratio}x recent realised — options are pricing more movement than the stock has delivered.`);
  }

  return {
    grade,
    reasons,
    complete: sp != null && oi != null && vol != null,
    contract: {
      expiry: contract.expiry, type: contract.type, strike: contract.strike,
      bid: contract.bid, ask: contract.ask, mid: pct(contract.mid),
      delta: contract.delta, theta: contract.theta, vega: contract.vega,
      openInterest: oi, volume: vol, spreadPct: pct(sp),
    },
    // Stated explicitly so the report never implies a rank it does not have.
    ivRank: { value: null, note: 'IV Rank/Percentile requires an implied-volatility history this snapshot does not carry.' },
    ivContext,
  };
}

/**
 * Assess both horizons from one chain fetch.
 *
 * `intraday` looks at the nearest expiry at or under one day — the 0DTE/1DTE
 * contract an intraday setup would actually use. `swing` looks for 90-120 DTE
 * at a 0.55-0.70 delta, the directional profile the spec asks for.
 */
export function assessOptions(chain, { spot, dailyBars = [], direction = 'bullish', today = new Date() } = {}) {
  const rv = realisedVol(dailyBars);
  const type = direction === 'bearish' ? 'put' : 'call';
  const out = { asOf: chain?.asOf ?? null, realisedVol20d: rv != null ? pct(rv * 100) : null };

  const near = selectExpiry(chain, { minDte: 0, maxDte: 2, targetDte: 0, today });
  if (!near) {
    out.intraday = { ...gradeContract(null), dte: null, expiry: null, expectedMove: null };
  } else {
    const atm = atmContract(chain, near.expiry, type, spot);
    out.intraday = {
      ...gradeContract(atm, { realisedVolatility: rv }),
      dte: near.dte,
      expiry: near.expiry,
      expectedMove: expectedMove(chain, near.expiry, spot),
    };
  }

  const far = selectExpiry(chain, { minDte: 90, maxDte: 120, targetDte: 105, today });
  if (!far) {
    out.swing = { ...gradeContract(null), dte: null, expiry: null, expectedMove: null };
    out.swing.reasons = ['No expiry available between 90 and 120 days.'];
  } else {
    const pick = pickByDelta(chain, far.expiry, type) ?? atmContract(chain, far.expiry, type, spot);
    out.swing = {
      ...gradeContract(pick, { realisedVolatility: rv }),
      dte: far.dte,
      expiry: far.expiry,
      expectedMove: expectedMove(chain, far.expiry, spot),
    };
  }
  return out;
}

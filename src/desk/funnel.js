/**
 * The two shortlists, built from the daily sweep.
 *
 * Neither list is a ranking of one number. Each candidate accumulates named
 * confluence factors, and the report can show exactly which it has — a name
 * carried by trend, flow and sector is a different proposition from one
 * carried by a single stretched oscillator, even when a scalar scores them
 * alike.
 *
 * The lists are computed independently and are expected to differ: a name can
 * be a poor intraday vehicle and an excellent three-month one.
 */

const MAX_CANDIDATES = 12;

/**
 * Record a factor with the direction it argues for.
 *
 * Polarity matters: counting a deteriorating flow reading as "confluence" for
 * a long simply because it is a fact about the name would rank the most
 * conflicted candidates highest. Factors are tallied against the direction
 * actually taken, and the ones that argue the other way are kept as
 * counterpoints rather than quietly dropped.
 */
function factor(list, condition, text, polarity = 'neutral') {
  if (condition === true && text) list.push({ text, polarity });
  return condition === true;
}

/** Split factors into those supporting a direction and those opposing it. */
function split(factors, direction) {
  const want = direction === 'bullish' ? 'bull' : 'bear';
  const other = direction === 'bullish' ? 'bear' : 'bull';
  return {
    supporting: factors.filter((f) => f.polarity === want || f.polarity === 'neutral').map((f) => f.text),
    opposing: factors.filter((f) => f.polarity === other).map((f) => f.text),
  };
}

/** Trend read from the sweep's own cloud and swing-structure columns. */
function sweepTrend(r) {
  const up = r.cloud === 'above_cloud';
  const down = r.cloud === 'below_cloud';
  return {
    up, down,
    makingHighs: r.structure === 'HH-up',
    makingLows: r.structure === 'LL-down',
  };
}

/**
 * Stage 1, intraday. Daily context, flow, sector and location only. No 1H, no
 * 15m, no options — those are what the survivors earn.
 */
export function intradayShortlist(rows, { sectorTable = [], regime = null, limit = MAX_CANDIDATES } = {}) {
  const sectorClass = new Map(sectorTable.map((s) => [s.name, s.classification]));

  const scored = rows.map((r) => {
    const why = [];
    const t = sweepTrend(r);
    const sector = sectorClass.get(r.sector) ?? null;
    const flow = r.flow ?? {};

    factor(why, t.up && t.makingHighs, 'Above the cloud and making higher highs.', 'bull');
    factor(why, t.down && t.makingLows, 'Below the cloud and making lower lows.', 'bear');
    factor(why, flow.direction === 'improving', 'Money flow improving against the prior session.', 'bull');
    factor(why, flow.direction === 'deteriorating', 'Money flow deteriorating against the prior session.', 'bear');
    // When the sweep had no prior session to compare against, the CMF level is
    // still a real observation — but a weaker one, and it is named as such so
    // the card never implies a trend that was not measured.
    factor(why, !flow.complete && r.cmf != null && r.cmf > 0.05, `Money flow positive at ${r.cmf} (trend unavailable this run).`, 'bull');
    factor(why, !flow.complete && r.cmf != null && r.cmf < -0.05, `Money flow negative at ${r.cmf} (trend unavailable this run).`, 'bear');
    factor(why, sector === 'LEADING' || sector === 'IMPROVING', sector ? `Sector is ${sector.toLowerCase()}.` : '', 'bull');
    factor(why, sector === 'LAGGING' || sector === 'WEAKENING', sector ? `Sector is ${sector.toLowerCase()}.` : '', 'bear');
    factor(why, r.rsi != null && r.rsiMa != null && r.rsi > r.rsiMa, 'RSI above its own moving average — momentum turning up.', 'bull');
    factor(why, r.rsi != null && r.rsiMa != null && r.rsi < r.rsiMa, 'RSI below its own moving average — momentum turning down.', 'bear');
    factor(why, r.changePct != null && r.changePct >= 1.5, `Up ${r.changePct}% by the sweep snapshot.`, 'bull');
    factor(why, r.changePct != null && r.changePct <= -1.5, `Down ${r.changePct}% by the sweep snapshot.`, 'bear');

    const direction = (t.up && (t.makingHighs || flow.direction === 'improving')) ? 'bullish'
      : (t.down && (t.makingLows || flow.direction === 'deteriorating')) ? 'bearish'
      : t.up && r.cmf > 0 ? 'bullish'
      : t.down && r.cmf < 0 ? 'bearish'
      : null;

    const withRegime = regime === 'TREND UP' ? direction === 'bullish'
      : regime === 'TREND DOWN' ? direction === 'bearish' : null;
    factor(why, withRegime === true, 'Direction agrees with the session regime.',
      direction === 'bullish' ? 'bull' : 'bear');

    const { supporting, opposing } = direction ? split(why, direction) : { supporting: [], opposing: [] };
    return {
      ...r, direction,
      confluence: supporting, counterpoints: opposing,
      confluenceCount: supporting.length, sectorClass: sector,
    };
  });

  // A candidate needs real agreement, not merely a lot of remarks: at least
  // three supporting factors and no more than one arguing the other way.
  return scored
    .filter((r) => r.direction && r.confluenceCount >= 3 && r.counterpoints.length <= 1 && r.sector !== 'Macro (x-check)')
    .sort((a, b) => b.confluenceCount - a.confluenceCount
      || a.counterpoints.length - b.counterpoints.length
      || Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
    .slice(0, limit);
}

/**
 * Stage 1, swing. Deliberately blind to today's session move: a gap says
 * nothing about a three-month thesis. Location matters more here than for
 * intraday — an entry far above the Bollinger basis is a chase whatever the
 * trend looks like.
 */
export function swingShortlist(rows, { sectorTable = [], limit = MAX_CANDIDATES } = {}) {
  const sectorClass = new Map(sectorTable.map((s) => [s.name, s.classification]));

  const scored = rows.map((r) => {
    const why = [];
    const t = sweepTrend(r);
    const sector = sectorClass.get(r.sector) ?? null;
    const flow = r.flow ?? {};

    factor(why, t.up, 'Trading above the cloud.', 'bull');
    factor(why, t.down, 'Trading below the cloud.', 'bear');
    factor(why, t.makingHighs, 'Daily structure is making higher highs.', 'bull');
    factor(why, t.makingLows, 'Daily structure is making lower lows.', 'bear');
    factor(why, flow.direction === 'improving', 'Money flow improving.', 'bull');
    factor(why, flow.direction === 'deteriorating', 'Money flow deteriorating.', 'bear');
    factor(why, !flow.complete && r.cmf != null && r.cmf > 0.05, `Money flow positive at ${r.cmf} (trend unavailable this run).`, 'bull');
    factor(why, !flow.complete && r.cmf != null && r.cmf < -0.05, `Money flow negative at ${r.cmf} (trend unavailable this run).`, 'bear');
    factor(why, sector === 'LEADING' || sector === 'IMPROVING', sector ? `Sector is ${sector.toLowerCase()}.` : '', 'bull');
    factor(why, sector === 'LAGGING' || sector === 'WEAKENING', sector ? `Sector is ${sector.toLowerCase()}.` : '', 'bear');

    // Distance from the Bollinger basis stands in for distance from the mean
    // at this stage; the 21 EMA zone is computed exactly, from bars, once the
    // name survives.
    const basis = r.bb?.basis;
    const distPct = basis && r.price ? ((r.price - basis) / basis) * 100 : null;
    const nearBasis = distPct != null && Math.abs(distPct) <= 8;
    factor(why, nearBasis, distPct != null ? `Within ${Math.abs(distPct).toFixed(1)}% of the Bollinger basis — not extended.` : '');
    const extended = distPct != null && Math.abs(distPct) > 18;

    const direction = t.up && (t.makingHighs || r.cmf > 0) ? 'bullish'
      : t.down && (t.makingLows || r.cmf < 0) ? 'bearish' : null;

    const { supporting, opposing } = direction ? split(why, direction) : { supporting: [], opposing: [] };
    return {
      ...r, swingDirection: direction,
      swingConfluence: supporting, swingCounterpoints: opposing,
      swingConfluenceCount: supporting.length, extended, distanceToBasisPct: distPct, sectorClass: sector,
    };
  });

  return scored
    .filter((r) => r.swingDirection && r.swingConfluenceCount >= 3 && r.swingCounterpoints.length <= 1
      && !r.extended && r.sector !== 'Macro (x-check)')
    .sort((a, b) => b.swingConfluenceCount - a.swingConfluenceCount
      || a.swingCounterpoints.length - b.swingCounterpoints.length)
    .slice(0, limit);
}

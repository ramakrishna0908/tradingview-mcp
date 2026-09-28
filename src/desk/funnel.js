/**
 * The two shortlists.
 *
 * Both start from the same 56 names and neither is a ranking of one number.
 * Each candidate accumulates named confluence factors, and the report can show
 * exactly which ones it has — a name carried by trend, flow and sector is a
 * different proposition from one carried by a single stretched oscillator even
 * when a scalar would score them alike.
 *
 * The two lists are computed independently and are expected to differ: a name
 * can be a poor intraday vehicle and an excellent three-month one.
 */

const MAX_CANDIDATES = 12;

/** A factor is only counted when its input actually exists. */
function factor(list, condition, text) {
  if (condition === true) list.push(text);
  return condition === true;
}

/**
 * Stage 1, intraday. Cheap: daily context, flow, sector and the session's gap
 * and relative volume. No 1H, no 15m, no options — those come after the cut.
 */
export function intradayShortlist(rows, { sectorTable = [], regime = null, limit = MAX_CANDIDATES } = {}) {
  const sectorClass = new Map(sectorTable.map((s) => [s.name, s.classification]));
  const scored = rows.map((r) => {
    const why = [];
    const ma = r.daily?.ma ?? {};
    const flow = r.daily?.cmfTrend ?? {};
    const sector = sectorClass.get(r.sector) ?? null;

    const bullish = ma.aboveSma200 === true && ma.aboveEma21 === true;
    const bearish = ma.aboveSma200 === false && ma.aboveEma21 === false;
    factor(why, bullish, 'Above both the 200 SMA and the 21 EMA.');
    factor(why, bearish, 'Below both the 200 SMA and the 21 EMA.');
    factor(why, flow.direction === 'improving', 'Money flow improving over the last five sessions.');
    factor(why, flow.direction === 'deteriorating', 'Money flow deteriorating over the last five sessions.');
    factor(why, sector === 'LEADING' || sector === 'IMPROVING', `Sector is ${sector?.toLowerCase()}.`);
    factor(why, sector === 'LAGGING' || sector === 'WEAKENING', `Sector is ${sector?.toLowerCase()}.`);
    factor(why, r.rvol != null && r.rvol >= 1.2, r.rvol != null ? `Relative volume ${r.rvol}x — participation above its own norm.` : '');
    factor(why, r.gapPct != null && Math.abs(r.gapPct) >= 1, r.gapPct != null ? `Gapped ${r.gapPct >= 0 ? '+' : ''}${r.gapPct.toFixed(1)}% into the session.` : '');

    // Direction must be coherent before a name is worth expensive analysis.
    const direction = bullish ? 'bullish' : bearish ? 'bearish' : null;
    // Alignment with the session's own regime, when the regime is decisive.
    const withRegime = regime === 'TREND UP' ? direction === 'bullish'
      : regime === 'TREND DOWN' ? direction === 'bearish' : null;
    factor(why, withRegime === true, 'Direction agrees with the session regime.');

    return { ...r, direction, confluence: why, confluenceCount: why.length, sectorClass: sector };
  });

  // A candidate needs a coherent direction and more than one reason. The floor
  // is what stops the list filling with names that merely scored well.
  return scored
    .filter((r) => r.direction && r.confluenceCount >= 2 && r.sector !== 'Macro (x-check)')
    .sort((a, b) => b.confluenceCount - a.confluenceCount || Math.abs(b.gapPct ?? 0) - Math.abs(a.gapPct ?? 0))
    .slice(0, limit);
}

/**
 * Stage 1, swing. Weekly and daily only — deliberately blind to the opening
 * range, VWAP and today's relative volume, none of which say anything about a
 * three-month thesis.
 */
export function swingShortlist(rows, { sectorTable = [], limit = MAX_CANDIDATES } = {}) {
  const sectorClass = new Map(sectorTable.map((s) => [s.name, s.classification]));
  const scored = rows.map((r) => {
    const why = [];
    const ma = r.daily?.ma ?? {};
    const weekly = r.weekly?.ma ?? {};
    const flow = r.daily?.cmfTrend ?? {};
    const sector = sectorClass.get(r.sector) ?? null;

    const bullStack = ma.aboveSma200 === true && ma.goldenCross === true;
    const bearStack = ma.aboveSma200 === false && ma.goldenCross === false;
    factor(why, bullStack, '50 SMA above the 200 with price above both.');
    factor(why, bearStack, '50 SMA below the 200 with price beneath both.');
    factor(why, ma.sma50Slope != null && ma.sma50Slope > 0.5, 'The 50 SMA is rising.');
    factor(why, ma.sma50Slope != null && ma.sma50Slope < -0.5, 'The 50 SMA is falling.');
    factor(why, weekly.aboveSma200 === true, 'Weekly close above its 200-period average.');
    factor(why, flow.direction === 'improving', 'Daily money flow improving.');
    factor(why, sector === 'LEADING' || sector === 'IMPROVING', `Sector is ${sector?.toLowerCase()}.`);

    // Location matters more for swing than for intraday: an entry 20% above
    // the 21 EMA is a chase whatever the trend looks like.
    const dist = ma.distanceToEma21Pct;
    const nearZone = dist != null && Math.abs(dist) <= 6;
    factor(why, nearZone, dist != null ? `Within ${Math.abs(dist).toFixed(1)}% of the 21 EMA — near the preferred entry zone.` : '');
    const extended = dist != null && Math.abs(dist) > 12;

    const direction = bullStack ? 'bullish' : bearStack ? 'bearish' : null;
    return { ...r, swingDirection: direction, swingConfluence: why, swingConfluenceCount: why.length, extended, sectorClass: sector };
  });

  return scored
    .filter((r) => r.swingDirection && r.swingConfluenceCount >= 3 && !r.extended && r.sector !== 'Macro (x-check)')
    .sort((a, b) => b.swingConfluenceCount - a.swingConfluenceCount)
    .slice(0, limit);
}

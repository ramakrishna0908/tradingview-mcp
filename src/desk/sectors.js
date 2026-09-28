/**
 * Sector rotation.
 *
 * Ranked on the direction of money flow first and the static picture second,
 * because a sector whose flow is improving from a weak base is the one worth
 * knowing about — a league table sorted on a snapshot score just re-lists the
 * sectors that were already strong last month.
 */

const pctOf = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : null);

/**
 * @param rows      per-symbol analysis rows, each carrying daily.ma / daily.cmfTrend
 * @param benchmark same-session change of the benchmark, for relative strength
 * @param previous  the prior session's sector table, when one exists on disk
 */
export function sectorRotation(rows, { benchmarkChangePct = null, previous = null } = {}) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.sector || r.sector === 'Macro (x-check)') continue;
    if (!groups.has(r.sector)) groups.set(r.sector, []);
    groups.get(r.sector).push(r);
  }

  const table = [...groups.entries()].map(([name, members]) => {
    const withFlow = members.filter((m) => m.daily?.cmfTrend?.direction);
    const improving = withFlow.filter((m) => m.daily.cmfTrend.direction === 'improving').length;
    const deteriorating = withFlow.filter((m) => m.daily.cmfTrend.direction === 'deteriorating').length;
    const cmfValues = members.map((m) => m.daily?.cmf).filter((v) => v != null);
    const avgCmf = cmfValues.length ? cmfValues.reduce((a, b) => a + b, 0) / cmfValues.length : null;

    const changes = members.map((m) => m.changePct).filter((v) => v != null);
    const avgChange = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;

    const withMa = members.filter((m) => m.daily?.ma?.aboveEma21 != null);
    const aboveEma21 = withMa.filter((m) => m.daily.ma.aboveEma21).length;
    const above200 = withMa.filter((m) => m.daily.ma.aboveSma200).length;

    // A composite of participation, not an opinion: each component is a plain
    // proportion and the report shows them alongside the total.
    const components = {
      trend: pctOf(above200, withMa.length),
      location: pctOf(aboveEma21, withMa.length),
      flow: withFlow.length ? pctOf(improving, withFlow.length) : null,
    };
    const parts = Object.values(components).filter((v) => v != null);
    const score = parts.length ? Number((parts.reduce((a, b) => a + b, 0) / parts.length).toFixed(1)) : null;

    const prior = previous?.find((p) => p.name === name) ?? null;
    const scoreChange = prior?.score != null && score != null ? Number((score - prior.score).toFixed(1)) : null;

    const relativeStrength = avgChange != null && benchmarkChangePct != null
      ? Number((avgChange - benchmarkChangePct).toFixed(2)) : null;

    const flowDirection = withFlow.length === 0 ? null
      : improving > deteriorating ? 'improving'
      : deteriorating > improving ? 'deteriorating' : 'flat';

    return {
      name,
      members: members.length,
      score, scoreChange, components,
      avgCmf: avgCmf != null ? Number(avgCmf.toFixed(3)) : null,
      flowDirection,
      improving, deteriorating, flowSample: withFlow.length,
      avgChangePct: avgChange != null ? Number(avgChange.toFixed(2)) : null,
      relativeStrength,
      structure: above200 === withMa.length && withMa.length ? 'all above 200 SMA'
        : above200 === 0 && withMa.length ? 'all below 200 SMA'
        : `${above200}/${withMa.length} above 200 SMA`,
      symbols: members.map((m) => m.symbol),
    };
  });

  for (const s of table) s.classification = classify(s);

  // Flow first, then the static score. Two sectors with the same flow direction
  // are separated by participation, not the other way round.
  const rank = { LEADING: 0, IMPROVING: 1, NEUTRAL: 2, WEAKENING: 3, LAGGING: 4 };
  table.sort((a, b) => (rank[a.classification] - rank[b.classification]) || ((b.score ?? -1) - (a.score ?? -1)));
  return table;
}

/**
 * Five states, with flow given more weight than level. A sector can be LEADING
 * on a middling score if participation is broad and money is moving in, and
 * WEAKENING on a high score if it is bleeding flow — which is the rotation the
 * table exists to catch.
 */
function classify(s) {
  const strongTrend = (s.components.trend ?? 0) >= 60;
  const weakTrend = (s.components.trend ?? 100) <= 30;
  if (s.flowDirection === 'improving' && strongTrend) return 'LEADING';
  if (s.flowDirection === 'improving') return 'IMPROVING';
  if (s.flowDirection === 'deteriorating' && weakTrend) return 'LAGGING';
  if (s.flowDirection === 'deteriorating') return 'WEAKENING';
  if (strongTrend) return 'NEUTRAL';
  if (weakTrend) return 'LAGGING';
  return 'NEUTRAL';
}

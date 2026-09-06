/**
 * Setup classification for the social summary table.
 *
 * Pure functions over a report row. The report's own score is used as-is —
 * this module only *labels* what the report already computed. Signals are
 * derived strictly from the data so nothing can be "upgraded" for engagement:
 *
 *   CONFIRMED  — the two-stage rule the report uses: score at the ±2.0 bar,
 *                price on the right side of the cloud, money flow agreeing,
 *                and price structure agreeing (HH-up / LL-down).
 *   WATCH      — everything else worth mentioning (unconfirmed, extended,
 *                exhaustion, divergence).
 */

export const SIGNAL = { CONFIRMED: 'CONFIRMED', WATCH: 'WATCH' };
export const CONFIDENCE_RANK = { High: 3, Medium: 2, Low: 1 };

function pct(a, b) {
  return a != null && b ? (a - b) / b : null;
}

/** Nearest known report level below / above price, with its label. */
export function nearestLevels(row) {
  const levels = [
    ['20d basis', row.bbBasis],
    ['lower band', row.bbLower],
    ['upper band', row.bbUpper],
    ['Q2 VWAP', row.vwap],
    ['cloud A', row.cloudA],
    ['cloud B', row.cloudB],
  ].filter(([, v]) => v != null && Number.isFinite(v));

  const below = levels.filter(([, v]) => v < row.price).sort((a, b) => b[1] - a[1]);
  const above = levels.filter(([, v]) => v > row.price).sort((a, b) => a[1] - b[1]);

  const support = below[0] ? { label: below[0][0], value: below[0][1] } : null;
  const resistance = above[0] ? { label: above[0][0], value: above[0][1] } : null;
  const nextSupport = below[1] ? { label: below[1][0], value: below[1][1] } : null;
  const nextResistance = above[1] ? { label: above[1][0], value: above[1][1] } : null;
  return { support, resistance, nextSupport, nextResistance };
}

/**
 * Classify one row. Returns null for rows with insufficient data.
 */
export function classifySetup(row) {
  const { price, rsi, cmf, score, position, structure, bbBasis, bbLower, bbUpper } = row;
  if (price == null || score == null || rsi == null || cmf == null || bbBasis == null) {
    return null;
  }

  const levels = nearestLevels(row);
  const aboveBasis = price > bbBasis;
  const nearUpper = bbUpper != null && price >= bbUpper * 0.98;
  const nearLower = bbLower != null && price <= bbLower * 1.02;
  const justReclaimed = aboveBasis && row.atr != null && price - bbBasis <= row.atr * 1.25;
  const bullScore = score >= 2;
  const bearScore = score <= -2;

  let direction = 'neutral';
  let setup = 'Range / no edge';
  let signal = SIGNAL.WATCH;
  let confidence = 'Low';
  let rationale = '';
  let risk = '';
  const alignment = [];

  if (bullScore) {
    direction = 'bullish';
    const cloudOk = position === 'above_cloud';
    const flowOk = cmf > 0.1;
    const structOk = structure === 'HH-up';
    if (cloudOk) alignment.push('above cloud');
    if (flowOk) alignment.push('positive flow');
    if (structOk) alignment.push('higher highs');
    const confirmed = cloudOk && flowOk && structOk;

    if (nearUpper && rsi >= 68) {
      setup = 'Extended momentum — exhaustion watch';
      signal = SIGNAL.WATCH;
      confidence = 'Low';
      rationale = `Pinned to the upper band with RSI ${rsi.toFixed(0)}: continuation only, not a fresh entry.`;
      risk = 'stretched; a rejection can retrace.';
    } else if (nearUpper) {
      setup = 'Breakout watch';
      signal = SIGNAL.WATCH; // resistance not yet cleared
      confidence = confirmed ? 'Medium' : 'Low';
      rationale = 'Momentum is constructive, but a confirmed move above the upper band is still needed.';
      risk = 'a rejection can return to support.';
    } else if (justReclaimed) {
      setup = 'Basis reclaim';
      signal = confirmed ? SIGNAL.CONFIRMED : SIGNAL.WATCH;
      confidence = confirmed ? (cmf >= 0.15 ? 'High' : 'Medium') : 'Low';
      rationale = 'Price is back above its 20-day basis on positive money flow without being stretched.';
      risk = 'losing the basis again negates this.';
    } else {
      setup = 'Trend continuation';
      signal = confirmed ? SIGNAL.CONFIRMED : SIGNAL.WATCH;
      confidence = confirmed ? (cmf >= 0.15 && rsi < 68 ? 'High' : 'Medium') : 'Low';
      rationale = 'Trend intact above the basis and cloud with money flow supporting.';
      risk = 'a close under basis negates this.';
    }
  } else if (bearScore) {
    direction = 'bearish';
    const cloudOk = position === 'below_cloud';
    const flowOk = cmf < -0.1;
    const structOk = structure === 'LL-down';
    if (cloudOk) alignment.push('below cloud');
    if (flowOk) alignment.push('negative flow');
    if (structOk) alignment.push('lower lows');
    const confirmed = cloudOk && flowOk && structOk;

    if (cmf >= 0) {
      setup = 'Seller exhaustion watch';
      signal = SIGNAL.WATCH;
      confidence = 'Low';
      rationale = 'Price is broken but money flow is no longer negative: sellers may be tiring.';
      risk = 'a new flow breakdown resumes selling.';
    } else if (nearLower) {
      setup = 'Bearish exhaustion watch';
      signal = SIGNAL.WATCH; // already at the band: chasing has poor reward-to-risk
      confidence = confirmed ? 'Medium' : 'Low';
      rationale = 'Already pinned to the lower band after the breakdown; extension is late, not early.';
      risk = 'bounces toward the basis are common.';
    } else {
      setup = 'Breakdown';
      signal = confirmed ? SIGNAL.CONFIRMED : SIGNAL.WATCH;
      confidence = confirmed ? (cmf <= -0.15 ? 'High' : 'Medium') : 'Low';
      rationale = 'Below basis and cloud with distribution: price has done the work the two-stage rule requires.';
      risk = 'a basis reclaim negates this read.';
    }
  } else {
    // |score| < 2: not a trade in the report's framework — only divergences are notable.
    if (!aboveBasis && cmf > 0.1) {
      direction = 'bullish';
      setup = 'Bullish divergence watch';
      rationale = 'Below basis while money flow turned positive: accumulation into weakness, unconfirmed.';
      risk = 'unconfirmed until basis reclaim.';
    } else if (position === 'above_cloud' && cmf < -0.1) {
      direction = 'bearish';
      setup = 'Bearish divergence watch';
      rationale = 'Structure still intact but money flow is negative: distribution under the surface.';
      risk = 'losing cloud support means breakdown.';
    } else {
      rationale = 'Mixed readings; no directional edge in the report framework.';
      risk = 'false breaks both ways in a range.';
    }
  }

  return {
    symbol: row.symbol,
    group: row.group,
    direction,
    setup,
    signal,
    confidence,
    score,
    price,
    rsi,
    cmf,
    support: levels.support,
    resistance: levels.resistance,
    nextSupport: levels.nextSupport,
    nextResistance: levels.nextResistance,
    alignment,
    extended: nearUpper || nearLower,
    distToBasisPct: pct(price, bbBasis),
    rationale,
    risk,
    biasNext: row.biasNext,
  };
}

/** Quality ordering used to pick post candidates: confirmed + high first. */
export function qualityRank(s) {
  return (s.signal === SIGNAL.CONFIRMED ? 10 : 0) + CONFIDENCE_RANK[s.confidence] * 2 + Math.abs(s.score ?? 0) / 10;
}

/** Build the social summary table (all rows, sorted by quality then score). */
export function buildSummaryTable(model, { groups = ['main', 'anness'] } = {}) {
  return model.rows
    .filter(r => groups.includes(r.group))
    .map(classifySetup)
    .filter(Boolean)
    .sort((a, b) => qualityRank(b) - qualityRank(a) || Math.abs(b.score) - Math.abs(a.score) || a.symbol.localeCompare(b.symbol));
}

/** Highest-quality setups eligible for a post, per config.posting. */
export function selectPostCandidates(table, posting) {
  const minRank = CONFIDENCE_RANK[posting.minConfidence] ?? 2;
  return table
    .filter(s => posting.allowedSignals.includes(s.signal))
    .filter(s => CONFIDENCE_RANK[s.confidence] >= minRank)
    .filter(s => s.direction !== 'neutral')
    .slice(0, posting.maxDraftsPerReport);
}

// ─── rendering ───────────────────────────────────────────────────────────────

export const TABLE_COLUMNS = ['Ticker', 'Setup', 'Price', 'RSI', 'CMF', 'Support', 'Resistance', 'Signal', 'Confidence'];

export function fmtMoney(v) {
  return v == null ? '—' : v.toFixed(2);
}

export function fmtCmf(v) {
  return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2);
}

export function tableRow(s) {
  return [
    s.symbol,
    s.setup,
    fmtMoney(s.price),
    s.rsi == null ? '—' : s.rsi.toFixed(0),
    fmtCmf(s.cmf),
    s.support ? fmtMoney(s.support.value) : '—',
    s.resistance ? fmtMoney(s.resistance.value) : '—',
    s.signal === SIGNAL.CONFIRMED ? 'CONFIRMED SETUP' : 'WATCH',
    s.confidence,
  ];
}

export function renderMarkdownTable(table) {
  const lines = [
    `| ${TABLE_COLUMNS.join(' | ')} |`,
    `| ${TABLE_COLUMNS.map(() => '---').join(' | ')} |`,
    ...table.map(s => `| ${tableRow(s).join(' | ')} |`),
  ];
  return lines.join('\n');
}

export function renderTextTable(table) {
  const rows = [TABLE_COLUMNS, ...table.map(tableRow)];
  const widths = TABLE_COLUMNS.map((_, i) => Math.max(...rows.map(r => String(r[i]).length)));
  return rows
    .map((r, idx) => {
      const line = r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
      return idx === 0 ? line + '\n' + widths.map(w => '-'.repeat(w)).join('  ') : line;
    })
    .join('\n');
}

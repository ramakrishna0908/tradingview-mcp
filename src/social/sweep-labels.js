/**
 * Labels for the "Daily Setup Sweep" post format — shared by the text
 * generator and the chart renderer so the two can never disagree about what
 * a setup is called.
 *
 * Everything here is keyed on the classifier's output (setup name + signal +
 * direction). The classifier is the only thing that can say CONFIRMED, so the
 * word "confirmed" — in a headline, a badge, anywhere — can only appear when
 * setup.signal === CONFIRMED. A WATCH gets a WATCH badge, full stop. That is
 * the "RECLAIM CONFIRMED only when the technical criteria are met" rule, and
 * compliance re-checks it on the finished text (signal_upgraded).
 */
import { SIGNAL } from './setup.js';

const CONFIRMED = SIGNAL.CONFIRMED;

/**
 * Per-setup wording. `headline` is the verb phrase after "$SYM" in the first
 * line; `badge` is the chart's big label; `subtitle` sits under the badge;
 * `annotation` is the short tag drawn on the chart at the last bar.
 */
const TABLE = {
  'Basis reclaim': {
    confirmed: { headline: 'has reclaimed its 20-day base — reclaim confirmed.', badge: 'RECLAIM CONFIRMED', subtitle: 'Price has reclaimed its 20-day base with positive money flow', annotation: '20D Base Reclaimed' },
    watch: { headline: 'has reclaimed its 20-day base — reclaim watch.', badge: 'RECLAIM WATCH', subtitle: 'Reclaimed the 20-day base — cloud, flow and structure are not all aligned yet', annotation: '20D Base Reclaimed' },
  },
  'Trend continuation': {
    confirmed: { headline: 'is holding above its 20-day base — trend confirmed.', badge: 'TREND CONFIRMED', subtitle: 'Holding above the 20-day base and cloud with money flow supporting', annotation: 'Trend Intact' },
    watch: { headline: 'is holding above its 20-day base — continuation watch.', badge: 'CONTINUATION WATCH', subtitle: 'Above the base, but cloud, flow and structure are not all aligned yet', annotation: 'Above Base' },
  },
  'Breakout watch': {
    watch: { headline: 'is pressing its upper band — breakout watch.', badge: 'BREAKOUT WATCH', subtitle: 'Momentum is constructive, but a confirmed move above the band is still needed', annotation: 'At Upper Band' },
  },
  'Extended momentum — exhaustion watch': {
    watch: { headline: 'is extended above its upper band — exhaustion watch.', badge: 'EXHAUSTION WATCH', subtitle: 'Stretched through the upper band — continuation only, not a fresh entry', annotation: 'Extended' },
  },
  // A classifier-confirmed breakdown has only lost the 20-day base: price is
  // still ABOVE the downside confirmation level (the 🎯 line), so "breakdown
  // confirmed" would claim a close that has not happened. That label belongs
  // to the lifecycle event (a daily close below 🎯) — see stageLabel().
  'Breakdown': {
    // mark 'dot': the card's ✓ would read as "confirmed", which this is not.
    confirmed: { headline: 'has lost its 20-day base — bearish setup active.', badge: 'BEARISH SETUP ACTIVE', subtitle: 'Below the 20-day base and cloud with money flow negative', annotation: '20D Base Lost', mark: 'dot' },
    watch: { headline: 'has slipped below its 20-day base — breakdown watch.', badge: 'BREAKDOWN WATCH', subtitle: 'Below the base, but cloud, flow and structure have not all confirmed it', annotation: 'Below Base' },
  },
  'Seller exhaustion watch': {
    watch: { headline: 'is broken but selling is fading — seller exhaustion watch.', badge: 'SELLER EXHAUSTION WATCH', subtitle: 'Money flow is no longer negative — sellers may be tiring', annotation: 'Selling Fading' },
  },
  'Bearish exhaustion watch': {
    watch: { headline: 'is pinned to its lower band — bearish exhaustion watch.', badge: 'BEARISH EXHAUSTION WATCH', subtitle: 'Already at the lower band after the breakdown — late, not early', annotation: 'At Lower Band' },
  },
  'Bullish divergence watch': {
    watch: { headline: 'is below its base while money flow turns positive — divergence watch.', badge: 'DIVERGENCE WATCH', subtitle: 'Accumulation into weakness — a base reclaim would confirm', annotation: 'Flow Diverging' },
  },
  'Bearish divergence watch': {
    watch: { headline: 'holds structure while money flow turns negative — divergence watch.', badge: 'DIVERGENCE WATCH', subtitle: 'Distribution under the surface — watching cloud support', annotation: 'Flow Diverging' },
  },
};

const GENERIC = {
  confirmed: { headline: 'shows a confirmed setup.', badge: 'SETUP CONFIRMED', subtitle: 'Score, cloud, flow and structure all agree', annotation: 'Setup' },
  watch: { headline: 'is on watch.', badge: 'SETUP WATCH', subtitle: 'Mixed readings — no confirmed edge yet', annotation: 'Watch' },
};

/**
 * Setup lifecycle. Every tracked setup moves through these in order and the
 * label on a post is always the stage it is in:
 *
 *   DEVELOPING  — posted as a WATCH: the read is constructive but not confirmed
 *   CONFIRMED   — score, cloud, flow and structure agree (badge names the setup:
 *                 RECLAIM CONFIRMED / TREND CONFIRMED / BEARISH SETUP ACTIVE)
 *   BREAKOUT    — a daily close beyond the 🎯 level ("BREAKOUT UPDATE"; for a
 *                 bearish setup "BREAKDOWN CONFIRMED" — the only place that
 *                 label is used, because only this close earns it)
 *   INVALIDATED — a daily close beyond the 🛑 level
 *   EXPIRED     — neither happened within the tracking window (not posted,
 *                 not counted in the hit rate)
 */
export const STAGE = Object.freeze({
  DEVELOPING: 'DEVELOPING',
  CONFIRMED: 'CONFIRMED',
  BREAKOUT: 'BREAKOUT',
  INVALIDATED: 'INVALIDATED',
  EXPIRED: 'EXPIRED',
  REMOVED: 'REMOVED',   // the post was taken down on X — closed, never scored
});

/** The stage a setup enters when first posted. */
export function initialStage(setup) {
  return setup.signal === CONFIRMED ? STAGE.CONFIRMED : STAGE.DEVELOPING;
}

/** Display label for a stage. CONFIRMED names the setup; BREAKOUT names the direction. */
export function stageLabel(stage, { setup = null, direction = 'bullish' } = {}) {
  switch (stage) {
    case STAGE.DEVELOPING: return 'DEVELOPING';
    case STAGE.CONFIRMED: {
      const entry = setup ? TABLE[setup] : null;
      return entry?.confirmed?.badge ?? 'SETUP CONFIRMED';
    }
    case STAGE.BREAKOUT: return direction === 'bearish' ? 'BREAKDOWN CONFIRMED' : 'BREAKOUT UPDATE';
    case STAGE.INVALIDATED: return 'INVALIDATED';
    case STAGE.EXPIRED: return 'EXPIRED';
    case STAGE.REMOVED: return 'REMOVED';
    default: return String(stage);
  }
}

/**
 * Label for a tracker record's current stage, derived from the stage rather
 * than read from the stored `stageLabel`, so records opened under older
 * wording (e.g. "BREAKDOWN CONFIRMED" for a base loss) display correctly.
 */
export function recordStageLabel(rec) {
  return stageLabel(rec.stage, { setup: rec.setupName, direction: rec.direction });
}

/**
 * Wording for one classified setup. Never returns a "confirmed" label for a
 * WATCH: a WATCH is posted at the DEVELOPING stage, with the setup's own name
 * in the chip above the badge so the reader still sees what kind of setup it is.
 */
export function sweepLabels(setup) {
  const entry = TABLE[setup.setup] ?? GENERIC;
  const confirmed = setup.signal === CONFIRMED && entry.confirmed;
  const words = confirmed ? entry.confirmed : (entry.watch ?? GENERIC.watch);
  const stage = confirmed ? STAGE.CONFIRMED : STAGE.DEVELOPING;
  return {
    ...words,
    stage,
    badge: confirmed ? words.badge : 'DEVELOPING',
    chip: confirmed ? 'TECHNICAL SETUP' : words.badge,
    confirmed: !!confirmed,
    icon: setup.direction === 'bearish' ? '📉' : confirmed ? '📈' : '👀',
  };
}

/**
 * One plain-English sentence per setup — the "why it matters" a reader who
 * has never heard of CMF or a 20-day basis can follow. Descriptive of the
 * present state only; the two levels in the post carry the what-happens-next.
 */
const PLAIN = {
  'Basis reclaim': {
    confirmed: 'In plain terms: price is back above its 20-day average and volume is backing it — buyers are in control while it holds.',
    watch: 'In plain terms: price is back above its 20-day average, but not every signal agrees yet — a watch, not a call.',
  },
  'Trend continuation': {
    confirmed: 'In plain terms: the uptrend is intact and money is still flowing in — the levels below say where that changes.',
    watch: 'In plain terms: the trend is intact, but flow or structure has not caught up yet.',
  },
  'Breakout watch': { watch: 'In plain terms: price is pressing the top of its recent range; a close above it is what a breakout looks like — a wick through it is not.' },
  'Extended momentum — exhaustion watch': { watch: 'In plain terms: price is stretched far above its normal range — this is late in the move, not early.' },
  'Breakdown': {
    confirmed: 'In plain terms: price has lost its 20-day average and money is leaving — sellers are in control while it stays below.',
    watch: 'In plain terms: price slipped under its 20-day average, but not every signal agrees yet.',
  },
  'Seller exhaustion watch': { watch: 'In plain terms: the trend is down, but selling pressure is fading — a reclaim of the base is what a turn looks like.' },
  'Bearish exhaustion watch': { watch: 'In plain terms: price is pinned at the bottom of its range after the drop — late in the move, not early.' },
  'Bullish divergence watch': { watch: 'In plain terms: price is weak but money is quietly flowing in — a base reclaim would turn this from a watch into a setup.' },
  'Bearish divergence watch': { watch: 'In plain terms: price looks fine but money is quietly leaving — the support below is the tell.' },
};
const PLAIN_GENERIC = {
  confirmed: 'In plain terms: the two levels below define the read — one confirms it, the other cancels it.',
  watch: 'In plain terms: the readings are mixed — the two levels below decide it, nothing else.',
};

/** The plain-English line for a classified setup (always one sentence). */
export function plainLine(setup) {
  const entry = PLAIN[setup.setup] ?? PLAIN_GENERIC;
  const confirmed = setup.signal === CONFIRMED && entry.confirmed;
  return confirmed ? entry.confirmed : (entry.watch ?? PLAIN_GENERIC.watch);
}

/** "shows positive money flow" — present tense, descriptive, no forecast. */
export function cmfPhrase(cmf) {
  if (cmf > 0.1) return 'shows positive money flow';
  if (cmf >= 0) return 'shows flat money flow';
  if (cmf > -0.1) return 'shows money flow softening';
  return 'shows money leaving';
}

/** "RSI 64 keeps momentum healthy" — descriptive of the current reading only. */
export function rsiPhrase(rsi, direction) {
  const r = rsi.toFixed(0);
  if (direction === 'bearish') {
    if (rsi <= 32) return `RSI ${r} is washed out`;
    if (rsi < 40) return `RSI ${r} stays weak`;
    if (rsi < 50) return `RSI ${r} sits below the midline`;
    return `RSI ${r} has not followed the move`; // never "confirmed" — that word is the signal's
  }
  if (rsi >= 68) return `RSI ${r} is stretched`;
  if (rsi >= 60) return `RSI ${r} keeps momentum healthy`;
  if (rsi >= 50) return `RSI ${r} holds above the midline`;
  return `RSI ${r} lags the move`;
}

/** Subtitles for the chart's stat tiles. */
export function rsiTile(rsi) {
  if (rsi >= 70) return 'Overbought — stretched';
  if (rsi >= 60) return 'Strong momentum (not overbought)';
  if (rsi >= 50) return 'Above the midline';
  if (rsi >= 40) return 'Below the midline';
  if (rsi > 30) return 'Weak momentum';
  return 'Oversold';
}

export function cmfTile(cmf) {
  if (cmf > 0.1) return 'Positive money flow';
  if (cmf >= -0.1) return 'Flat money flow';
  return 'Negative money flow';
}

/**
 * Relative volume under 1.0× means the move is happening on below-average
 * participation. Every post and card that shows such a reading says so, in
 * the same words, so a thin move is never presented as full-strength.
 */
export function lowParticipation(ratio) {
  return ratio != null && ratio < 1.0;
}

/** "⚠️ RVOL 0.4× — low participation, so confirmation is weaker." (null at ≥ 1.0×) */
export function participationLine(ratio) {
  return lowParticipation(ratio) ? `⚠️ RVOL ${ratio.toFixed(1)}× — low participation, so confirmation is weaker.` : null;
}

export function rvolTile(ratio) {
  if (ratio == null) return null;
  if (lowParticipation(ratio)) return 'Low volume — weaker confirmation';
  if (ratio <= 1.1) return 'Around average';
  return 'Above average';
}

/** What a close beyond the 🎯 level means, per direction — shared by setup posts, follow-ups and cards. */
export const TARGET_OUTCOME = Object.freeze({ bullish: 'potential breakout', bearish: 'bearish continuation confirmed' });

/**
 * The two levels the format is built around, in the order the post states
 * them: the level in the setup's direction (🎯) and the one that negates it (🛑).
 * Either may be null when the report has no level on that side of price.
 * For a bearish setup the 🎯 level is the Downside Confirmation: a daily close
 * below it is what confirms the breakdown.
 */
export function sweepLevels(setup) {
  const bearish = setup.direction === 'bearish';
  const target = bearish ? setup.support : setup.resistance;
  const stop = bearish ? setup.resistance : setup.support;
  return {
    target: target ? { ...target, side: bearish ? 'Below' : 'Above', outcome: bearish ? TARGET_OUTCOME.bearish : TARGET_OUTCOME.bullish, tile: bearish ? 'Downside Confirmation' : 'Breakout level' } : null,
    stop: stop ? { ...stop, side: bearish ? 'Above' : 'Below', outcome: 'setup invalidated', tile: 'Invalidation level' } : null,
  };
}

/**
 * The closing tag line for setup-family posts (setup, thread reply, follow-up):
 * the required tags, then either the fixed `hashtags.tagLine` (e.g.
 * #TechnicalAnalysis #TradingEducation — the ticker stays in the text as
 * $TICKER) or, when no tag line is configured, the legacy #SYM + asset tag
 * capped at `maxTotal`. The tag line is used verbatim — it is the format.
 */
export function setupTags(symbol, config) {
  const h = config.hashtags ?? {};
  const prohibited = new Set((h.prohibited ?? []).map(x => x.toLowerCase()));
  const required = h.required ?? [];
  const seen = new Set(required.map(x => x.toLowerCase()));
  const keep = t => { const k = t.toLowerCase(); if (seen.has(k) || prohibited.has(k)) return false; seen.add(k); return true; };
  if (h.tagLine?.length) return [...required, ...h.tagLine.filter(keep)];
  const extras = [h.symbolTag ? `#${symbol}` : null, h.assetTag || null].filter(Boolean).filter(keep);
  return [...required, ...extras.slice(0, Math.max(0, (h.maxTotal ?? 6) - required.length))];
}

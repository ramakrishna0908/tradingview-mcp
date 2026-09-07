/**
 * Event-driven follow-up posts and the weekly scorecard.
 *
 * A follow-up is generated from a tracker record and one lifecycle event.
 * Every number in it is one of: the levels the original post named, the
 * daily close (or intraday extreme) that triggered the event, the setup's
 * entry price, or the next level the original classification listed. All of
 * them are stored on the tracker record, and compliance checks the text
 * against exactly that set (validation ctx.kind = 'followup').
 *
 * The scorecard is generated from tracker statistics; compliance re-derives
 * every count from the same stats and blocks on any mismatch (ctx.kind =
 * 'scorecard').
 */
import { fmtPrice } from './money.js';
import { formatDataTimestamp } from './generate.js';
import { STAGE, stageLabel } from './sweep-labels.js';
import { EVENT } from './tracker.js';
import { xWeightedLength } from './compliance.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 7" from YYYY-MM-DD. */
export function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Sep 7, 2026" from YYYY-MM-DD. */
export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function pct(v) {
  if (v == null) return null;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

/**
 * Data timestamp for a follow-up: the close of the bar that triggered it.
 * Equities close 16:00 ET; crypto daily bars close at 00:00 UTC of the next day.
 */
export function barCloseIso(bar, assetClass) {
  if (assetClass === 'crypto') {
    const d = new Date(`${bar}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  }
  // 16:00 ET — EDT for Mar–Nov, EST otherwise (close enough for a freshness check)
  const [, m] = bar.split('-').map(Number);
  const offset = m >= 3 && m <= 11 ? '20' : '21';
  return `${bar}T${offset}:00:00.000Z`;
}

/** Model-shaped object so the same validator can run. */
export function followUpModel(rec, event) {
  return { reportDate: event.bar, dataAsOf: barCloseIso(event.bar, rec.assetClass), timeframe: 'D', rows: [] };
}

/**
 * Setup-shaped object for validation and the chart: current price is the
 * event close; support/resistance are the original 🛑/🎯 levels; every other
 * number the text may cite is listed in extraLevels.
 */
export function followUpSetup(rec, event) {
  const bull = rec.direction !== 'bearish';
  const extra = [rec.entryPrice, event.extreme, rec.nextTarget?.value].filter(v => v != null).map(value => ({ value }));
  return {
    symbol: rec.symbol,
    direction: rec.direction,
    signal: rec.signal,
    setup: rec.setupName,
    score: rec.score,
    price: event.price,
    rsi: null, cmf: null,
    resistance: bull ? rec.target : rec.stop,
    support: bull ? rec.stop : rec.target,
    nextResistance: bull ? rec.nextTarget : null,
    nextSupport: bull ? null : rec.nextTarget,
    extraLevels: extra,
    stage: event.type === EVENT.LEVEL_TEST ? rec.stage : event.type,
  };
}

/** Row-shaped object for validation (price is the event close). */
export function followUpRow(rec, event) {
  return { symbol: rec.symbol, price: event.price, score: rec.score, rsi: null, cmf: null, flags: '', biasNext: '' };
}

function tags(rec, config) {
  const h = config.hashtags ?? {};
  const out = [...(h.required ?? [])];
  if (h.symbolTag) out.push(`#${rec.symbol}`);
  if (h.assetTag) out.push(h.assetTag);
  return out.slice(0, h.maxTotal ?? 6);
}

/**
 * The follow-up text for one event. Layout (bullish shown; bearish mirrors
 * the level wording):
 *
 *   ✅ $ETH — BREAKOUT UPDATE. $2,579 cleared on the daily close.
 *   Price: $2,610.40 (daily close) · +4.5% from $2,498 at the setup
 *   🎯 Next level: $2,700 (upper band)
 *   🛑 A close back under $2,579 negates the breakout
 *   Setup posted Sep 7 as RECLAIM CONFIRMED.
 *   $2,700 or back under $2,579 first? 👇
 *   Data: daily · Sep 9, 2026
 *   #ETH #Crypto
 *
 * Every event closes on a level question (the same reply-driving shape as the
 * setup post) and an INVALIDATED update carries the one-line lesson — the
 * level did its job — so a miss reads as accountability, not as a loss.
 */
export function generateFollowUp(rec, event, config) {
  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const $ = v => fmtPrice(v, mo);
  const bull = rec.direction !== 'bearish';
  const above = bull ? 'above' : 'below';
  const Below = bull ? 'Below' : 'Above';
  const backUnder = bull ? 'back under' : 'back above';
  const origin = `Setup posted ${shortDate(rec.reportDate)} as ${rec.posts?.[0] ? stageLabel(rec.posts[0].stage, { setup: rec.setupName, direction: rec.direction }) : rec.stageLabel}`;
  const move = pct(event.pct);
  const priceLine = `Price: ${$(event.price)} (daily close)${move ? ` · ${move} from ${$(rec.entryPrice)} at the setup` : ''}`;
  const stamp = `Data: daily · ${longDate(event.bar)}`;
  const tagLine = tags(rec, config).join(' ') || null;
  const disclosure = config.disclosurePlacement === 'bio' ? null : config.disclosure.trim();
  let lines;
  let cta = null;

  switch (event.type) {
    case EVENT.CONFIRMED: {
      const label = stageLabel(STAGE.CONFIRMED, { setup: rec.setupName, direction: rec.direction });
      lines = [
        `${bull ? '📈' : '📉'} $${rec.symbol} — ${label} (update). Cloud, money flow and structure now agree on the daily.`,
        priceLine,
        rec.target ? `🎯 ${bull ? 'Above' : 'Below'} ${$(rec.target.value)} → ${bull ? 'potential breakout' : 'breakdown continues'}` : null,
        rec.stop ? `🛑 ${Below} ${$(rec.stop.value)} → setup invalidated` : null,
        `First posted ${shortDate(rec.reportDate)} as DEVELOPING.`,
      ];
      cta = rec.target && rec.stop ? `Which level gets hit first — ${$(rec.target.value)} or ${$(rec.stop.value)}? 👇` : null;
      break;
    }
    case EVENT.BREAKOUT: {
      const label = stageLabel(STAGE.BREAKOUT, { direction: rec.direction });
      lines = [
        `✅ $${rec.symbol} — ${label}. ${$(event.level)} cleared on the daily close.`,
        priceLine,
        rec.nextTarget ? `🎯 Next level: ${$(rec.nextTarget.value)} (${rec.nextTarget.label})` : `🎯 No further level listed in the report ${above} ${$(event.level)}`,
        `🛑 A close ${backUnder} ${$(event.level)} negates the ${bull ? 'breakout' : 'breakdown'}`,
        `${origin}.`,
      ];
      cta = rec.nextTarget ? `${$(rec.nextTarget.value)} or ${backUnder} ${$(event.level)} first? 👇` : `Does ${$(event.level)} hold as the new ${bull ? 'floor' : 'ceiling'}? 👇`;
      break;
    }
    case EVENT.LEVEL_TEST: {
      lines = [
        `👀 $${rec.symbol} — LEVEL TEST. Tagged ${$(event.level)} intraday (${bull ? 'high' : 'low'} ${$(event.extreme)}) but did not close ${above} it.`,
        priceLine,
        `🎯 A daily close ${above} ${$(event.level)} → ${bull ? 'breakout' : 'breakdown'}`,
        rec.stop ? `🛑 ${Below} ${$(rec.stop.value)} → setup invalidated` : null,
        `${origin}.`,
      ];
      cta = rec.stop ? `Close ${above} ${$(event.level)} or ${bull ? 'lose' : 'reclaim'} ${$(rec.stop.value)} first? 👇` : `Does ${$(event.level)} give way on a close? 👇`;
      break;
    }
    case EVENT.INVALIDATED: {
      lines = [
        `🛑 $${rec.symbol} — INVALIDATED. ${$(event.level)} lost on the daily close.`,
        priceLine,
        `${origin} · logged as an invalidation in the weekly scorecard.`,
        'The lesson: the level did its job — it said exactly when the read stopped being right, before the outcome was known.',
      ];
      cta = `Would you have drawn the line at ${$(event.level)} too? 👇`;
      break;
    }
    default:
      throw new Error(`No follow-up for event ${event.type}`);
  }

  if (config.cta?.enabled === false) cta = null;
  const assemble = ({ withCta = true, withTags = true } = {}) => [...lines, withCta ? cta : null, stamp, disclosure, withTags ? tagLine : null].filter(Boolean).join('\n');
  let text = assemble();
  for (const step of [{ withCta: false }, { withCta: false, withTags: false }]) {
    if (xWeightedLength(text) <= config.charLimit) break;
    text = assemble(step);
  }
  return { text, length: xWeightedLength(text), parts: { lines, cta, stamp, tagLine } };
}

/** Chart overrides so the card shows the lifecycle stage rather than the original verdict. */
export function followUpChartOverrides(rec, event, config) {
  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const $ = v => fmtPrice(v, mo);
  const bull = rec.direction !== 'bearish';
  const above = bull ? 'above' : 'below';
  const tiles = [
    { label: 'Daily close', value: $(event.price), sub: longDate(event.bar) },
    { label: 'Entry', value: $(rec.entryPrice), sub: `posted ${shortDate(rec.reportDate)}` },
    { label: 'Move since setup', value: pct(event.pct) ?? '—', sub: rec.stageLabel },
    { rvol: true },
  ];
  const stopLine = rec.stop ? { icon: bull ? 'down' : 'up', text: `${bull ? 'Below' : 'Above'} ${$(rec.stop.value)}`, sub: 'Setup invalidated' } : null;
  switch (event.type) {
    case EVENT.CONFIRMED:
      return { badge: stageLabel(STAGE.CONFIRMED, { setup: rec.setupName, direction: rec.direction }), chip: 'LIFECYCLE UPDATE', subtitle: 'Cloud, money flow and structure now agree', annotation: 'Confirmed', confirmed: true, tiles };
    case EVENT.BREAKOUT:
      return {
        badge: stageLabel(STAGE.BREAKOUT, { direction: rec.direction }), chip: 'LIFECYCLE UPDATE', subtitle: `${$(event.level)} cleared on the daily close`, annotation: bull ? 'Breakout' : 'Breakdown', confirmed: true, tiles,
        bottom: [
          { icon: 'check', text: `Cleared ${$(event.level)}`, sub: `Daily close ${above} the level` },
          { icon: bull ? 'down' : 'up', text: `Back ${bull ? 'under' : 'above'} ${$(event.level)}`, sub: `Negates the ${bull ? 'breakout' : 'breakdown'}` },
          { icon: 'question', text: 'Next listed level', sub: rec.nextTarget ? `${$(rec.nextTarget.value)} (${rec.nextTarget.label})` : 'None in the report' },
        ],
      };
    case EVENT.LEVEL_TEST:
      return {
        badge: 'LEVEL TEST', chip: 'LIFECYCLE UPDATE', subtitle: `Tagged ${$(event.level)} intraday, no close ${above}`, annotation: 'Level test', confirmed: false, tiles,
        bottom: [
          { icon: bull ? 'up' : 'down', text: `Tagged ${$(event.level)}`, sub: `${bull ? 'High' : 'Low'} ${$(event.extreme)}, no close ${above}` },
          ...(stopLine ? [stopLine] : []),
          { icon: 'question', text: 'Which comes first?', sub: `A close ${above} ${$(event.level)}${rec.stop ? ` or ${$(rec.stop.value)}` : ''}` },
        ],
      };
    case EVENT.INVALIDATED:
      return {
        badge: 'INVALIDATED', chip: 'LIFECYCLE UPDATE', subtitle: `${$(event.level)} lost on the daily close`, annotation: 'Invalidated', confirmed: false, verdictColor: 'red', tiles,
        bottom: [
          { icon: 'x', text: `Lost ${$(event.level)}`, sub: `Daily close ${bull ? 'below' : 'above'} the level` },
          { icon: 'question', text: 'Logged', sub: 'Counted as an invalidation in the weekly scorecard' },
        ],
      };
    default:
      return {};
  }
}

// ─── weekly scorecard ────────────────────────────────────────────────────────

/**
 *   📊 Weekly Setup Scorecard · Sep 1–5, 2026
 *   Setups posted: 5
 *   ✅ Breakouts / levels reached: 2
 *   🛑 Invalidated: 1
 *   👀 Still active: 2
 *   Hit rate this week: 67% (2 of 3 resolved)
 *   All-time: 12 setups · 58% hit rate (7 of 12 resolved)
 *   Best this week: $ETH +4.5% · Worst: $SOL −2.7%
 *   Every setup, its levels and its outcome are logged before posting.
 *   How to read it: hit rate = breakouts ÷ resolved setups. Invalidations count as misses; expiries are shown, not scored.
 *   Which setup did you follow this week? 👇
 *   Data: daily · Sep 5, 2026
 *   #Stocks #Crypto
 *
 * "⏳ Expired (no resolution): N" is added after "Still active" whenever N > 0,
 * so nothing that was posted disappears from the count.
 *
 * Wording note: the word "targets" never appears — it is a blocked
 * forward-looking term in the compliance config, and here it would only
 * describe past outcomes anyway.
 */
export function generateScorecard(stats, config) {
  const range = `${shortDate(stats.from)}–${stats.from.slice(0, 7) === stats.to.slice(0, 7) ? stats.to.split('-')[2].replace(/^0/, '') : shortDate(stats.to)}, ${stats.to.slice(0, 4)}`;
  const week = stats.hitRate == null ? 'Hit rate this week: — (nothing resolved yet)' : `Hit rate this week: ${stats.hitRate}% (${stats.breakouts} of ${stats.resolved} resolved)`;
  const all = stats.allTime.hitRate == null
    ? `All-time: ${stats.allTime.setups} setups · no resolved outcomes yet`
    : `All-time: ${stats.allTime.setups} setups · ${stats.allTime.hitRate}% hit rate (${stats.allTime.breakouts} of ${stats.allTime.resolved} resolved)`;
  const bw = stats.best && stats.worst && stats.best.symbol !== stats.worst.symbol
    ? `Best this week: $${stats.best.symbol} ${pct(stats.best.pct)} · Worst: $${stats.worst.symbol} ${pct(stats.worst.pct)}`
    : stats.best ? `Move this week: $${stats.best.symbol} ${pct(stats.best.pct)}` : null;
  const sc = config.scorecard ?? {};
  const tagLine = (sc.hashtags ?? []).slice(0, config.hashtags?.maxTotal ?? 6).join(' ') || null;
  const lines = [
    `📊 Weekly Setup Scorecard · ${range}`,
    `Setups posted: ${stats.posted}`,
    `✅ Breakouts / levels reached: ${stats.breakouts}`,
    `🛑 Invalidated: ${stats.invalidated}`,
    `👀 Still active: ${stats.active}`,
    stats.expired > 0 ? `⏳ Expired (no resolution): ${stats.expired}` : null,
    week,
    all,
    bw,
    'Every setup, its levels and its outcome are logged before posting.',
    'How to read it: hit rate = breakouts ÷ resolved setups. Invalidations count as misses; expiries are shown, not scored.',
    config.cta?.enabled === false ? null : 'Which setup did you follow this week? 👇',
    `Data: daily · ${longDate(stats.to)}`,
    config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    tagLine,
  ].filter(Boolean);
  const text = lines.join('\n');
  return { text, length: xWeightedLength(text), parts: { lines } };
}

/** Spec for the scorecard card (rendered by scripts/render-chart-sweep.py, style "scorecard"). */
export function buildScorecardSpec(stats, config, outPath) {
  return {
    style: 'scorecard',
    out: outPath,
    width: config.charts?.width ?? 1200,
    height: config.charts?.height ?? 1000,
    brand: config.brand?.name || null,
    tagline: config.brand?.tagline || null,
    title: 'Weekly Setup Scorecard',
    range: `${longDate(stats.from)} – ${longDate(stats.to)}`,
    tiles: [
      { label: 'Setups posted', value: String(stats.posted), color: 'blue' },
      { label: 'Breakouts / levels reached', value: String(stats.breakouts), color: 'green' },
      { label: 'Invalidated', value: String(stats.invalidated), color: 'red' },
      { label: 'Still active', value: String(stats.active), color: 'blue' },
    ],
    hitRate: stats.hitRate,
    hitRateText: stats.hitRate == null ? 'nothing resolved yet' : `${stats.breakouts} of ${stats.resolved} resolved`,
    allTime: stats.allTime.hitRate == null ? `${stats.allTime.setups} setups tracked · no resolved outcomes yet` : `All-time: ${stats.allTime.setups} setups · ${stats.allTime.hitRate}% hit rate (${stats.allTime.breakouts} of ${stats.allTime.resolved} resolved)`,
    rows: [
      ...stats.symbols.breakouts.map(s => ({ symbol: s, outcome: 'Breakout', color: 'green' })),
      ...stats.symbols.invalidated.map(s => ({ symbol: s, outcome: 'Invalidated', color: 'red' })),
      ...stats.symbols.active.map(s => ({ symbol: s, outcome: 'Active', color: 'blue' })),
    ].slice(0, 12),
    footer: `Data: daily · ${longDate(stats.to)} · outcomes on daily closes`,
    source: 'Every setup, its levels and its outcome are logged before posting.',
    disclosure: config.disclosure.trim(),
  };
}

/** Alt text for the scorecard card. */
export function scorecardAltText(stats, config) {
  const bits = [`Weekly Setup Scorecard, ${longDate(stats.from)} to ${longDate(stats.to)}.`,
    `Setups posted ${stats.posted}, breakouts ${stats.breakouts}, invalidated ${stats.invalidated}, still active ${stats.active}.`];
  if (stats.hitRate != null) bits.push(`Hit rate this week ${stats.hitRate}%.`);
  bits.push(config.disclosure.trim());
  return bits.join(' ').slice(0, 1000);
}

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
import { STAGE, stageLabel, recordStageLabel, setupTags, TARGET_OUTCOME } from './sweep-labels.js';
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
  return setupTags(rec.symbol, config);
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
  const origin = `Setup posted ${shortDate(rec.reportDate)} as ${rec.posts?.[0] ? stageLabel(rec.posts[0].stage, { setup: rec.setupName, direction: rec.direction }) : recordStageLabel(rec)}`;
  const move = pct(event.pct);
  const priceLine = `Price: ${$(event.price)} (daily close)${move ? ` · ${move} from ${$(rec.entryPrice)} at the setup` : ''}`;
  const stamp = `Data: daily · ${longDate(event.bar)}`;
  const tagLine = tags(rec, config).join(' ') || null;
  const disclosure = config.disclosurePlacement === 'bio' ? null : config.disclosure.trim();
  let lines;
  let cta = null;
  // Context lines the fit ladder may drop (in this order) before the CTA, so
  // a 280-character account still gets the event, the price and the level.
  let optional = [];

  switch (event.type) {
    case EVENT.CONFIRMED: {
      const label = stageLabel(STAGE.CONFIRMED, { setup: rec.setupName, direction: rec.direction });
      lines = [
        `${bull ? '📈' : '📉'} $${rec.symbol} — ${label} (update). Cloud, money flow and structure now agree on the daily.`,
        priceLine,
        rec.target ? `🎯 ${bull ? 'Above' : 'Below'} ${$(rec.target.value)} → ${bull ? TARGET_OUTCOME.bullish : TARGET_OUTCOME.bearish}` : null,
        rec.stop ? `🛑 ${Below} ${$(rec.stop.value)} → setup invalidated` : null,
        `First posted ${shortDate(rec.reportDate)} as DEVELOPING.`,
      ];
      optional = [lines[4]];
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
      optional = [lines[4]];
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
      optional = [lines[4]];
      cta = rec.stop ? `Close ${above} ${$(event.level)} or ${bull ? 'lose' : 'reclaim'} ${$(rec.stop.value)} first? 👇` : `Does ${$(event.level)} give way on a close? 👇`;
      break;
    }
    case EVENT.INVALIDATED: {
      // A bearish setup fails when price closes *above* the 🛑 level, so the
      // level is reclaimed, not lost — same lose/reclaim pair used by the
      // LEVEL TEST CTA above.
      lines = [
        `🛑 $${rec.symbol} — INVALIDATED. ${$(event.level)} ${bull ? 'lost' : 'reclaimed'} on the daily close.`,
        priceLine,
        `${origin} · logged as an invalidation in the weekly scorecard.`,
        'The lesson: the level did its job — it said exactly when the read stopped being right, before the outcome was known.',
      ];
      optional = [lines[3], lines[2]];
      cta = `Would you have drawn the line at ${$(event.level)} too? 👇`;
      break;
    }
    default:
      throw new Error(`No follow-up for event ${event.type}`);
  }

  if (config.cta?.enabled === false) cta = null;
  const assemble = ({ withCta = true, withTags = true, drop = 0 } = {}) => {
    const gone = new Set(optional.slice(0, drop));
    return [...lines.filter(l => !gone.has(l)), withCta ? cta : null, stamp, disclosure, withTags ? tagLine : null].filter(Boolean).join('\n');
  };
  let text = assemble();
  // Fit ladder: the optional context lines, then the CTA. A configured tag
  // line is part of the format — it is never trimmed.
  const all = optional.length;
  const ladder = [...optional.map((_, i) => ({ drop: i + 1 })), { drop: all, withCta: false }, { drop: all, withCta: false, withTags: !!config.hashtags?.tagLine?.length }];
  for (const step of ladder) {
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
    { label: 'Move since setup', value: pct(event.pct) ?? '—', sub: recordStageLabel(rec) },
    { rvol: true },
  ];
  const stopLine = rec.stop ? { icon: bull ? 'down' : 'up', text: `${bull ? 'Below' : 'Above'} ${$(rec.stop.value)}`, sub: 'Setup invalidated' } : null;
  switch (event.type) {
    case EVENT.CONFIRMED:
      return { badge: stageLabel(STAGE.CONFIRMED, { setup: rec.setupName, direction: rec.direction }), chip: 'LIFECYCLE UPDATE', subtitle: 'Cloud, money flow and structure now agree', annotation: 'Confirmed', confirmed: true, tiles };
    case EVENT.BREAKOUT:
      return {
        // mark 'check': the close beyond 🎯 is the one event that earns the ✓ (overrides a setup's 'dot')
        badge: stageLabel(STAGE.BREAKOUT, { direction: rec.direction }), chip: 'LIFECYCLE UPDATE', subtitle: `${$(event.level)} cleared on the daily close`, annotation: bull ? 'Breakout' : 'Breakdown', confirmed: true, mark: 'check', tiles,
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
        badge: 'INVALIDATED', chip: 'LIFECYCLE UPDATE', subtitle: `${$(event.level)} ${bull ? 'lost' : 'reclaimed'} on the daily close`, annotation: 'Invalidated', confirmed: false, verdictColor: 'red', tiles,
        bottom: [
          { icon: 'x', text: `${bull ? 'Lost' : 'Reclaimed'} ${$(event.level)}`, sub: `Daily close ${bull ? 'below' : 'above'} the level` },
          { icon: 'question', text: 'Logged', sub: 'Counted as an invalidation in the weekly scorecard' },
        ],
      };
    default:
      return {};
  }
}

// ─── weekly scorecard ────────────────────────────────────────────────────────

/** Fixed accountability line — the scorecard's promise, on the post and the card. */
export const SCORECARD_ACCOUNTABILITY = 'No deleting losers. No cherry-picking winners.';
/** Reply-driving question: invites the next educational breakdown. */
export const SCORECARD_CTA = 'Which setup should we break down next? 👇';
/** The "Lesson of the Week" line prefix; the lesson itself must fit the phone line budget. */
export const LESSON_PREFIX = '🧠 Lesson of the Week: ';
export const LESSON_MAX_CHARS = 150 - LESSON_PREFIX.length;
const WATCH_PREFIX = '🔭 Watching Next Week: ';

/**
 * Lessons of the week, keyed by what the week's numbers show. Each one teaches
 * how to read tracked setups — never a call on a name, never forward-looking
 * (no "will", no forecast wording) — and fits LESSON_MAX_CHARS. The week number
 * rotates through a pool so consecutive quiet weeks do not repeat verbatim.
 */
export const SCORECARD_LESSONS = Object.freeze({
  quiet: [
    'A level only counts on a daily close. Intraday pokes through it are noise until the candle settles.',
    'No resolution in a week is normal. Swing setups often need several sessions to reach or lose a level.',
    'An open setup with its invalidation level intact is still a valid read. Patience is part of the plan.',
  ],
  misses: [
    'An invalidation is the plan working: the level showed the read was wrong, so it closed and risk stayed defined.',
    'Misses are information. A setup that loses its level on a daily close is logged, not explained away.',
  ],
  hits: [
    'A good week is still a small sample. Judge a process over dozens of setups, not five sessions.',
    'The invalidation level was set before the move, not after. That is what makes a reached level meaningful.',
  ],
  mixed: [
    'A hit rate means little without the misses beside it. Both sides are counted, on daily closes.',
    'Mixed weeks are the honest ones: some levels were reached, some failed. The rules decided, not hindsight.',
  ],
  stalled: [
    'A setup that goes nowhere expires unscored. Time is a risk too: a stalled idea ties up attention and capital.',
  ],
  none: [
    'No setup cleared the bar this week. Sitting out when nothing qualifies is a decision, not a gap.',
  ],
});

/** Which lesson pool fits the week's numbers. */
export function lessonKind(stats) {
  if (stats.breakouts && stats.invalidated) return 'mixed';
  if (stats.breakouts) return 'hits';
  if (stats.invalidated) return 'misses';
  if (stats.expired) return 'stalled';
  if (stats.active || stats.posted) return 'quiet';
  return 'none';
}

/** The Lesson of the Week: an explicit override, else a pool lesson rotated by week. */
export function weeklyLesson(stats, override = null) {
  if (override != null && String(override).trim()) return String(override).trim().replace(/\s+/g, ' ');
  const pool = SCORECARD_LESSONS[lessonKind(stats)];
  const [y, m, d] = stats.to.split('-').map(Number);
  const week = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / (7 * 86400_000));
  return pool[week % pool.length];
}

/** Every still-active ticker, once each, in the order the tracker holds them. */
export function watchingNextWeek(stats) {
  return [...new Set(stats.symbols?.active ?? [])];
}

/** "Pending" until something resolves; otherwise the percentage. */
export function hitRateLabel(stats) {
  return stats.hitRate == null ? 'Pending' : `${stats.hitRate}%`;
}

/**
 *   📊 Weekly Setup Scorecard · Sep 7–11, 2026
 *   📋 Setups Tracked: 4 · 👀 Active: 4
 *   🎯 Targets Hit: 0 · 🛑 Invalidated: 0
 *   📈 Hit Rate: Pending — nothing resolved yet (targets hit ÷ resolved setups)
 *
 *   🧠 Lesson of the Week: A level only counts on a daily close. …
 *
 *   🔭 Watching Next Week: $CRCL $MSTR $LLY $RKLB
 *   🧾 No deleting losers. No cherry-picking winners.
 *   Which setup should we break down next? 👇
 *   Data: daily · Sep 11, 2026
 *   #TechnicalAnalysis #TradingEducation
 *
 * "⏳ Expired (not scored): N" follows the counts whenever N > 0, so nothing
 * that was posted disappears. Watching Next Week lists EVERY still-active
 * ticker — compliance checks the list against the tracker, so no open setup
 * can be quietly left off.
 *
 * Wording note: "Targets Hit" is the one place the word appears. It reports
 * how many posted 🎯 levels were reached on a daily close — a past outcome —
 * and compliance exempts exactly that phrase on scorecards only; any other
 * "target" wording still blocks as forward-looking.
 */
export function generateScorecard(stats, config, { lesson = null } = {}) {
  const range = `${shortDate(stats.from)}–${stats.from.slice(0, 7) === stats.to.slice(0, 7) ? stats.to.split('-')[2].replace(/^0/, '') : shortDate(stats.to)}, ${stats.to.slice(0, 4)}`;
  const hit = stats.hitRate == null
    ? '📈 Hit Rate: Pending — nothing resolved yet (targets hit ÷ resolved setups)'
    : `📈 Hit Rate: ${stats.hitRate}% (${stats.breakouts} targets hit ÷ ${stats.resolved} resolved)`;
  const watching = watchingNextWeek(stats);
  const watchLine = watching.length ? fitTickers(WATCH_PREFIX, watching) : `${WATCH_PREFIX}no open setups carry over`;
  const sc = config.scorecard ?? {};
  const tagLine = (sc.hashtags ?? []).slice(0, config.hashtags?.maxTotal ?? 6).join(' ') || null;
  const lines = [
    `📊 Weekly Setup Scorecard · ${range}`,
    `📋 Setups Tracked: ${stats.posted} · 👀 Active: ${stats.active}`,
    `🎯 Targets Hit: ${stats.breakouts} · 🛑 Invalidated: ${stats.invalidated}`,
    stats.expired > 0 ? `⏳ Expired (not scored): ${stats.expired}` : null,
    hit,
    '',
    `${LESSON_PREFIX}${weeklyLesson(stats, lesson)}`,
    '',
    watchLine,
    `🧾 ${SCORECARD_ACCOUNTABILITY}`,
    config.cta?.enabled === false ? null : SCORECARD_CTA,
    `Data: daily · ${longDate(stats.to)}`,
    config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    tagLine,
  ].filter(l => l != null);
  const text = lines.join('\n');
  return { text, length: xWeightedLength(text), parts: { lines, watching } };
}

/** "$A $B $C" on one phone line; past 150 chars the rest collapse to "+N more" (the card lists all). */
function fitTickers(prefix, symbols) {
  const all = `${prefix}${symbols.map(s => `$${s}`).join(' ')}`;
  if (all.length <= 150) return all;
  for (let n = symbols.length - 1; n > 0; n--) {
    const line = `${prefix}${symbols.slice(0, n).map(s => `$${s}`).join(' ')} +${symbols.length - n} more`;
    if (line.length <= 150) return line;
  }
  return `${prefix}${symbols.length} open setups`;
}

/** Spec for the scorecard card (rendered by scripts/render-chart-sweep.py, style "scorecard"). */
export function buildScorecardSpec(stats, config, outPath, { lesson = null } = {}) {
  const resolvedRows = [
    ...stats.symbols.breakouts.map(s => ({ symbol: s, outcome: 'Target hit', color: 'green' })),
    ...stats.symbols.invalidated.map(s => ({ symbol: s, outcome: 'Invalidated', color: 'red' })),
    ...(stats.symbols.expired ?? []).map(s => ({ symbol: s, outcome: 'Expired', color: 'muted' })),
  ];
  return {
    style: 'scorecard',
    out: outPath,
    width: config.charts?.width ?? 1200,
    brand: config.brand?.name || null,
    tagline: config.brand?.tagline || null,
    title: 'Weekly Setup Scorecard',
    range: `${longDate(stats.from)} – ${longDate(stats.to)}`,
    tiles: [
      { label: 'Setups Tracked', value: String(stats.posted), color: 'blue' },
      { label: 'Active', value: String(stats.active), color: 'blue' },
      { label: 'Targets Hit', value: String(stats.breakouts), color: 'green' },
      { label: 'Invalidated', value: String(stats.invalidated), color: 'red' },
      { label: 'Hit Rate', value: hitRateLabel(stats), color: stats.hitRate == null ? 'amber' : stats.hitRate >= 50 ? 'green' : 'red',
        sub: stats.hitRate == null ? 'nothing resolved yet' : `${stats.breakouts} of ${stats.resolved} resolved` },
    ],
    lesson: weeklyLesson(stats, lesson),
    watching: watchingNextWeek(stats),
    resolved: resolvedRows,
    accountability: SCORECARD_ACCOUNTABILITY,
    footer: `Data: daily · ${longDate(stats.to)} · outcomes on daily closes · hit rate = targets hit ÷ resolved setups`
      + (stats.allTime ? ` · all-time: ${stats.allTime.setups} setups tracked` : ''),
    disclosure: (config.cardDisclosure ?? config.disclosure).trim(),
  };
}

/** Alt text for the scorecard card. */
export function scorecardAltText(stats, config, { lesson = null } = {}) {
  const watching = watchingNextWeek(stats);
  const bits = [`Weekly Setup Scorecard, ${longDate(stats.from)} to ${longDate(stats.to)}.`,
    `Setups tracked ${stats.posted}, active ${stats.active}, targets hit ${stats.breakouts}, invalidated ${stats.invalidated}.`,
    stats.hitRate == null ? 'Hit rate pending: nothing resolved yet.' : `Hit rate ${stats.hitRate}%.`,
    `Lesson of the week: ${weeklyLesson(stats, lesson)}`,
    watching.length ? `Watching next week: ${watching.join(', ')}.` : 'No open setups carry over.',
    SCORECARD_ACCOUNTABILITY,
    (config.cardDisclosure ?? config.disclosure).trim()];
  return bits.join(' ').slice(0, 1000);
}

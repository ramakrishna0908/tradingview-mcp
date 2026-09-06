/**
 * Deterministic X post generator.
 *
 * Every number comes straight from the report row; the narrative and the
 * invalidation come from the setup classifier; the CTA, disclosure and
 * hashtags come from config. No forward-looking claims, no targets.
 *
 * Layout:
 *   🔻 $CRWV — Breakdown · Confirmed Setup
 *   Price: $82.84 · RSI: 44 · CMF: -0.38
 *   Support: $76.79 · Resistance: $88.71
 *   Downside level: $76.79 (support test)          ← bearish; "Upside level … (resistance test)" when bullish
 *   Invalidation: reclaim and hold above $88.71    ← always present (risk context)
 *   <narrative — what happened, what to watch>     ← dropped when it does not fit
 *   <CTA>                                          ← dropped first when it does not fit
 *   Data: daily · Aug 31, 2026 9:49 AM ET
 *   <disclosure>                                   ← only when disclosurePlacement = "post"
 *   #NFA #DYOR #Breakdown …
 */
import { SIGNAL, fmtCmf } from './setup.js';
import { xWeightedLength } from './compliance.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Aug 31, 2026 9:49 AM ET" from an ISO timestamp. */
export function formatDataTimestamp(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = k => parts.find(p => p.type === k)?.value;
  const month = MONTHS[Number(get('month')) - 1];
  return `${month} ${get('day')}, ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')} ET`;
}

function money(v) {
  return '$' + v.toFixed(2);
}

const TIMEFRAME_WORD = { D: 'daily', W: 'weekly', '60': '1h', '240': '4h' };

function headline(setup, labels) {
  const icon = setup.direction === 'bearish' ? '🔻' : '👀';
  const label = setup.signal === SIGNAL.CONFIRMED ? labels.CONFIRMED : labels.WATCH;
  // "Breakout watch" already carries the WATCH label — don't repeat it.
  const name = /watch$/i.test(setup.setup) && setup.signal === SIGNAL.WATCH
    ? setup.setup
    : `${setup.setup} · ${label}`;
  return `${icon} $${setup.symbol} — ${name}`;
}

function levelsLine(setup) {
  const bits = [];
  if (setup.support) bits.push(`Support: ${money(setup.support.value)}`);
  if (setup.resistance) bits.push(`Resistance: ${money(setup.resistance.value)}`);
  return bits.join(' · ');
}

/** "Downside level: $76.79 (support test)" / "Upside level: $123.50 (resistance test)". */
export function levelToWatchLine(setup) {
  if (setup.direction === 'bearish' && setup.support) return `Downside level: ${money(setup.support.value)} (support test)`;
  if (setup.direction === 'bullish' && setup.resistance) return `Upside level: ${money(setup.resistance.value)} (resistance test)`;
  return null;
}

/** The condition that negates the read — always stated, never a target. */
export function invalidationLine(setup) {
  if (setup.direction === 'bearish' && setup.resistance) return `Invalidation: reclaim and hold above ${money(setup.resistance.value)}`;
  if (setup.direction === 'bullish' && setup.support) return `Invalidation: lose and hold below ${money(setup.support.value)}`;
  return `Invalidation: ${setup.risk}`;
}

/** " (+0.05 vs prior day)" — day-over-day CMF change, only when a prior session exists. */
export function cmfDeltaNote(setup) {
  if (setup.cmfDelta == null) return '';
  const sign = setup.cmfDelta > 0 ? '+' : setup.cmfDelta < 0 ? '−' : '±';
  return ` (${sign}${Math.abs(setup.cmfDelta).toFixed(2)} vs prior day)`;
}

/** Shorter invalidation used only when the post would not otherwise fit. */
function invalidationShort(setup) {
  if (setup.direction === 'bearish' && setup.resistance) return `Invalidation: hold above ${money(setup.resistance.value)}`;
  if (setup.direction === 'bullish' && setup.support) return `Invalidation: hold below ${money(setup.support.value)}`;
  return invalidationLine(setup);
}

/** Engagement hashtags in priority order for this setup (deduped, no required ones). */
export function engagementHashtags(setup, config) {
  const h = config.hashtags ?? {};
  const eng = h.engagement ?? {};
  const bySetup = [];
  if (/breakout/i.test(setup.setup)) bySetup.push('#Breakout');
  if (/breakdown/i.test(setup.setup)) bySetup.push('#Breakdown');
  const pool = [...bySetup, ...(eng[setup.direction] ?? []), ...(eng.default ?? [])];
  const required = new Set((h.required ?? []).map(x => x.toLowerCase()));
  const prohibited = new Set((h.prohibited ?? []).map(x => x.toLowerCase()));
  const out = [];
  for (const tag of pool) {
    const k = tag.toLowerCase();
    if (required.has(k) || prohibited.has(k) || out.some(o => o.toLowerCase() === k)) continue;
    out.push(tag);
  }
  return out;
}

/**
 * Compose the post. Returns { text, length, parts }.
 *
 * Fit ladder when the configured limit is exceeded: drop the CTA, then
 * engagement hashtags one at a time (lowest priority first), then the
 * narrative, the timeframe word, the (duplicate) level-to-watch line, the
 * short invalidation wording, and as a last resort the prior-day CMF note. Price/RSI/CMF, the
 * levels, the invalidation, the timestamp, the disclosure (when placed in the
 * post) and the REQUIRED hashtags are never dropped — if it still does not
 * fit, validation reports `char_limit` and a human edits.
 */
export function generatePost(setup, model, config) {
  const labels = config.signalLabels;
  const tf = TIMEFRAME_WORD[model.timeframe] ?? model.timeframe ?? null;
  const stamp = formatDataTimestamp(model.dataAsOf);
  const required = config.hashtags?.required ?? [];
  const maxTotal = config.hashtags?.maxTotal ?? 6;
  const extras = engagementHashtags(setup, config).slice(0, Math.max(0, maxTotal - required.length));
  const cta = config.cta?.enabled && config.cta.text?.trim() ? config.cta.text.trim() : null;

  const parts = {
    headline: headline(setup, labels),
    indicators: `Price: ${money(setup.price)} · RSI: ${setup.rsi.toFixed(0)} · CMF: ${fmtCmf(setup.cmf)}${cmfDeltaNote(setup)}`,
    indicatorsNoDelta: `Price: ${money(setup.price)} · RSI: ${setup.rsi.toFixed(0)} · CMF: ${fmtCmf(setup.cmf)}`,
    levels: levelsLine(setup),
    levelToWatch: levelToWatchLine(setup),
    invalidation: invalidationLine(setup),
    invalidationShort: invalidationShort(setup),
    narrative: setup.rationale,
    cta,
    timestamp: tf ? `Data: ${tf} · ${stamp}` : `Data: ${stamp}`,
    timestampShort: `Data: ${stamp}`,
    disclosure: config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    requiredHashtags: required,
    engagementHashtags: extras,
  };

  const assemble = ({ narrative = true, withCta = true, tfWord = true, extraCount = extras.length, levelToWatch = true, shortInvalidation = false, deltaNote = true } = {}) => {
    const tags = [...required, ...extras.slice(0, extraCount)];
    return [
      parts.headline,
      deltaNote ? parts.indicators : parts.indicatorsNoDelta,
      parts.levels,
      levelToWatch ? parts.levelToWatch : null,
      shortInvalidation ? parts.invalidationShort : parts.invalidation,
      narrative ? parts.narrative : null,
      withCta ? parts.cta : null,
      tfWord ? parts.timestamp : parts.timestampShort,
      parts.disclosure,
      tags.length ? tags.join(' ') : null,
    ].filter(Boolean).join('\n');
  };

  const ladder = [{}, { withCta: false }];
  for (let n = extras.length - 1; n >= 0; n--) ladder.push({ withCta: false, extraCount: n });
  ladder.push({ withCta: false, narrative: false, extraCount: 0 });
  ladder.push({ withCta: false, narrative: false, extraCount: 0, tfWord: false });
  ladder.push({ withCta: false, narrative: false, extraCount: 0, tfWord: false, levelToWatch: false });
  ladder.push({ withCta: false, narrative: false, extraCount: 0, tfWord: false, levelToWatch: false, shortInvalidation: true });
  ladder.push({ withCta: false, narrative: false, extraCount: 0, tfWord: false, levelToWatch: false, shortInvalidation: true, deltaNote: false });

  let text = assemble();
  for (const step of ladder) {
    text = assemble(step);
    if (xWeightedLength(text) <= config.charLimit) break;
  }
  return { text, length: xWeightedLength(text), parts };
}

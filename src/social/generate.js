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
 *   Volume: 1.4× 20-day avg (last bar)              ← from the chart candles, dropped with the narrative
 *   <narrative — what happened, what to watch>     ← dropped when it does not fit
 *   <CTA>                                          ← dropped first when it does not fit
 *   Data: daily · Aug 31, 2026 9:49 AM ET
 *   <disclosure>                                   ← only when disclosurePlacement = "post"
 *   #NFA #DYOR #Breakdown …
 */
import { SIGNAL, fmtCmf } from './setup.js';
import { xWeightedLength } from './compliance.js';
import { fmtPrice } from './money.js';
import { sweepLabels, sweepLevels, cmfPhrase, rsiPhrase, plainLine, participationLine, lowParticipation, setupTags } from './sweep-labels.js';

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

/**
 * Price as the post prints it. `opts.grouping` comes from the config so the
 * crypto sweep can render "$79,610.00" while the stock posts keep the exact
 * ungrouped two-decimal formatting they have always had.
 */
function money(v, opts) {
  return fmtPrice(v, opts);
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

function levelsLine(setup, opts) {
  const bits = [];
  if (setup.support) bits.push(`Support: ${money(setup.support.value, opts)}`);
  if (setup.resistance) bits.push(`Resistance: ${money(setup.resistance.value, opts)}`);
  return bits.join(' · ');
}

/** "Downside level: $76.79 (support test)" / "Upside level: $123.50 (resistance test)". */
export function levelToWatchLine(setup, opts) {
  if (setup.direction === 'bearish' && setup.support) return `Downside level: ${money(setup.support.value, opts)} (support test)`;
  if (setup.direction === 'bullish' && setup.resistance) return `Upside level: ${money(setup.resistance.value, opts)} (resistance test)`;
  return null;
}

/** The condition that negates the read — always stated, never a target. */
export function invalidationLine(setup, opts) {
  if (setup.direction === 'bearish' && setup.resistance) return `Invalidation: reclaim and hold above ${money(setup.resistance.value, opts)}`;
  if (setup.direction === 'bullish' && setup.support) return `Invalidation: lose and hold below ${money(setup.support.value, opts)}`;
  return `Invalidation: ${setup.risk}`;
}

/** " (+0.05 vs prior day)" — day-over-day CMF change, only when a prior session exists. */
export function cmfDeltaNote(setup) {
  if (setup.cmfDelta == null) return '';
  const sign = setup.cmfDelta > 0 ? '+' : setup.cmfDelta < 0 ? '−' : '±';
  return ` (${sign}${Math.abs(setup.cmfDelta).toFixed(2)} vs prior day)`;
}

/** Shorter invalidation used only when the post would not otherwise fit. */
function invalidationShort(setup, opts) {
  if (setup.direction === 'bearish' && setup.resistance) return `Invalidation: hold above ${money(setup.resistance.value, opts)}`;
  if (setup.direction === 'bullish' && setup.support) return `Invalidation: hold below ${money(setup.support.value, opts)}`;
  return invalidationLine(setup, opts);
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
/** "Volume: 1.4× 20-day avg (last bar)" — only when chart candle data exists. */
export function volumeLine(chart, config) {
  if (!config.charts?.volumeLine || chart?.volumeRatio == null) return null;
  const low = lowParticipation(chart.volumeRatio) ? ' — low participation, so confirmation is weaker' : '';
  return `Volume: ${chart.volumeRatio.toFixed(1)}× 20-day avg (last bar)${low}`;
}

export function generatePost(setup, model, config, opts = {}) {
  if (config.postFormat === 'sweep') return generateSweepPost(setup, model, config, opts);
  return generateClassicPost(setup, model, config, opts);
}

/**
 * The Daily Setup Sweep format.
 *
 *   📉 $RKLB has lost its 20-day base — bearish setup active.
 *   CMF -0.20 shows money leaving while RSI 37 stays weak.
 *   ⚠️ RVOL 0.4× — low participation, so confirmation is weaker.
 *   🎯 Below $55.81 → bearish continuation confirmed
 *   🛑 Above $68.37 → setup invalidated
 *   Current price: $62.77 · Setup score -2.5
 *   Which level gets hit first — $55.81 or $68.37? 👇
 *   Daily Setup Sweep · tracked to a daily close beyond a level · scored every Friday
 *   Data: daily · Sep 11, 2026 9:51 AM ET
 *   #TechnicalAnalysis #TradingEducation
 *
 * RVOL is stated once: in the ⚠️ participation line when it is under 1.0×
 * (never dropped — it qualifies the read), otherwise on the stats line. The
 * closing tags come from `hashtags.tagLine` via setupTags(); a configured tag
 * line is part of the format and is never trimmed.
 *
 * The "In plain terms" line (config `plainLanguage`) is the
 * beginner's reading of the setup from sweep-labels.js; the series line
 * (config `brand.seriesLine`, null to drop) names the recurring format and
 * the accountability loop so a first-time reader knows what comes next.
 *
 * Same rules as the classic layout: every number is the report's, the word
 * "confirmed" appears only for a CONFIRMED signal (sweep-labels.js), the
 * invalidation line is the risk context, and the Data line is the freshness
 * marker compliance keys on. The CTA is a config template; {level1} is the
 * 🎯 level and {level2} the 🛑 level. When the report has only one level on
 * the relevant side the CTA becomes a single-level question instead.
 *
 * Fit ladder: drop the series line, then the plain-English line, then the
 * CTA, then the narrative, then the score, then every hashtag that is not
 * required.
 */
export function generateSweepPost(setup, model, config, { chart = null } = {}) {
  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const $ = v => fmtPrice(v, mo);
  const words = sweepLabels(setup);
  const { target, stop } = sweepLevels(setup);
  const tf = TIMEFRAME_WORD[model.timeframe] ?? model.timeframe ?? null;
  const stamp = formatDataTimestamp(model.dataAsOf);

  const price = `Current price: ${$(setup.price)}`;
  const ratio = config.charts?.volumeLine ? (chart?.volumeRatio ?? null) : null;
  const participation = participationLine(ratio);
  const rvol = ratio != null && !participation ? `RVOL ${ratio.toFixed(1)}×` : null;
  const score = setup.score != null ? `Setup score ${setup.score > 0 ? '+' : ''}${setup.score.toFixed(1)}` : null;

  let cta = null;
  const tpl = config.cta?.enabled ? (config.cta.text ?? '').trim() : '';
  if (tpl) {
    if (target && stop) cta = tpl.replace('{level1}', $(target.value)).replace('{level2}', $(stop.value));
    else if (stop) cta = `Does ${$(stop.value)} hold? 👇`;
    else if (target) cta = `Does ${$(target.value)} give way? 👇`;
  }

  const h = config.hashtags ?? {};
  const tags = setupTags(setup.symbol, config);
  const reqKeys = new Set((h.required ?? []).map(x => x.toLowerCase()));
  // Required tags and a configured tag line are fixed; only the legacy #SYM / asset extras may be trimmed.
  const fixedTag = t => reqKeys.has(t.toLowerCase()) || !!h.tagLine?.length;
  const required = tags.filter(fixedTag);
  const optional = tags.filter(t => !fixedTag(t));

  const parts = {
    headline: `${words.icon} $${setup.symbol} ${words.headline}`,
    narrative: `CMF ${fmtCmf(setup.cmf)} ${cmfPhrase(setup.cmf)} while ${rsiPhrase(setup.rsi, setup.direction)}.`,
    participation,
    plain: config.plainLanguage === false ? null : plainLine(setup),
    series: (config.brand?.seriesLine ?? '').trim() || null,
    target: target ? `🎯 ${target.side} ${$(target.value)} → ${target.outcome}` : null,
    stop: stop ? `🛑 ${stop.side} ${$(stop.value)} → ${stop.outcome}` : null,
    stats: [price, rvol, score].filter(Boolean).join(' · '),
    statsNoScore: [price, rvol].filter(Boolean).join(' · '),
    // Once the narrative is dropped to fit, the stats line carries RSI and CMF
    // so the required indicators survive on a 280-character account.
    statsCompact: [`Price: ${$(setup.price)}`, setup.rsi != null ? `RSI ${setup.rsi.toFixed(0)}` : null, setup.cmf != null ? `CMF ${fmtCmf(setup.cmf)}` : null, rvol].filter(Boolean).join(' · '),
    cta,
    timestamp: tf ? `Data: ${tf} · ${stamp}` : `Data: ${stamp}`,
    timestampShort: (tf ? `Data: ${tf} · ${stamp}` : `Data: ${stamp}`).replace(/ \d{1,2}:\d{2} [AP]M ET$/, ''),
    disclosure: config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    requiredHashtags: required,
    engagementHashtags: optional,
    labels: words,
  };

  const assemble = ({ withSeries = true, withPlain = true, withCta = true, narrative = true, withScore = true, withParticipation = true, shortStamp = false, withTarget = true, extraCount = optional.length } = {}) => {
    const tags = [...required, ...optional.slice(0, extraCount)];
    return [
      parts.headline,
      narrative ? parts.narrative : null,
      withParticipation ? parts.participation : null,
      withPlain ? parts.plain : null,
      withTarget ? parts.target : null,
      parts.stop,
      narrative ? (withScore ? parts.stats : parts.statsNoScore) : parts.statsCompact,
      withCta ? parts.cta : null,
      withSeries ? parts.series : null,
      shortStamp ? parts.timestampShort : parts.timestamp,
      parts.disclosure,
      tags.length ? tags.join(' ') : null,
    ].filter(Boolean).join('\n');
  };

  const trimmed = { withSeries: false, withPlain: false };
  const bare = { ...trimmed, withCta: false, narrative: false, withScore: false };
  const ladder = [{}, { withSeries: false }, trimmed, { ...trimmed, withCta: false }, { ...trimmed, withCta: false, narrative: false }, bare];
  // 280-character accounts: the low-participation line goes (the compact stats
  // line then cites no volume, and the card still shows the RVOL warning), then
  // the clock time, then — only when the 🛑 line still names a level — the 🎯 line.
  let tight = { ...bare, withParticipation: false };
  ladder.push(tight, (tight = { ...tight, shortStamp: true }));
  if (parts.stop) ladder.push((tight = { ...tight, withTarget: false }));
  for (let n = optional.length - 1; n >= 0; n--) ladder.push({ ...tight, extraCount: n });

  let text = assemble();
  for (const step of ladder) {
    text = assemble(step);
    if (xWeightedLength(text) <= config.charLimit) break;
  }
  return { text, length: xWeightedLength(text), parts };
}

export function generateClassicPost(setup, model, config, { chart = null } = {}) {
  const labels = config.signalLabels;
  const tf = TIMEFRAME_WORD[model.timeframe] ?? model.timeframe ?? null;
  const stamp = formatDataTimestamp(model.dataAsOf);
  const required = config.hashtags?.required ?? [];
  const maxTotal = config.hashtags?.maxTotal ?? 6;
  const extras = engagementHashtags(setup, config).slice(0, Math.max(0, maxTotal - required.length));
  const cta = config.cta?.enabled && config.cta.text?.trim() ? config.cta.text.trim() : null;

  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const parts = {
    headline: headline(setup, labels),
    indicators: `Price: ${money(setup.price, mo)} · RSI: ${setup.rsi.toFixed(0)} · CMF: ${fmtCmf(setup.cmf)}${cmfDeltaNote(setup)}`,
    indicatorsNoDelta: `Price: ${money(setup.price, mo)} · RSI: ${setup.rsi.toFixed(0)} · CMF: ${fmtCmf(setup.cmf)}`,
    levels: levelsLine(setup, mo),
    levelToWatch: levelToWatchLine(setup, mo),
    invalidation: invalidationLine(setup, mo),
    invalidationShort: invalidationShort(setup, mo),
    volume: volumeLine(chart, config),
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
      narrative ? parts.volume : null,
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

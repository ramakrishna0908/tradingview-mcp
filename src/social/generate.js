/**
 * Deterministic X post generator.
 *
 * Templates are intentionally plain: numbers come straight from the report
 * row, the risk sentence comes from the setup classifier, and the disclosure
 * is appended from config. No forward-looking language, no projections.
 *
 * Layout (each line is one fact group):
 *   👀 $XYZ Breakout watch                     ← setup + signal label
 *   Price: $120.40 · RSI: 64 · CMF: +0.19      ← never selectively omitted
 *   Support: $115.00 · Resistance: $123.50
 *   <rationale>                                 ← only if it fits the limit
 *   Risk: <downside / invalidation>             ← always present
 *   Data: daily · Sep 6, 2026 9:30 AM ET        ← report timestamp
 *   <configured disclosure>                     ← always last
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
  return `${icon} $${setup.symbol} ${name}`;
}

function levelsLine(setup) {
  const bits = [];
  if (setup.support) bits.push(`Support: ${money(setup.support.value)}`);
  if (setup.resistance) bits.push(`Resistance: ${money(setup.resistance.value)}`);
  return bits.join(' · ');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Compose the post. Returns { text, length, parts }.
 *
 * Fit ladder when the configured limit is exceeded: drop the rationale, then
 * the timeframe word in the Data line. Price/RSI/CMF, levels, the risk line,
 * the timestamp and the disclosure are never dropped — if it still does not
 * fit, validation reports `char_limit` and a human edits.
 */
export function generatePost(setup, model, config) {
  const labels = config.signalLabels;
  const tf = TIMEFRAME_WORD[model.timeframe] ?? model.timeframe ?? null;
  const stamp = formatDataTimestamp(model.dataAsOf);
  const parts = {
    headline: headline(setup, labels),
    indicators: `Price: ${money(setup.price)} · RSI: ${setup.rsi.toFixed(0)} · CMF: ${fmtCmf(setup.cmf)}`,
    levels: levelsLine(setup),
    rationale: setup.rationale,
    risk: `Risk: ${capitalize(setup.risk)}`,
    timestamp: tf ? `Data: ${tf} · ${stamp}` : `Data: ${stamp}`,
    timestampShort: `Data: ${stamp}`,
    disclosure: config.disclosure.trim(),
  };

  const assemble = ({ rationale = true, tfWord = true } = {}) =>
    [
      parts.headline,
      parts.indicators,
      parts.levels,
      rationale ? parts.rationale : null,
      parts.risk,
      tfWord ? parts.timestamp : parts.timestampShort,
      parts.disclosure,
    ].filter(Boolean).join('\n');

  const ladder = [{}, { rationale: false }, { rationale: false, tfWord: false }];
  let text = assemble();
  for (const step of ladder) {
    text = assemble(step);
    if (xWeightedLength(text) <= config.charLimit) break;
  }
  return { text, length: xWeightedLength(text), parts };
}

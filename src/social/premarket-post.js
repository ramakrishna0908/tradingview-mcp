/**
 * The X post built from the Daily Premarket Market Direction Report.
 *
 * Layout (every line comes from the report model, nothing is typed by hand):
 *   hook + bias + confidence · top 3 drivers · SPY levels · sectors ·
 *   the one event that could flip the read · CTA · short disclaimer ·
 *   Data line · 0–2 hashtags
 *
 * Compliance re-checks the finished text against the same report (kind
 * 'premarket'): the bias word and confidence must match, the level numbers
 * must be the report's, and the short disclaimer must be present.
 */
import { formatDataTimestamp } from './generate.js';
import { fmtPct } from '../premarket/bias.js';

export const PREMARKET_DISCLAIMER = 'Educational market analysis only. Not investment advice.';
export const ICON = Object.freeze({ Bullish: '🟢', Bearish: '🔴', Neutral: '🟡' });
const COLOR = Object.freeze({ Bullish: 'green', Bearish: 'red', Neutral: 'amber' });
const SHORT = { Technology: 'Tech', Communication: 'Comms', 'Consumer Discretionary': 'Cons. Disc.', Semiconductors: 'Semis' };

/** "Tue Sep 8" for a YYYY-MM-DD. */
export function shortSession(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`)).replace(',', '');
}

/** "Tue Sep 8, 2026" */
export function longSession(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
}

const sectorNames = xs => xs.map(s => SHORT[s.name] ?? s.name).join(', ');

/** One data-driven sentence: what the overnight tape looks like, no forecast. */
export function hookLine(report) {
  const es = report.snapshot?.es;
  const vix = report.snapshot?.vix;
  const trend = report.components?.find(c => c.key === 'trend');
  const fut = es ? (es.changePct > 0.2 ? 'Futures green' : es.changePct < -0.2 ? 'Futures red' : 'Futures flat') : 'Futures quiet';
  const v = vix ? (vix.price < 18 ? (vix.changePct > 5 ? 'VIX perking up' : 'VIX calm') : vix.price < 25 ? 'VIX elevated' : 'VIX in stress mode') : null;
  const tr = trend ? (trend.score > 0 ? 'uptrend intact' : trend.score < 0 ? 'trend broken' : 'trend mixed') : null;
  const tail = { Bullish: 'the bulls have the ball into the open.', Bearish: 'risk is on the back foot into the open.', Neutral: 'the tape is waiting for a catalyst.' }[report.bias];
  return `${[fut, v, tr].filter(Boolean).join(', ')} — ${tail}`;
}

/**
 * The single event most able to change the read: a high-impact release
 * (earliest first), then a Fed event, then a high-impact headline, then a
 * medium release, then the biggest earnings report. When nothing on the day
 * qualifies, the next high-impact release later in the week is named instead.
 */
export function flipEvent(report) {
  const ev = report.events ?? [];
  const byTime = xs => [...xs].sort((a, b) => (a.at ?? 'z').localeCompare(b.at ?? 'z'));
  // Earnings count only when they can move the index: a mega-cap, or a
  // large cap reporting before the open. A mid-cap after the close cannot
  // flip the session's read, so the week's next high-impact release wins.
  const pick = byTime(ev.filter(e => e.type === 'economic' && e.impact === 'High'))[0]
    ?? byTime(ev.filter(e => e.kind === 'fed'))[0]
    ?? ev.find(e => e.type === 'news' && e.impact === 'High')
    ?? byTime(ev.filter(e => e.type === 'economic' && e.impact === 'Medium'))[0]
    ?? ev.find(e => e.type === 'earnings' && (e.impact === 'High' || (e.impact === 'Medium' && e.session === 'BMO')));
  if (pick) return { today: true, title: pick.title.replace(/ — .*$/, ''), when: pick.time, text: pick.flipShort ?? 'only an outsized surprise versus expectations changes the read' };
  const next = (report.laterWeek ?? [])[0];
  if (next) return { today: false, title: next.title, when: `${shortSession(next.date).replace(/ .*$/, '')} ${next.time}`, text: next.flipShort ?? 'only an outsized surprise versus expectations changes the read' };
  return null;
}

/** The two SPY numbers the post quotes, as strings, plus the sentence that names the downside. */
export function levelsLine(report) {
  const l = report.levels?.spy;
  const r = l?.resistance?.[0], s = l?.support?.[0];
  if (!r || !s) return null;
  const R = r.value.toFixed(2), S = s.value.toFixed(2);
  const hold = report.bias === 'Bullish' ? `Losing ${S} negates the bullish read.`
    : report.bias === 'Bearish' ? `Reclaiming ${R} negates the bearish read.`
    : `A close beyond either side sets the direction; losing ${S} negates the hold.`;
  return { text: `SPY levels: ${R} above (${r.label.toLowerCase()}) · ${S} below (${s.label.toLowerCase()}). ${hold}`, numbers: [R, S] };
}

const arrow = d => (d.direction === 'supportive' ? '▲' : d.direction === 'headwind' ? '▼' : '•');

export function generatePremarketPost(report, config) {
  const pm = config.premarket ?? {};
  const tags = (pm.hashtags ?? []).slice(0, Math.min(2, config.hashtags?.maxTotal ?? 2));
  const drivers = (report.drivers ?? []).slice(0, 3);
  const lv = levelsLine(report);
  const fe = flipEvent(report);
  const lines = [
    `${ICON[report.bias]} Premarket read for ${shortSession(report.sessionDate)} — ${report.bias.toUpperCase()} (confidence ${report.confidence}/100)`,
    hookLine(report),
    'Top drivers:',
    ...drivers.map(d => `${arrow(d)} ${d.text}`),
    lv?.text ?? null,
    `Sectors: strongest ${sectorNames(report.sectors?.strength ?? []) || '—'} · weakest ${sectorNames(report.sectors?.weakness ?? []) || '—'}`,
    fe ? (fe.today ? `Flip event: ${fe.when} ${fe.title} — ${fe.text}.` : `Flip event: nothing high-impact on today's calendar — ${fe.title} (${fe.when}) is the first release that can move the read: ${fe.text}.`) : 'Flip event: no high-impact release on the calendar — headlines and the open itself set the tone.',
    'Bullish or bearish today? 👇',
    PREMARKET_DISCLAIMER,
    `Data: ${formatDataTimestamp(report.dataAsOf ?? report.generatedAt)}`,
    tags.length ? tags.join(' ') : null,
  ].filter(Boolean);
  return { text: lines.join('\n'), lines, levels: lv?.numbers ?? [] };
}

/** Spec for the premarket card (scripts/render-chart-sweep.py, style "premarket"). */
export function buildPremarketSpec(report, config, outPath) {
  const q = report.snapshot ?? {};
  const tile = (key, label, fmtValue) => {
    const x = q[key];
    if (!x) return { label, value: '—', sub: '', color: 'blue' };
    return { label, value: fmtValue(x), sub: x.unit === 'pct' ? `${(x.change ?? 0) * 100 >= 0 ? '+' : ''}${((x.change ?? 0) * 100).toFixed(1)} bp` : fmtPct(x.changePct), color: (x.change ?? 0) > 0 ? 'green' : (x.change ?? 0) < 0 ? 'red' : 'blue' };
  };
  const lv = report.levels?.spy;
  const fe = flipEvent(report);
  return {
    style: 'premarket',
    out: outPath,
    width: config.charts?.width ?? 1200,
    height: config.charts?.height ?? 1000,
    brand: config.brand?.name || null,
    tagline: config.brand?.tagline || null,
    title: 'PREMARKET MARKET DIRECTION',
    session: longSession(report.sessionDate),
    bias: report.bias.toUpperCase(),
    biasColor: COLOR[report.bias],
    confidence: report.confidence,
    hook: hookLine(report),
    tiles: [
      tile('es', 'S&P 500 futures', x => (x.price >= 1000 ? x.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : x.price.toFixed(2))),
      tile('vix', 'VIX', x => x.price.toFixed(2)),
      tile('us10y', '10-year yield', x => `${x.price.toFixed(2)}%`),
      tile('wti', 'WTI crude', x => `$${x.price.toFixed(2)}`),
    ], // every tile colours by the sign of its own change: up green, down red (standard market convention, same as the HTML report)
    drivers: (report.drivers ?? []).slice(0, 3).map(d => ({ text: d.text, color: d.direction === 'supportive' ? 'green' : d.direction === 'headwind' ? 'red' : 'blue', direction: d.direction })),
    levels: lv ? { label: 'SPY', above: lv.resistance[0] ? `${lv.resistance[0].value.toFixed(2)}  ·  ${lv.resistance[0].label}` : '—', below: lv.support[0] ? `${lv.support[0].value.toFixed(2)}  ·  ${lv.support[0].label}` : '—' } : null,
    sectors: { strong: (report.sectors?.strength ?? []).map(s => s.name), weak: (report.sectors?.weakness ?? []).map(s => s.name) },
    event: fe ? { title: fe.title, when: fe.when, text: fe.text, today: fe.today } : null,
    holiday: report.holiday?.name ?? null,
    footer: `Data: ${formatDataTimestamp(report.dataAsOf ?? report.generatedAt)} · futures, VIX, yields, dollar, crude, sector ETFs, U.S. calendar`,
    source: 'Bias = weighted read of nine overnight inputs; confidence = how much they agree, not a probability.',
    disclosure: config.disclosure.trim(),
  };
}

export function premarketAltText(report, config) {
  const lv = levelsLine(report);
  const fe = flipEvent(report);
  const bits = [`Premarket market direction for ${longSession(report.sessionDate)}: ${report.bias}, confidence ${report.confidence} out of 100.`, hookLine(report)];
  for (const d of (report.drivers ?? []).slice(0, 3)) bits.push(`${d.direction === 'supportive' ? 'Supportive' : d.direction === 'headwind' ? 'Headwind' : 'Neutral'}: ${d.text}.`);
  if (lv) bits.push(lv.text);
  bits.push(`Strongest sectors ${sectorNames(report.sectors?.strength ?? [])}; weakest ${sectorNames(report.sectors?.weakness ?? [])}.`);
  if (fe) bits.push(`Flip event: ${fe.when} ${fe.title} — ${fe.text}.`);
  bits.push(config.disclosure.trim());
  return bits.join(' ').slice(0, 1000);
}

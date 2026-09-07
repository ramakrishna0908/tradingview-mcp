/**
 * Daily Premarket Market Direction Report.
 *
 *   buildReport(opts)  → the report model (pure, given the fetched inputs)
 *   runReport(opts)    → fetch inputs, build, write JSON + Markdown + HTML
 *
 * The report is educational market analysis: it says what the overnight
 * inputs read as, how much they agree, and which scheduled outcome could
 * change that read. It never says what to buy.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUMENTS, allInstruments, fetchAllQuotes, etDate, etStamp } from './data.js';
import { fetchCalendar, fetchEarnings, selectEvents, laterThisWeek, isHoliday, selectEarnings, earningsAsEvents, newsAsEvents, nextSession } from './calendar.js';
import { scoreBias, rankSectors, keyLevels, watchList } from './bias.js';
import { renderMarkdown, renderHtml } from './render.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DEFAULT_OUT_DIR = join(ROOT, 'docs', 'reports', 'premarket');
export const DISCLAIMER = 'Educational market analysis only. Not investment advice. Trading involves risk.';

/** Watchlist names whose earnings are always surfaced (mirrors the daily sweep). */
export const WATCHLIST = ['QQQ', 'IWM', 'SMH', 'SNDK', 'AMD', 'GOOGL', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'HOOD', 'MSTR', 'NFLX', 'PLTR', 'COIN', 'MRVL', 'CRWV', 'BMNR', 'ORCL', 'BABA', 'DELL', 'LUNR', 'MU', 'ARM', 'INTC', 'NBIS', 'AVGO', 'UNH', 'HIMS', 'SNOW', 'ACN', 'LLY', 'ISRG', 'CRCL', 'SOFI', 'MCD', 'SOUN', 'APLD', 'IREN', 'LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'TDG', 'HII', 'LDOS', 'AXON'];

function loadHolidays() {
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'social-compliance.json'), 'utf8'));
    return Array.isArray(cfg.marketHolidays) ? cfg.marketHolidays : [];
  } catch { return []; }
}

/**
 * Assemble the report from already-fetched inputs.
 *
 * @param {object} o
 * @param {string} o.date            YYYY-MM-DD (New York) the report is generated on
 * @param {object} o.quotes          key → quote (see data.js)
 * @param {object} [o.quoteErrors]   key → error message for instruments that failed
 * @param {Array}  [o.calendar]      ForexFactory rows
 * @param {Array}  [o.earningsRows]  Nasdaq earnings rows for the session
 * @param {Array}  [o.news]          items from the morning task
 * @param {string[]} [o.holidays]    NYSE closures
 * @param {Date}   [o.now]
 */
export function buildReport({ date, quotes, quoteErrors = {}, calendar = [], earningsRows = [], news = [], holidays = [], now = new Date(), sources = {} }) {
  const holidayToday = holidays.includes(date) || isHoliday(calendar, date);
  const sessionDate = holidayToday ? nextSession(date, holidays) : date;
  const holidayName = holidayToday ? (calendar.find(r => r.country === 'USD' && /holiday/i.test(r.title ?? '') && etDate(new Date(r.date)) === date)?.title ?? 'Market holiday') : null;

  const sectors = rankSectors(quotes, INSTRUMENTS.sectors);
  const economic = selectEvents(calendar, sessionDate);
  const earnings = selectEarnings(earningsRows, { watchlist: WATCHLIST });
  const events = [...economic, ...earningsAsEvents(earnings, sessionDate), ...newsAsEvents(news, sessionDate)];
  const laterWeek = laterThisWeek(calendar, sessionDate);
  const missing = Object.keys(quoteErrors);
  const score = scoreBias(quotes, { sectors, events, holiday: holidayToday, missing });

  const levels = {};
  for (const key of ['spy', 'qqq', 'es', 'nq']) if (quotes[key]) levels[key] = keyLevels(quotes[key]);

  const strength = sectors.slice(0, 3);
  const weakness = sectors.slice(-3).reverse();
  const watch = watchList({ bias: score.bias, quotes, levels, sectors, events, laterWeek });

  const asOfTimes = Object.values(quotes).map(q => q.asOf).filter(Boolean).sort();
  const snapshot = Object.fromEntries(Object.entries(quotes).map(([k, q]) => [k, { symbol: q.symbol, name: q.name, group: q.group, unit: q.unit, price: q.price, prevClose: q.prevClose, change: q.change, changePct: q.changePct, asOf: q.asOf }]));

  return {
    reportVersion: 1,
    kind: 'premarket',
    date,
    sessionDate,
    holiday: holidayToday ? { name: holidayName, note: `U.S. markets are closed today (${holidayName}). This read is for the next session, ${sessionDate}, using the overnight futures and the last completed cash session.` } : null,
    generatedAt: now.toISOString(),
    generatedAtEt: etStamp(now),
    dataAsOf: asOfTimes.at(-1) ?? null,
    dataAsOfEt: asOfTimes.length ? etStamp(new Date(asOfTimes.at(-1))) : null,
    bias: score.bias,
    confidence: score.confidence,
    composite: score.composite,
    agreement: score.agreement,
    drivers: score.drivers,
    components: score.components,
    penalties: score.penalties,
    snapshot,
    sectors: { ranked: sectors, strength, weakness },
    levels,
    events,
    laterWeek,
    earnings,
    watch,
    missing: quoteErrors,
    sources: { quotes: 'Yahoo Finance chart API', calendar: 'ForexFactory weekly calendar', earnings: 'Nasdaq earnings calendar', news: news.length ? (sources.news ?? 'morning task (web)') : 'none supplied', ...sources },
    methodology: 'Composite = weighted mean of nine −1…+1 inputs (S&P futures ×3, futures breadth ×1, VIX ×2, 10-year move ×1.5, dollar ×1, crude ×1, SPY trend ×2, sector breadth ×1, bitcoin ×0.5). Bullish ≥ +0.15, Bearish ≤ −0.15, otherwise Neutral. Confidence = 20 + 40×magnitude + 40×agreement, minus penalties for pre-open high-impact releases, Fed days, VIX ≥ 25, holiday sessions and missing inputs. Confidence measures how much the inputs agree — it is not a probability.',
    disclaimer: DISCLAIMER,
  };
}

/** Fetch everything, build, and write the three files. Returns { report, paths }. */
export async function runReport({ date = etDate(), outDir = DEFAULT_OUT_DIR, news = [], newsSource = null, fetchImpl = fetch, now = new Date(), write = true, log = () => {} } = {}) {
  const holidays = loadHolidays();
  log(`fetching ${allInstruments().length} quotes…`);
  const [{ quotes, errors }, calendarRes, ] = await Promise.all([
    fetchAllQuotes({ fetchImpl }),
    fetchCalendar({ fetchImpl }).then(v => ({ ok: true, v })).catch(e => ({ ok: false, e })),
  ]);
  const calendar = calendarRes.ok ? calendarRes.v : [];
  if (!calendarRes.ok) log(`calendar unavailable: ${calendarRes.e.message}`);
  const holidayToday = holidays.includes(date) || isHoliday(calendar, date);
  const sessionDate = holidayToday ? nextSession(date, holidays) : date;
  let earningsRows = [];
  try { earningsRows = await fetchEarnings(sessionDate, { fetchImpl }); }
  catch (e) { log(`earnings unavailable: ${e.message}`); }

  const report = buildReport({ date, quotes, quoteErrors: errors, calendar, earningsRows, news, holidays, now, sources: { ...(calendarRes.ok ? {} : { calendar: 'unavailable this run' }), ...(newsSource ? { news: newsSource } : {}) } });
  if (!calendarRes.ok) report.sources.calendar = 'ForexFactory weekly calendar — unavailable this run';
  if (!earningsRows.length) report.sources.earnings = 'Nasdaq earnings calendar — no rows returned';

  const paths = writePaths(outDir, date);
  if (write) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(paths.json, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(paths.md, renderMarkdown(report));
    writeFileSync(paths.html, renderHtml(report));
  }
  return { report, paths };
}

export function writePaths(outDir, date) {
  const base = join(outDir, `premarket-${date}`);
  return { json: `${base}.json`, md: `${base}.md`, html: `${base}.html` };
}

/** Re-render an existing day's JSON (used after the task supplies news). */
export function loadReport(outDir, date) {
  const p = writePaths(outDir, date).json;
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** One-paragraph summary for logs and the task's hand-off. */
export function summarize(report) {
  const d = report.drivers.slice(0, 3).map(x => x.text).join('; ');
  const ev = report.events.filter(e => e.impact === 'High').slice(0, 3).map(e => `${e.title} (${e.time})`).join('; ');
  return `${report.holiday ? `[${report.holiday.name} — read for ${report.sessionDate}] ` : ''}${report.bias} · confidence ${report.confidence}/100. Drivers: ${d || 'none'}. High-impact today: ${ev || 'none'}. Strength: ${report.sectors.strength.map(s => s.name).join(', ') || '—'}; weakness: ${report.sectors.weakness.map(s => s.name).join(', ') || '—'}.`;
}

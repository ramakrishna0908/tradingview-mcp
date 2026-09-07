/**
 * Market-moving events for the session: the U.S. economic calendar plus the
 * day's notable earnings, each annotated with the reading the report gives
 * it — expected impact and which outcome would flip the bias.
 *
 * Economic calendar: ForexFactory's public weekly JSON feed (no key). Only
 * USD events matter here; low-impact rows are kept only when they are the
 * kind that moves rates or oil (auctions, Fed speakers, EIA inventories …).
 *
 * Earnings: Nasdaq's public earnings-calendar endpoint, filtered to the
 * large caps that can move an index or a sector, plus any watchlist names.
 */
import { etDate, etTime } from './data.js';

export const FF_CALENDAR = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const NASDAQ_EARNINGS = 'https://api.nasdaq.com/api/calendar/earnings';

const UA = 'Mozilla/5.0 (Macintosh; tradingview-mcp premarket)';

// ─── economic events ─────────────────────────────────────────────────────────

/**
 * How the report reads each kind of release. `flip` says which outcome would
 * push the bias the other way; the wording is deliberately conditional and
 * educational — it describes the usual market reaction, not a prediction.
 */
export const EVENT_READINGS = [
  { re: /holiday/i, kind: 'holiday', expected: 'U.S. markets closed', flip: null },
  { re: /\bFOMC\b.*(statement|rate|press)|federal funds rate|fomc press conference/i, kind: 'fed', impact: 'High', flipShort: 'a hawkish surprise lifts yields and pressures stocks; a dovish one does the reverse',
    expected: 'The Fed decision and press conference set the rate path — the biggest scheduled catalyst of any week it lands in',
    flip: 'A hawkish surprise (fewer cuts, higher dots, sticky-inflation language) usually lifts yields and the dollar and pressures equities; a dovish surprise does the reverse' },
  { re: /fomc|fed chair|speaks|monetary policy report|fed .*minutes/i, kind: 'fed', flipShort: 'hawkish tone weighs on risk; dovish tone supports it', expected: 'Fed communication — markets reprice the cut path on tone',
    flip: 'Hawkish tone (patience on cuts, inflation concern) weighs on risk; dovish tone (readiness to ease) supports it' },
  { re: /\bCPI\b|\bPPI\b|\bPCE\b|inflation expectations/i, kind: 'inflation', flipShort: 'hotter than expected → yields up, stocks pressured; cooler → relief', expected: 'Inflation print — the number the rate path is built on',
    flip: 'Hotter than forecast → yields and the dollar up, equities pressured (leans bearish); cooler than forecast → rates relief, growth and small caps bid (leans bullish)' },
  { re: /non-farm|nonfarm|unemployment rate|average hourly|jolts|adp|unemployment claims|jobless claims|employment change/i, kind: 'labor', flipShort: 'much stronger → yields up, cuts priced out; much weaker → growth scare', expected: 'Labor-market read — growth versus the Fed\'s room to cut',
    flip: 'Much stronger than forecast → yields up and cuts priced out (can weigh on rate-sensitive names); much weaker → growth scare unless it reads as "the Fed can ease"' },
  { re: /\bGDP\b/i, kind: 'growth', flipShort: 'a sharp miss revives recession worries; a beat with tame inflation supports risk', expected: 'Growth print — confirms or challenges the soft-landing read',
    flip: 'A sharp miss revives recession worries (bearish); a beat with contained inflation supports risk (bullish)' },
  { re: /retail sales/i, kind: 'consumer', flipShort: 'a clear miss weighs on consumer names; a beat supports cyclicals', expected: 'Consumer-spending read — drives discretionary and the growth narrative',
    flip: 'A clear miss weighs on consumer names and growth (bearish); a beat supports cyclicals (bullish) unless it pushes yields sharply higher' },
  { re: /\bISM\b|\bPMI\b|philly fed|empire state|richmond|chicago pmi/i, kind: 'activity', flipShort: 'below 50 with rising prices paid is the worst mix; above 50 with easing prices the best', expected: 'Activity survey — new orders and the prices-paid sub-index are what move markets',
    flip: 'Below 50 with rising prices paid is the worst mix (bearish); above 50 with easing prices paid is the best (bullish)' },
  { re: /bond auction|note auction|bill auction/i, kind: 'auction', flipShort: 'weak demand pushes yields up and pressures stocks; strong demand does the opposite', expected: 'Treasury auction — a demand test for duration; the reaction is in the 10-year yield after 1:00 PM ET',
    flip: 'A weak auction (tail above the when-issued yield, soft bid-to-cover) pushes yields up and pressures equities; strong demand does the opposite' },
  { re: /crude oil inventories|natural gas storage|api weekly/i, kind: 'energy', flipShort: 'a large draw lifts crude (rates headwind); a large build is relief', expected: 'Energy inventories — moves crude, and crude is a headline driver of the inflation and geopolitical read',
    flip: 'A large draw lifts crude (inflation/rates headwind, energy bid); a large build weighs on crude (relief for the broader tape)' },
  { re: /consumer sentiment|consumer confidence/i, kind: 'sentiment', flipShort: 'rising inflation expectations lean hawkish; falling ones lean supportive', expected: 'Sentiment survey — the inflation-expectations line matters more than the headline',
    flip: 'Rising inflation expectations lean hawkish (bearish); falling expectations with steady confidence lean bullish' },
  { re: /housing|home sales|building permits|housing starts/i, kind: 'housing', expected: 'Housing data — rate-sensitive, second-order for the index', flip: 'Only a large surprise matters for the index; watch homebuilders and the 10-year' },
  { re: /trade balance|current account/i, kind: 'trade', expected: 'Trade data — minor for the index', flip: 'Rarely moves the bias on its own' },
];

/** Low-impact calendar rows kept because they still move rates or oil. */
const KEEP_LOW = /auction|fomc|fed|speaks|crude oil inventories|gdp|retail sales|\bism\b|\bpmi\b|sentiment|monetary policy|minutes/i;

export function readEvent(title) {
  const r = EVENT_READINGS.find(x => x.re.test(title));
  return r ?? { kind: 'other', expected: 'Scheduled release — a large surprise versus forecast can move rates first, equities second', flip: 'Only an outsized miss or beat versus forecast would change the read', flipShort: 'only an outsized surprise versus expectations changes the read' };
}

/** Normalise one ForexFactory row into the report's event shape. */
export function normalizeFfEvent(row) {
  const reading = readEvent(row.title);
  const at = row.date ? new Date(row.date) : null;
  return {
    type: reading.kind === 'holiday' ? 'holiday' : 'economic',
    kind: reading.kind,
    title: row.title,
    at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
    date: at && !Number.isNaN(at.getTime()) ? etDate(at) : null,
    time: at && !Number.isNaN(at.getTime()) ? etTime(at) : 'time TBA',
    impact: reading.impact ?? row.impact ?? 'Low',
    forecast: row.forecast || null,
    previous: row.previous || null,
    expected: reading.expected,
    flip: reading.flip,
    flipShort: reading.flipShort ?? 'only an outsized surprise versus expectations changes the read',
  };
}

/**
 * The USD events on `date`, deduplicated and ordered by time. Low-impact
 * rows survive only when they match KEEP_LOW.
 */
export function selectEvents(feed, date, { country = 'USD' } = {}) {
  const rows = (feed ?? []).filter(r => r.country === country).map(normalizeFfEvent).filter(e => e.date === date);
  const seen = new Set();
  const out = [];
  for (const e of rows) {
    const key = `${e.title}|${e.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.impact === 'Low' && !KEEP_LOW.test(e.title)) continue;
    out.push(e);
  }
  return out.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
}

/** High-impact USD events later in the same week (context for the "what to watch" list). */
export function laterThisWeek(feed, date, { country = 'USD' } = {}) {
  return (feed ?? []).filter(r => r.country === country).map(normalizeFfEvent)
    .filter(e => e.date && e.date > date && e.impact === 'High')
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function isHoliday(feed, date, { country = 'USD' } = {}) {
  return (feed ?? []).some(r => r.country === country && /holiday/i.test(r.title ?? '') && r.date && etDate(new Date(r.date)) === date);
}

export async function fetchCalendar({ fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(FF_CALENDAR, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error('unexpected calendar payload');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ─── earnings ────────────────────────────────────────────────────────────────

export function parseMarketCap(s) {
  const n = Number(String(s ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const SESSION = { 'time-pre-market': 'BMO', 'time-after-hours': 'AMC', 'time-not-supplied': 'TBA' };

/**
 * Notable earnings for the day: everything at or above `minCapB` billions
 * of market cap plus any `watchlist` name, largest first, capped at `limit`.
 */
export function selectEarnings(rows, { minCapB = 5, watchlist = [], limit = 12 } = {}) {
  const watch = new Set(watchlist.map(s => s.toUpperCase()));
  const out = (rows ?? []).map(r => ({
    symbol: String(r.symbol ?? '').toUpperCase(),
    name: r.name ?? null,
    session: SESSION[r.time] ?? 'TBA',
    marketCapB: Number((parseMarketCap(r.marketCap) / 1e9).toFixed(1)),
    epsForecast: r.epsForecast || null,
    watchlist: watch.has(String(r.symbol ?? '').toUpperCase()),
  })).filter(e => e.symbol && (e.marketCapB >= minCapB || e.watchlist));
  out.sort((a, b) => (b.watchlist - a.watchlist) || (b.marketCapB - a.marketCapB));
  return out.slice(0, limit);
}

/** Earnings rows rendered as events, so they sit in the same timeline as the data. */
export function earningsAsEvents(earnings, date) {
  return earnings.map(e => ({
    type: 'earnings',
    kind: 'earnings',
    title: `${e.symbol} earnings (${e.session})${e.name ? ` — ${e.name}` : ''}`,
    at: null,
    date,
    time: e.session === 'BMO' ? 'before the open' : e.session === 'AMC' ? 'after the close' : 'time TBA',
    impact: e.marketCapB >= 100 ? 'High' : e.marketCapB >= 20 ? 'Medium' : 'Low',
    forecast: e.epsForecast ? `EPS est. ${e.epsForecast}` : null,
    previous: null,
    expected: e.marketCapB >= 100 ? `Mega-cap report — can move its sector and the index (market cap ≈ $${Math.round(e.marketCapB)}B)` : `Large-cap report — moves its sector and read-through names (market cap ≈ $${Math.round(e.marketCapB)}B)`,
    flip: 'A beat with raised guidance supports its sector; a miss or cut guidance drags peers — the reaction, not the headline number, is what matters',
    flipShort: 'a beat with raised guidance lifts its sector; a miss or cut guidance drags peers',
    symbol: e.symbol,
    session: e.session,
    watchlist: e.watchlist,
  }));
}

export async function fetchEarnings(date, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${NASDAQ_EARNINGS}?date=${date}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json?.data?.rows ?? [];
  } finally {
    clearTimeout(timer);
  }
}

// ─── news (supplied by the scheduled task, never fetched here) ───────────────

/**
 * Items the morning task collected from the wires. Shape:
 *   { headline, source?, impact?: High|Medium|Low, note?, flip?, time? }
 * They become events of type "news" so they render in the same list.
 */
export function newsAsEvents(items, date) {
  return (items ?? []).filter(n => n && n.headline).map(n => ({
    type: 'news',
    kind: 'news',
    title: String(n.headline),
    at: null,
    date,
    time: n.time ? String(n.time) : 'overnight',
    impact: ['High', 'Medium', 'Low'].includes(n.impact) ? n.impact : 'Medium',
    forecast: null,
    previous: null,
    expected: n.note ? String(n.note) : 'Headline risk — already partly in the overnight futures move',
    flip: n.flip ? String(n.flip) : 'Escalation or a reversal of this story would move futures before the open',
    flipShort: (n.flip ? String(n.flip) : 'escalation or a reversal of this story moves futures before the open').replace(/\bforecasts?\b/gi, 'expectations'),
    source: n.source ? String(n.source) : null,
  }));
}

/** Next weekday (Mon–Fri) after `date`, skipping listed holidays. */
export function nextSession(date, holidays = []) {
  const d = new Date(`${date}T12:00:00Z`);
  for (let i = 0; i < 10; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || holidays.includes(iso)) continue;
    return iso;
  }
  return date;
}

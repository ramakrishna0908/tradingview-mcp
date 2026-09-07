/**
 * Premarket market data — one quote + recent daily candles per instrument.
 *
 * Source: Yahoo Finance's public chart endpoint (no key), the same feed the
 * social charts use. Futures and FX quote nearly 24h so the "price" of ES=F
 * at 8 AM ET is the live overnight print; cash ETFs (SPY, XLK…) still show
 * the prior close, which is exactly what the level and trend maths want.
 *
 * Every fetcher takes `fetchImpl` so tests run on fixtures, never the network.
 */
import { parseYahooChart, YAHOO_CHART } from '../social/chart-data.js';

/** The instruments the report is built from, grouped by role. */
export const INSTRUMENTS = Object.freeze({
  futures: [
    { key: 'es', symbol: 'ES=F', name: 'S&P 500 futures' },
    { key: 'nq', symbol: 'NQ=F', name: 'Nasdaq 100 futures' },
    { key: 'ym', symbol: 'YM=F', name: 'Dow futures' },
    { key: 'rty', symbol: 'RTY=F', name: 'Russell 2000 futures' },
  ],
  macro: [
    { key: 'vix', symbol: '^VIX', name: 'VIX' },
    { key: 'us2y', symbol: '2YY=F', name: '2-year yield', unit: 'pct' },
    { key: 'us10y', symbol: '^TNX', name: '10-year yield', unit: 'pct' },
    { key: 'us30y', symbol: '^TYX', name: '30-year yield', unit: 'pct' },
    { key: 'dxy', symbol: 'DX-Y.NYB', name: 'U.S. Dollar Index' },
    { key: 'wti', symbol: 'CL=F', name: 'WTI crude' },
    { key: 'brent', symbol: 'BZ=F', name: 'Brent crude' },
    { key: 'gold', symbol: 'GC=F', name: 'Gold' },
    { key: 'btc', symbol: 'BTC-USD', name: 'Bitcoin' },
  ],
  indexEtfs: [
    { key: 'spy', symbol: 'SPY', name: 'S&P 500 (SPY)' },
    { key: 'qqq', symbol: 'QQQ', name: 'Nasdaq 100 (QQQ)' },
    { key: 'dia', symbol: 'DIA', name: 'Dow (DIA)' },
    { key: 'iwm', symbol: 'IWM', name: 'Russell 2000 (IWM)' },
  ],
  sectors: [
    { key: 'xlk', symbol: 'XLK', name: 'Technology' },
    { key: 'xlc', symbol: 'XLC', name: 'Communication' },
    { key: 'xly', symbol: 'XLY', name: 'Consumer Discretionary' },
    { key: 'xlf', symbol: 'XLF', name: 'Financials' },
    { key: 'xlv', symbol: 'XLV', name: 'Health Care' },
    { key: 'xli', symbol: 'XLI', name: 'Industrials' },
    { key: 'xle', symbol: 'XLE', name: 'Energy' },
    { key: 'xlp', symbol: 'XLP', name: 'Staples' },
    { key: 'xlu', symbol: 'XLU', name: 'Utilities' },
    { key: 'xlb', symbol: 'XLB', name: 'Materials' },
    { key: 'xlre', symbol: 'XLRE', name: 'Real Estate' },
    { key: 'smh', symbol: 'SMH', name: 'Semiconductors' },
  ],
});

export function allInstruments() {
  return Object.entries(INSTRUMENTS).flatMap(([group, list]) => list.map(i => ({ ...i, group })));
}

/** YYYY-MM-DD in New York for an instant. */
export function etDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "8:30 AM ET" for an instant. */
export function etTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(dt) + ' ET';
}

/** "Mon Sep 7, 2026 · 8:02 AM ET" */
export function etStamp(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(dt);
  return `${day} · ${etTime(dt)}`;
}

/**
 * Turn one Yahoo chart payload into the quote the report works with.
 *
 * `price` is Yahoo's regular-market price (live for futures/FX/crypto, the
 * last close for cash ETFs). `changePct` is Yahoo's change against the prior
 * settlement, which is the right reference for an overnight read; when Yahoo
 * gives no change the previous completed candle is used instead.
 * `candles` holds only completed sessions (bars dated before the quote's own
 * session), so moving averages and prior-day levels never include a partial bar.
 */
export function quoteFromChart(json, inst) {
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || 'no chart result');
  const m = r.meta ?? {};
  const price = Number(m.regularMarketPrice);
  if (!Number.isFinite(price)) throw new Error(`${inst.symbol}: no price`);
  const asOf = m.regularMarketTime ? new Date(m.regularMarketTime * 1000) : null;
  const session = asOf ? etDate(asOf) : null;
  const all = parseYahooChart(json);
  // A bar dated on the quote's own session is complete only once that
  // session has closed (4 PM New York). Cash ETFs quoted after the close keep
  // their last bar; futures, FX and crypto quoted at 8 AM drop the live one.
  const hourEt = asOf ? Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(asOf)) : 0;
  const candles = session ? all.filter(c => c.t < session || (c.t === session && hourEt >= 16)) : all.slice(0, -1);
  let changePct = Number(m.regularMarketChangePercent);
  let prevClose = null;
  if (Number.isFinite(changePct) && changePct !== 0) {
    prevClose = price / (1 + changePct / 100);
  } else if (candles.length) {
    prevClose = candles.at(-1).c;
    changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  } else {
    changePct = 0;
  }
  return {
    key: inst.key,
    symbol: inst.symbol,
    name: inst.name,
    group: inst.group ?? null,
    unit: inst.unit ?? 'price',
    price,
    prevClose: prevClose == null ? null : Number(prevClose.toFixed(4)),
    change: prevClose == null ? null : Number((price - prevClose).toFixed(4)),
    changePct: Number(changePct.toFixed(3)),
    dayHigh: Number.isFinite(m.regularMarketDayHigh) ? m.regularMarketDayHigh : null,
    dayLow: Number.isFinite(m.regularMarketDayLow) ? m.regularMarketDayLow : null,
    asOf: asOf ? asOf.toISOString() : null,
    session,
    candles,
  };
}

export async function fetchQuote(inst, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const url = `${YAHOO_CHART}${encodeURIComponent(inst.symbol)}?range=4mo&interval=1d`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (tradingview-mcp premarket)' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return quoteFromChart(await res.json(), inst);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch every instrument. A single failure never sinks the report: the
 * missing quote is recorded under `errors` and the scoring treats it as
 * "no signal". Requests run a few at a time to stay polite to the endpoint.
 */
export async function fetchAllQuotes({ fetchImpl = fetch, concurrency = 4, instruments = allInstruments() } = {}) {
  const quotes = {};
  const errors = {};
  let i = 0;
  const worker = async () => {
    while (i < instruments.length) {
      const inst = instruments[i++];
      try { quotes[inst.key] = await fetchQuote(inst, { fetchImpl }); }
      catch (err) { errors[inst.key] = `${inst.symbol}: ${err.message}`; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, instruments.length) }, worker));
  return { quotes, errors };
}

// ─── candle maths ────────────────────────────────────────────────────────────

export function sma(candles, n) {
  if (!candles || candles.length < n) return null;
  const xs = candles.slice(-n);
  return Number((xs.reduce((s, c) => s + c.c, 0) / n).toFixed(4));
}

/** Percent change of the last completed close over `n` sessions. */
export function pctOver(candles, n) {
  if (!candles || candles.length <= n) return null;
  const last = candles.at(-1).c;
  const base = candles.at(-1 - n).c;
  return base ? Number((((last - base) / base) * 100).toFixed(2)) : null;
}

export function hiLo(candles, n) {
  if (!candles || !candles.length) return { high: null, low: null };
  const xs = candles.slice(-n);
  return { high: Math.max(...xs.map(c => c.h)), low: Math.min(...xs.map(c => c.l)) };
}

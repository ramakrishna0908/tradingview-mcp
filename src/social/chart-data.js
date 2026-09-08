/**
 * Daily OHLC candles for the chart image.
 *
 * Source: Yahoo Finance's public chart endpoint (no key). Only used to draw
 * price history behind the report's levels — every number quoted in the post
 * and every level drawn on the chart still comes from the report model.
 * A failure here never blocks a post: the caller falls back to text-only.
 */

import { roundPrice } from './money.js';

export const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/**
 * Yahoo ticker for a report symbol.
 *
 * Equities: BRK.B → BRK-B, everything else untouched.
 * Crypto: Yahoo quotes coins as a pair, so a bare BTC has to become BTC-USD.
 * A few coins are listed under a disambiguated ticker (Yahoo appends the
 * CoinMarketCap id when a symbol collides with an equity), so an explicit
 * override always wins over the derived name.
 */
export const YAHOO_CRYPTO_OVERRIDES = {
  HYPE: 'HYPE32196-USD',
  UNI: 'UNI7083-USD',
};

export function toYahooSymbol(symbol, { assetClass = 'equity' } = {}) {
  if (assetClass === 'crypto') {
    const sym = symbol.toUpperCase();
    if (YAHOO_CRYPTO_OVERRIDES[sym]) return YAHOO_CRYPTO_OVERRIDES[sym];
    return /-USD$/.test(sym) ? sym : `${sym}-USD`;
  }
  return symbol.replace('.', '-');
}

/** Parse Yahoo's chart JSON into [{ t: 'YYYY-MM-DD', o, h, l, c, v }]. */
export function parseYahooChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || 'no chart result');
  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].some(v => v == null || !Number.isFinite(v))) continue;
    const t = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out.push({ t, o: roundPrice(o), h: roundPrice(h), l: roundPrice(l), c: roundPrice(c), v: q.volume?.[i] ?? null });
  }
  return out;
}

/**
 * Fetch up to `bars` daily candles ending on or before `endDate` (YYYY-MM-DD).
 * Candles after the report date are dropped so the chart never shows price
 * action the report could not have seen.
 */
export async function fetchDailyCandles(symbol, { bars = 60, endDate = null, fetchImpl = fetch, timeoutMs = 10_000, assetClass = 'equity' } = {}) {
  const url = `${YAHOO_CHART}${encodeURIComponent(toYahooSymbol(symbol, { assetClass }))}?range=6mo&interval=1d`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (tradingview-mcp social charts)' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let candles = parseYahooChart(await res.json());
    if (endDate) candles = candles.filter(c => c.t <= endDate);
    return candles.slice(-bars);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Intraday snapshot for the close-of-day check: last trade, session high/low
 * and the timestamp of the last bar, from Yahoo's 1-day / 5-minute chart.
 */
export async function fetchIntradayQuote(symbol, { fetchImpl = fetch, timeoutMs = 10_000, assetClass = 'equity' } = {}) {
  const url = `${YAHOO_CHART}${encodeURIComponent(toYahooSymbol(symbol, { assetClass }))}?range=1d&interval=5m`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (tradingview-mcp social charts)' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseIntradayQuote(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export function parseIntradayQuote(json) {
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || 'no chart result');
  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  let high = -Infinity, low = Infinity, last = null, lastTs = null;
  for (let i = 0; i < ts.length; i++) {
    const h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (h != null && Number.isFinite(h)) high = Math.max(high, h);
    if (l != null && Number.isFinite(l)) low = Math.min(low, l);
    if (c != null && Number.isFinite(c)) { last = c; lastTs = ts[i]; }
  }
  if (last == null) throw new Error('no intraday bars');
  const asOf = new Date(lastTs * 1000).toISOString();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(asOf));
  return { last: roundPrice(last), high: roundPrice(high), low: roundPrice(low), asOf, date, marketPrice: r.meta?.regularMarketPrice ?? null };
}

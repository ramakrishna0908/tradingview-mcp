/**
 * Daily OHLC candles for the chart image.
 *
 * Source: Yahoo Finance's public chart endpoint (no key). Only used to draw
 * price history behind the report's levels — every number quoted in the post
 * and every level drawn on the chart still comes from the report model.
 * A failure here never blocks a post: the caller falls back to text-only.
 */

export const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/** Yahoo symbol quirks: BRK.B → BRK-B, futures/indices untouched. */
export function toYahooSymbol(symbol) {
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
    out.push({ t, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: q.volume?.[i] ?? null });
  }
  return out;
}

/**
 * Fetch up to `bars` daily candles ending on or before `endDate` (YYYY-MM-DD).
 * Candles after the report date are dropped so the chart never shows price
 * action the report could not have seen.
 */
export async function fetchDailyCandles(symbol, { bars = 60, endDate = null, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const url = `${YAHOO_CHART}${encodeURIComponent(toYahooSymbol(symbol))}?range=6mo&interval=1d`;
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

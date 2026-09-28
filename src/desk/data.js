/**
 * Market data for the decision-support report.
 *
 * Two public sources, both unauthenticated so the 10:10 job stays a pure data
 * job with no browser and no desktop app:
 *
 *   Yahoo chart API   OHLCV at any interval, plus the exchange's own regular
 *                     session boundaries, which is what the opening range and
 *                     the closed-candle rule are anchored to.
 *   Cboe delayed      Full option chain: IV, greeks, open interest, volume and
 *                     the bid/ask needed to judge whether a strike is tradable.
 *
 * Nothing here interprets a number. Fetch, normalise, and say plainly when a
 * value is missing so the layers above can degrade instead of guessing.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const YAHOO_HOSTS = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'];
const CBOE = 'https://cdn.cboe.com/api/global/delayed_quotes/options';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export const INTERVAL_SECONDS = Object.freeze({
  '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '60m': 3600, '1d': 86400, '1wk': 604800,
});

/** Opening range, fixed by the spec and never varied between sessions. */
export const OPENING_RANGE_MINUTES = 30;

/**
 * Optional on-disk response cache, off unless DESK_CACHE is set.
 *
 * Both endpoints rate limit an impatient caller, and a development loop that
 * refetches the same series on every run will trip that within minutes. The
 * scheduled job leaves this off and always takes live data.
 */
const CACHE_DIR = process.env.DESK_CACHE_DIR || join(tmpdir(), 'desk-cache');
const CACHE_TTL_MS = Number(process.env.DESK_CACHE_TTL ?? 900) * 1000;
const cacheEnabled = () => Boolean(process.env.DESK_CACHE);

function cachePath(url) {
  return join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`);
}

function readCache(url) {
  if (!cacheEnabled()) return null;
  try {
    const p = cachePath(url);
    const stat = statSync(p);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch { return null; }
}

function writeCache(url, json) {
  if (!cacheEnabled()) return;
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(url), JSON.stringify(json));
  } catch { /* a cache miss is never worth failing a report over */ }
}

/**
 * Minimum gap between requests to one host.
 *
 * These feeds rate limit a burst far more readily than a steady stream, and a
 * 429 midway through the run costs the whole report. Pacing the calls is the
 * difference between a slow report and no report.
 */
const HOST_GAP_MS = Number(process.env.DESK_REQUEST_GAP_MS ?? 350);
const lastRequestAt = new Map();

async function pace(url) {
  const host = new URL(url).hostname;
  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + HOST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(host, Date.now());
}

async function getJson(url, { fetchImpl = fetch, timeoutMs = 15_000, retries = 4 } = {}) {
  const hit = readCache(url);
  if (hit) return hit;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      await pace(url);
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      // 429 is the common failure against these endpoints; back off rather than
      // treating a rate limit as "no data" and silently thinning the report.
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      writeCache(url, json);
      return json;
    } catch (err) {
      lastErr = err;
      const rateLimited = /HTTP 429/.test(err.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, (rateLimited ? 5000 : 1000) * 2 ** attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * Bars for one symbol at one interval.
 *
 * `closed` marks bars that have actually finished. Yahoo appends a live,
 * still-forming bar whose timestamp is the current clock time rather than a
 * point on the interval grid — the exact candle the spec forbids treating as a
 * confirmation, so it is flagged here once and never re-derived downstream.
 */
export async function fetchBars(symbol, { interval = '1d', range = '6mo', prePost = false, now = new Date(), ...opts } = {}) {
  const step = INTERVAL_SECONDS[interval];
  if (!step) throw new Error(`Unsupported interval: ${interval}`);
  const qs = `range=${range}&interval=${interval}${prePost ? '&includePrePost=true' : ''}`;
  let json, lastErr;
  for (const host of YAHOO_HOSTS) {
    try { json = await getJson(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`, opts); break; }
    catch (err) { lastErr = err; }
  }
  if (!json) throw lastErr ?? new Error('no response');

  const result = json?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error('no bars returned');
  const q = result.indicators?.quote?.[0] ?? {};
  const nowSec = Math.floor(now.getTime() / 1000);
  const reg = result.meta?.currentTradingPeriod?.regular ?? null;

  const bars = result.timestamp.map((t, i) => ({
    t,
    o: numOrNull(q.open?.[i]),
    h: numOrNull(q.high?.[i]),
    l: numOrNull(q.low?.[i]),
    c: numOrNull(q.close?.[i]),
    v: numOrNull(q.volume?.[i]),
    // On the grid AND far enough in the past to have completed.
    closed: t % step === 0 && t + step <= nowSec,
  })).filter((b) => b.c != null);

  return {
    symbol,
    interval,
    bars,
    closedBars: bars.filter((b) => b.closed),
    meta: {
      timezone: result.meta?.exchangeTimezoneName ?? null,
      previousClose: numOrNull(result.meta?.chartPreviousClose ?? result.meta?.previousClose),
      regularStart: reg?.start ?? null,
      regularEnd: reg?.end ?? null,
      fetchedAt: new Date(now).toISOString(),
    },
  };
}

function numOrNull(v) { return Number.isFinite(v) ? v : null; }

/**
 * Split an intraday series into premarket, regular session, and the opening
 * range. Session boundaries come from the exchange via Yahoo rather than a
 * hardcoded 9:30, so a half day or a DST edge cannot silently shift the range.
 */
export function sessionSlices(series, { openingRangeMinutes = OPENING_RANGE_MINUTES } = {}) {
  const { regularStart, regularEnd } = series.meta;
  if (regularStart == null) return { premarket: [], rth: [], openingRange: [], regularStart: null, orEnd: null };
  const orEnd = regularStart + openingRangeMinutes * 60;
  const inToday = (b) => b.t >= regularStart - 6 * 3600 && b.t < regularEnd;
  return {
    regularStart,
    orEnd,
    premarket: series.bars.filter((b) => inToday(b) && b.t < regularStart),
    rth: series.bars.filter((b) => b.t >= regularStart && b.t < regularEnd),
    // Only bars that both fall inside the window and have closed: at 10:10 the
    // 9:30-10:00 range is complete, but this stays correct if run earlier.
    openingRange: series.bars.filter((b) => b.t >= regularStart && b.t < orEnd && b.closed),
  };
}

/** High/low of a bar slice; null rather than Infinity when the slice is empty. */
export function rangeOf(bars) {
  const highs = bars.map((b) => b.h).filter((v) => v != null);
  const lows = bars.map((b) => b.l).filter((v) => v != null);
  return {
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
  };
}

/**
 * Session VWAP from the regular session only, typical price weighted by volume.
 * Premarket is excluded deliberately — a VWAP that includes thin premarket
 * prints is not the level traders are watching.
 */
export function vwap(rthBars) {
  let pv = 0, vol = 0;
  for (const b of rthBars) {
    if (b.v == null || b.h == null || b.l == null || b.c == null) continue;
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    vol += b.v;
  }
  return vol > 0 ? pv / vol : null;
}

/**
 * Relative volume, compared like for like: today's cumulative regular-session
 * volume against the average cumulative volume by the same point of the
 * session across prior days. Comparing a 40-minute-old session against a full
 * day's average would read as 0.1 and reject every setup before 3pm.
 */
export function relativeVolume(series, { lookbackDays = 10 } = {}) {
  const { regularStart, regularEnd } = series.meta;
  if (regularStart == null) return { rvol: null, reason: 'no session boundaries' };
  const step = INTERVAL_SECONDS[series.interval];
  const sessionLength = regularEnd - regularStart;

  const byDay = new Map();
  for (const b of series.bars) {
    if (b.v == null) continue;
    // Offset into that bar's own session, using the session length to bucket.
    const dayKey = Math.floor((b.t - regularStart) / 86400);
    const dayStart = regularStart + dayKey * 86400;
    const offset = b.t - dayStart;
    if (offset < 0 || offset >= sessionLength) continue;
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push({ offset, v: b.v });
  }

  const today = byDay.get(0) ?? [];
  if (!today.length) return { rvol: null, reason: 'no regular-session bars today' };
  const elapsed = Math.max(...today.map((x) => x.offset)) + step;
  const todayVolume = today.reduce((s, x) => s + x.v, 0);

  const priors = [...byDay.entries()]
    .filter(([k]) => k < 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, lookbackDays)
    .map(([, rows]) => rows.filter((x) => x.offset < elapsed).reduce((s, x) => s + x.v, 0))
    .filter((v) => v > 0);

  if (priors.length < 3) return { rvol: null, reason: `only ${priors.length} comparable prior sessions` };
  const avg = priors.reduce((a, b) => a + b, 0) / priors.length;
  return {
    rvol: avg > 0 ? Number((todayVolume / avg).toFixed(2)) : null,
    todayVolume,
    averageVolume: Math.round(avg),
    sessionsCompared: priors.length,
    throughMinutes: Math.round(elapsed / 60),
  };
}

/** Aggregate lower-interval bars into a higher one (1h -> 4h). */
export function aggregate(bars, factor) {
  const out = [];
  for (let i = 0; i + factor <= bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    out.push({
      t: chunk[0].t,
      o: chunk[0].o,
      h: Math.max(...chunk.map((b) => b.h)),
      l: Math.min(...chunk.map((b) => b.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, b) => s + (b.v ?? 0), 0),
      closed: chunk.every((b) => b.closed),
    });
  }
  return out;
}

// ─── options ─────────────────────────────────────────────────────────────────

/** OSI contract code -> {expiry, type, strike}. */
export function parseOsi(code) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(code);
  if (!m) return null;
  return { root: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === 'C' ? 'call' : 'put', strike: Number(m[6]) / 1000 };
}

/**
 * Full option chain. Contracts with no two-sided market are dropped here: a
 * strike nobody is quoting cannot be assessed for liquidity, and keeping it
 * would let a zero spread look like a tight one.
 */
export async function fetchOptionChain(symbol, opts = {}) {
  const json = await getJson(`${CBOE}/${encodeURIComponent(symbol)}.json`, opts);
  const data = json?.data;
  if (!data?.options?.length) throw new Error('no option data');
  const contracts = [];
  for (const o of data.options) {
    const parsed = parseOsi(o.option);
    if (!parsed) continue;
    const bid = numOrNull(o.bid), ask = numOrNull(o.ask);
    if (bid == null || ask == null || ask <= 0 || ask < bid) continue;
    contracts.push({
      ...parsed,
      bid, ask,
      mid: (bid + ask) / 2,
      iv: numOrNull(o.iv),
      delta: numOrNull(o.delta),
      gamma: numOrNull(o.gamma),
      theta: numOrNull(o.theta),
      vega: numOrNull(o.vega),
      openInterest: numOrNull(o.open_interest),
      volume: numOrNull(o.volume),
    });
  }
  return {
    symbol,
    spot: numOrNull(data.current_price),
    asOf: json.timestamp ?? null,
    contracts,
    expiries: [...new Set(contracts.map((c) => c.expiry))].sort(),
  };
}

/** Run an async job over a list a few at a time, collecting failures per key. */
export async function pool(items, worker, { concurrency = 4 } = {}) {
  const results = new Map();
  const errors = new Map();
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const item = items[i++];
      try { results.set(item, await worker(item)); }
      catch (err) { errors.set(item, err.message); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return { results, errors };
}

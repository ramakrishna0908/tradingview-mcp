#!/usr/bin/env node
/**
 * Resolve the "top 20 crypto" universe for the nightly sweep.
 *
 * Ranking comes from CoinGecko's public markets endpoint (no key) rather than
 * a list baked into the repo: the top 20 by market cap reshuffles constantly,
 * and a frozen list quietly sweeps the wrong coins. The result is cached to
 * config/crypto-universe.json and REUSED when the API is unreachable, so the
 * 1 AM job still has a universe if CoinGecko is down.
 *
 * What is filtered out, and why:
 *   - stablecoins (USDT, USDC, DAI, …) — a peg has no trend, RSI or breakout
 *   - wrapped / liquid-staked derivatives (WBTC, WSTETH, …) — duplicates of the
 *     asset they track, so they would post the same setup twice
 *   - tickers that are not spot pairs (underscores, dots) — no TradingView symbol
 *
 * Usage:
 *   node scripts/crypto-universe.js            # refresh, write cache, print table
 *   node scripts/crypto-universe.js --json     # machine-readable
 *   node scripts/crypto-universe.js --offline  # use the cache, never call the API
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const CACHE_PATH = join(ROOT, 'config', 'crypto-universe.json');
const API = 'https://api.coingecko.com/api/v3/coins/markets';

/** Size of the swept universe. */
export const UNIVERSE_SIZE = 20;

/** Coins that are a peg, a wrapper or otherwise untradeable as a spot setup. */
const DENY_IDS = new Set([
  'tether', 'usd-coin', 'dai', 'usds', 'ethena-usde', 'usd1-wlfi', 'first-digital-usd',
  'true-usd', 'paypal-usd', 'binance-usd', 'frax', 'blackrock-usd-institutional-digital-liquidity-fund',
  'wrapped-bitcoin', 'wrapped-steth', 'staked-ether', 'wrapped-eeth', 'weth', 'wrapped-beacon-eth',
  'coinbase-wrapped-btc', 'binance-staked-sol', 'jito-staked-sol', 'lido-staked-sol', 'rocket-pool-eth',
  'figure-heloc', 'bitcoin-cash-sv',
]);

/** A peg by behaviour: sits on $1 with real size behind it. */
function looksLikeStablecoin(c) {
  const p = Number(c.current_price);
  if (!Number.isFinite(p)) return false;
  const pegged = Math.abs(p - 1) <= 0.03;
  const named = /USD|EUR|DAI|PYUSD|GUSD/i.test(c.symbol ?? '');
  return pegged && named;
}

function looksLikeDerivative(c) {
  const id = (c.id ?? '').toLowerCase();
  const sym = (c.symbol ?? '').toUpperCase();
  if (/wrapped|staked|liquid-staked|-eth$|restaked/.test(id)) return true;
  if (/^W[A-Z]{2,}$/.test(sym) && /wrapped/.test(id)) return true;
  return false;
}

/** Not a spot ticker we can map onto an exchange pair. */
function unusableTicker(c) {
  return !/^[A-Z0-9]{2,10}$/.test((c.symbol ?? '').toUpperCase());
}

export function classify(c) {
  const id = (c.id ?? '').toLowerCase();
  if (DENY_IDS.has(id)) return 'denylisted (stablecoin, wrapper or non-spot instrument)';
  if (looksLikeStablecoin(c)) return 'stablecoin (pegged to $1)';
  if (looksLikeDerivative(c)) return 'wrapped or staked derivative of another coin';
  if (unusableTicker(c)) return 'ticker is not a spot pair symbol';
  return null;
}

/** TradingView symbols to try, in order, for a coin. */
export function tvCandidates(symbol) {
  const s = symbol.toUpperCase();
  return [`${s}USD`, `COINBASE:${s}USD`, `BINANCE:${s}USDT`, `CRYPTO:${s}USD`];
}

export function buildUniverse(markets, { size = UNIVERSE_SIZE } = {}) {
  const universe = [];
  const excluded = [];
  for (const c of markets) {
    const reason = classify(c);
    const sym = (c.symbol ?? '').toUpperCase();
    if (reason) { excluded.push({ symbol: sym, name: c.name, reason }); continue; }
    universe.push({
      rank: universe.length + 1,
      symbol: sym,
      name: c.name,
      id: c.id,
      priceUsd: c.current_price ?? null,
      marketCapUsd: c.market_cap ?? null,
      marketCapRank: c.market_cap_rank ?? null,
      tv: tvCandidates(sym)[0],
      tvCandidates: tvCandidates(sym),
      yahoo: `${sym}-USD`,
    });
  }
  return { universe: universe.slice(0, size), reserves: universe.slice(size, size + 8), excluded };
}

async function fetchMarkets({ perPage = 60, timeoutMs = 25_000 } = {}) {
  const url = `${API}?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'tradingview-mcp crypto sweep' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json) || !json.length) throw new Error('unexpected payload');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export function readCache() {
  if (!existsSync(CACHE_PATH)) return null;
  try { return JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { return null; }
}

export async function resolveUniverse({ offline = false, size = UNIVERSE_SIZE } = {}) {
  if (!offline) {
    try {
      const markets = await fetchMarkets();
      const { universe, reserves, excluded } = buildUniverse(markets, { size });
      if (universe.length < size) throw new Error(`only ${universe.length} tradeable coins after filtering`);
      const payload = {
        fetchedAt: new Date().toISOString(),
        source: 'coingecko /coins/markets (market_cap_desc)',
        size, universe, reserves, excluded,
      };
      mkdirSync(dirname(CACHE_PATH), { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2) + '\n');
      return { ...payload, stale: false };
    } catch (err) {
      const cached = readCache();
      if (!cached) throw new Error(`CoinGecko unreachable and no cached universe: ${err.message}`);
      return { ...cached, stale: true, staleReason: err.message };
    }
  }
  const cached = readCache();
  if (!cached) throw new Error('no cached universe at ' + CACHE_PATH);
  return { ...cached, stale: true, staleReason: 'offline mode' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Set(process.argv.slice(2));
  const data = await resolveUniverse({ offline: args.has('--offline') });
  if (args.has('--json')) {
    console.log(JSON.stringify(data, null, 2));
  } else if (args.has('--symbols')) {
    console.log(data.universe.map(c => c.symbol).join(' '));
  } else {
    console.log(`Top ${data.universe.length} crypto by market cap · ${data.stale ? `CACHED (${data.staleReason}) from ${data.fetchedAt}` : 'fetched ' + data.fetchedAt}`);
    for (const c of data.universe) {
      console.log(`${String(c.rank).padStart(2)}  ${c.symbol.padEnd(7)} ${c.tv.padEnd(10)} ${('$' + (c.priceUsd ?? 0)).padEnd(14)} ${((c.marketCapUsd ?? 0) / 1e9).toFixed(1)}B  ${c.name}`);
    }
    console.log(`\nexcluded: ${data.excluded.map(e => e.symbol).join(', ') || '—'}`);
    console.log(`reserves (used when a coin has no TradingView symbol): ${data.reserves.map(r => r.symbol).join(', ') || '—'}`);
  }
}

/**
 * Crypto market-read X post — generator and compliance (kind 'cryptomarket'),
 * plus the 280-character crypto policy for @GameSol404.
 * Run: node --test tests/crypto-market-post.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { generateCryptoMarketPost, marketStats, btcLevels } from '../src/social/crypto-market-post.js';
import { generateFollowUp, followUpChartOverrides } from '../src/social/followup.js';
import { validatePost, blocking, xWeightedLength } from '../src/social/compliance.js';
import { loadConfig, resetConfigCache } from '../src/social/config.js';

const NOW = new Date('2026-09-11T17:00:00Z');
const FULL = 'Educational market analysis only. Not investment advice. Trading involves risk.';

function model(over = {}) {
  const row = (symbol, price, bbBasis, score, extra = {}) => ({ symbol, price, bbBasis, bbLower: bbBasis * 0.93, bbUpper: bbBasis * 1.07, rsi: 60, cmf: 0.1, score, structure: 'HH-up', ...extra });
  return {
    reportDate: '2026-09-11',
    dataAsOf: '2026-09-11T16:16:00Z',
    rows: [
      row('BTC', 79380, 77988, 2.5, { bbLower: 72797, bbUpper: 83180, rsi: 63.8 }),
      row('ETH', 2498, 2449, 2.5, { rsi: 64.2 }),
      row('SOL', 150, 140, 2),
      row('XRP', 0.61, 0.6, 1, { cmf: -0.05 }),
      row('DOGE', 0.19412, 0.2, -1.5, { cmf: -0.2, structure: 'LL-down' }),
    ],
    ...over,
  };
}

function cryptoConfig() {
  resetConfigCache?.();
  return loadConfig(join(process.cwd(), 'config', 'social-compliance-crypto.json'));
}
const longPosts = () => ({ ...cryptoConfig(), charLimit: 4000 });

const ctx = (config, stats, over = {}) => ({ config, now: NOW, priorRecords: [], setup: null, row: null, model: { reportDate: '2026-09-11', dataAsOf: '2026-09-11T16:16:00Z' }, kind: 'cryptomarket', cryptoMarket: stats, chart: { path: 'card.png' }, ...over });

describe('live crypto policy (@GameSol404 since 2026-09-11)', () => {
  it('280 characters, short disclosure in-post, full disclosure on the card, GameKing brand, no series line', () => {
    const cfg = cryptoConfig();
    assert.equal(cfg.charLimit, 280);
    assert.equal(cfg.disclosurePlacement, 'post');
    assert.equal(cfg.disclosure, 'Educational only. Not financial advice.');
    assert.equal(cfg.cardDisclosure, FULL);
    assert.equal(cfg.brand.name, 'GameKing');
    assert.equal(cfg.brand.seriesLine, null);
    assert.equal(cfg.cryptoMarket.enabled, true);
    assert.equal(cfg.cryptoMarket.queue, 'crypto');
  });
});

describe('crypto market post', () => {
  it('long-post layout: tone + breadth, BTC/ETH lines, BTC levels with what negates the read, disclosure last before the tags', () => {
    const cfg = longPosts();
    const { lines, stats } = generateCryptoMarketPost(model(), cfg);
    assert.equal(lines[0], '🟢 Crypto market read for Fri Sep 11 — RISK-ON (breadth 4/5 above the 20-day basis)');
    assert.match(lines[1], /^BTC: \$79,380 · RSI 63\.8 · higher highs, above its 20-day basis \$77,988$/);
    assert.ok(lines.includes('BTC levels: $83,180 above (upper band) · $77,988 below (20-day basis). A daily close under $77,988 negates the hold.'));
    assert.equal(lines.at(-1), '#Crypto #Bitcoin');
    assert.equal(lines.at(-2), cfg.disclosure);
    assert.deepEqual(stats.levels, [83180, 77988]);
  });

  it('fits 280 under the live policy: compact headline and levels, and still compliance-clean', () => {
    const cfg = cryptoConfig();
    const { text, lines, stats } = generateCryptoMarketPost(model(), cfg);
    assert.ok(xWeightedLength(text) <= 280, `${xWeightedLength(text)} > 280:\n${text}`);
    assert.match(lines[0], /^🟢 Crypto read Fri Sep 11 — RISK-ON \(breadth 4\/5\)$/);
    assert.ok(lines.some(l => l.startsWith('BTC levels: $83,180 above (upper band) · $77,988 below (basis).')));
    assert.equal(lines.at(-2), 'Educational only. Not financial advice.');
    const issues = validatePost(text, ctx(cfg, stats));
    assert.deepEqual(blocking(issues), []);
    assert.deepEqual(issues.filter(i => i.severity === 'warn'), []);
  });

  it('blocks a tampered tone, breadth or BTC level', () => {
    const cfg = longPosts();
    const { text, stats } = generateCryptoMarketPost(model(), cfg);
    const codes = t => blocking(validatePost(t, ctx(cfg, stats))).map(i => i.code);
    assert.ok(codes(text.replace('RISK-ON', 'RISK-OFF')).includes('value_mismatch'));
    assert.ok(codes(text.replace('breadth 4/5', 'breadth 5/5')).includes('value_mismatch'));
    assert.ok(codes(text.replace('$83,180 above', '$85,000 above')).includes('value_mismatch'));
  });

  it('is MIXED, not RISK-ON, when BTC is below its basis even with broad breadth', () => {
    const m = model();
    m.rows[0] = { ...m.rows[0], price: 77940, bbBasis: 78649, bbLower: 76350, bbUpper: 80948 };
    const s = marketStats(m);
    assert.equal(s.tone, 'MIXED');
    const lv = btcLevels(s.btc, cryptoConfig());
    assert.equal(lv.text, 'BTC levels: $78,649 above (20-day basis) · $76,350 below (lower band). A daily close back above $78,649 negates the weak read.');
    assert.equal(lv.compact, 'BTC levels: $78,649 above (basis) · $76,350 below (lower band). Back above $78,649 negates it.');
  });
});

describe('crypto follow-up at 280 characters', () => {
  it('an INVALIDATED update drops the lesson and origin lines first and keeps the CTA, price, disclosure and tag line', () => {
    const cfg = cryptoConfig();
    const rec = { symbol: 'ADA', direction: 'bullish', reportDate: '2026-09-07', entryPrice: 0.221192, setupName: 'Basis reclaim', stage: 'INVALIDATED', target: { value: 0.2353, label: 'upper band' }, stop: { value: 0.21154, label: 'cloud A' }, posts: [{ stage: 'CONFIRMED' }], queue: 'crypto', assetClass: 'crypto' };
    const ev = { type: 'INVALIDATED', bar: '2026-09-10', price: 0.20472, level: 0.21154, pct: -7.45 };
    const { text } = generateFollowUp(rec, ev, cfg);
    assert.ok(xWeightedLength(text) <= 280, `${xWeightedLength(text)} > 280:\n${text}`);
    assert.doesNotMatch(text, /The lesson/);
    assert.match(text, /^🛑 \$ADA — INVALIDATED\. \$0\.21154 lost on the daily close\.\nPrice: \$0\.20472 \(daily close\)/);
    assert.match(text, /Would you have drawn the line at \$0\.21154 too\? 👇\nData: daily · Sep 10, 2026\nEducational only\. Not financial advice\.\n#Crypto #TechnicalAnalysis$/);
  });

  it('a bearish setup is invalidated by a close back ABOVE the level, so the level reads as reclaimed, not lost', () => {
    const cfg = cryptoConfig();
    // Mirrors the real 2026-09-19 $DOGE record: short setup, stop above entry,
    // price closes through it to the upside.
    const rec = { symbol: 'DOGE', direction: 'bearish', reportDate: '2026-09-17', entryPrice: 0.080283, setupName: 'Breakdown', stage: 'INVALIDATED', target: { value: 0.078262, label: 'lower band' }, stop: { value: 0.084203, label: 'cloud A' }, posts: [{ stage: 'CONFIRMED' }], queue: 'crypto', assetClass: 'crypto' };
    const ev = { type: 'INVALIDATED', bar: '2026-09-19', price: 0.08753, level: 0.084203, pct: 9.03 };
    const { text } = generateFollowUp(rec, ev, cfg);
    assert.ok(xWeightedLength(text) <= 280, `${xWeightedLength(text)} > 280:\n${text}`);
    assert.match(text, /^🛑 \$DOGE — INVALIDATED\. \$0\.084203 reclaimed on the daily close\./);
    assert.doesNotMatch(text, /lost on the daily close/);
  });

  it('the INVALIDATED chart card follows the same direction split as the post text', () => {
    const cfg = cryptoConfig();
    const base = { symbol: 'X', reportDate: '2026-09-07', entryPrice: 1, stage: 'INVALIDATED', stop: { value: 2, label: 'cloud A' }, posts: [{ stage: 'CONFIRMED' }], queue: 'crypto', assetClass: 'crypto' };
    const ev = { type: 'INVALIDATED', bar: '2026-09-10', price: 3, level: 2, pct: 200 };
    const bear = followUpChartOverrides({ ...base, direction: 'bearish' }, ev, cfg);
    assert.match(bear.subtitle, /reclaimed on the daily close/);
    assert.match(bear.bottom[0].text, /^Reclaimed /);
    assert.equal(bear.bottom[0].sub, 'Daily close above the level');
    const bull = followUpChartOverrides({ ...base, direction: 'bullish' }, ev, cfg);
    assert.match(bull.subtitle, /lost on the daily close/);
    assert.match(bull.bottom[0].text, /^Lost /);
  });
});

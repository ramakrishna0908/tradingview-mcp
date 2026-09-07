/**
 * Premarket X post — generator, card spec and compliance (kind 'premarket').
 * Run: node --test tests/premarket-post.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generatePremarketPost, buildPremarketSpec, premarketAltText, flipEvent, hookLine, shortSession, PREMARKET_DISCLAIMER } from '../src/social/premarket-post.js';
import { validatePost, blocking } from '../src/social/compliance.js';
import { loadConfig, resetConfigCache } from '../src/social/config.js';
import { SocialWorkflow } from '../src/social/index.js';
import { AuditStore } from '../src/social/audit.js';

const NOW = new Date('2026-09-08T12:05:00Z');

function report(over = {}) {
  return {
    reportVersion: 1, kind: 'premarket', date: '2026-09-08', sessionDate: '2026-09-08', holiday: null,
    generatedAt: '2026-09-08T12:00:00Z', dataAsOf: '2026-09-08T11:58:00Z',
    bias: 'Bullish', confidence: 74, composite: 0.31, agreement: 0.78,
    drivers: [
      { key: 'futures', direction: 'supportive', text: 'S&P futures +0.62% overnight', contribution: 2.48 },
      { key: 'trend', direction: 'supportive', text: 'SPY closed 770.19, above both its 20- and 50-day averages (uptrend intact)', contribution: 2 },
      { key: 'vix', direction: 'supportive', text: 'VIX 13.8 (-4.10%) — calm', contribution: 1.6 },
      { key: 'yields', direction: 'headwind', text: '10-year 4.78% (+3 bp)', contribution: -0.56 },
    ],
    components: [{ key: 'trend', score: 1 }],
    snapshot: {
      es: { symbol: 'ES=F', name: 'S&P 500 futures', unit: 'price', price: 7770.25, change: 48, changePct: 0.62 },
      vix: { symbol: '^VIX', name: 'VIX', unit: 'price', price: 13.8, change: -0.59, changePct: -4.1 },
      us10y: { symbol: '^TNX', name: '10-year yield', unit: 'pct', price: 4.78, change: 0.03, changePct: 0.6 },
      wti: { symbol: 'CL=F', name: 'WTI crude', unit: 'price', price: 91.48, change: 0.18, changePct: 0.2 },
    },
    sectors: { strength: [{ name: 'Semiconductors' }, { name: 'Technology' }, { name: 'Energy' }], weakness: [{ name: 'Consumer Discretionary' }, { name: 'Communication' }, { name: 'Real Estate' }], ranked: [] },
    levels: { spy: { name: 'S&P 500 (SPY)', price: 770.19, priorDay: { high: 772.87, low: 769, close: 770.19 }, resistance: [{ label: 'Prior-day high', value: 772.87 }, { label: '10-day high', value: 775.3 }], support: [{ label: 'Prior close', value: 770.19 }, { label: 'Prior-day low', value: 769 }] } },
    events: [
      { type: 'economic', kind: 'inflation', title: 'Core CPI m/m', at: '2026-09-08T12:30:00Z', date: '2026-09-08', time: '8:30 AM ET', impact: 'High', flipShort: 'hotter than expected → yields up, stocks pressured; cooler → relief' },
      { type: 'earnings', kind: 'earnings', title: 'CASY earnings (AMC) — Caseys', at: null, date: '2026-09-08', time: 'after the close', impact: 'Medium', session: 'AMC', flipShort: 'a beat with raised guidance lifts its sector; a miss or cut guidance drags peers' },
    ],
    laterWeek: [{ title: 'PPI m/m', date: '2026-09-10', time: '8:30 AM ET', impact: 'High', flipShort: 'hotter than expected → yields up, stocks pressured; cooler → relief' }],
    earnings: [], watch: [], missing: {}, sources: {}, methodology: '', disclaimer: 'Educational market analysis only. Not investment advice. Trading involves risk.',
    ...over,
  };
}

function stocksConfig() {
  resetConfigCache?.();
  return loadConfig(join(process.cwd(), 'config', 'social-compliance.json'));
}

describe('premarket post', () => {
  it('builds hook, bias + confidence, three drivers, SPY levels, sectors, flip event, CTA, disclaimer, data line and two hashtags', () => {
    const cfg = stocksConfig();
    const { text, lines, levels } = generatePremarketPost(report(), cfg);
    assert.equal(lines[0], '🟢 Premarket read for Tue Sep 8 — BULLISH (confidence 74/100)');
    assert.match(lines[1], /^Futures green, VIX calm, uptrend intact — the bulls have the ball into the open\.$/);
    assert.equal(lines[2], 'Top drivers:');
    assert.equal(lines.filter(l => /^[▲▼•] /.test(l)).length, 3);
    assert.match(text, /SPY levels: 772\.87 above \(prior-day high\) · 770\.19 below \(prior close\)\. Losing 770\.19 negates the bullish read\./);
    assert.match(text, /Sectors: strongest Semis, Tech, Energy · weakest Cons\. Disc\., Comms, Real Estate/);
    assert.match(text, /Flip event: 8:30 AM ET Core CPI m\/m — hotter than expected → yields up, stocks pressured; cooler → relief\./);
    assert.ok(text.includes('Bullish or bearish today? 👇'));
    assert.ok(text.includes(PREMARKET_DISCLAIMER));
    assert.match(text, /\nData: Sep 8, 2026 7:58 AM ET\n/);
    assert.equal(lines.at(-1), '#Stocks #Premarket');
    assert.deepEqual(levels, ['772.87', '770.19']);
    assert.ok(!/\bforecast/i.test(text));
  });

  it('flip event: high-impact release first; small after-hours earnings defer to the week\'s next high-impact release', () => {
    assert.equal(flipEvent(report()).title, 'Core CPI m/m');
    const r = report({ events: [report().events[1]] });
    const fe = flipEvent(r);
    assert.equal(fe.today, false);
    assert.equal(fe.title, 'PPI m/m');
    assert.equal(fe.when, 'Thu 8:30 AM ET');
    const { text } = generatePremarketPost(r, stocksConfig());
    assert.match(text, /Flip event: nothing high-impact on today's calendar — PPI m\/m \(Thu 8:30 AM ET\)/);
    const mega = report({ events: [{ ...report().events[1], impact: 'High', title: 'ORCL earnings (AMC) — Oracle' }] });
    assert.equal(flipEvent(mega).title, 'ORCL earnings (AMC)');
    assert.equal(flipEvent(report({ events: [], laterWeek: [] })), null);
  });

  it('hook and wording follow the bias', () => {
    assert.match(hookLine(report({ bias: 'Bearish', snapshot: { ...report().snapshot, es: { ...report().snapshot.es, changePct: -0.9 }, vix: { ...report().snapshot.vix, price: 23, changePct: 12 } } })), /^Futures red, VIX elevated, uptrend intact — risk is on the back foot into the open\.$/);
    assert.match(generatePremarketPost(report({ bias: 'Neutral', confidence: 55 }), stocksConfig()).text, /NEUTRAL \(confidence 55\/100\)[\s\S]*losing 770\.19 negates the hold/);
    assert.equal(shortSession('2026-09-11'), 'Fri Sep 11');
  });

  it('passes compliance as kind premarket with the stocks config, and is blocked when bias, confidence or levels drift', () => {
    const cfg = stocksConfig();
    const r = report();
    const { text, levels } = generatePremarketPost(r, cfg);
    const ctx = { config: cfg, now: NOW, setup: null, row: null, model: { reportDate: r.date, dataAsOf: r.dataAsOf }, kind: 'premarket', premarket: { sessionDate: r.sessionDate, bias: r.bias, confidence: r.confidence, levels }, chart: { path: '/tmp/x.png' } };
    assert.deepEqual(blocking(validatePost(text, ctx)), []);
    assert.ok(blocking(validatePost(text.replace('BULLISH', 'BEARISH'), ctx)).some(i => i.code === 'value_mismatch'));
    assert.ok(blocking(validatePost(text.replace('74/100', '90/100'), ctx)).some(i => i.code === 'value_mismatch'));
    assert.ok(blocking(validatePost(text.replace('772.87 above', '780.00 above'), ctx)).some(i => i.code === 'value_mismatch'));
    assert.ok(blocking(validatePost(text.replace(PREMARKET_DISCLAIMER, ''), ctx)).some(i => i.code === 'missing_disclosure'));
    assert.ok(blocking(validatePost(text, { ...ctx, chart: null })).some(i => i.code === 'missing_chart'));
    assert.ok(blocking(validatePost(text.replace(/SPY levels: .*\n/, ''), ctx)).some(i => i.code === 'missing_indicator'));
  });

  it('card spec and alt text carry the same numbers as the text', () => {
    const cfg = stocksConfig();
    const spec = buildPremarketSpec(report(), cfg, '/tmp/card.png');
    assert.equal(spec.style, 'premarket');
    assert.equal(spec.bias, 'BULLISH');
    assert.equal(spec.biasColor, 'green');
    assert.equal(spec.confidence, 74);
    assert.equal(spec.tiles[0].label, 'S&P 500 futures');
    assert.equal(spec.tiles[0].color, 'green');
    assert.equal(spec.tiles[2].color, 'red'); // yields up is the red one
    assert.match(spec.levels.above, /^772\.87/);
    assert.equal(spec.event.title, 'Core CPI m/m');
    assert.equal(spec.disclosure, cfg.disclosure.trim());
    const alt = premarketAltText(report(), cfg);
    assert.match(alt, /Bullish, confidence 74 out of 100/);
    assert.ok(alt.includes(cfg.disclosure.trim()));
  });

  it('queuePremarket: one ready record per session, refuses a duplicate, refuses without a report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-post-'));
    const reportDir = join(dir, 'reports'); mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'premarket-2026-09-08.json'), JSON.stringify(report()));
    const cfg = { ...stocksConfig(), posting: { ...stocksConfig().posting, autoPublish: { ...stocksConfig().posting.autoPublish, enabled: true, via: 'browser', allowWarnings: true } } };
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'audit.jsonl')), now: () => NOW });
    const python = process.env.SOCIAL_PYTHON || 'python3';
    const s1 = await wf.queuePremarket({ date: '2026-09-08', chartOpts: { dir: join(dir, 'charts'), reportDir, python } });
    if (s1.refused && /missing_chart/.test(s1.refused)) { console.log('skipping: Pillow not available'); return; }
    assert.equal(s1.refused, null, s1.refused);
    assert.equal(s1.record.ready, true);
    assert.ok(s1.record.chart.endsWith('MKT-premarket-2026-09-08.png'));
    const ready = wf.audit.latest().filter(r => r.status === 'ready_to_post');
    assert.equal(ready.length, 1);
    assert.equal(ready[0].kind, 'premarket');
    assert.equal(ready[0].queue, 'stocks');
    assert.equal(ready[0].premarket.bias, 'Bullish');
    const s2 = await wf.queuePremarket({ date: '2026-09-08', chartOpts: { dir: join(dir, 'charts'), reportDir, python } });
    assert.match(s2.refused, /already ready_to_post/);
    const s3 = await wf.queuePremarket({ date: '2026-09-09', chartOpts: { dir: join(dir, 'charts'), reportDir, python } });
    assert.match(s3.refused, /no premarket report/);
  });
});

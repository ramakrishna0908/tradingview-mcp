/**
 * Social summary table + X post generator — unit tests (no TradingView needed).
 * Run: node --test tests/social.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseReportHtml, loadReportModel, parseCohort, num } from '../src/social/report-model.js';
import { classifySetup, buildSummaryTable, selectPostCandidates, cohortCandidates, renderMarkdownTable, SIGNAL, nearestLevels } from '../src/social/setup.js';
import { validatePost, blocking, xWeightedLength, textHash } from '../src/social/compliance.js';
import { generatePost, formatDataTimestamp } from '../src/social/generate.js';
import { loadConfig, resetConfigCache, DEFAULT_DISCLOSURE } from '../src/social/config.js';
import { AuditStore } from '../src/social/audit.js';
import { SocialWorkflow } from '../src/social/index.js';
import { oauth1Signature, oauth1Header, percentEncode, postTweet, uploadMedia, getCredentialsFromEnv } from '../src/social/x-client.js';
import { parseYahooChart, toYahooSymbol, parseIntradayQuote } from '../src/social/chart-data.js';
import { generateThreadReply, generateCloseUpdate, levelStatus } from '../src/social/thread.js';
import { buildChartSpec, chartAltText, makeChart, renderChartSpec, buildSweepChartSpec, sweepChartAltText } from '../src/social/chart.js';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORT_0831 = join(ROOT, 'docs', 'reports', 'daily-2026-08-31.html');
const REPORT_0904 = join(ROOT, 'docs', 'reports', 'daily-2026-09-04.html');
const HAVE_REPORT = existsSync(REPORT_0831);
const HAVE_0904 = existsSync(REPORT_0904);

// ─── fixtures ────────────────────────────────────────────────────────────────

const ROW = (over = {}) => ({
  symbol: 'XYZ', group: 'main', flags: '', price: 120.40, rsi: 64, rsiMa: 60, cmf: 0.19, cmfTrend: null,
  atr: 2.0, bbLower: 108.2, bbBasis: 115.0, bbUpper: 123.5, vwap: 110.0, cloudA: 112.0, cloudB: 109.0,
  position: 'above_cloud', structure: 'HH-up', score: 2.5, biasNext: 'Calls', ...over,
});

const MODEL = (rows, over = {}) => ({
  modelVersion: 1, reportDate: '2026-09-08', title: 't', sourcePath: null,
  dataAsOf: new Date().toISOString(), dataAsOfSource: 'test', timeframe: 'D', marketTheme: null, footer: null,
  rows, ...over,
});

// Two publishable rows on one report: the hero plus one thread reply, used by
// the CLI record regression test below.
const THREAD_REPORT_HTML = `<!DOCTYPE html><html><head><title>Daily Stock Report &mdash; 2026-09-08</title></head><body>
<h2>Market Theme</h2><p>Narrow tape.</p>
<table><thead><tr><th>Sym</th><th>Px</th><th>RSI / MA</th><th>CMF</th><th>ATR</th><th>BB L / Basis / Up</th><th>VWAP</th><th>Cloud A / B</th><th>Pos</th><th>HH/LL</th><th>Score</th><th>Bias-Next</th></tr></thead>
<tbody>
<tr><td>AAA</td><td>118.00</td><td>64.0 / 60.0</td><td>+0.19</td><td>2.00</td><td>108.20 / <b>115.00</b> / 123.50</td><td>110.00</td><td>112.00 / 109.00</td><td>Above cloud</td><td>HH-up</td><td>+2.5</td><td>Calls</td></tr>
<tr><td>BBB</td><td>118.00</td><td>64.0 / 60.0</td><td>+0.19</td><td>2.00</td><td>108.20 / <b>115.00</b> / 123.50</td><td>110.00</td><td>112.00 / 109.00</td><td>Above cloud</td><td>HH-up</td><td>+2.5</td><td>Calls</td></tr>
</tbody></table>
</body></html>`;

const MIN_HTML = `<!DOCTYPE html><html><head><title>Daily Stock Report &mdash; 2026-08-31</title></head><body>
<h2>Market Theme</h2><p>Narrow tape.</p>
<table><thead><tr><th>Sym</th><th>Px</th><th>RSI / MA</th><th>CMF</th><th>ATR</th><th>BB L / Basis / Up</th><th>VWAP</th><th>Cloud A / B</th><th>Pos</th><th>HH/LL</th><th>Score</th><th>Bias-Next</th></tr></thead>
<tbody>
<tr><td>MSTR</td><td>127.21</td><td>63.0 / 58.2</td><td>+0.12</td><td>7.58</td><td>79.56 / <b>108.10</b> / 136.64</td><td>124.31</td><td>115.77 / 110.80</td><td>Above cloud</td><td>HH-up</td><td>+2.5</td><td>Calls</td></tr>
<tr><td>APLD <span>A</span></td><td>25.06</td><td>38.0 / 45.0</td><td>&minus;0.22</td><td>2.18</td><td>25.11 / 28.76 / 32.41</td><td>34.99</td><td>27.63 / 35.80</td><td>Below cloud</td><td>LL-down</td><td>&minus;2.5</td><td>Puts</td></tr>
</tbody></table>
<h2>Defense &amp; Aerospace</h2>
<table><thead><tr><th>Sym</th><th>Px</th><th>RSI/MA</th><th>CMF</th><th>CMF Trend</th><th>ATR</th><th>BB L/Basis/Up</th><th>VWAP</th><th>Cloud A/B</th><th>Pos</th><th>HH/LL</th><th>Score</th><th>Bias-Next</th></tr></thead>
<tbody><tr><td>LMT</td><td>450.10</td><td>55.1/52.0</td><td>+0.05</td><td>+0.02 –</td><td>9.1</td><td>430/445/460</td><td>440.0</td><td>441.0/438.0</td><td>▲</td><td>HH-up</td><td>+1.5</td><td>lean</td></tr></tbody></table>
<footer>Generated 2026-08-31. Not investment advice.</footer></body></html>`;

function freshConfig() {
  resetConfigCache();
  // Tests pin the per-post disclosure so the disclosure checks are exercised;
  // the shipped config may place it in the bio instead.
  // Tests pin the free-tier limit, the per-post disclosure, charts off and the
  // API publish path so every check is exercised regardless of the shipped config.
  const cfg = loadConfig();
  return classicPins({
    ...cfg,
    charLimit: 280,
    disclosurePlacement: 'post',
    charts: { ...cfg.charts, enabled: false, volumeLine: false },
    posting: { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, via: 'api' } },
  });
}

/** The shipped configs use the sweep layout; these suites test the classic one. */
function classicPins(cfg) {
  return {
    ...cfg,
    postFormat: 'classic',
    priceDisplay: 'exact',
    cta: { enabled: true, text: 'Watching this setup? Bookmark it and follow for daily breakdowns.' },
    charts: { ...cfg.charts, style: 'classic', requireForPublish: false },
    hashtags: { ...cfg.hashtags, required: ['#NFA', '#DYOR'], maxTotal: 6, symbolTag: false, assetTag: null },
    // the classic suites assert cohort order and multi-post runs
    posting: { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, candidateOrder: 'report', maxPostsPerRun: 20 } },
  };
}

// ─── report model ────────────────────────────────────────────────────────────

describe('report model — HTML → structured JSON', () => {
  it('parses numbers with unicode minus, plus and $', () => {
    assert.equal(num('−0.22'), -0.22);
    assert.equal(num('+2.5'), 2.5);
    assert.equal(num('$1,517.88'), 1517.88);
    assert.equal(num('n/a'), null);
  });

  it('parses the main and defense tables with groups and positions', () => {
    const m = parseReportHtml(MIN_HTML);
    assert.equal(m.reportDate, '2026-08-31');
    assert.equal(m.rows.length, 3);
    const mstr = m.rows.find(r => r.symbol === 'MSTR');
    assert.deepEqual([mstr.price, mstr.rsi, mstr.cmf, mstr.bbBasis, mstr.bbUpper, mstr.cloudA, mstr.score],
      [127.21, 63, 0.12, 108.10, 136.64, 115.77, 2.5]);
    assert.equal(mstr.position, 'above_cloud');
    assert.equal(mstr.structure, 'HH-up');
    const apld = m.rows.find(r => r.symbol === 'APLD');
    assert.equal(apld.group, 'anness');
    assert.equal(apld.cmf, -0.22);
    assert.equal(apld.score, -2.5);
    const lmt = m.rows.find(r => r.symbol === 'LMT');
    assert.equal(lmt.group, 'defense');
    assert.equal(lmt.position, 'above_cloud');
    assert.equal(lmt.cmfTrend, '+0.02 –');
    assert.equal(m.marketTheme, 'Narrow tape.');
  });

  it('uses the run log "report ready" time as the data timestamp', () => {
    const log = '=== Mon Aug 31 09:35:00 EDT 2026 starting daily report ===\nMon Aug 31 09:49:09 EDT 2026: report ready -> x.html\n';
    const m = parseReportHtml(MIN_HTML, { runLog: log });
    assert.equal(m.dataAsOf, '2026-08-31T13:49:09.000Z');
    assert.equal(m.dataAsOfSource, 'run-log');
  });

  it('caches a JSON model next to the HTML and reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'social-'));
    const html = join(dir, 'daily-2026-08-31.html');
    writeFileSync(html, MIN_HTML);
    const first = loadReportModel(html);
    assert.equal(first.source, 'html');
    assert.ok(existsSync(join(dir, 'daily-2026-08-31.json')));
    const second = loadReportModel(html);
    assert.equal(second.source, 'json');
    assert.deepEqual(second.model.rows, first.model.rows);
  });

  it('parses the Cohort Summary: list form, "SYM (+2.5) and SYM" prose, scored mentions; watches excluded', () => {
    const rows = [
      ROW({ symbol: 'AAA', score: 2.5 }), ROW({ symbol: 'BBB', score: 2.0 }), ROW({ symbol: 'CCC', score: 2.0 }),
      ROW({ symbol: 'DDD', score: -2.0 }), ROW({ symbol: 'EEE', score: -2.5 }), ROW({ symbol: 'FFF', score: 0.5 }),
      ROW({ symbol: 'GGG', score: 2.0 }), ROW({ symbol: 'HHH', score: -2.0 }),
    ];
    const html = `<h2>Cohort Summary</h2><div>🟢 Calls (3): AAA +2.5, BBB +2.0, CCC +2.0. Unlike FFF, all above basis.</div>
      <div>🔴 Puts (2): DDD −2.0 is the headline. EEE −2.5 rounds it out.</div>
      <div>⚠️ Watches: GGG — demoted from Calls, flow fading. HHH — removed from Puts: seller exhaustion.</div>
      <div>Flow breadth: 1 improving.</div>`;
    const c = parseCohort(html, rows);
    assert.deepEqual(c.calls.map(x => x.symbol), ['AAA', 'BBB', 'CCC']);   // FFF mentioned but below the bar
    assert.deepEqual(c.puts.map(x => x.symbol), ['DDD', 'EEE']);
    assert.ok(c.watches.includes('GGG') && c.watches.includes('HHH'));       // demoted/removed never come back
    assert.equal(parseCohort('<p>No cohort here</p>', rows), null);
  });

  it('parses the real 2026-09-04 cohort lists exactly as the report states them', { skip: !HAVE_0904 }, () => {
    const m = parseReportHtml(readFileSync(REPORT_0904, 'utf8'));
    assert.deepEqual(m.cohort.calls.map(x => x.symbol), ['AAPL', 'HOOD', 'MSTR', 'BMNR', 'CRCL', 'MSFT', 'TSLA', 'NFLX', 'SNDK', 'DELL']);
    assert.deepEqual(m.cohort.puts.map(x => x.symbol), ['LUNR', 'MCD', 'MRVL', 'SOUN']);
    for (const s of ['SPCX', 'ACN', 'AVGO', 'CRWV', 'SOFI']) assert.ok(m.cohort.watches.includes(s), s);
  });

  it('attaches day-over-day CMF from the previous report in the directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prior-'));
    const prev = MIN_HTML.replace('2026-08-31', '2026-08-28').replace('<td>+0.12</td>', '<td>+0.20</td>');
    writeFileSync(join(dir, 'daily-2026-08-28.html'), prev);
    writeFileSync(join(dir, 'daily-2026-08-31.html'), MIN_HTML);
    const { model } = loadReportModel(join(dir, 'daily-2026-08-31.html'));
    assert.equal(model.priorReportDate, '2026-08-28');
    const mstr = model.rows.find(r => r.symbol === 'MSTR');
    assert.equal(mstr.cmfPrev, 0.20);
    assert.equal(mstr.cmfDelta, -0.08);
    assert.equal(mstr.cmfTrendLabel, 'deteriorating');
    const s = classifySetup(mstr);
    assert.equal(s.cmfDelta, -0.08);
    const cfg = { ...freshConfig(), charLimit: 4000 }; // at 280 with an in-post disclosure the note is the last thing trimmed
    const { text } = generatePost(s, model, cfg);
    assert.match(text, /CMF: \+0\.12 \(−0\.08 vs prior day\)/);
    const row = mstr;
    assert.deepEqual(blocking(validatePost(text, { setup: s, row, model, config: cfg })), []);
    assert.ok(blocking(validatePost(text.replace('−0.08 vs', '+0.08 vs'), { setup: s, row, model, config: cfg })).some(i => i.code === 'value_mismatch'));
    // the first report in a directory has no prior → no note
    const first = loadReportModel(join(dir, 'daily-2026-08-28.html')).model;
    assert.equal(first.rows[0].cmfDelta ?? null, null);
  });

  it('parses the real 2026-08-31 report (41 rows, MSTR on top)', { skip: !HAVE_REPORT }, () => {
    const m = parseReportHtml(readFileSync(REPORT_0831, 'utf8'));
    assert.equal(m.reportDate, '2026-08-31');
    assert.equal(m.rows.length, 41);
    assert.equal(m.rows[0].symbol, 'MSTR');
    const aapl = m.rows.find(r => r.symbol === 'AAPL');
    assert.equal(aapl.cmf, 0.20);
    assert.ok(m.rows.every(r => r.price != null && r.score != null));
    assert.deepEqual(m.cohort.calls.map(x => x.symbol), ['MSTR', 'NFLX', 'PLTR', 'ACN', 'CRCL', 'AAPL', 'MSFT', 'BMNR', 'SPCX']);
    // META is in the report's Puts list but carries the ⚑ trial flag and sits in Watches → excluded
    assert.deepEqual(m.cohort.puts.map(x => x.symbol), ['SMH', 'AMD', 'MRVL', 'CRWV', 'AVGO', 'UNH', 'SOFI', 'IREN', 'APLD']);
  });
});

// ─── setup classification ────────────────────────────────────────────────────

describe('setup classification (labels only — never recomputes the score)', () => {
  it('nearest levels: support below price, resistance above', () => {
    const l = nearestLevels(ROW());
    assert.equal(l.support.value, 115.0);
    assert.equal(l.support.label, '20d basis');
    assert.equal(l.resistance.value, 123.5);
  });

  it('bullish, aligned, not stretched → CONFIRMED momentum continuation', () => {
    const s = classifySetup(ROW({ price: 118.0 }));
    assert.equal(s.signal, SIGNAL.CONFIRMED);
    assert.equal(s.setup, 'Trend continuation');
    assert.equal(s.confidence, 'High');
  });

  it('just above the basis (within 1.25 ATR) → Basis reclaim', () => {
    const s = classifySetup(ROW({ price: 116.5 }));
    assert.equal(s.setup, 'Basis reclaim');
    assert.equal(s.signal, SIGNAL.CONFIRMED);
  });

  it('price at the upper band with RSI < 68 → Breakout WATCH (resistance not cleared)', () => {
    const s = classifySetup(ROW({ price: 122.0 }));
    assert.equal(s.setup, 'Breakout watch');
    assert.equal(s.signal, SIGNAL.WATCH);
  });

  it('stretched at the band with RSI ≥ 68, or above the band at any RSI → exhaustion watch, Low', () => {
    const s = classifySetup(ROW({ price: 123.0, rsi: 71 }));
    assert.match(s.setup, /exhaustion watch/);
    assert.equal(s.confidence, 'Low');
    const above = classifySetup(ROW({ price: 125.0, rsi: 65 })); // through the 123.5 upper band
    assert.match(above.setup, /exhaustion watch/);
    assert.equal(above.signal, SIGNAL.WATCH);
  });

  it('bullish score without flow/cloud alignment is only a WATCH, and says so', () => {
    const s = classifySetup(ROW({ price: 118, cmf: 0.05, position: 'in_cloud' }));
    assert.equal(s.signal, SIGNAL.WATCH);
    assert.equal(s.confidence, 'Low');
    assert.match(s.rationale, /not all aligned/);
    const bear = classifySetup(ROW({ price: 111, rsi: 42, cmf: 0.02, position: 'below_cloud', structure: 'LL-down', score: -2, cloudA: 114, cloudB: 116 }));
    assert.equal(bear.setup, 'Seller exhaustion watch');
    const bear2 = classifySetup(ROW({ price: 111, rsi: 42, cmf: -0.05, position: 'below_cloud', structure: 'LL-down', score: -2, cloudA: 114, cloudB: 116 }));
    assert.equal(bear2.signal, SIGNAL.WATCH);
    assert.match(bear2.rationale, /not all confirmed/);
  });

  it('bearish aligned mid-band → Breakdown CONFIRMED; at lower band → exhaustion WATCH', () => {
    const bear = ROW({ price: 111, rsi: 42, cmf: -0.25, position: 'below_cloud', structure: 'LL-down', score: -2.5, cloudA: 114, cloudB: 116 });
    const s = classifySetup(bear);
    assert.equal(s.setup, 'Breakdown');
    assert.equal(s.signal, SIGNAL.CONFIRMED);
    assert.equal(s.confidence, 'High');
    const t = classifySetup({ ...bear, price: 108.5 });
    assert.equal(t.setup, 'Bearish exhaustion watch');
    assert.equal(t.signal, SIGNAL.WATCH);
  });

  it('bearish score with non-negative flow → seller exhaustion watch', () => {
    const s = classifySetup(ROW({ price: 111, rsi: 40, cmf: 0.02, position: 'below_cloud', structure: 'LL-down', score: -2 }));
    assert.equal(s.setup, 'Seller exhaustion watch');
    assert.equal(s.signal, SIGNAL.WATCH);
  });

  it('|score| < 2 with positive flow below basis → bullish divergence watch', () => {
    const s = classifySetup(ROW({ price: 113, rsi: 43, cmf: 0.11, score: -0.5, structure: 'range' }));
    assert.equal(s.setup, 'Bullish divergence watch');
    assert.equal(s.direction, 'bullish');
  });

  it('table is ordered by quality and candidates respect the posting bar', () => {
    const rows = [
      ROW({ symbol: 'AAA', price: 118 }),                               // confirmed high
      ROW({ symbol: 'BBB', price: 118, cmf: 0.12 }),                    // confirmed medium
      ROW({ symbol: 'CCC', price: 118, cmf: 0.05 }),                    // watch low
      ROW({ symbol: 'DDD', price: 116, score: 0.5, cmf: 0.0 }),         // range
    ];
    const table = buildSummaryTable(MODEL(rows));
    assert.deepEqual(table.map(t => t.symbol), ['AAA', 'BBB', 'CCC', 'DDD']);
    const picks = selectPostCandidates(table, { allowedSignals: ['CONFIRMED', 'WATCH'], minConfidence: 'Medium', maxDraftsPerReport: 3 });
    assert.deepEqual(picks.map(p => p.symbol), ['AAA', 'BBB']);
    const md = renderMarkdownTable(table);
    assert.match(md, /\| Ticker \| Setup \| Price \| RSI \| CMF \| Support \| Resistance \| Signal \| Confidence \|/);
    assert.match(md, /\| AAA \| Trend continuation \| 118.00 \| 64 \| \+0.19 \| 115.00 \| 123.50 \| CONFIRMED SETUP \| High \|/);
  });
});

// ─── generation + compliance ─────────────────────────────────────────────────

describe('post generation', () => {
  it('produces a compliant post under 280 weighted chars with all required parts', () => {
    const cfg = freshConfig();
    const row = ROW({ price: 118.0 });
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const { text, length } = generatePost(setup, model, cfg);
    assert.ok(length <= 280, `length ${length}`);
    assert.match(text, /^👀 \$XYZ — Trend continuation · Confirmed Setup\n/);
    assert.match(text, /Price: \$118\.00 · RSI: 64 · CMF: \+0\.19/);
    assert.match(text, /Support: \$115\.00 · Resistance: \$123\.50/);
    assert.match(text, /Invalidation: /);
    assert.match(text, /\n#NFA #DYOR/);
    assert.match(text, /Data: \w{3} \d{1,2}, 20\d\d \d{1,2}:\d\d [AP]M ET/);
    assert.ok(text.includes(DEFAULT_DISCLOSURE + '\n#NFA #DYOR'));
    const issues = validatePost(text, { setup, row, model, config: cfg });
    assert.deepEqual(blocking(issues), []);
  });

  it('includes the rationale when the configured limit allows it (e.g. X Premium)', () => {
    const cfg = { ...freshConfig(), charLimit: 4000 };
    const row = ROW({ price: 118.0 });
    const setup = classifySetup(row);
    const { text } = generatePost(setup, MODEL([row]), cfg);
    assert.ok(text.includes(setup.rationale));
    assert.match(text, /Watching this setup\? Bookmark it and follow for daily breakdowns\.\nData: daily · /);
    assert.match(text, /#NFA #DYOR #Momentum #Stocks #TechnicalAnalysis #StockMarket$/);
    assert.deepEqual(blocking(validatePost(text, { setup, row, model: MODEL([row]), config: cfg })), []);
    const tight = generatePost(setup, MODEL([row]), { ...cfg, charLimit: 280 }).text;
    assert.ok(!tight.includes(setup.rationale));
  });

  it('disclosurePlacement "bio" drops the line from posts and skips the disclosure checks, hashtags still required', () => {
    const cfg = { ...freshConfig(), disclosurePlacement: 'bio' };
    const row = ROW({ price: 118.0 });
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg);
    assert.ok(!text.includes(DEFAULT_DISCLOSURE));
    assert.match(text, /\n#NFA #DYOR/);
    assert.match(text, /Upside level: \$123\.50 \(resistance test\)\nInvalidation: lose and hold below \$115\.00\n/);
    const issues = validatePost(text, { setup, row, model, config: cfg });
    assert.deepEqual(blocking(issues), []);
    assert.ok(!issues.some(i => i.code === 'disclosure_position'));
    assert.ok(blocking(validatePost(text.replace('#NFA #DYOR', ''), { setup, row, model, config: cfg })).some(i => i.code === 'missing_hashtag'));
    resetConfigCache();
    const bad = join(mkdtempSync(join(tmpdir(), 'dp-')), 'c.json');
    writeFileSync(bad, JSON.stringify({ disclosurePlacement: 'nowhere' }));
    assert.throws(() => loadConfig(bad), /disclosurePlacement/);
    resetConfigCache();
  });

  it('formats timestamps in ET', () => {
    assert.equal(formatDataTimestamp('2026-08-31T13:49:09.000Z'), 'Aug 31, 2026 9:49 AM ET');
  });

  it('uses the configured disclosure, not a hard-coded one', () => {
    resetConfigCache();
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    const p = join(dir, 'c.json');
    writeFileSync(p, JSON.stringify({ disclosure: 'Custom legal text.', disclosurePlacement: 'post' }));
    const cfg = loadConfig(p);
    const row = ROW({ price: 118 });
    const { text } = generatePost(classifySetup(row), MODEL([row]), cfg);
    assert.match(text, /Custom legal text\.\n#NFA #DYOR/);
    assert.equal(cfg.posting.autoPublish.enabled, false);
    resetConfigCache();
  });
});

describe('X weighted length', () => {
  it('counts ASCII as 1, emoji as 2, URLs as 23', () => {
    assert.equal(xWeightedLength('abc'), 3);
    assert.equal(xWeightedLength('👀'), 2);
    assert.equal(xWeightedLength('see https://example.com/a/very/long/path/that/goes/on'), 4 + 23);
  });
});

describe('compliance validation', () => {
  let cfg, row, setup, model, base;
  beforeEach(() => {
    cfg = freshConfig();
    row = ROW({ price: 118.0 });
    setup = classifySetup(row);
    model = MODEL([row]);
    base = generatePost(setup, model, cfg).text;
  });
  const codes = (text, extra = {}) => blocking(validatePost(text, { setup, row, model, config: cfg, ...extra })).map(i => i.code);

  it('blocks the character limit', () => {
    assert.ok(codes(base + '\n' + 'x'.repeat(200)).includes('char_limit'));
  });

  it('blocks prohibited / promotional wording', () => {
    for (const bad of ['Guaranteed breakout', 'easy profit here', 'You should buy this', 'must buy', 'risk-free trade']) {
      assert.ok(codes(base.replace('Invalidation:', bad + ' Invalidation:')).includes('prohibited_wording'), bad);
    }
  });

  it('blocks personalized advice', () => {
    assert.ok(codes(base.replace('Invalidation:', 'Great for your portfolio. Invalidation:')).includes('personalized_advice'));
  });

  it('blocks a missing disclosure', () => {
    assert.ok(codes(base.replace(DEFAULT_DISCLOSURE, '')).includes('missing_disclosure'));
  });

  it('blocks stale report data unless explicitly acknowledged', () => {
    const stale = { ...model, dataAsOf: new Date(Date.now() - 48 * 3600_000).toISOString() };
    assert.ok(codes(base, { model: stale }).includes('stale_data'));
    const acked = validatePost(base, { setup, row, model: stale, config: cfg, staleAcknowledged: true });
    assert.ok(!blocking(acked).some(i => i.code === 'stale_data'));
    assert.ok(acked.some(i => i.code === 'stale_data_acknowledged' && i.severity === 'warn'));
  });

  it('blocks unsupported forward-looking claims', () => {
    assert.ok(codes(base.replace('Invalidation:', 'Price will rally to the band. Invalidation:')).includes('unsupported_claim'));
    assert.ok(codes(base.replace('Invalidation:', 'Price target $150.00. Invalidation:')).includes('unsupported_claim'));
  });

  it('blocks duplicates: same text, or same ticker+report already approved/published', () => {
    const prior = [{ id: 'old', symbol: 'XYZ', reportDate: model.reportDate, status: 'published', textHash: textHash(base) }];
    assert.ok(codes(base, { priorRecords: prior, draftId: 'new' }).includes('duplicate_post'));
    const prior2 = [{ id: 'old', symbol: 'XYZ', reportDate: model.reportDate, status: 'approved', textHash: 'other' }];
    assert.ok(codes(base, { priorRecords: prior2, draftId: 'new' }).includes('duplicate_post'));
    const rejected = [{ id: 'old', symbol: 'XYZ', reportDate: model.reportDate, status: 'rejected', textHash: textHash(base) }];
    assert.ok(!codes(base, { priorRecords: rejected, draftId: 'new' }).includes('duplicate_post'));
  });

  it('blocks missing indicators', () => {
    assert.ok(codes(base.replace('RSI: 64 · CMF: +0.19', 'momentum ok')).includes('missing_indicator'));
    assert.ok(codes(base.replace(/Support: \$115\.00 · Resistance: \$123\.50/, 'levels tbd').replace(/Upside level: .*\n/, '')).includes('missing_indicator'));
  });

  it('blocks wrong ticker, wrong price, and numbers not in the report', () => {
    assert.ok(codes(base.replace('$XYZ', '$ABC')).includes('ticker_mismatch'));
    assert.ok(codes(base.replace('Price: $118.00', 'Price: $119.00')).includes('price_mismatch'));
    assert.ok(codes(base.replace('$123.50', '$130.00')).includes('value_mismatch'));
    assert.ok(codes(base.replace('RSI: 64', 'RSI: 72')).includes('value_mismatch'));
    assert.ok(codes(base.replace('CMF: +0.19', 'CMF: +0.40')).includes('value_mismatch'));
    assert.ok(codes(base.replace('CMF: +0.19', 'CMF: +0.19 (+0.10 vs prior day)')).includes('value_mismatch')); // no prior report in this fixture
  });

  it('requires the configured hashtags and blocks promotional ones', () => {
    assert.ok(codes(base.replace('#NFA #DYOR', '#DYOR')).includes('missing_hashtag'));
    assert.ok(codes(base.replace('#NFA #DYOR', '#NFA #DYOR #ToTheMoon')).includes('prohibited_hashtag'));
    const spam = base + ' #a #b #c #d #e #f';
    assert.ok(validatePost(spam, { setup, row, model, config: cfg }).some(i => i.code === 'too_many_hashtags'));
  });

  it('accepts a trailing hashtag-only line after the disclosure, but not prose', () => {
    const ok = validatePost(base, { setup, row, model, config: cfg });
    assert.ok(!ok.some(i => i.code === 'disclosure_position'));
    const bad = validatePost(base + '\nBuy the dip!', { setup, row, model, config: cfg });
    assert.ok(bad.some(i => i.code === 'disclosure_position'));
  });

  it('never lets a WATCH be upgraded to a confirmed setup', () => {
    const watchRow = ROW({ price: 122.0 });
    const watch = classifySetup(watchRow);
    assert.equal(watch.signal, SIGNAL.WATCH);
    const text = generatePost(watch, MODEL([watchRow]), cfg).text;
    const upgraded = text.replace('Breakout watch', 'Breakout · Confirmed Setup');
    const issues = blocking(validatePost(upgraded, { setup: watch, row: watchRow, model: MODEL([watchRow]), config: cfg })).map(i => i.code);
    assert.ok(issues.includes('signal_upgraded'));
  });

  it('requires downside/risk context and a data timestamp', () => {
    const noRisk = base.split('\n').filter(l => !l.startsWith('Invalidation:')).join('\n');
    assert.ok(codes(noRisk).includes('missing_risk_context'));
    const noTs = base.split('\n').filter(l => !l.startsWith('Data:')).join('\n');
    assert.ok(codes(noTs).includes('missing_timestamp'));
  });
});

// ─── workflow + audit ────────────────────────────────────────────────────────

describe('workflow: draft → validate → edit → approve → publish, fully audited', () => {
  let wf, model, row, auditPath;
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-'));
    auditPath = join(dir, 'audit.jsonl');
    row = ROW({ price: 118.0 });
    model = MODEL([row]);
    wf = new SocialWorkflow({ config: freshConfig(), audit: new AuditStore(auditPath), actor: 'tester' });
  });

  it('drafts only candidates above the bar, and never auto-publishes', async () => {
    const recs = await wf.draft(model);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].status, 'draft');
    assert.equal(recs[0].publication, null);
    assert.deepEqual(blocking(recs[0].issues), []);
  });

  it('edit invalidates approval; approve is refused with blocking issues', async () => {
    const [d] = await wf.draft(model);
    const approved = wf.approve(d.id, model);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.approval.by, 'tester');

    const edited = wf.edit(d.id, approved.originalText.replace('Invalidation:', 'Guaranteed win. Invalidation:'), model);
    assert.equal(edited.status, 'edited');
    assert.equal(edited.approval, null);
    assert.throws(() => wf.approve(d.id, model), /Approval refused.*Prohibited phrase/);
    await assert.rejects(wf.publish(d.id, model, { creds: { type: 'oauth2', accessToken: 'x' } }), /Only approved drafts/);
  });

  it('publishes the exact approved text via the X API and records the post id', async () => {
    const [d] = await wf.draft(model);
    wf.approve(d.id, model);
    let sent = null;
    const fetchImpl = async (url, init) => {
      sent = { url, init };
      return { ok: true, status: 201, json: async () => ({ data: { id: '1234567890', text: 'x' } }) };
    };
    const pub = await wf.publish(d.id, model, { fetchImpl, creds: { type: 'oauth2', accessToken: 'tok' } });
    assert.equal(pub.status, 'published');
    assert.equal(pub.publication.xPostId, '1234567890');
    assert.equal(pub.publication.method, 'x-api');
    assert.equal(sent.url, 'https://api.x.com/2/tweets');
    assert.equal(sent.init.headers.Authorization, 'Bearer tok');
    assert.equal(JSON.parse(sent.init.body).text, d.originalText);

    // audit history: draft → approved → publishing → published
    const statuses = wf.audit.history(d.id).map(r => r.status);
    assert.deepEqual(statuses, ['draft', 'approved', 'publishing', 'published']);
    const final = wf.audit.get(d.id);
    assert.equal(final.originalText, d.originalText);
    assert.equal(final.editedText, null);
    assert.equal(final.dataAsOf, model.dataAsOf);
    assert.ok(final.approval.at && final.publication.at);

    // a second draft for the same ticker/report is now a duplicate
    const [again] = await wf.draft(model, { symbol: 'XYZ' });
    assert.ok(again.issues.some(i => i.code === 'duplicate_post'));
    assert.throws(() => wf.approve(again.id, model), /duplicate|already published/i);
  });

  it('records API failures without marking published', async () => {
    const [d] = await wf.draft(model);
    wf.approve(d.id, model);
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ detail: 'Forbidden' }) });
    const res = await wf.publish(d.id, model, { fetchImpl, creds: { type: 'oauth2', accessToken: 'tok' } });
    assert.equal(res.status, 'failed');
    assert.equal(res.error, 'Forbidden');
    assert.equal(res.publication, null);
  });

  it('stale data needs an explicit, audited acknowledgement to approve', async () => {
    const stale = { ...model, dataAsOf: new Date(Date.now() - 72 * 3600_000).toISOString() };
    const [d] = await wf.draft(stale);
    assert.ok(d.issues.some(i => i.code === 'stale_data'));
    assert.throws(() => wf.approve(d.id, stale), /Report data is/);
    const ok = wf.approve(d.id, stale, { acknowledgeStale: 'sample post from the 08-31 report' });
    assert.equal(ok.status, 'approved');
    assert.equal(ok.staleAcknowledged.reason, 'sample post from the 08-31 report');
    assert.equal(ok.staleAcknowledged.by, 'tester');
  });

  it('manual publication is recorded only for approved drafts', async () => {
    const [d] = await wf.draft(model);
    assert.throws(() => wf.recordManualPublication(d.id, model, { xPostId: '1' }), /Only approved/);
    wf.approve(d.id, model);
    const rec = wf.recordManualPublication(d.id, model, { xPostId: '42' });
    assert.equal(rec.status, 'published');
    assert.equal(rec.publication.method, 'manual');
    assert.equal(rec.publication.url, 'https://x.com/i/web/status/42');
  });
});

// ─── auto-publish policy ─────────────────────────────────────────────────────

describe('auto-publish: policy-gated, audited, never overrides freshness', () => {
  let wf, auditPath, cfg;
  const okFetch = (id = '777') => async () => ({ ok: true, status: 201, json: async () => ({ data: { id } }) });
  const creds = { type: 'oauth2', accessToken: 'tok' };
  beforeEach(() => {
    auditPath = join(mkdtempSync(join(tmpdir(), 'auto-')), 'audit.jsonl');
    cfg = { ...freshConfig() };
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, maxPostsPerRun: 2, candidateSource: 'table', requireSignal: 'CONFIRMED', minConfidence: 'High', spacingSeconds: 0 } };
    wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(auditPath), actor: 'cron' });
  });

  it('report-cohort source posts exactly the report\'s Calls then Puts, spaced, labels never upgraded', async () => {
    const rows = [
      ROW({ symbol: 'AAA', price: 118 }),                                    // call, confirmed
      ROW({ symbol: 'BBB', price: 122 }),                                    // call, but at the band → posts as Breakout watch
      ROW({ symbol: 'CCC', price: 111, rsi: 42, cmf: -0.25, position: 'below_cloud', structure: 'LL-down', score: -2.5, cloudA: 114, cloudB: 116 }), // put
      ROW({ symbol: 'DDD', price: 118 }),                                    // call listed but skipped by keyword
      ROW({ symbol: 'EEE', price: 118, biasNext: 'Calls' }),                 // NOT in the cohort → never posted
    ];
    rows[3].biasNext = 'Call — earnings 09-10 AMC';
    const model = MODEL(rows, { cohort: { source: 't', calls: [{ symbol: 'AAA', score: 2.5 }, { symbol: 'BBB', score: 2.5 }, { symbol: 'DDD', score: 2.5 }], puts: [{ symbol: 'CCC', score: -2.5 }], watches: [] } });
    const cohortCfg = { ...cfg, posting: { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, candidateSource: 'report-cohort', requireSignal: null, minConfidence: 'Low', maxPostsPerRun: 20, spacingSeconds: 120 } } };
    const w = new SocialWorkflow({ config: cohortCfg, audit: new AuditStore(join(mkdtempSync(join(tmpdir(), 'coh-')), 'a.jsonl')) });
    const sleeps = [];
    const r = await w.autoPublish(model, { creds, fetchImpl: okFetch('5'), sleep: async ms => { sleeps.push(ms); } });
    assert.equal(r.refused, null);
    assert.deepEqual(r.published.map(p => p.symbol), ['AAA', 'BBB', 'CCC']);
    assert.deepEqual(r.published.map(p => p.cohort), ['calls', 'calls', 'puts']);
    assert.match(r.published[1].text, /Breakout watch/);                    // report Call, still a WATCH label
    assert.deepEqual(sleeps, [120000, 120000]);                              // spaced between posts, none before the first
    assert.match(r.skipped.find(s => s.symbol === 'DDD').reason, /earnings/);
    assert.ok(!r.skipped.some(s => s.symbol === 'EEE'));
    assert.deepEqual(cohortCandidates(model, buildSummaryTable(model)).map(s => s.symbol), ['AAA', 'BBB', 'DDD', 'CCC']);
  });

  it('report-cohort source refuses when the report has no cohort lists', async () => {
    const cohortCfg = { ...cfg, posting: { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, candidateSource: 'report-cohort' } } };
    const w = new SocialWorkflow({ config: cohortCfg, audit: new AuditStore(auditPath) });
    const r = await w.autoPublish(MODEL([ROW({ price: 118 })], { cohort: null }), { creds, fetchImpl: okFetch() });
    assert.match(r.refused, /no Calls\/Puts cohort/);
  });

  it('is refused when disabled in config or by the kill switch', async () => {
    const off = new SocialWorkflow({ config: { ...cfg, posting: { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: false } } }, audit: new AuditStore(auditPath) });
    const r = await off.autoPublish(MODEL([ROW({ price: 118 })]), { creds, fetchImpl: okFetch() });
    assert.match(r.refused, /disabled/);
    resetConfigCache();
    process.env.SOCIAL_AUTO_PUBLISH = '0';
    const killed = loadConfig();
    delete process.env.SOCIAL_AUTO_PUBLISH;
    resetConfigCache();
    assert.equal(killed.posting.autoPublish.enabled, false);
    assert.equal(killed.posting.autoPublish.disabledBy, 'SOCIAL_AUTO_PUBLISH=0');
  });

  it('never publishes stale data, even with acknowledgement machinery available', async () => {
    const stale = MODEL([ROW({ price: 118 })], { dataAsOf: new Date(Date.now() - 30 * 3600_000).toISOString() });
    const r = await wf.autoPublish(stale, { creds, fetchImpl: okFetch() });
    assert.match(r.refused, /never overrides freshness/);
    assert.equal(wf.audit.latest().length, 0);
  });

  it('refuses on market holidays and weekends', async () => {
    const hol = new SocialWorkflow({ config: { ...cfg, marketHolidays: ['2026-09-07'] }, audit: new AuditStore(auditPath) });
    const r = await hol.autoPublish(MODEL([ROW({ price: 118 })], { reportDate: '2026-09-07' }), { creds, fetchImpl: okFetch() });
    assert.match(r.refused, /market holiday/);
    const w = await hol.autoPublish(MODEL([ROW({ price: 118 })], { reportDate: '2026-09-06' }), { creds, fetchImpl: okFetch() });
    assert.match(w.refused, /weekend/);
  });

  it('refuses without API credentials (no manual/browser path)', async () => {
    const r = await wf.autoPublish(MODEL([ROW({ price: 118 })]), { creds: null });
    assert.match(r.refused, /credentials/);
  });

  it('publishes only CONFIRMED/High rows, skipping flagged, keyworded, low-confidence and cooled-down names', async () => {
    const rows = [
      ROW({ symbol: 'AAA', price: 118 }),                                             // confirmed high → post
      ROW({ symbol: 'BBB', price: 118, cmf: 0.12 }),                                  // confirmed medium → skip
      ROW({ symbol: 'CCC', price: 118, flags: '⚑' }),                                 // catalyst flag → skip
      ROW({ symbol: 'DDD', price: 118, biasNext: 'Calls — but earnings Thu AMC' }),   // keyword → skip
      ROW({ symbol: 'EEE', price: 122 }),                                             // breakout WATCH → skip
      ROW({ symbol: 'FFF', price: 118 }),                                             // confirmed high → post (2nd)
      ROW({ symbol: 'GGG', price: 118 }),                                             // over maxPostsPerRun → not reached
    ];
    const model = MODEL(rows);
    const r = await wf.autoPublish(model, { creds, fetchImpl: okFetch('9001') });
    assert.equal(r.refused, null);
    assert.deepEqual(r.published.map(p => p.symbol), ['AAA', 'FFF']);
    assert.equal(r.published[0].xPostId, '9001');
    // The table is quality-sorted, so the run stops at the cap before the
    // Medium/WATCH rows are even considered; only the guard skips are logged.
    const reasons = Object.fromEntries(r.skipped.map(s => [s.symbol, s.reason]));
    assert.match(reasons.CCC, /catalyst flag/);
    assert.match(reasons.DDD, /earnings/);
    assert.equal(reasons.GGG, undefined);

    // With the cap lifted, the lower-quality rows are skipped for the right reasons.
    const wide = new SocialWorkflow({ config: { ...cfg, posting: { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, maxPostsPerRun: 10 } } }, audit: new AuditStore(join(mkdtempSync(join(tmpdir(), 'auto2-')), 'a.jsonl')) });
    const r2 = await wide.autoPublish(model, { creds, fetchImpl: okFetch('9003') });
    const reasons2 = Object.fromEntries(r2.skipped.map(s => [s.symbol, s.reason]));
    assert.deepEqual(r2.published.map(p => p.symbol), ['AAA', 'FFF', 'GGG']);
    assert.match(reasons2.BBB, /confidence Medium/);
    assert.match(reasons2.EEE, /signal WATCH/);

    const aaa = wf.audit.latest().find(x => x.symbol === 'AAA');
    assert.equal(aaa.status, 'published');
    assert.equal(aaa.approval.by, 'auto-publish policy');
    assert.equal(aaa.publication.method, 'x-api');
    assert.match(aaa.originalText, /#NFA #DYOR/);

    // second run off the SAME report: the two published setups already fill the
    // cap, so nothing else is queued — the day's heroes are the day's heroes.
    const again = await wf.autoPublish(model, { creds, fetchImpl: okFetch('9002') });
    assert.deepEqual(again.published, []);
    assert.deepEqual([...again.pending].sort(), ['AAA', 'FFF']);
    assert.equal(again.capped, true);
    assert.ok(!again.skipped.some(s => s.symbol === 'GGG' && /cooldown/.test(s.reason)));
  });

  it('via "browser": policy-approves into ready_to_post, nothing is sent, record marks it published', async () => {
    const browserCfg = { ...cfg, posting: { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, via: 'browser' } } };
    const w = new SocialWorkflow({ config: browserCfg, audit: new AuditStore(join(mkdtempSync(join(tmpdir(), 'br-')), 'a.jsonl')) });
    let called = false;
    const model = MODEL([ROW({ price: 118 })]);
    const r = await w.autoPublish(model, { creds: null, fetchImpl: async () => { called = true; } });
    assert.equal(r.refused, null);              // no API credentials needed in browser mode
    assert.equal(r.via, 'browser');
    assert.equal(called, false);
    assert.equal(r.published[0].ready, true);
    const ready = w.ready();
    assert.equal(ready.length, 1);
    assert.equal(ready[0].status, 'ready_to_post');
    assert.equal(ready[0].approval.by, 'auto-publish policy');
    const rec = w.recordManualPublication(ready[0].id, model, { xPostId: '999' });
    assert.equal(rec.status, 'published');
    assert.equal(rec.publication.method, 'browser');
    assert.equal(w.ready().length, 0);
    const again = await w.autoPublish(model, { creds: null });
    assert.equal(again.published.length, 0);   // duplicate / cooldown
  });

  it('rehearse builds poster input from the latest report without guards or audit records', async () => {
    const model = MODEL([ROW({ price: 118 })], { reportDate: '2026-09-07', dataAsOf: new Date(Date.now() - 90 * 3600_000).toISOString() }); // holiday + stale
    const recs = await wf.rehearse(model);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].rehearsal, true);
    assert.match(recs[0].id, /^rehearsal-/);
    assert.match(recs[0].text, /\$XYZ/);
    assert.equal(wf.audit.latest().length, 0);
    assert.throws(() => wf.recordManualPublication(recs[0].id, model, { xPostId: '1' }), /not found/);
  });

  it('dry-run records auto_dry_run and calls nothing', async () => {
    let called = false;
    const r = await wf.autoPublish(MODEL([ROW({ price: 118 })]), { dryRun: true, creds: null, fetchImpl: async () => { called = true; } });
    assert.equal(r.refused, null);
    assert.equal(r.published[0].dryRun, true);
    assert.equal(called, false);
    assert.equal(wf.audit.latest()[0].status, 'auto_dry_run');
  });

  it('records a failed API call as failed, not published', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ detail: 'Forbidden' }) });
    const r = await wf.autoPublish(MODEL([ROW({ price: 118 })]), { creds, fetchImpl });
    assert.equal(r.published.length, 0);
    assert.match(r.skipped[0].reason, /publish failed: Forbidden/);
    assert.equal(wf.audit.latest()[0].status, 'failed');
  });
});

// ─── charts ──────────────────────────────────────────────────────────────────

const HAVE_PIL = spawnSync('python3', ['-c', 'import PIL'], { encoding: 'utf8' }).status === 0;

function fakeYahoo(symbol, n = 40, start = 100) {
  const ts = [], open = [], high = [], low = [], close = [], volume = [];
  let px = start;
  for (let i = 0; i < n; i++) {
    const day = new Date(Date.UTC(2026, 6, 1 + i));
    ts.push(Math.floor(day.getTime() / 1000));
    const o = px, c = px + (i % 3 === 0 ? -1.2 : 0.8);
    open.push(o); close.push(c); high.push(Math.max(o, c) + 0.9); low.push(Math.min(o, c) - 0.9); volume.push(1000 + i);
    px = c;
  }
  return { chart: { result: [{ meta: { symbol }, timestamp: ts, indicators: { quote: [{ open, high, low, close, volume }] } }], error: null } };
}

describe('charts: real candles + the report levels, nothing forward-looking', () => {
  it('parses Yahoo chart JSON into dated candles and maps symbols', () => {
    const candles = parseYahooChart(fakeYahoo('XYZ', 5));
    assert.equal(candles.length, 5);
    assert.equal(candles[0].t, '2026-07-01');
    assert.ok(candles.every(c => c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c)));
    assert.equal(toYahooSymbol('BRK.B'), 'BRK-B');
    assert.throws(() => parseYahooChart({ chart: { result: null, error: { description: 'No data' } } }), /No data/);
  });

  it('spec draws support, resistance, report price and basis only — no targets — and alt text restates the post', () => {
    const cfg = freshConfig();
    const row = ROW({ price: 118 });
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const spec = buildChartSpec(setup, model, parseYahooChart(fakeYahoo('XYZ', 20)), cfg, '/tmp/x.png');
    const labels = spec.levels.map(l => l.label);
    assert.deepEqual(labels, ['Resistance $123.50', 'Support $115.00', 'Report price $118.00']); // basis == support here → not duplicated
    assert.ok(!JSON.stringify(spec).match(/target|projection/i));
    assert.equal(spec.badge, 'CONFIRMED SETUP');
    assert.match(spec.stats, /RSI 64 · CMF \+0\.19/);
    assert.equal(spec.disclosure, DEFAULT_DISCLOSURE);
    const alt = chartAltText(setup, model);
    assert.match(alt, /Support \$115\.00\. Resistance \$123\.50\. Setup: Trend continuation \(confirmed setup\)/);
    assert.ok(alt.length <= 1000);
  });

  it('renders a PNG through the Pillow script', { skip: !HAVE_PIL }, async () => {
    const cfg = { ...freshConfig(), charts: { enabled: true, bars: 30 } };
    const row = ROW({ price: 118 });
    const setup = classifySetup(row);
    const model = MODEL([row], { reportDate: '2026-08-10' });
    const dir = mkdtempSync(join(tmpdir(), 'chart-'));
    const fetchImpl = async () => ({ ok: true, json: async () => fakeYahoo('XYZ', 40) });
    const r = await makeChart(setup, model, cfg, { dir, fetchImpl });
    assert.equal(r.error, undefined, r.error);
    assert.ok(existsSync(r.path));
    assert.equal(r.bars, 30);
    assert.ok(r.lastBar <= '2026-08-10'); // candles after the report date are dropped
    const head = readFileSync(r.path).subarray(0, 8);
    assert.equal(head.toString('hex'), '89504e470d0a1a0a');
  });

  it('a chart failure never blocks the post: text-only publish with the reason audited', async () => {
    const auditPath = join(mkdtempSync(join(tmpdir(), 'chartwf-')), 'a.jsonl');
    const cfg = { ...freshConfig(), charts: { enabled: true, bars: 30, requireForPublish: false } };
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(auditPath), actor: 't' });
    const row = ROW({ price: 118 });
    const model = MODEL([row]);
    const [d] = await wf.draft(model, { chartOpts: { fetchImpl: async () => { throw new Error('offline'); } } });
    assert.equal(d.chart.path, null);
    assert.match(d.chart.error, /offline/);
    wf.approve(d.id, model);
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push(url); return { ok: true, status: 201, json: async () => ({ data: { id: '1' } }) }; };
    const pub = await wf.publish(d.id, model, { fetchImpl, creds: { type: 'oauth2', accessToken: 't' } });
    assert.equal(pub.status, 'published');
    assert.deepEqual(pub.publication.mediaIds, []);
    assert.match(pub.publication.chartNote, /no chart: offline/);
    assert.deepEqual(calls, ['https://api.x.com/2/tweets']);
  });

  it('with a chart, publish uploads media, sets alt text, and attaches the media id', { skip: !HAVE_PIL }, async () => {
    const auditPath = join(mkdtempSync(join(tmpdir(), 'chartwf2-')), 'a.jsonl');
    const cfg = { ...freshConfig(), charts: { enabled: true, bars: 30, requireForPublish: true } };
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(auditPath), actor: 't' });
    const row = ROW({ price: 118 });
    const model = MODEL([row]);
    const dir = mkdtempSync(join(tmpdir(), 'chart2-'));
    const [d] = await wf.draft(model, { chartOpts: { dir, fetchImpl: async () => ({ ok: true, json: async () => fakeYahoo('XYZ', 40) }) } });
    assert.ok(d.chart.path && existsSync(d.chart.path));
    wf.approve(d.id, model);
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, body: init.body });
      if (url.endsWith('/media/upload')) return { ok: true, status: 200, json: async () => ({ data: { id: '777' } }) };
      if (url.endsWith('/media/metadata')) return { ok: true, status: 200, json: async () => ({}) };
      return { ok: true, status: 201, json: async () => ({ data: { id: '55' } }) };
    };
    const pub = await wf.publish(d.id, model, { fetchImpl, creds: { type: 'oauth2', accessToken: 't' } });
    assert.equal(pub.status, 'published');
    assert.deepEqual(pub.publication.mediaIds, ['777']);
    assert.deepEqual(seen.map(x => x.url.split('/2/')[1]), ['media/upload', 'media/metadata', 'tweets']);
    assert.ok(seen[0].body instanceof FormData);
    assert.match(JSON.parse(seen[1].body).metadata.alt_text.text, /Support \$115\.00/);
    assert.deepEqual(JSON.parse(seen[2].body).media, { media_ids: ['777'] });
  });

  it('volume line comes from the chart candles and is integrity-checked', () => {
    const cfg = { ...freshConfig(), charLimit: 4000, charts: { enabled: true, bars: 30, volumeLine: true } };
    const row = ROW({ price: 118 });
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const chart = { path: '/tmp/x.png', volumeRatio: 1.4, volumeAvg: 1000 };
    const { text } = generatePost(setup, model, cfg, { chart });
    assert.match(text, /\nVolume: 1\.4× 20-day avg \(last bar\)\n/);
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
    assert.ok(blocking(validatePost(text.replace('1.4×', '2.5×'), { setup, row, model, config: cfg, chart })).some(i => i.code === 'value_mismatch'));
    assert.ok(blocking(validatePost(text, { setup, row, model, config: cfg, chart: null })).some(i => i.code === 'value_mismatch'));
    const noChart = generatePost(setup, model, cfg, { chart: null }).text;
    assert.ok(!/Volume:/.test(noChart));
  });

  it('uploadMedia surfaces API errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'up-'));
    const f = join(dir, 'x.png'); writeFileSync(f, Buffer.from('89504e470d0a1a0a', 'hex'));
    const r = await uploadMedia(f, { creds: { type: 'oauth2', accessToken: 't' }, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ detail: 'nope' }) }) });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'nope');
    assert.equal((await uploadMedia(f, { creds: null })).ok, false);
  });
});

// ─── X client ────────────────────────────────────────────────────────────────

describe('X API client — OAuth 1.0a', () => {
  it('percent-encodes per RFC 3986', () => {
    assert.equal(percentEncode("Ladies + Gentlemen"), 'Ladies%20%2B%20Gentlemen');
    assert.equal(percentEncode("An encoded string!"), 'An%20encoded%20string%21');
    assert.equal(percentEncode("Dogs, Cats & Mice"), 'Dogs%2C%20Cats%20%26%20Mice');
  });

  it('reproduces the documented X signature example', () => {
    // From X's "Creating a signature" developer docs.
    const { signature } = oauth1Signature({
      method: 'POST',
      url: 'https://api.twitter.com/1.1/statuses/update.json',
      params: {
        status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
        include_entities: 'true',
        oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
        oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1318622958',
        oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
        oauth_version: '1.0',
      },
      consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    });
    assert.equal(signature, 'hCtSmYh+iHYCEqBWrE7C7hYmtUk=');
  });

  it('builds an Authorization header with all oauth_* fields', () => {
    const h = oauth1Header({
      method: 'POST', url: 'https://api.x.com/2/tweets', nonce: 'n', timestamp: 1,
      creds: { apiKey: 'k', apiSecret: 's', accessToken: 't', accessTokenSecret: 'ts' },
    });
    assert.match(h, /^OAuth oauth_consumer_key="k", oauth_nonce="n", oauth_signature="[^"]+", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1", oauth_token="t", oauth_version="1\.0"$/);
  });

  it('reads credentials only from the environment', () => {
    assert.equal(getCredentialsFromEnv({}), null);
    assert.equal(getCredentialsFromEnv({ X_OAUTH2_ACCESS_TOKEN: 'a' }).type, 'oauth2');
    assert.equal(getCredentialsFromEnv({ X_API_KEY: '1', X_API_SECRET: '2', X_ACCESS_TOKEN: '3', X_ACCESS_TOKEN_SECRET: '4' }).type, 'oauth1');
  });

  it('refuses to post without credentials and surfaces API errors', async () => {
    const none = await postTweet('hi', { creds: null });
    assert.equal(none.ok, false);
    const err = await postTweet('hi', {
      creds: { type: 'oauth2', accessToken: 'x' },
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ title: 'Too Many Requests' }) }),
    });
    assert.equal(err.ok, false);
    assert.equal(err.retryable, true);
    assert.equal(err.error, 'Too Many Requests');
  });
});

// ─── crypto sweep: 24/7 calendar, sub-dollar precision, queue isolation ──────

describe('crypto sweep (24/7 market, sub-dollar precision, separate queue)', () => {
  const CRYPTO_CFG_PATH = join(ROOT, 'config', 'social-compliance-crypto.json');

  // A coin priced well under $1, where two decimals would collapse the levels.
  const COIN = (over = {}) => ROW({
    symbol: 'XLM', price: 0.19412, rsi: 63, rsiMa: 60, cmf: 0.19,
    atr: 0.0087, bbLower: 0.17427, bbBasis: 0.18733, bbUpper: 0.20044,
    vwap: 0.19024, cloudA: 0.18539, cloudB: 0.18247,
    position: 'above_cloud', structure: 'HH-up', score: 2.5, biasNext: 'Calls', ...over,
  });

  function cryptoConfig(over = {}) {
    resetConfigCache();
    const cfg = loadConfig(CRYPTO_CFG_PATH);
    resetConfigCache();
    return { ...classicPins(cfg), ...over };
  }

  it('ships a crypto config whose calendar is 24x7 with its own queue and asset class', () => {
    const cfg = cryptoConfig();
    assert.equal(cfg.marketCalendar, '24x7');
    assert.equal(cfg.queue, 'crypto');
    assert.equal(cfg.assetClass, 'crypto');
    assert.equal(cfg.priceGrouping, true);
    assert.deepEqual(cfg.marketHolidays, []);
    // Sweep policy: no in-post marker tags, so the chart (which carries the
    // disclaimer) is mandatory — the loader refuses the config otherwise.
    resetConfigCache();
    const shipped = loadConfig(CRYPTO_CFG_PATH);
    resetConfigCache();
    assert.deepEqual(shipped.hashtags.required, []);
    assert.equal(shipped.charts.requireForPublish, true);
  });

  it('sub-dollar levels keep enough decimals to stay distinct in a post', () => {
    const cfg = { ...cryptoConfig(), disclosurePlacement: 'bio', charLimit: 4000 };
    const setup = classifySetup(COIN());
    const { text } = generatePost(setup, MODEL([COIN()]), cfg);
    assert.match(text, /Price: \$0\.19412/);
    // Nearest level below price is the Q2 VWAP (0.19024), nearest above is the
    // upper band (0.20044). At two decimals price and support both render
    // "$0.19" and the invalidation line becomes meaningless.
    assert.match(text, /Support: \$0\.19024/);
    assert.match(text, /Resistance: \$0\.20044/);
    // Price, support and resistance must be three different numbers. (The
    // level-to-watch and invalidation lines deliberately restate two of them,
    // so compare the distinct set, not every occurrence.)
    const shown = new Set([...text.matchAll(/\$(\d+\.\d+)/g)].map(m => m[1]));
    assert.deepEqual([...shown].sort(), ['0.19024', '0.19412', '0.20044']);
  });

  it('groups thousands for a high-priced coin but leaves stock formatting untouched', () => {
    const btc = ROW({ symbol: 'BTC', price: 79611, bbLower: 71000, bbBasis: 76800, bbUpper: 84200, vwap: 74000, cloudA: 75000, cloudB: 73000, atr: 2400 });
    const cryptoText = generatePost(classifySetup(btc), MODEL([btc]), { ...cryptoConfig(), disclosurePlacement: 'bio', charLimit: 4000 }).text;
    assert.match(cryptoText, /Price: \$79,611\.00/);
    // The stock config must not group — its posts keep their existing shape.
    const stockText = generatePost(classifySetup(btc), MODEL([btc]), { ...freshConfig(), charLimit: 4000 }).text;
    assert.match(stockText, /Price: \$79611\.00/);
  });

  it('compliance still catches a fabricated sub-dollar value (it used to skip >2 decimals)', () => {
    const cfg = { ...cryptoConfig(), disclosurePlacement: 'bio', charLimit: 4000 };
    const row = COIN();
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const good = generatePost(setup, model, cfg).text;
    assert.equal(blocking(validatePost(good, { setup, row, model, config: cfg })).length, 0);
    // Invent a level that is not in the report.
    const bad = good.replace('$0.20044', '$0.28888');
    assert.notEqual(bad, good, 'the level must actually appear in the post');
    const issues = validatePost(bad, { setup, row, model, config: cfg });
    assert.ok(blocking(issues).some(i => i.code === 'value_mismatch'), 'fabricated level must block');
  });

  it('auto-publish runs on a weekend and on an NYSE holiday under the 24x7 calendar', async () => {
    const row = COIN();
    const cfg = {
      ...cryptoConfig(), disclosurePlacement: 'bio', charLimit: 4000,
      charts: { enabled: false, bars: 60, requireForPublish: false, volumeLine: false },
    };
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'api', spacingSeconds: 0, maxPostsPerRun: 5 } };
    const okFetch = async () => ({ ok: true, status: 201, json: async () => ({ data: { id: '9' } }) });

    for (const date of ['2026-09-05', '2026-09-06', '2026-09-07']) { // Sat, Sun, Labor Day
      const model = MODEL([row], {
        reportDate: date, dataAsOf: new Date().toISOString(),
        cohort: { source: 't', calls: [{ symbol: 'XLM', score: 2.5 }], puts: [], watches: [] },
      });
      const w = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(mkdtempSync(join(tmpdir(), 'c247-')), 'a.jsonl')) });
      const r = await w.autoPublish(model, { creds: { type: 'oauth2', accessToken: 't' }, fetchImpl: okFetch });
      assert.equal(r.refused, null, `${date} must not be refused for a 24/7 market`);
      assert.deepEqual(r.published.map(p => p.symbol), ['XLM']);
    }
  });

  it('the stock calendar still refuses those same dates', async () => {
    const row = COIN();
    const cfg = { ...freshConfig(), charLimit: 4000 };
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'api', spacingSeconds: 0 } };
    for (const [date, why] of [['2026-09-05', /weekend/], ['2026-09-07', /market holiday/]]) {
      const model = MODEL([row], { reportDate: date, cohort: { source: 't', calls: [{ symbol: 'XLM', score: 2.5 }], puts: [], watches: [] } });
      const w = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(mkdtempSync(join(tmpdir(), 'cnyse-')), 'a.jsonl')) });
      const r = await w.autoPublish(model, { creds: { type: 'oauth2', accessToken: 't' } });
      assert.match(r.refused ?? '', why);
    }
  });

  it('drafts carry their queue so the two posters never take each other\'s work', async () => {
    const row = COIN();
    const model = MODEL([row]);
    const mk = (config, dir) => new SocialWorkflow({ config, audit: new AuditStore(join(mkdtempSync(join(tmpdir(), dir)), 'a.jsonl')) });

    const cCfg = { ...cryptoConfig(), disclosurePlacement: 'bio', charLimit: 4000, charts: { enabled: false } };
    const cw = mk(cCfg, 'qc-');
    const [cRec] = await cw.draft(model, { symbol: 'XLM' });
    assert.equal(cRec.queue, 'crypto');

    const sCfg = { ...freshConfig(), charLimit: 4000, charts: { enabled: false } };
    const sw = mk(sCfg, 'qs-');
    const [sRec] = await sw.draft(model, { symbol: 'XLM' });
    assert.equal(sRec.queue, 'stocks', 'a config without a queue defaults to stocks');

    // ready() scopes by queue; an untagged legacy record reads as stocks.
    const audit = new AuditStore(join(mkdtempSync(join(tmpdir(), 'qr-')), 'a.jsonl'));
    audit.append({ ...cRec, status: 'ready_to_post' });
    audit.append({ ...sRec, id: 'legacy-1', queue: undefined, status: 'ready_to_post' });
    const w = new SocialWorkflow({ config: cCfg, audit });
    assert.deepEqual(w.ready({ queue: 'crypto' }).map(r => r.id), [cRec.id]);
    assert.deepEqual(w.ready({ queue: 'stocks' }).map(r => r.id), ['legacy-1']);
    assert.equal(w.ready().length, 2, 'no filter returns both');
  });

  it('crypto chart candles are fetched as a Yahoo pair, equities are untouched', () => {
    assert.equal(toYahooSymbol('BTC', { assetClass: 'crypto' }), 'BTC-USD');
    assert.equal(toYahooSymbol('XLM', { assetClass: 'crypto' }), 'XLM-USD');
    assert.equal(toYahooSymbol('HYPE', { assetClass: 'crypto' }), 'HYPE32196-USD', 'collision override wins');
    assert.equal(toYahooSymbol('BTC-USD', { assetClass: 'crypto' }), 'BTC-USD', 'already a pair');
    assert.equal(toYahooSymbol('BRK.B'), 'BRK-B');
    assert.equal(toYahooSymbol('AAPL'), 'AAPL');
  });

  it('candle parsing keeps sub-cent precision instead of rounding to zero', () => {
    const json = { chart: { result: [{ timestamp: [1757000000], indicators: { quote: [{ open: [0.0000123456], high: [0.0000133], low: [0.0000119], close: [0.0000128], volume: [42] }] } }] } };
    const [c] = parseYahooChart(json);
    assert.ok(c.o > 0, 'a sub-cent open must not round to 0');
    assert.equal(c.o, 0.000012346); // ~5 significant digits, not 0.00
    // Equity-scale values still land on two decimals exactly as before.
    const eq = parseYahooChart({ chart: { result: [{ timestamp: [1757000000], indicators: { quote: [{ open: [123.456], high: [124.5], low: [122.1], close: [123.9], volume: [10] }] } }] } });
    assert.equal(eq[0].o, 123.46);
  });
});

// ─── Daily Setup Sweep format ────────────────────────────────────────────────

describe('sweep format: verdict gated on the signal, compact prices, level CTA, 0-2 tags', () => {
  const STOCK_CFG = join(ROOT, 'config', 'social-compliance.json');
  const CRYPTO_CFG = join(ROOT, 'config', 'social-compliance-crypto.json');
  const ETH = (over = {}) => ROW({
    symbol: 'ETH', price: 2498.20, rsi: 64, rsiMa: 60, cmf: 0.22, atr: 95,
    bbLower: 2300.10, bbBasis: 2448.62, bbUpper: 2578.88, vwap: 2410.55, cloudA: 2380.00, cloudB: 2350.00,
    position: 'above_cloud', structure: 'HH-up', score: 2.5, biasNext: 'Calls', ...over,
  });
  const sweep = (path, over = {}) => { resetConfigCache(); const c = loadConfig(path); resetConfigCache(); return { ...c, ...over }; };
  const chart = { path: '/tmp/eth.png', volumeRatio: 0.8 };

  it('a draft with no rendered chart cannot pass validation under the shipped policy (browser path included)', async () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH();
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg, { chart: null });
    const codes = blocking(validatePost(text, { setup, row, model, config: cfg, chart: { path: null, error: 'renderer failed' } })).map(i => i.code);
    assert.ok(codes.includes('missing_chart'), codes.join(','));
    // The auto-publish browser path audits it as a skip instead of queueing it.
    const bad = { ...cfg, charts: { ...cfg.charts, enabled: true, requireForPublish: true } };
    bad.posting = { ...bad.posting, autoPublish: { ...bad.posting.autoPublish, enabled: true, via: 'browser', spacingSeconds: 0 } };
    const w = new SocialWorkflow({ config: bad, audit: new AuditStore(join(mkdtempSync(join(tmpdir(), 'nochart-')), 'a.jsonl')) });
    const m = MODEL([row], { cohort: { source: 't', calls: [{ symbol: 'ETH', score: 2.5 }], puts: [], watches: [] } });
    const r = await w.autoPublish(m, { fetchImplForCharts: async () => ({ ok: false, status: 503 }) });
    assert.equal(r.refused, null);
    assert.deepEqual(r.published, []);
    assert.ok(r.skipped.some(s => s.symbol === 'ETH' && /missing_chart/.test(s.reason)), JSON.stringify(r.skipped));
    assert.equal(w.ready({ queue: 'crypto' }).length, 0, 'nothing may reach the browser poster without a chart');
    // The classic policy (chart optional) still allows a text-only post.
    const lax = classicPins(cfg);
    assert.ok(!blocking(validatePost(generatePost(setup, model, lax).text, { setup, row, model, config: lax, chart: null })).some(i => i.code === 'missing_chart'));
  });

  it('renders the ETH mockup layout from a confirmed basis reclaim', () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH();
    const setup = classifySetup(row);
    assert.equal(setup.setup, 'Basis reclaim');
    assert.equal(setup.signal, SIGNAL.CONFIRMED);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg, { chart });
    const lines = text.split('\n');
    assert.equal(lines[0], '📈 $ETH has reclaimed its 20-day base — reclaim confirmed.');
    assert.equal(lines[1], 'CMF +0.22 shows positive money flow while RSI 64 keeps momentum healthy.');
    assert.equal(lines[2], 'In plain terms: price is back above its 20-day average and volume is backing it — buyers are in control while it holds.');
    assert.equal(lines[3], '🎯 Above $2,579 → potential breakout');
    assert.equal(lines[4], '🛑 Below $2,449 → setup invalidated');
    assert.equal(lines[5], 'Current price: $2,498 · RVOL 0.8× · Setup score +2.5');
    assert.equal(lines[6], 'Which level gets hit first — $2,579 or $2,449? 👇');
    assert.equal(lines[7], 'Daily Setup Sweep · tracked to a daily close beyond a level · scored every Friday');
    assert.match(lines[8], /^Data: daily · \w{3} \d{1,2}, 20\d\d/);
    assert.equal(lines[9], '#ETH #Crypto');
    assert.equal(lines.length, 10);
    // both additions are config-driven and drop cleanly
    const bare = generatePost(setup, model, { ...cfg, plainLanguage: false, brand: { ...cfg.brand, seriesLine: null } }, { chart }).text.split('\n');
    assert.equal(bare.length, 8);
    assert.ok(!bare.some(l => /^In plain terms|^Daily Setup Sweep/.test(l)));
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
  });

  it('the stock config yields the same layout with #SYM #Stocks', () => {
    const cfg = sweep(STOCK_CFG);
    const row = ROW({ price: 118 });
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg, { chart });
    assert.match(text, /^📈 \$XYZ is holding above its 20-day base — trend confirmed\.\n/);
    assert.match(text, /\n#XYZ #Stocks$/);
    assert.ok(!/#NFA|#DYOR/.test(text), 'no marker tags in the sweep layout');
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
  });

  it('a WATCH can never carry a confirmed verdict — text, badge, or tampered headline', () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH({ position: 'in_cloud' });           // cloud not aligned → WATCH
    const setup = classifySetup(row);
    assert.equal(setup.signal, SIGNAL.WATCH);
    const model = MODEL([row]);
    const { text, parts } = generatePost(setup, model, cfg, { chart });
    assert.match(text.split('\n')[0], /reclaim watch\.$/);
    assert.ok(!/confirmed/i.test(text.split('\n')[0]));
    assert.equal(parts.labels.badge, 'DEVELOPING', 'a WATCH is posted at the DEVELOPING stage');
    assert.equal(parts.labels.chip, 'RECLAIM WATCH', 'the setup name moves to the chip');
    assert.equal(parts.labels.stage, 'DEVELOPING');
    assert.equal(parts.labels.confirmed, false);
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
    // Any "confirmed" in a WATCH headline blocks, whatever the phrasing.
    const forged = text.replace('reclaim watch.', 'reclaim confirmed.');
    assert.ok(blocking(validatePost(forged, { setup, row, model, config: cfg, chart })).some(i => i.code === 'signal_upgraded'));
  });

  it('compact prices pass integrity because they round FROM a report level; a fabricated one still blocks', () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH();
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg, { chart });
    assert.ok(text.includes('$2,579') && text.includes('$2,449') && text.includes('$2,498'));
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
    const bad = text.replace('$2,579', '$2,600');
    assert.ok(blocking(validatePost(bad, { setup, row, model, config: cfg, chart })).some(i => i.code === 'value_mismatch'));
    // whole-dollar rounding is only accepted at whole-dollar precision
    const off = text.replace('$2,579', '$2,579.40');
    assert.ok(blocking(validatePost(off, { setup, row, model, config: cfg, chart })).some(i => i.code === 'value_mismatch'));
  });

  it('setup score and RVOL are integrity-checked like every other number', () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH();
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg, { chart });
    assert.ok(blocking(validatePost(text.replace('Setup score +2.5', 'Setup score +3.0'), { setup, row, model, config: cfg, chart })).some(i => i.code === 'value_mismatch'));
    assert.ok(blocking(validatePost(text.replace('RVOL 0.8×', 'RVOL 2.4×'), { setup, row, model, config: cfg, chart })).some(i => i.code === 'value_mismatch'));
    assert.ok(blocking(validatePost(text, { setup, row, model, config: cfg, chart: null })).some(i => i.code === 'value_mismatch'), 'RVOL without chart data must block');
  });

  it('bearish confirmed breakdown flips the level roles and the CTA', () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH({ price: 2300, rsi: 38, cmf: -0.24, position: 'below_cloud', structure: 'LL-down', score: -2.5, bbLower: 2210.00, bbBasis: 2448.62, bbUpper: 2578.88, vwap: 2410.55, cloudA: 2380, cloudB: 2350 });
    const setup = classifySetup(row);
    assert.equal(setup.setup, 'Breakdown');
    assert.equal(setup.signal, SIGNAL.CONFIRMED);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg, { chart });
    const lines = text.split('\n');
    assert.equal(lines[0], '📉 $ETH has broken below its 20-day base — breakdown confirmed.');
    assert.equal(lines[1], 'CMF -0.24 shows money leaving while RSI 38 stays weak.');
    assert.equal(lines[2], 'In plain terms: price has lost its 20-day average and money is leaving — sellers are in control while it stays below.');
    assert.equal(lines[3], '🎯 Below $2,210 → breakdown continues');
    assert.equal(lines[4], '🛑 Above $2,350 → setup invalidated');
    assert.equal(lines[6], 'Which level gets hit first — $2,210 or $2,350? 👇');
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
  });

  it('with only one level on the relevant side the CTA becomes a single-level question', () => {
    const cfg = sweep(CRYPTO_CFG);
    // price above every level: no resistance
    const row = ETH({ price: 2700, rsi: 73, bbUpper: 2578.88 });
    const setup = classifySetup(row);
    assert.equal(setup.resistance, null);
    const model = MODEL([row]);
    const { text } = generatePost(setup, model, cfg, { chart });
    assert.ok(!text.includes('🎯'));
    assert.match(text, /🛑 Below \$2,579 → setup invalidated/);
    assert.match(text, /Does \$2,579 hold\? 👇/);
    assert.match(text.split('\n')[0], /exhaustion watch\.$/);
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
  });

  it('config loader refuses a marker-less policy whose chart is optional', () => {
    resetConfigCache();
    const p = join(mkdtempSync(join(tmpdir(), 'mk-')), 'c.json');
    writeFileSync(p, JSON.stringify({ disclosurePlacement: 'bio', hashtags: { required: [] }, charts: { enabled: true, requireForPublish: false } }));
    assert.throws(() => loadConfig(p), /requireForPublish/);
    resetConfigCache();
    writeFileSync(p, JSON.stringify({ disclosurePlacement: 'bio', hashtags: { required: [] }, charts: { enabled: true, requireForPublish: true } }));
    assert.doesNotThrow(() => loadConfig(p));
    resetConfigCache();
  });

  it('sweep chart spec: report levels only, MA derived from the candles, tiles and strip restate the post', () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH();
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const candles = Array.from({ length: 40 }, (_, i) => ({ t: `2026-08-${String(i % 28 + 1).padStart(2, '0')}`, o: 2400 + i, h: 2420 + i, l: 2390 + i, c: 2410 + i, v: 1000 + i }));
    const spec = buildSweepChartSpec(setup, model, candles, cfg, '/tmp/x.png');
    assert.equal(spec.style, 'sweep');
    assert.equal(spec.badge, 'RECLAIM CONFIRMED');
    assert.equal(spec.confirmed, true);
    assert.deepEqual(spec.levels.map(l => [l.label, l.role]), [['$2,579', 'Breakout level'], ['$2,498', 'Current price'], ['$2,449', 'Invalidation level']]);
    assert.deepEqual(spec.levels.map(l => l.value), [2578.88, 2498.20, 2448.62]);
    assert.equal(spec.ma.length, 40);
    assert.equal(spec.ma[18], null);
    assert.ok(Math.abs(spec.ma[19] - (2410 + 9.5)) < 1e-6, '20-bar SMA of closes');
    assert.deepEqual(spec.tiles.map(t => t.label), ['Price', 'RSI (14)', 'CMF (20)', 'Volume (RVOL)']);
    assert.equal(spec.tiles[1].sub, 'Strong momentum (not overbought)');
    assert.deepEqual(spec.bottom.map(b => b.text), ['Above $2,579', 'Below $2,449', 'Which level gets hit first?']);
    assert.ok(!JSON.stringify(spec).match(/target|projection|ahead/i), 'nothing forward-looking in the spec');
    assert.equal(spec.disclosure, cfg.disclosure);
    const alt = sweepChartAltText(setup, model, cfg);
    assert.match(alt, /RECLAIM CONFIRMED\. Current price \$2,498\. Breakout level \$2,579\. Invalidation level \$2,449\./);
  });

  it('renders the sweep PNG through the Pillow script', { skip: !HAVE_PIL }, async () => {
    const cfg = sweep(CRYPTO_CFG);
    const row = ETH();
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const candles = Array.from({ length: 60 }, (_, i) => ({ t: `2026-07-${String(i % 28 + 1).padStart(2, '0')}`, o: 2300 + i * 3, h: 2330 + i * 3, l: 2280 + i * 3, c: 2320 + i * 3, v: 1000 + i * 10 }));
    const dir = mkdtempSync(join(tmpdir(), 'sweep-'));
    const out = await makeChart(setup, model, cfg, { dir, candles });
    assert.ok(!out.error, out.error);
    assert.ok(existsSync(out.path));
    assert.ok(out.altText.includes('RECLAIM CONFIRMED'));
    assert.equal(out.volumeRatio != null, true);
  });
});

// ─── publishing strategy: lifecycle tracker, follow-ups, scorecard, metrics ─────

import { SetupTracker, openFromSetup, detectEvents, graduate, scorecardStats, weekBounds, EVENT, TERMINAL } from '../src/social/tracker.js';
import { generateFollowUp, followUpModel, followUpSetup, followUpRow, generateScorecard, buildScorecardSpec, barCloseIso } from '../src/social/followup.js';
import { MetricsStore, parseTweetMetrics, recordManual, buildReport, insightsBoost, collectPostMetrics, engagementRate } from '../src/social/metrics.js';
import { STAGE, stageLabel, initialStage } from '../src/social/sweep-labels.js';

describe('lifecycle tracker: DEVELOPING → CONFIRMED → BREAKOUT / INVALIDATED on daily closes', () => {
  const CRYPTO_CFG = join(ROOT, 'config', 'social-compliance-crypto.json');
  const cfg = () => { resetConfigCache(); const c = loadConfig(CRYPTO_CFG); resetConfigCache(); return { ...c, charts: { ...c.charts, enabled: false, requireForPublish: false } }; };
  const ETH = (over = {}) => ROW({
    symbol: 'ETH', price: 2498.20, rsi: 64, rsiMa: 60, cmf: 0.22, atr: 95,
    bbLower: 2300.10, bbBasis: 2448.62, bbUpper: 2578.88, vwap: 2410.55, cloudA: 2380.00, cloudB: 2350.00,
    position: 'above_cloud', structure: 'HH-up', score: 2.5, biasNext: 'Calls', ...over,
  });
  const audit = (over = {}) => ({ id: '2026-09-07-ETH-abc123', queue: 'crypto', reportDate: '2026-09-07', reportPath: '/r.html', publication: { xPostId: '1', url: 'u', at: '2026-09-07T16:00:00Z' }, ...over });
  const bar = (t, o, h, l, c, v = 1000) => ({ t, o, h, l, c, v });
  const open = (over = {}, rowOver = {}) => openFromSetup(audit(over), classifySetup(ETH(rowOver)), { queue: 'crypto', assetClass: 'crypto', now: new Date('2026-09-07T16:00:00Z') });

  it('opens a CONFIRMED setup with the post\'s two levels and a DEVELOPING one from a WATCH', () => {
    const rec = open();
    assert.equal(rec.stage, STAGE.CONFIRMED);
    assert.equal(rec.stageLabel, 'RECLAIM CONFIRMED');
    assert.deepEqual(rec.target, { value: 2578.88, label: 'upper band' });
    assert.deepEqual(rec.stop, { value: 2448.62, label: '20d basis' });
    assert.equal(rec.entryPrice, 2498.20);
    assert.equal(rec.posts[0].xPostId, '1');
    const dev = open({}, { position: 'in_cloud' });
    assert.equal(dev.stage, STAGE.DEVELOPING);
    assert.equal(dev.stageLabel, 'DEVELOPING');
    assert.equal(initialStage(classifySetup(ETH({ position: 'in_cloud' }))), STAGE.DEVELOPING);
  });

  it('level test then breakout, on closes only; re-running the same bars is a no-op', () => {
    const rec = open();
    const candles = [
      bar('2026-09-07', 2480, 2510, 2470, 2498.20),         // the report bar — ignored
      bar('2026-09-08', 2500, 2585.10, 2490, 2560.20),      // tags 🎯 intraday, closes below → LEVEL_TEST
      bar('2026-09-09', 2565, 2620, 2550, 2610.40),         // closes above 🎯 → BREAKOUT (terminal)
      bar('2026-09-10', 2610, 2700, 2400, 2420),            // would be an invalidation — never reached
    ];
    const { events, next } = detectEvents(rec, candles, { now: new Date('2026-09-11T00:00:00Z') });
    assert.deepEqual(events.map(e => e.type), [EVENT.LEVEL_TEST, EVENT.BREAKOUT]);
    assert.equal(events[0].extreme, 2585.10);
    assert.equal(events[1].price, 2610.40);
    assert.equal(events[1].pct, 4.49);
    assert.equal(next.stage, STAGE.BREAKOUT);
    assert.equal(next.stageLabel, 'BREAKOUT UPDATE');
    assert.equal(next.outcome, 'breakout');
    assert.equal(next.closedBar, '2026-09-09');
    assert.ok(TERMINAL.has(next.stage));
    const again = detectEvents(next, candles);
    assert.deepEqual(again.events, []);
  });

  it('a close beyond 🛑 invalidates, and wins over a breakout in the same bar', () => {
    const rec = open();
    const r1 = detectEvents(rec, [bar('2026-09-08', 2490, 2500, 2400, 2430.00)]);
    assert.deepEqual(r1.events.map(e => e.type), [EVENT.INVALIDATED]);
    assert.equal(r1.next.outcome, 'invalidated');
    assert.equal(r1.next.stageLabel, 'INVALIDATED');
    const wild = detectEvents(rec, [bar('2026-09-08', 2490, 2700, 2300, 2300)]); // closes below stop after trading above target
    assert.equal(wild.events[0].type, EVENT.INVALIDATED);
  });

  it('bearish setups mirror the levels', () => {
    const rec = open({}, { price: 2300, rsi: 38, cmf: -0.24, position: 'below_cloud', structure: 'LL-down', score: -2.5, bbLower: 2210.00 });
    assert.equal(rec.direction, 'bearish');
    assert.equal(rec.target.value, 2210.00);   // support is the 🎯 for a breakdown
    assert.equal(rec.stop.value, 2350.00);     // cloud B is the nearest level above
    const r = detectEvents(rec, [bar('2026-09-08', 2290, 2300, 2190, 2200)]);
    assert.equal(r.events[0].type, EVENT.BREAKOUT);
    assert.equal(r.next.stageLabel, 'BREAKDOWN UPDATE');
  });

  it('expires quietly after maxAgeSessions without resolution', () => {
    const rec = open();
    const candles = Array.from({ length: 16 }, (_, i) => bar(`2026-09-${String(8 + i).padStart(2, '0')}`, 2500, 2520, 2480, 2500));
    const r = detectEvents(rec, candles, { maxAgeSessions: 15 });
    assert.deepEqual(r.events.map(e => e.type), [EVENT.EXPIRED]);
    assert.equal(r.next.outcome, 'expired');
  });

  it('a DEVELOPING setup graduates when a later report confirms the same direction', () => {
    const dev = open({}, { position: 'in_cloud' });
    const later = MODEL([ETH()], { reportDate: '2026-09-09' });
    const g = graduate(dev, classifySetup(ETH()), later, { now: new Date('2026-09-09T14:00:00Z') });
    assert.ok(g);
    assert.equal(g.event.type, EVENT.CONFIRMED);
    assert.equal(g.next.stage, STAGE.CONFIRMED);
    assert.equal(g.next.stageLabel, 'RECLAIM CONFIRMED');
    assert.equal(graduate(dev, classifySetup(ETH({ price: 2300, rsi: 38, cmf: -0.24, position: 'below_cloud', structure: 'LL-down', score: -2.5 })), later), null, 'opposite direction does not graduate');
    assert.equal(graduate(open(), classifySetup(ETH()), later), null, 'already CONFIRMED does not graduate again');
  });

  it('weekBounds and scorecard stats: counts, hit rate on resolved only, all-time', () => {
    assert.deepEqual(weekBounds('2026-09-09'), { from: '2026-09-07', to: '2026-09-11' });
    assert.deepEqual(weekBounds('2026-09-13'), { from: '2026-09-07', to: '2026-09-11' }, 'a Sunday belongs to the week just ended');
    const mk = (id, symbol, reportDate, outcome, closedBar, pct) => ({ ...open({ id, reportDate }), symbol, outcome, closedBar, stage: outcome ? (outcome === 'breakout' ? STAGE.BREAKOUT : outcome === 'invalidated' ? STAGE.INVALIDATED : STAGE.EXPIRED) : STAGE.CONFIRMED, events: outcome ? [{ type: outcome.toUpperCase(), pct }] : [] });
    const recs = [
      mk('a', 'ETH', '2026-09-07', 'breakout', '2026-09-09', 4.5),
      mk('b', 'SOL', '2026-09-07', 'invalidated', '2026-09-10', -2.7),
      mk('c', 'BTC', '2026-09-08', null, null, null),
      mk('d', 'ADA', '2026-09-08', 'breakout', '2026-09-11', 3.1),
      mk('e', 'OLD', '2026-08-24', 'invalidated', '2026-08-28', -1.0),   // last week's — all-time only
      mk('f', 'EXP', '2026-08-20', 'expired', '2026-09-10', 0.2),        // expired this week — not scored
    ];
    const st = scorecardStats(recs, weekBounds('2026-09-11'));
    assert.equal(st.posted, 4);
    assert.equal(st.breakouts, 2);
    assert.equal(st.invalidated, 1);
    assert.equal(st.expired, 1);
    assert.equal(st.active, 1);
    assert.equal(st.hitRate, 67);
    assert.deepEqual(st.allTime, { setups: 6, breakouts: 2, invalidated: 2, resolved: 4, hitRate: 50 });
    assert.equal(st.best.symbol, 'ETH');
    assert.equal(st.worst.symbol, 'SOL');
  });

  it('follow-up posts: every number is a stored level or the event close, labelled by stage, compliance-clean', () => {
    const c = cfg();
    const rec = open();
    const cases = [
      [{ type: EVENT.BREAKOUT, bar: '2026-09-09', price: 2610.40, level: 2578.88, pct: 4.49 }, /^✅ \$ETH — BREAKOUT UPDATE\. \$2,579 cleared on the daily close\.$/, ['Price: $2,610 (daily close) · +4.5% from $2,498 at the setup', '🛑 A close back under $2,579 negates the breakout', 'Does $2,579 hold as the new floor? 👇']],
      [{ type: EVENT.LEVEL_TEST, bar: '2026-09-08', price: 2560.20, level: 2578.88, extreme: 2585.10, pct: 2.48 }, /^👀 \$ETH — LEVEL TEST\. Tagged \$2,579 intraday \(high \$2,585\) but did not close above it\.$/, ['🎯 A daily close above $2,579 → breakout', '🛑 Below $2,449 → setup invalidated', 'Close above $2,579 or lose $2,449 first? 👇']],
      [{ type: EVENT.INVALIDATED, bar: '2026-09-10', price: 2430.00, level: 2448.62, pct: -2.73 }, /^🛑 \$ETH — INVALIDATED\. \$2,449 lost on the daily close\.$/, ['Price: $2,430 (daily close) · −2.7% from $2,498 at the setup', 'The lesson: the level did its job', 'Would you have drawn the line at $2,449 too? 👇']],
    ];
    for (const [ev, head, mustHave] of cases) {
      const { text } = generateFollowUp(rec, ev, c);
      const lines = text.split('\n');
      assert.match(lines[0], head);
      for (const m of mustHave) assert.ok(text.includes(m), `${ev.type}: missing "${m}"\n${text}`);
      assert.match(text, /\nData: daily · Sep \d+, 2026\n#ETH #Crypto$/);
      const setup = followUpSetup(rec, ev);
      const issues = validatePost(text, { setup, row: followUpRow(rec, ev), model: followUpModel(rec, ev), config: c, kind: 'followup', stage: setup.stage, now: new Date(`${ev.bar}T23:00:00Z`) });
      assert.deepEqual(blocking(issues), [], `${ev.type}: ${JSON.stringify(blocking(issues))}`);
      // a fabricated level still blocks
      const shown = ev.level >= 2500 ? '$2,579' : '$2,449';
      assert.ok(text.includes(shown));
      const bad = validatePost(text.replace(shown, '$2,650'), { setup, row: followUpRow(rec, ev), model: followUpModel(rec, ev), config: c, kind: 'followup', stage: setup.stage, now: new Date(`${ev.bar}T23:00:00Z`) });
      assert.ok(blocking(bad).some(i => i.code === 'value_mismatch'), `${ev.type}: fabricated level must block`);
    }
    // graduation update may say "confirmed"; a level test on a DEVELOPING setup may not
    const dev = open({}, { position: 'in_cloud' });
    const gEv = { type: EVENT.CONFIRMED, bar: '2026-09-09', price: 2498.20, level: null, pct: 0 };
    const g = generateFollowUp(dev, gEv, c);
    assert.match(g.text.split('\n')[0], /^📈 \$ETH — RECLAIM CONFIRMED \(update\)\./);
    assert.match(g.text, /First posted Sep 7 as DEVELOPING\./);
    assert.match(g.text, /\nWhich level gets hit first — \$2,579 or \$2,449\? 👇\nData: daily/);
    const gs = followUpSetup(dev, gEv);
    assert.deepEqual(blocking(validatePost(g.text, { setup: gs, row: followUpRow(dev, gEv), model: followUpModel(dev, gEv), config: c, kind: 'followup', stage: gs.stage, now: new Date('2026-09-09T23:00:00Z') })), []);
    const lt = { type: EVENT.LEVEL_TEST, bar: '2026-09-08', price: 2560.20, level: 2578.88, extreme: 2585.10, pct: 2.48 };
    const forged = generateFollowUp(dev, lt, c).text.replace('LEVEL TEST.', 'LEVEL TEST — reclaim confirmed.');
    const ls = followUpSetup(dev, lt);
    assert.ok(blocking(validatePost(forged, { setup: ls, row: followUpRow(dev, lt), model: followUpModel(dev, lt), config: c, kind: 'followup', stage: ls.stage, now: new Date('2026-09-08T23:00:00Z') })).some(i => i.code === 'signal_upgraded'));
    assert.equal(barCloseIso('2026-09-09', 'crypto'), '2026-09-10T00:00:00.000Z');
    assert.equal(barCloseIso('2026-09-09', 'equity'), '2026-09-09T20:00:00.000Z');
  });

  it('scorecard text restates the tracker exactly, never says "targets", and a tampered count blocks', () => {
    const c = cfg();
    const stats = { from: '2026-09-07', to: '2026-09-11', posted: 4, breakouts: 2, invalidated: 1, expired: 1, active: 1, resolved: 3, hitRate: 67, allTime: { setups: 6, breakouts: 2, invalidated: 2, resolved: 4, hitRate: 50 }, best: { symbol: 'ETH', pct: 4.5 }, worst: { symbol: 'SOL', pct: -2.7 }, symbols: { posted: [], breakouts: ['ETH', 'ADA'], invalidated: ['SOL'], active: ['BTC'] } };
    const { text } = generateScorecard(stats, c);
    const lines = text.split('\n');
    assert.equal(lines[0], '📊 Weekly Setup Scorecard · Sep 7–11, 2026');
    assert.equal(lines[1], 'Setups posted: 4');
    assert.equal(lines[2], '✅ Breakouts / levels reached: 2');
    assert.equal(lines[3], '🛑 Invalidated: 1');
    assert.equal(lines[4], '👀 Still active: 1');
    assert.equal(lines[5], '⏳ Expired (no resolution): 1');
    assert.equal(lines[6], 'Hit rate this week: 67% (2 of 3 resolved)');
    assert.equal(lines[7], 'All-time: 6 setups · 50% hit rate (2 of 4 resolved)');
    assert.equal(lines[8], 'Best this week: $ETH +4.5% · Worst: $SOL −2.7%');
    assert.equal(lines[9], 'Every setup, its levels and its outcome are logged before posting.');
    assert.match(lines[10], /^How to read it: hit rate = breakouts ÷ resolved/);
    assert.equal(lines[11], 'Which setup did you follow this week? 👇');
    assert.match(text, /\nData: daily · Sep 11, 2026\n#Stocks #Crypto$/);
    assert.ok(!generateScorecard({ ...stats, expired: 0 }, c).text.includes('Expired'));
    assert.ok(!/target/i.test(text));
    const ctx = { setup: null, row: null, model: { reportDate: '2026-09-11', dataAsOf: new Date().toISOString() }, config: c, kind: 'scorecard', scorecard: stats };
    assert.deepEqual(blocking(validatePost(text, ctx)), []);
    assert.ok(blocking(validatePost(text.replace('Setups posted: 4', 'Setups posted: 9'), ctx)).some(i => i.code === 'value_mismatch'));
    assert.ok(blocking(validatePost(text.replace('67%', '90%'), ctx)).some(i => i.code === 'value_mismatch'));
    const spec = buildScorecardSpec(stats, c, '/tmp/s.png');
    assert.equal(spec.style, 'scorecard');
    assert.equal(spec.hitRate, 67);
    assert.deepEqual(spec.tiles.map(t => t.value), ['4', '2', '1', '1']);
  });

  it('renders the scorecard card', { skip: !HAVE_PIL }, () => {
    const c = cfg();
    const stats = scorecardStats([open()], weekBounds('2026-09-07'));
    const out = join(mkdtempSync(join(tmpdir(), 'sc-')), 'SCORECARD.png');
    renderChartSpec(buildScorecardSpec(stats, c, out));
    assert.ok(existsSync(out));
  });
});

describe('one hero per day: pending-aware cap, surplus as thread replies, close check', () => {
  const STOCK_CFG = join(ROOT, 'config', 'social-compliance.json');
  const load = () => { resetConfigCache(); const c = loadConfig(STOCK_CFG); resetConfigCache(); return { ...c, charts: { ...c.charts, enabled: false, requireForPublish: false } }; };
  const ROWX = (sym, over = {}) => ROW({ symbol: sym, price: 118, cmf: 0.19, ...over });
  const cohort = syms => ({ source: 't', calls: syms.map(s => ({ symbol: s, score: 2.5 })), puts: [], watches: [] });
  const fresh = (over = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'hero-'));
    const cfg = load();
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser', spacingSeconds: 0, ...over } };
    // Thread replies are an account cadence choice (off on the live account),
    // so pin them on here: these tests cover the mechanism, not the setting.
    cfg.thread = { ...cfg.thread, enabled: true, maxReplies: 3 };
    return { cfg, wf: new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'audit.jsonl')), insights: null }) };
  };
  const rows = () => [ROWX('AAA'), ROWX('BBB'), ROWX('CCC'), ROWX('DDD'), ROWX('EEE')];

  it('a re-run with a setup already waiting on the poster queues NO second hero', async () => {
    const { wf } = fresh();
    const model = MODEL(rows(), { cohort: cohort(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']) });
    const first = await wf.autoPublish(model);
    assert.deepEqual(first.published.map(p => p.symbol), ['AAA']);
    const again = await wf.autoPublish(model);
    assert.deepEqual(again.published, []);
    assert.deepEqual(again.pending, ['AAA']);
    assert.equal(again.capped, true);
    assert.equal(again.noSetup, undefined);
    const setups = wf.ready({ queue: 'stocks' }).filter(r => (r.kind ?? 'setup') === 'setup');
    assert.equal(setups.length, 1, 'still exactly one hero queued');
  });

  it('the surplus becomes at most maxReplies thread replies under the hero, validated, not tracked', async () => {
    const { wf } = fresh();
    const model = MODEL(rows(), { cohort: cohort(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']) });
    const r = await wf.autoPublish(model);
    assert.deepEqual(r.published.map(p => p.symbol), ['AAA']);
    const queued = r.thread.filter(t => t.ready);
    assert.deepEqual(queued.map(t => t.symbol), ['BBB', 'CCC', 'DDD']);
    assert.ok(r.thread.some(t => t.symbol === 'EEE' && /thread cap/.test(t.skipped)));
    const ready = wf.ready({ queue: 'stocks' });
    const replies = ready.filter(x => x.kind === 'thread');
    assert.equal(replies.length, 3);
    for (const rep of replies) {
      assert.equal(rep.replyTo, r.published[0].id);
      assert.equal(rep.replyToPost.status, 'ready_to_post');       // parent not posted yet → no xPostId
      assert.match(rep.originalText, /^(Also on today's sweep:|And:) \$[A-Z]+ /);
      assert.match(rep.originalText, /Not tracked/);
      assert.match(rep.originalText, /🎯 Above \$123\.50 → potential breakout · 🛑 Below \$115\.00 → setup invalidated/);
      assert.deepEqual(blocking(rep.issues), []);
    }
    // a second run adds nothing to the thread
    const again = await wf.autoPublish(model);
    assert.equal(again.thread.filter(t => t.ready).length, 0);
    assert.equal(wf.ready({ queue: 'stocks' }).filter(x => x.kind === 'thread').length, 3);
    // once the hero is recorded the replies resolve its post id, and recording a reply opens nothing in the tracker
    wf.recordManualPublication(r.published[0].id, model, { xPostId: '100' });
    const resolved = wf.ready({ queue: 'stocks' }).find(x => x.kind === 'thread');
    assert.equal(resolved.replyToPost.xPostId, '100');
    wf.recordManualPublication(resolved.id, model, { xPostId: '101' });
    assert.equal(wf.tracker.active().length, 1, 'only the hero is tracked');
  });

  // A thread reply is backed by the same sweep report as its hero, so `social
  // record` must load that report's model for it. Passing null crashed in
  // findRow(model, ...) and left a reply live on X but still ready_to_post.
  it('the CLI records a thread reply without a crash (report model is loaded for kind thread)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'thread-cli-'));
    const reportPath = join(dir, 'daily-report.html');
    writeFileSync(reportPath, THREAD_REPORT_HTML);
    const { model } = loadReportModel(reportPath);
    model.dataAsOf = new Date().toISOString();
    model.cohort = cohort(['AAA', 'BBB']);

    const cfg = load();
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser', spacingSeconds: 0 } };
    cfg.thread = { ...cfg.thread, enabled: true, maxReplies: 3 };
    const auditPath = join(dir, 'audit.jsonl');
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(auditPath), insights: null });
    const r = await wf.autoPublish(model);
    assert.deepEqual(r.published.map(p => p.symbol), ['AAA']);
    const reply = wf.ready({ queue: 'stocks' }).find(x => x.kind === 'thread');
    assert.ok(reply, 'a thread reply was queued');
    assert.equal(reply.reportPath, reportPath, 'the reply carries the report it came from');

    const env = { ...process.env, SOCIAL_AUDIT_PATH: auditPath, SOCIAL_TRACKER_PATH: join(dir, 'setups.jsonl'), SOCIAL_METRICS_PATH: join(dir, 'metrics.jsonl') };
    const run = args => spawnSync(process.execPath, [join(ROOT, 'src', 'cli', 'index.js'), 'social', ...args], { encoding: 'utf8', env });

    const hero = run(['record', r.published[0].id, '--post-id', '900', '--json']);
    assert.equal(hero.status, 0, hero.stdout + hero.stderr);

    const out = run(['record', reply.id, '--post-id', '901', '--url', 'https://x.com/u/status/901', '--json']);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    const rec = JSON.parse(out.stdout);
    assert.notEqual(rec.success, false, `CLI reported an error: ${rec.error}`);
    assert.equal(rec.status, 'published');
    assert.equal(rec.publication.xPostId, '901');
    assert.equal(wf.ready({ queue: 'stocks' }).filter(x => x.id === reply.id).length, 0, 'the recorded reply leaves the ready queue');
  });

  it('thread reply text never upgrades a WATCH and carries the ticker, price and both levels', () => {
    const cfg = load();
    const row = ROWX('ZZZ', { price: 122 });         // breakout WATCH
    const setup = classifySetup(row);
    const model = MODEL([row]);
    const { text } = generateThreadReply(setup, model, cfg, { index: 2 });
    assert.match(text, /^And: \$ZZZ /);
    assert.ok(!/confirmed/i.test(text.split('\n')[0]));
    assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, kind: 'thread' })), []);
    const upgraded = text.replace(text.split('\n')[0], 'And: $ZZZ breakout confirmed.');
    assert.ok(blocking(validatePost(upgraded, { setup, row, model, config: cfg, kind: 'thread' })).some(i => i.code === 'signal_upgraded'));
  });

  it('close check: last price vs setup price, level status from the session range, reply under the hero, once per day', async () => {
    const { wf } = fresh();
    const model = MODEL([ROWX('AAA')], { cohort: cohort(['AAA']) });
    const r = await wf.autoPublish(model);
    const heroId = r.published[0].id;
    const now = new Date();
    wf.now = () => now;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    wf.recordManualPublication(heroId, model, { xPostId: '500', url: 'https://x.com/ai_king0206/status/500' });
    const ts = Math.floor(now.getTime() / 1000);
    const yahoo = { chart: { result: [{ meta: {}, timestamp: [ts - 600, ts - 300, ts], indicators: { quote: [{ open: [118, 119, 120], high: [119, 121, 124], low: [117, 118.5, 119], close: [119, 120.5, 121.4], volume: [1, 1, 1] }] } }], error: null } };
    const fetchImplForQuotes = async () => ({ ok: true, json: async () => yahoo });
    const q = parseIntradayQuote(yahoo);
    assert.equal(q.last, 121.4);
    assert.equal(q.high, 124);
    const s = await wf.closeUpdate({ fetchImplForQuotes, today: day });
    assert.equal(s.checked, 1);
    assert.equal(s.queued.length, 1);
    const rec = wf.ready({ queue: 'stocks' }).find(x => x.kind === 'closeupdate');
    assert.ok(rec);
    assert.equal(rec.replyTo, heroId);
    assert.equal(rec.replyToPost.xPostId, '500');
    assert.match(rec.originalText, /^⏱ \$AAA — CLOSE CHECK\. Price: \$121\.40 at \d{1,2}:\d\d [AP]M ET \(\+2\.9% from \$118\.00 at the setup\)\./);
    assert.match(rec.originalText, /🎯 \$123\.50: tagged intraday · 🛑 \$115\.00: intact/);
    assert.match(rec.originalText, /Levels only count on the daily close/);
    assert.deepEqual(blocking(rec.issues), []);
    // idempotent per day
    const s2 = await wf.closeUpdate({ fetchImplForQuotes, today: day });
    assert.equal(s2.queued.length, 0);
    assert.match(s2.skipped[0].reason, /already queued today/);
    // recording it attaches to the hero's tracker record without opening a new one
    wf.recordManualPublication(rec.id, null, { xPostId: '501' });
    const tr = wf.tracker.active()[0];
    assert.equal(wf.tracker.active().length, 1);
    assert.ok(tr.posts.some(p => p.auditId === rec.id && p.stage === 'CLOSE_CHECK'));
    // level status helper
    assert.deepEqual(levelStatus({ direction: 'bullish', target: { value: 123.5 }, stop: { value: 115 } }, { last: 124.5, high: 125, low: 119 }), { target: 'trading through', stop: 'intact' });
    assert.deepEqual(levelStatus({ direction: 'bearish', target: { value: 110 }, stop: { value: 125 } }, { last: 126, high: 127, low: 118 }), { target: 'not reached', stop: 'trading through' });
  });

  it('a queued setup that missed its window expires instead of posting stale', async () => {
    const { wf } = fresh();
    const model = MODEL([ROWX('AAA'), ROWX('BBB')], { cohort: cohort(['AAA', 'BBB']) });
    await wf.autoPublish(model);
    assert.equal(wf.ready({ queue: 'stocks' }).length, 2); // hero + 1 thread reply
    wf.now = () => new Date(Date.now() + 30 * 3600_000);
    const expired = wf.expireStaleReady({ queue: 'stocks' });
    assert.deepEqual(expired.map(e => e.status), ['expired', 'expired']);
    assert.equal(wf.ready({ queue: 'stocks' }).length, 0);
  });

  it('close check runs only for setups posted today', async () => {
    const { wf } = fresh();
    const model = MODEL([ROWX('AAA')], { cohort: cohort(['AAA']) });
    const r = await wf.autoPublish(model);
    wf.recordManualPublication(r.published[0].id, model, { xPostId: '600' });
    const s = await wf.closeUpdate({ fetchImplForQuotes: async () => { throw new Error('should not be called'); }, today: '2020-01-01' });
    assert.equal(s.checked, 0);
    assert.equal(s.queued.length, 0);
  });
});

describe('publishing policy: one highest-quality setup per run, tracked, followed up, scored weekly', () => {
  const CRYPTO_CFG = join(ROOT, 'config', 'social-compliance-crypto.json');
  const STOCK_CFG = join(ROOT, 'config', 'social-compliance.json');
  const load = (p, over = {}) => { resetConfigCache(); const c = loadConfig(p); resetConfigCache(); return { ...c, charts: { ...c.charts, enabled: false, requireForPublish: false }, ...over }; };
  const ETH = (over = {}) => ROW({
    symbol: 'ETH', price: 2498.20, rsi: 64, rsiMa: 60, cmf: 0.22, atr: 95,
    bbLower: 2300.10, bbBasis: 2448.62, bbUpper: 2578.88, vwap: 2410.55, cloudA: 2380.00, cloudB: 2350.00,
    position: 'above_cloud', structure: 'HH-up', score: 2.5, biasNext: 'Calls', ...over,
  });
  const bar = (t, o, h, l, c, v = 1000) => ({ t, o, h, l, c, v });
  const fresh = (p, over = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'policy-'));
    const cfg = load(p, over);
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser', spacingSeconds: 0 } };
    return { cfg, wf: new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'audit.jsonl')), insights: null }), dir };
  };
  const cohort = syms => ({ source: 't', calls: syms.map(s => ({ symbol: s, score: 2.5 })), puts: [], watches: [] });

  it('posts exactly one setup — the highest-quality one — and never forces a post below the bar', async () => {
    const { wf } = fresh(CRYPTO_CFG);
    const rows = [
      ETH({ symbol: 'AAA', position: 'in_cloud' }),                // WATCH / Low
      ETH({ symbol: 'BBB', cmf: 0.12 }),                            // CONFIRMED / Medium (cmf < 0.15)
      ETH({ symbol: 'CCC' }),                                       // CONFIRMED / High
    ];
    const model = MODEL(rows, { cohort: cohort(['AAA', 'BBB', 'CCC']) });
    const r = await wf.autoPublish(model);
    assert.equal(r.refused, null);
    assert.deepEqual(r.published.map(p => p.symbol), ['CCC']);
    assert.equal(r.capped, true);
    assert.equal(r.candidateOrder[0], 'CCC:CONFIRMED/High');
    assert.equal(wf.ready({ queue: 'crypto' }).length, 1);
    // nothing meets Medium → nothing posted, and the summary says so
    const { wf: w2 } = fresh(CRYPTO_CFG);
    const low = MODEL([ETH({ symbol: 'AAA', position: 'in_cloud' })], { cohort: cohort(['AAA']) });
    const r2 = await w2.autoPublish(low);
    assert.deepEqual(r2.published, []);
    assert.match(r2.noSetup, /nothing posted/);
    assert.ok(r2.skipped.some(s => s.symbol === 'AAA' && /confidence Low/.test(s.reason)));
  });

  it('a DEVELOPING setup is posted when it is the best Medium-or-better candidate', async () => {
    const { wf } = fresh(CRYPTO_CFG);
    // breakout watch at the band with confirmation → WATCH / Medium
    const row = ETH({ symbol: 'DDD', price: 2570 });
    const setup = classifySetup(row);
    assert.equal(setup.signal, SIGNAL.WATCH);
    assert.equal(setup.confidence, 'Medium');
    const r = await wf.autoPublish(MODEL([row], { cohort: cohort(['DDD']) }));
    assert.deepEqual(r.published.map(p => p.symbol), ['DDD']);
    const rec = wf.ready({ queue: 'crypto' })[0];
    assert.equal(rec.stage, STAGE.DEVELOPING);
    assert.match(rec.originalText.split('\n')[0], /breakout watch\.$/);
  });

  it('recording the browser post opens the lifecycle record; the symbol is then skipped until it resolves', async () => {
    const { wf } = fresh(CRYPTO_CFG);
    const model = MODEL([ETH()], { cohort: cohort(['ETH']) });
    await wf.autoPublish(model);
    const [ready] = wf.ready({ queue: 'crypto' });
    assert.equal(wf.tracker.active().length, 0, 'not tracked until it is actually live');
    wf.recordManualPublication(ready.id, model, { xPostId: '999', url: 'https://x.com/a/status/999' });
    const [tr] = wf.tracker.active();
    assert.equal(tr.id, ready.id);
    assert.equal(tr.stage, STAGE.CONFIRMED);
    assert.equal(tr.posts[0].xPostId, '999');
    assert.equal(tr.target.value, 2578.88);
    // next morning: the 20h cooldown has passed, so it is the tracker that holds the symbol back
    const tomorrow = new Date(Date.now() + 26 * 3600_000);
    const later = new SocialWorkflow({ config: wf.config, audit: wf.audit, tracker: wf.tracker, now: () => tomorrow, insights: null });
    const again = await later.autoPublish(MODEL([ETH()], { reportDate: '2026-09-09', dataAsOf: tomorrow.toISOString(), cohort: cohort(['ETH']) }));
    assert.deepEqual(again.published, []);
    assert.ok(again.skipped.some(s => s.symbol === 'ETH' && /already tracked as RECLAIM CONFIRMED/.test(s.reason)), JSON.stringify(again.skipped));
  });

  it('trackEvents queues a compliance-clean follow-up per event and advances the tracker; dry-run changes nothing', async () => {
    const { wf } = fresh(CRYPTO_CFG);
    const model = MODEL([ETH()], { reportDate: '2026-09-07', cohort: cohort(['ETH']) });
    await wf.autoPublish(model);
    const [ready] = wf.ready({ queue: 'crypto' });
    wf.recordManualPublication(ready.id, model, { xPostId: '999' });
    const candles = [
      bar('2026-09-07', 2480, 2510, 2470, 2498.20),
      bar('2026-09-08', 2500, 2585.10, 2490, 2560.20),
      bar('2026-09-09', 2565, 2620, 2550, 2610.40),
    ];
    const yahoo = async () => ({ ok: true, json: async () => ({ chart: { result: [{ timestamp: candles.map(c => Date.parse(c.t + 'T00:00:00Z') / 1000), indicators: { quote: [{ open: candles.map(c => c.o), high: candles.map(c => c.h), low: candles.map(c => c.l), close: candles.map(c => c.c), volume: candles.map(c => c.v) }] } }] } }) });
    const frozen = () => new Date('2026-09-10T05:00:00Z');
    const dry = new SocialWorkflow({ config: wf.config, audit: wf.audit, tracker: wf.tracker, now: frozen, insights: null });
    const d = await dry.trackEvents({ dryRun: true, fetchImplForCandles: yahoo });
    assert.deepEqual(d.events.map(e => e.type), ['LEVEL_TEST', 'BREAKOUT']);
    // The run is on the 10th; both events sit inside the follow-up freshness
    // window (96h), so both are queued. Beyond it they are audited as skipped.
    assert.equal(d.queued.length, 2, JSON.stringify(d.skipped));
    assert.equal(wf.tracker.active().length, 1, 'dry run leaves the tracker alone');
    assert.equal(wf.ready({ queue: 'crypto' }).length, 0);
    // Non-terminal updates are capped per run; terminal events always go out.
    const capped = new SocialWorkflow({ config: { ...wf.config, followUps: { ...wf.config.followUps, maxUpdatesPerRun: 0 } }, audit: wf.audit, tracker: wf.tracker, now: frozen, insights: null });
    const cap = await capped.trackEvents({ dryRun: true, fetchImplForCandles: yahoo });
    assert.deepEqual(cap.queued.map(q => q.type), ['BREAKOUT']);
    assert.ok(cap.skipped.some(x => x.type === 'LEVEL_TEST' && /follow-up cap/.test(x.reason)), JSON.stringify(cap.skipped));
    const old = new SocialWorkflow({ config: wf.config, audit: wf.audit, tracker: wf.tracker, now: () => new Date('2026-09-20T05:00:00Z'), insights: null });
    const o = await old.trackEvents({ dryRun: true, fetchImplForCandles: yahoo });
    assert.equal(o.queued.length, 0);
    assert.ok(o.skipped.every(x => /stale_data/.test(x.reason)), JSON.stringify(o.skipped));

    const live = new SocialWorkflow({ config: wf.config, audit: wf.audit, tracker: wf.tracker, now: frozen, insights: null });
    const r = await live.trackEvents({ fetchImplForCandles: yahoo });
    assert.equal(r.queued.length, 2, JSON.stringify(r.skipped));
    const readyNow = wf.ready({ queue: 'crypto' });
    assert.deepEqual(readyNow.map(x => [x.kind, x.stage, x.symbol]), [['followup', 'CONFIRMED', 'ETH'], ['followup', 'BREAKOUT', 'ETH']]);
    assert.match(readyNow[0].originalText, /^👀 \$ETH — LEVEL TEST\./);
    assert.match(readyNow[1].originalText, /^✅ \$ETH — BREAKOUT UPDATE\./);
    assert.equal(readyNow[0].followUpOf, ready.id);
    const [tr] = wf.tracker.latest();
    assert.equal(tr.stage, STAGE.BREAKOUT);
    assert.equal(tr.outcome, 'breakout');
    assert.equal(wf.tracker.active().length, 0);
    // recording the follow-up appends it to the lifecycle record
    live.recordManualPublication(readyNow[1].id, null, { xPostId: '1000' });
    assert.equal(wf.tracker.latest()[0].posts.at(-1).xPostId, '1000');
    // a second run finds nothing new
    const r2 = await live.trackEvents({ fetchImplForCandles: yahoo });
    assert.deepEqual(r2.events, []);
  });

  it('a later report graduates a DEVELOPING setup and queues the CONFIRMED update', async () => {
    const { wf } = fresh(CRYPTO_CFG);
    const devModel = MODEL([ETH({ price: 2570 })], { cohort: cohort(['ETH']) });
    await wf.autoPublish(devModel);
    const [ready] = wf.ready({ queue: 'crypto' });
    wf.recordManualPublication(ready.id, devModel, { xPostId: '5' });
    assert.equal(wf.tracker.active()[0].stage, STAGE.DEVELOPING);
    const later = MODEL([ETH({ price: 2520 })], { reportDate: '2026-09-09' }); // basis reclaim, confirmed, same direction
    assert.equal(classifySetup(later.rows[0]).signal, SIGNAL.CONFIRMED);
    const flat = [bar('2026-09-08', 2560, 2575, 2510, 2530), bar('2026-09-09', 2530, 2545, 2505, 2520)];
    const yahoo = async () => ({ ok: true, json: async () => ({ chart: { result: [{ timestamp: flat.map(c => Date.parse(c.t + 'T00:00:00Z') / 1000), indicators: { quote: [{ open: flat.map(c => c.o), high: flat.map(c => c.h), low: flat.map(c => c.l), close: flat.map(c => c.c), volume: flat.map(c => c.v) }] } }] } }) });
    const live = new SocialWorkflow({ config: wf.config, audit: wf.audit, tracker: wf.tracker, now: () => new Date('2026-09-10T05:00:00Z'), insights: null });
    const r = await live.trackEvents({ model: later, fetchImplForCandles: yahoo });
    assert.deepEqual(r.events.map(e => e.type), ['CONFIRMED']);
    assert.equal(wf.tracker.active()[0].stage, STAGE.CONFIRMED);
    assert.match(wf.ready({ queue: 'crypto' })[0].originalText, /CONFIRMED \(update\)/);
  });

  it('queueScorecard produces one validated scorecard per week on the stocks queue', async () => {
    const { wf } = fresh(STOCK_CFG);
    const model = MODEL([ETH({ symbol: 'XYZ' })], { cohort: cohort(['XYZ']) });
    await wf.autoPublish(model);
    const [ready] = wf.ready({ queue: 'stocks' });
    wf.recordManualPublication(ready.id, model, { xPostId: '7' });
    const s = await wf.queueScorecard({ date: '2026-09-08' });
    assert.equal(s.refused, null, s.refused);
    assert.equal(s.stats.posted, 1);
    assert.equal(s.stats.active, 1);
    const sc = wf.ready({ queue: 'stocks' }).find(r => r.kind === 'scorecard');
    assert.ok(sc);
    assert.match(sc.originalText, /^📊 Weekly Setup Scorecard · Sep 7–11, 2026\nSetups posted: 1\n/);
    assert.match(sc.originalText, /Hit rate this week: — \(nothing resolved yet\)/);
    const dup = await wf.queueScorecard({ date: '2026-09-09' });
    assert.match(dup.refused, /already ready_to_post/);
    const { wf: crypto } = fresh(CRYPTO_CFG);
    assert.match((await crypto.queueScorecard({ date: '2026-09-08' })).refused, /disabled/);
  });

  it('historical engagement breaks ties between equally-ranked candidates, never overrides quality', async () => {
    const insights = { byQueueSetup: { 'crypto/Trend continuation': { withMetrics: 5, engagementRate: 0.08 }, 'crypto/Basis reclaim': { withMetrics: 5, engagementRate: 0.02 } } };
    const { cfg, dir } = fresh(CRYPTO_CFG);
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'a2.jsonl')), insights });
    const rows = [
      ETH({ symbol: 'AAA' }),                          // Basis reclaim / CONFIRMED / High
      ETH({ symbol: 'BBB', price: 2515, bbBasis: 2440, atr: 50, rsi: 62 }), // Trend continuation / CONFIRMED / High
    ];
    const r = await wf.autoPublish(MODEL(rows, { cohort: cohort(['AAA', 'BBB']) }));
    assert.deepEqual(r.published.map(p => p.symbol), ['BBB'], r.candidateOrder.join(' '));
    // with no evidence the tiebreak is alphabetical
    const wf2 = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'a3.jsonl')), insights: null });
    const r2 = await wf2.autoPublish(MODEL(rows, { cohort: cohort(['AAA', 'BBB']) }));
    assert.deepEqual(r2.published.map(p => p.symbol), ['AAA']);
    assert.equal(insightsBoost(insights, { setup: 'Basis reclaim' }, 'crypto'), 0.02);
    assert.equal(insightsBoost({ bySetupType: { X: { withMetrics: 2, engagementRate: 0.9 } } }, { setup: 'X' }, 'crypto'), 0, 'fewer than 3 measured posts is not evidence');
  });
});

describe('metrics: collection, manual recording, report and insights', () => {
  it('normalises X API v2 metrics and manual entries the same way', () => {
    const m = parseTweetMetrics({ id: '42', public_metrics: { impression_count: 1000, like_count: 10, reply_count: 2, retweet_count: 3, quote_count: 1, bookmark_count: 4 }, non_public_metrics: { user_profile_clicks: 6 } });
    assert.equal(m.impressions, 1000);
    assert.equal(m.engagements, 26);
    assert.equal(engagementRate(m), 0.026);
    const r = recordManual('42', { impressions: '500', likes: '5', bookmarks: '2' }, { source: 'browser' });
    assert.equal(r.engagements, 7);
    assert.equal(r.source, 'browser');
  });

  it('collectPostMetrics signs a GET with OAuth 1.0a and parses the batch', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ data: [{ id: '1', public_metrics: { impression_count: 10, like_count: 1, reply_count: 0, retweet_count: 0, quote_count: 0, bookmark_count: 0 } }] }) }; };
    const creds = { type: 'oauth1', apiKey: 'k', apiSecret: 's', accessToken: 't', accessTokenSecret: 'ts' };
    const out = await collectPostMetrics(['1'], { creds, fetchImpl });
    assert.equal(out[0].impressions, 10);
    assert.match(calls[0].url, /^https:\/\/api\.x\.com\/2\/tweets\?ids=1&tweet\.fields=/);
    assert.match(calls[0].opts.headers.Authorization, /^OAuth oauth_consumer_key="k"/);
  });

  it('report joins metrics with the audit log and tracker, aggregates, recommends, and feeds insights', () => {
    const dir = mkdtempSync(join(tmpdir(), 'met-'));
    const metrics = new MetricsStore(join(dir, 'm.jsonl'));
    const auditRecords = [];
    const trackerRecords = [];
    const mk = (i, queue, setupType, outcome, imp, eng) => {
      const id = `id${i}`;
      auditRecords.push({ id, status: 'published', kind: 'setup', queue, symbol: `S${i}`, setup: { setup: setupType, signal: 'CONFIRMED' }, stage: 'CONFIRMED', publication: { xPostId: `p${i}`, url: 'u', at: `2026-09-0${(i % 5) + 1}T14:0${i}:00Z` } });
      trackerRecords.push({ id, outcome });
      metrics.append({ kind: 'post', xPostId: `p${i}`, impressions: imp, likes: eng, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, profileClicks: 0 });
    };
    for (let i = 1; i <= 4; i++) mk(i, 'crypto', 'Basis reclaim', 'breakout', 1000, 50);
    for (let i = 5; i <= 8; i++) mk(i, 'stocks', 'Trend continuation', i % 2 ? 'breakout' : 'invalidated', 400, 4);
    metrics.append({ kind: 'account', followers: 10 });
    metrics.append({ kind: 'account', followers: 14 });
    const rep = buildReport({ metrics, auditRecords, trackerRecords });
    assert.equal(rep.posts, 8);
    assert.equal(rep.postsWithMetrics, 8);
    assert.equal(rep.byQueue.crypto.engagementRate, 0.05);
    assert.equal(rep.bySetupType['Basis reclaim'].hitRate, 100);
    assert.equal(rep.bySetupType['Trend continuation'].hitRate, 50);
    assert.equal(rep.followers.delta, 4);
    assert.ok(rep.recommendations.some(r => /"Basis reclaim" has the highest engagement rate/.test(r)), rep.recommendations.join(' | '));
    assert.ok(rep.recommendations.some(r => /crypto posts engage better/.test(r)));
    assert.equal(insightsBoost(rep, { setup: 'Basis reclaim' }, 'crypto'), 0.05);
    assert.equal(insightsBoost(rep, { setup: 'Trend continuation' }, 'stocks'), 0.01);
  });
});

// ─── educational explainers ───────────────────────────────────────────────────

import { TOPICS, getTopic, nextTopic, generateEducationPost, buildEducationSpec, educationAltText, lessonNumbers, lessonNumberFor, TAKEAWAY } from '../src/social/education.js';

describe('educational explainers: one topic per post, rotated, no tickers, footer on the card', () => {
  const STOCK_CFG = join(ROOT, 'config', 'social-compliance.json');
  const CRYPTO_CFG = join(ROOT, 'config', 'social-compliance-crypto.json');
  const load = (p, over = {}) => { resetConfigCache(); const c = loadConfig(p); resetConfigCache(); return { ...c, ...over }; };

  it('the library is well-formed: unique ids, three examples each with a takeaway and a drawable illustration', () => {
    const ids = TOPICS.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(TOPICS.length >= 8);
    for (const t of TOPICS) {
      assert.equal(t.examples.length, 3, t.id);
      assert.ok(t.definition.length <= 110, `${t.id} definition too long`);
      assert.ok(t.question.endsWith('?'), t.id);
      for (const e of t.examples) {
        assert.ok(Object.values(TAKEAWAY).includes(e.takeaway), `${t.id}/${e.label}`);
        assert.ok(['candles', 'osc', 'line'].includes(e.art.type), `${t.id}/${e.label} art`);
        if (e.art.type === 'candles') assert.ok(e.art.bars.length >= 4);
        if (e.art.type !== 'candles') assert.ok(e.art.points.length >= 4);
        assert.ok(!/\$[A-Z]{1,6}\b/.test(e.text + e.note), 'no tickers in teaching copy');
      }
      const takeaways = new Set(t.examples.map(e => e.takeaway));
      assert.equal(takeaways.size, 3, `${t.id} should cover bullish, bearish and neutral`);
    }
  });

  it('every topic generates a compliance-clean post under the stock config; a ticker or a claim blocks', () => {
    const cfg = load(STOCK_CFG);
    for (const t of TOPICS) {
      const { text } = generateEducationPost(t, cfg, { lesson: 3 });
      const lines = text.split('\n');
      assert.equal(lines[0], '🎓 AI Trade School — Lesson #03');
      assert.equal(lines[1], t.title);
      assert.equal(lines[2], t.definition);
      assert.ok(lines.some(l => l.startsWith('✅ Bullish — ')), t.id);
      assert.ok(lines.some(l => l.startsWith('🛑 Bearish — ')), t.id);
      assert.ok(lines.some(l => l.startsWith('⚖️ Neutral — ')), t.id);
      assert.match(lines.at(-2), /^👇 .*\?$/);
      assert.equal(lines.at(-1), '#TechnicalAnalysis #TradingEducation', 'a lesson ends on exactly these two tags');
      assert.ok(!text.includes('#AITradeSchool'), 'the header carries the branding, not a tag');
      assert.ok(lines.length <= 10, `${t.id}: ${lines.length} lines — header, title, hook, ≤5 points, CTA, tags`);
      const ctx = { setup: null, row: null, model: { reportDate: '2026-09-08', dataAsOf: new Date().toISOString() }, config: cfg, kind: 'education', chart: { path: '/tmp/e.png' } };
      assert.deepEqual(blocking(validatePost(text, ctx)), [], `${t.id}: ${JSON.stringify(blocking(validatePost(text, ctx)))}`);
      assert.ok(blocking(validatePost(text + '\nLook at $AAPL', ctx)).some(i => i.code === 'ticker_in_education'));
      assert.ok(blocking(validatePost(text.replace('👇', '— it will rally 👇'), ctx)).some(i => i.code === 'unsupported_claim'));
    }
  });

  it('rotation: never-posted topics first in library order, then the one posted longest ago', () => {
    assert.equal(nextTopic([]).id, TOPICS[0].id);
    const posted = (topic, at) => ({ kind: 'education', topic, status: 'published', publication: { at } });
    const all = TOPICS.map((t, i) => posted(t.id, `2026-08-${String(i + 1).padStart(2, '0')}T12:00:00Z`));
    assert.equal(nextTopic(all).id, TOPICS[0].id, 'oldest first once every topic has run');
    const bumped = [...all, posted(TOPICS[0].id, '2026-09-01T12:00:00Z')];
    assert.equal(nextTopic(bumped).id, TOPICS[1].id);
    assert.equal(nextTopic(all.slice(0, 3)).id, TOPICS[3].id, 'first never-posted');
    assert.equal(getTopic('nope'), null);
  });

  it('queueEducation: one per day on the stocks queue, rendered card carries the footer, crypto config refuses', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edu-'));
    const cfg = load(STOCK_CFG, { charts: { ...load(STOCK_CFG).charts, enabled: false, requireForPublish: false } });
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser' } };
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'a.jsonl')), insights: null, now: () => new Date('2026-09-08T12:00:00Z') });
    const s = await wf.queueEducation({});
    assert.equal(s.refused, null, s.refused);
    assert.equal(s.topic, TOPICS[0].id);
    const [rec] = wf.ready({ queue: 'stocks' });
    assert.equal(rec.kind, 'education');
    assert.equal(rec.topic, TOPICS[0].id);
    assert.equal(rec.symbol, 'EDU');
    assert.match(rec.originalText, /^🎓 AI Trade School — Lesson #01\nSupport & Resistance\n/);
    assert.equal(rec.lesson, 1, 'the first topic taught is Lesson #01');
    assert.equal(rec.setup.setup, 'AI Trade School Lesson #01: Support & Resistance');
    const dup = await wf.queueEducation({});
    assert.match(dup.refused, /already ready_to_post/);
    const next = new SocialWorkflow({ config: cfg, audit: wf.audit, insights: null, now: () => new Date('2026-09-11T12:00:00Z') });
    wf.recordManualPublication(rec.id, null, { xPostId: '77' });
    const s2 = await next.queueEducation({});
    assert.equal(s2.topic, TOPICS[1].id, 'rotation advances after publication');
    assert.equal(s2.lesson, 2, 'the second topic taught is Lesson #02');
    const unknown = await next.queueEducation({ topic: 'nope' });
    assert.match(unknown.refused, /unknown topic/);
    const crypto = new SocialWorkflow({ config: load(CRYPTO_CFG), audit: new AuditStore(join(dir, 'c.jsonl')), insights: null });
    assert.match((await crypto.queueEducation({})).refused, /disabled/);
    const spec = buildEducationSpec(TOPICS[2], cfg, '/tmp/e.png', { lesson: 3 });
    assert.equal(spec.style, 'explainer');
    assert.equal(spec.series, 'AI TRADE SCHOOL — LESSON #03', 'the card chip carries the lesson, not the curriculum group');
    assert.equal(spec.title, TOPICS[2].title);
    assert.equal(spec.footer, 'Educational only. Not financial advice.');
    assert.equal(spec.width, 1080);
    assert.equal(spec.height, 1350);
    assert.deepEqual(spec.examples.map(e => e.takeawayWord), ['Bullish', 'Bearish', 'Neutral']);
    const alt = educationAltText(TOPICS[2], cfg, { lesson: 3 });
    assert.match(alt, /^AI Trade School Lesson #03: /);
    assert.match(alt, /Educational only\. Not financial advice\.$/);
  });

  it('lesson numbers: by first publication, permanent, and stable when a topic comes round again', () => {
    const posted = (topic, at, extra = {}) => ({ kind: 'education', topic, status: 'published', publication: { at }, ...extra });
    const history = [
      posted('candlestick-basics', '2026-09-08T15:23:47Z'),
      posted('support-resistance', '2026-09-07T17:56:48Z'),
    ];
    assert.deepEqual([...lessonNumbers(history)], [['support-resistance', 1], ['candlestick-basics', 2]],
      'numbered by publication order, not the order records appear');
    assert.equal(lessonNumberFor(history, 'rsi'), 3, 'a new topic takes the next free number');
    assert.equal(lessonNumberFor(history, 'support-resistance'), 1, 'a repeat keeps its number');
    assert.equal(lessonNumberFor([], 'rsi'), 1);

    // A stored `lesson` pins the topic even if older records are trimmed away.
    const trimmed = [posted('rsi', '2026-09-11T12:00:00Z', { lesson: 3 })];
    assert.equal(lessonNumberFor(trimmed, 'rsi'), 3);
    assert.equal(lessonNumberFor(trimmed, 'gaps'), 1, 'free numbers are reused below a pinned one');

    // Drafts and dry runs are not lessons yet.
    assert.equal(lessonNumbers([{ kind: 'education', topic: 'rsi', status: 'auto_dry_run' }]).size, 0);
  });

  it('renders every topic\'s explainer card', { skip: !HAVE_PIL }, () => {
    const cfg = load(STOCK_CFG);
    const dir = mkdtempSync(join(tmpdir(), 'edu-png-'));
    for (const t of TOPICS) {
      const out = join(dir, `${t.id}.png`);
      renderChartSpec(buildEducationSpec(t, cfg, out));
      assert.ok(existsSync(out), t.id);
    }
  });

  it('metrics report buckets education posts by topic', () => {
    const dir = mkdtempSync(join(tmpdir(), 'edu-met-'));
    const metrics = new MetricsStore(join(dir, 'm.jsonl'));
    const auditRecords = [];
    let i = 0;
    for (const topic of ['rsi', 'rsi', 'rsi', 'cmf', 'cmf', 'cmf']) {
      i++;
      auditRecords.push({ id: `e${i}`, status: 'published', kind: 'education', topic, queue: 'stocks', symbol: 'EDU', setup: { setup: 'x' }, publication: { xPostId: `q${i}`, url: 'u', at: `2026-09-0${i}T12:00:00Z` } });
      metrics.append({ kind: 'post', xPostId: `q${i}`, impressions: 1000, likes: topic === 'rsi' ? 80 : 20, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, profileClicks: 0 });
    }
    const rep = buildReport({ metrics, auditRecords });
    assert.equal(rep.byTopic.rsi.engagementRate, 0.08);
    assert.equal(rep.byTopic.cmf.engagementRate, 0.02);
    assert.ok(rep.recommendations.some(r => /Educational topic "rsi" engages best/.test(r)), rep.recommendations.join(' | '));
  });
});

describe('removed posts: closed unscored, hold no cooldown', () => {
  it('removePost marks the audit record removed and closes the lifecycle record as REMOVED', async () => {
    resetConfigCache(); const c0 = loadConfig(join(ROOT, 'config', 'social-compliance-crypto.json')); resetConfigCache();
    const cfg = { ...c0, charts: { ...c0.charts, enabled: false, requireForPublish: false } };
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser' } };
    const dir = mkdtempSync(join(tmpdir(), 'rm-'));
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'a.jsonl')), insights: null });
    const row = ROW({ symbol: 'ETH', price: 2498.20, atr: 95, bbLower: 2300.10, bbBasis: 2448.62, bbUpper: 2578.88, vwap: 2410.55, cloudA: 2380, cloudB: 2350 });
    const model = MODEL([row], { reportDate: '2026-09-07', cohort: { source: 't', calls: [{ symbol: 'ETH', score: 2.5 }], puts: [], watches: [] } });
    await wf.autoPublish(model);
    const [ready] = wf.ready({ queue: 'crypto' });
    wf.recordManualPublication(ready.id, model, { xPostId: '1' });
    assert.equal(wf.tracker.active().length, 1);
    const r = wf.removePost(ready.id, { reason: 'deleted on X' });
    assert.equal(r.audit.status, 'removed');
    assert.equal(r.tracked.stage, 'REMOVED');
    assert.equal(r.tracked.outcome, 'removed');
    assert.equal(wf.tracker.active().length, 0);
    const st = scorecardStats(wf.tracker.latest(), weekBounds('2026-09-07'));
    assert.equal(st.posted, 0, 'a removed post is not a posted setup');
    assert.equal(st.removed, 1);
    assert.equal(st.allTime.setups, 0);
    // no cooldown, no tracker skip: the symbol can be posted again from a fresh report
    const again = await wf.autoPublish(MODEL([row], { reportDate: '2026-09-07', dataAsOf: new Date().toISOString(), cohort: { source: 't', calls: [{ symbol: 'ETH', score: 2.5 }], puts: [], watches: [] } }));
    assert.deepEqual(again.published.map(p => p.symbol), ['ETH'], JSON.stringify(again.skipped));
    assert.throws(() => wf.removePost(ready.id), /Only published/);
  });
});

// ─── launch sequence ─────────────────────────────────────────────────────────

import { LAUNCH_SEQUENCE, launchItem, nextLaunchItem, generateIntroPost, buildIntroSpec, introAltText } from '../src/social/launch.js';
import { educationalTags } from '../src/social/education.js';

describe('launch sequence: the first 14 posts, the pinned intro, and the #AITradeSchool archive tag', () => {
  const STOCK_CFG = join(ROOT, 'config', 'social-compliance.json');
  const load = (p, over = {}) => { resetConfigCache(); const c = loadConfig(p); resetConfigCache(); return { ...c, ...over }; };
  // The archive tag is an account choice (the live account has it switched off),
  // so these tests pin one rather than asserting whatever the shipped config says.
  const withArchive = (tag = '#AITradeSchool') => { const c = load(STOCK_CFG); return { ...c, launch: { ...c.launch, hashtags: [] }, education: { ...c.education, archiveTag: tag } }; };

  it('the plan is well-formed: 14 items, numbered 1..14, unique ids, exactly one pinned', () => {
    assert.equal(LAUNCH_SEQUENCE.length, 14);
    assert.deepEqual(LAUNCH_SEQUENCE.map(i => i.n), Array.from({ length: 14 }, (_, i) => i + 1));
    const ids = LAUNCH_SEQUENCE.map(i => i.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(LAUNCH_SEQUENCE.filter(i => i.pin).length, 1);
    assert.equal(LAUNCH_SEQUENCE[0].id, 'intro');
    assert.equal(launchItem('1').id, 'intro');
    assert.equal(launchItem('intro').n, 1);
    assert.equal(launchItem('nope'), null);
  });

  it('the archive tag is always present and always last, even when the reach tags fill the cap', () => {
    const cfg = withArchive();
    assert.equal(cfg.education.maxTags, 3);
    assert.equal(cfg.hashtags.maxTotal, 2, 'setup posts keep the tighter cap');
    assert.deepEqual(educationalTags(['#A', '#B'], cfg), ['#A', '#B', '#AITradeSchool']);
    assert.deepEqual(educationalTags(['#A', '#B', '#C', '#D'], cfg), ['#A', '#B', '#AITradeSchool'], 'trim the reach tags, never the archive tag');
    assert.deepEqual(educationalTags(['#A', '#AITradeSchool'], cfg), ['#A', '#AITradeSchool'], 'no duplicate when already listed');
    assert.deepEqual(educationalTags(['#A'], { ...cfg, education: { ...cfg.education, archiveTag: null } }), ['#A']);
  });

  it('the intro tag line comes from launch.hashtags, falling back to the archive tag and then to no tags', () => {
    const base = load(STOCK_CFG);
    const withTags = { ...base, launch: { ...base.launch, hashtags: ['#TechnicalAnalysis', '#ChartEducation'] } };
    assert.equal(generateIntroPost(withTags).lines.at(-1), '#TechnicalAnalysis #ChartEducation');
    // launch.hashtags wins over an archive tag that is still configured
    const both = { ...withTags, education: { ...base.education, archiveTag: '#Legacy' } };
    assert.equal(generateIntroPost(both).lines.at(-1), '#TechnicalAnalysis #ChartEducation');
    // no launch tags → the archive tag, if any
    const archiveOnly = { ...base, launch: { ...base.launch, hashtags: [] }, education: { ...base.education, archiveTag: '#Legacy' } };
    assert.equal(generateIntroPost(archiveOnly).lines.at(-1), '#Legacy');
    // neither → the post ends on the disclaimer, with no trailing tag line
    const none = { ...base, launch: { ...base.launch, hashtags: [] }, education: { ...base.education, archiveTag: null } };
    assert.equal(generateIntroPost(none).lines.at(-1), 'Educational only — not financial advice.');
  });

  it('the pinned intro is compliance-clean: no ticker, no claim, no prohibited wording, archive tag last', () => {
    const cfg = withArchive();
    const { text } = generateIntroPost(cfg);
    const lines = text.split('\n');
    assert.equal(lines[0], 'Learning technical analysis does not mean predicting every move.');
    assert.equal(lines.at(-1), '#AITradeSchool');
    assert.equal(lines.at(-2), 'Educational only — not financial advice.');
    assert.equal(lines.filter(l => l.startsWith('• ')).length, 5);
    const ctx = { setup: null, row: null, model: { reportDate: '2026-09-08', dataAsOf: new Date().toISOString() }, config: cfg, kind: 'intro', chart: { path: '/tmp/i.png' } };
    assert.deepEqual(blocking(validatePost(text, ctx)), []);
    // the wording the compliance gate exists to catch
    assert.ok(blocking(validatePost(text.replace('No promises.', 'No guaranteed returns.'), ctx)).some(i => i.code === 'prohibited_wording'));
    assert.ok(blocking(validatePost(text + '\nBuy $AAPL', ctx)).some(i => i.code === 'ticker_in_education'));
  });

  it('queueLaunch: builds item 1, marks it to pin, refuses a second copy and refuses items with no generator', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'launch-'));
    const base = load(STOCK_CFG);
    const cfg = { ...base, charts: { ...base.charts, enabled: false, requireForPublish: false } };
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser' } };
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'a.jsonl')), insights: null, now: () => new Date('2026-09-08T12:00:00Z') });
    const s = await wf.queueLaunch({});
    assert.equal(s.refused, null, s.refused);
    assert.equal(s.item, 'intro');
    assert.equal(s.record.pin, true);
    const [rec] = wf.ready({ queue: 'stocks' });
    assert.equal(rec.kind, 'intro');
    assert.equal(rec.launchItem, 'intro');
    assert.equal(rec.symbol, 'EDU');
    assert.equal(rec.pin, true);
    // re-asking for item 1 by name is refused; asking for "next" has already moved on
    const dup = await wf.queueLaunch({ item: 'intro' });
    assert.match(dup.refused, /already ready_to_post/);
    assert.equal(nextLaunchItem(wf.audit.latest()).id, 'long-wick-rejection', 'the sequence advances once item 1 is queued');
    assert.match((await wf.queueLaunch({})).refused, /no generator yet/, 'next is item 2, which is not built');
    const planned = await wf.queueLaunch({ item: 'struggle-poll' });
    assert.match(planned.refused, /no generator yet/);
    const delegated = await wf.queueLaunch({ item: 'vwap-reclaim-reject' });
    assert.match(delegated.refused, /educate --topic vwap/);
  });

  it('retract: only a published post, keeps the publication, frees the slot for a re-queue', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'retract-'));
    const base = load(STOCK_CFG);
    const cfg = { ...base, charts: { ...base.charts, enabled: false, requireForPublish: false } };
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser' } };
    const wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(join(dir, 'a.jsonl')), insights: null, now: () => new Date('2026-09-08T12:00:00Z') });
    const s = await wf.queueLaunch({});
    const id = s.record.id;
    assert.throws(() => wf.retract(id, 'too soon'), /Only a published post can be retracted/);
    wf.recordManualPublication(id, null, { xPostId: '42', url: 'https://x.com/a/status/42' });
    assert.throws(() => wf.reject(id, 'x'), /Cannot reject a published post/, 'a published post is never rejectable');
    assert.throws(() => wf.retract(id, '  '), /needs a reason/);
    const out = wf.retract(id, 'deleted on X, reposted under a renamed tag');
    assert.equal(out.status, 'retracted');
    assert.equal(out.publication.xPostId, '42', 'the original publication stays in the trail');
    assert.equal(out.retraction.url, 'https://x.com/a/status/42');
    assert.match(out.retraction.reason, /renamed tag/);
    // the slot is free again, and the retracted post no longer counts as live
    assert.equal(nextLaunchItem(wf.audit.latest()).id, 'intro');
    const again = await wf.queueLaunch({ item: 'intro' });
    assert.equal(again.refused, null, again.refused);
  });

  it('the intro card spec carries the disclaimer footer and the archive tag', { skip: !HAVE_PIL }, () => {
    const cfg = withArchive();
    const out = join(mkdtempSync(join(tmpdir(), 'intro-png-')), 'intro.png');
    const spec = buildIntroSpec(cfg, out);
    assert.equal(spec.style, 'intro');
    assert.equal(spec.footer, 'Educational only. Not financial advice.');
    assert.equal(spec.archiveTag, '#AITradeSchool');
    assert.equal(spec.bullets.length, 5);
    renderChartSpec(spec);
    assert.ok(existsSync(out));
    assert.match(introAltText(cfg), /Educational only\. Not financial advice\.$/);
  });
});

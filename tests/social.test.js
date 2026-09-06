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

import { parseReportHtml, loadReportModel, num } from '../src/social/report-model.js';
import { classifySetup, buildSummaryTable, selectPostCandidates, renderMarkdownTable, SIGNAL, nearestLevels } from '../src/social/setup.js';
import { validatePost, blocking, xWeightedLength, textHash } from '../src/social/compliance.js';
import { generatePost, formatDataTimestamp } from '../src/social/generate.js';
import { loadConfig, resetConfigCache, DEFAULT_DISCLOSURE } from '../src/social/config.js';
import { AuditStore } from '../src/social/audit.js';
import { SocialWorkflow } from '../src/social/index.js';
import { oauth1Signature, oauth1Header, percentEncode, postTweet, getCredentialsFromEnv } from '../src/social/x-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORT_0831 = join(ROOT, 'docs', 'reports', 'daily-2026-08-31.html');
const HAVE_REPORT = existsSync(REPORT_0831);

// ─── fixtures ────────────────────────────────────────────────────────────────

const ROW = (over = {}) => ({
  symbol: 'XYZ', group: 'main', flags: '', price: 120.40, rsi: 64, rsiMa: 60, cmf: 0.19, cmfTrend: null,
  atr: 2.0, bbLower: 108.2, bbBasis: 115.0, bbUpper: 123.5, vwap: 110.0, cloudA: 112.0, cloudB: 109.0,
  position: 'above_cloud', structure: 'HH-up', score: 2.5, biasNext: 'Calls', ...over,
});

const MODEL = (rows, over = {}) => ({
  modelVersion: 1, reportDate: '2026-09-06', title: 't', sourcePath: null,
  dataAsOf: new Date().toISOString(), dataAsOfSource: 'test', timeframe: 'D', marketTheme: null, footer: null,
  rows, ...over,
});

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
  return loadConfig();
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

  it('parses the real 2026-08-31 report (41 rows, MSTR on top)', { skip: !HAVE_REPORT }, () => {
    const m = parseReportHtml(readFileSync(REPORT_0831, 'utf8'));
    assert.equal(m.reportDate, '2026-08-31');
    assert.equal(m.rows.length, 41);
    assert.equal(m.rows[0].symbol, 'MSTR');
    const aapl = m.rows.find(r => r.symbol === 'AAPL');
    assert.equal(aapl.cmf, 0.20);
    assert.ok(m.rows.every(r => r.price != null && r.score != null));
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

  it('stretched at the band with RSI ≥ 68 → exhaustion watch, Low', () => {
    const s = classifySetup(ROW({ price: 123.0, rsi: 71 }));
    assert.match(s.setup, /exhaustion watch/);
    assert.equal(s.confidence, 'Low');
  });

  it('bullish score without flow/cloud alignment is only a WATCH', () => {
    const s = classifySetup(ROW({ price: 118, cmf: 0.05, position: 'in_cloud' }));
    assert.equal(s.signal, SIGNAL.WATCH);
    assert.equal(s.confidence, 'Low');
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
    assert.match(text, /^👀 \$XYZ Trend continuation · Confirmed Setup\n/);
    assert.match(text, /Price \$118\.00 · RSI 64 · CMF \+0\.19/);
    assert.match(text, /Support \$115\.00 · Resistance \$123\.50/);
    assert.match(text, /\n#NFA #DYOR/);
    assert.match(text, /Risk: /);
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
    assert.match(text, /Data: daily · /);
    assert.match(text, /#NFA #DYOR #Momentum #Stocks #TechnicalAnalysis #StockMarket$/);
    assert.deepEqual(blocking(validatePost(text, { setup, row, model: MODEL([row]), config: cfg })), []);
    const tight = generatePost(setup, MODEL([row]), { ...cfg, charLimit: 280 }).text;
    assert.ok(!tight.includes(setup.rationale));
  });

  it('formats timestamps in ET', () => {
    assert.equal(formatDataTimestamp('2026-08-31T13:49:09.000Z'), 'Aug 31, 2026 9:49 AM ET');
  });

  it('uses the configured disclosure, not a hard-coded one', () => {
    resetConfigCache();
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    const p = join(dir, 'c.json');
    writeFileSync(p, JSON.stringify({ disclosure: 'Custom legal text.' }));
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
      assert.ok(codes(base.replace('Risk:', bad + ' Risk:')).includes('prohibited_wording'), bad);
    }
  });

  it('blocks personalized advice', () => {
    assert.ok(codes(base.replace('Risk:', 'Great for your portfolio. Risk:')).includes('personalized_advice'));
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
    assert.ok(codes(base.replace('Risk:', 'Price will rally to the band. Risk:')).includes('unsupported_claim'));
    assert.ok(codes(base.replace('Risk:', 'Price target $150.00. Risk:')).includes('unsupported_claim'));
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
    assert.ok(codes(base.replace('RSI 64 · CMF +0.19', 'momentum ok')).includes('missing_indicator'));
    assert.ok(codes(base.replace(/Support \$115\.00 · Resistance \$123\.50/, 'levels tbd')).includes('missing_indicator'));
  });

  it('blocks wrong ticker, wrong price, and numbers not in the report', () => {
    assert.ok(codes(base.replace('$XYZ', '$ABC')).includes('ticker_mismatch'));
    assert.ok(codes(base.replace('Price $118.00', 'Price $119.00')).includes('price_mismatch'));
    assert.ok(codes(base.replace('$123.50', '$130.00')).includes('value_mismatch'));
    assert.ok(codes(base.replace('RSI 64', 'RSI 72')).includes('value_mismatch'));
    assert.ok(codes(base.replace('CMF +0.19', 'CMF +0.40')).includes('value_mismatch'));
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
    const noRisk = base.split('\n').filter(l => !l.startsWith('Risk:')).join('\n');
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

  it('drafts only candidates above the bar, and never auto-publishes', () => {
    const recs = wf.draft(model);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].status, 'draft');
    assert.equal(recs[0].publication, null);
    assert.deepEqual(blocking(recs[0].issues), []);
  });

  it('edit invalidates approval; approve is refused with blocking issues', async () => {
    const [d] = wf.draft(model);
    const approved = wf.approve(d.id, model);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.approval.by, 'tester');

    const edited = wf.edit(d.id, approved.originalText.replace('Risk:', 'Guaranteed win. Risk:'), model);
    assert.equal(edited.status, 'edited');
    assert.equal(edited.approval, null);
    assert.throws(() => wf.approve(d.id, model), /Approval refused.*Prohibited phrase/);
    await assert.rejects(wf.publish(d.id, model, { creds: { type: 'oauth2', accessToken: 'x' } }), /Only approved drafts/);
  });

  it('publishes the exact approved text via the X API and records the post id', async () => {
    const [d] = wf.draft(model);
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
    const [again] = wf.draft(model, { symbol: 'XYZ' });
    assert.ok(again.issues.some(i => i.code === 'duplicate_post'));
    assert.throws(() => wf.approve(again.id, model), /duplicate|already published/i);
  });

  it('records API failures without marking published', async () => {
    const [d] = wf.draft(model);
    wf.approve(d.id, model);
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ detail: 'Forbidden' }) });
    const res = await wf.publish(d.id, model, { fetchImpl, creds: { type: 'oauth2', accessToken: 'tok' } });
    assert.equal(res.status, 'failed');
    assert.equal(res.error, 'Forbidden');
    assert.equal(res.publication, null);
  });

  it('stale data needs an explicit, audited acknowledgement to approve', () => {
    const stale = { ...model, dataAsOf: new Date(Date.now() - 72 * 3600_000).toISOString() };
    const [d] = wf.draft(stale);
    assert.ok(d.issues.some(i => i.code === 'stale_data'));
    assert.throws(() => wf.approve(d.id, stale), /Report data is/);
    const ok = wf.approve(d.id, stale, { acknowledgeStale: 'sample post from the 08-31 report' });
    assert.equal(ok.status, 'approved');
    assert.equal(ok.staleAcknowledged.reason, 'sample post from the 08-31 report');
    assert.equal(ok.staleAcknowledged.by, 'tester');
  });

  it('manual publication is recorded only for approved drafts', () => {
    const [d] = wf.draft(model);
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
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, maxPostsPerRun: 2 } };
    wf = new SocialWorkflow({ config: cfg, audit: new AuditStore(auditPath), actor: 'cron' });
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

    // second run the same day: AAA/FFF are inside the cooldown, so GGG gets its turn
    const again = await wf.autoPublish(model, { creds, fetchImpl: okFetch('9002') });
    assert.deepEqual(again.published.map(p => p.symbol), ['GGG']);
    const cool = again.skipped.find(s => s.symbol === 'AAA');
    assert.match(cool.reason, /cooldown/);
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

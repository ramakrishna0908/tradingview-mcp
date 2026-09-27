/**
 * Content checklist — every post kind the account publishes, validated
 * against the growth/engagement/compliance bar in one place:
 *
 *   hook · clear bias or setup status · concise reasoning · key levels ·
 *   what changes the read (invalidation / flip event) · plain-English
 *   context · reply-driving CTA · recognisable recurring format ·
 *   accountability (follow-ups, scorecard) · mobile-friendly line count ·
 *   ≤ 2 hashtags · no jargon-only reasoning · compliant educational wording
 *
 * Fixtures only — no network. If a generator drifts away from the bar, the
 * failing assertion names the kind and the missing element.
 *
 * Run: node --test tests/content-checklist.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifySetup } from '../src/social/setup.js';
import { generatePost } from '../src/social/generate.js';
import { validatePost, blocking } from '../src/social/compliance.js';
import { loadConfig, resetConfigCache } from '../src/social/config.js';
import { openFromSetup, EVENT } from '../src/social/tracker.js';
import { generateFollowUp, followUpModel, followUpSetup, followUpRow, generateScorecard } from '../src/social/followup.js';
import { generateEducationPost, TOPICS } from '../src/social/education.js';
import { generatePremarketPost, PREMARKET_DISCLAIMER } from '../src/social/premarket-post.js';
import { plainLine } from '../src/social/sweep-labels.js';
import { VIDEO_TOPICS, generateVideoPost, buildVideoSpec, VIDEO_CTA } from '../src/social/video.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STOCK_CFG = join(ROOT, 'config', 'social-compliance.json');
const CRYPTO_CFG = join(ROOT, 'config', 'social-compliance-crypto.json');
// The checklists pin the sweep presentation (bio disclosure + series line).
// The live crypto policy moved to @GameSol404 on 2026-09-11 (in-post
// disclosure, no series line); tests/crypto-market-post.test.js pins that.
const SWEEP_PRESENTATION = c => ({ ...c, disclosurePlacement: 'bio', charLimit: 4000, hashtags: { ...c.hashtags, tagLine: ['#TechnicalAnalysis', '#TradingEducation'] }, disclosure: 'Educational market analysis only. Not investment advice. Trading involves risk.', cardDisclosure: undefined, brand: { ...c.brand, name: 'Daily Setup Sweep', seriesLine: 'Daily Setup Sweep · tracked to a daily close beyond a level · scored every Friday' } });
const load = p => { resetConfigCache(); const c = loadConfig(p); resetConfigCache(); return p === CRYPTO_CFG ? SWEEP_PRESENTATION(c) : c; };

const ROW = (over = {}) => ({
  symbol: 'ETH', group: 'main', flags: '', price: 2498.20, rsi: 64, rsiMa: 60, cmf: 0.22, cmfTrend: null, atr: 95,
  bbLower: 2300.10, bbBasis: 2448.62, bbUpper: 2578.88, vwap: 2410.55, cloudA: 2380.00, cloudB: 2350.00,
  position: 'above_cloud', structure: 'HH-up', score: 2.5, biasNext: 'Calls', ...over,
});
const MODEL = (rows, over = {}) => ({ modelVersion: 1, reportDate: '2026-09-08', title: 't', sourcePath: null, dataAsOf: new Date().toISOString(), dataAsOfSource: 'test', timeframe: 'D', marketTheme: null, footer: null, rows, ...over });
const chart = { path: '/tmp/eth.png', volumeRatio: 0.8 };

const MAX_LINES = 14;            // phone-height: the whole post is readable without "Show more" fatigue
const MAX_LINE_CHARS = 150;      // one thought per line; wraps to ≤ 3 lines on a phone
// An all-digit "#01" (the lesson number) is not a hashtag on X — don't count it.
const hashtags = t => [...t.matchAll(/(?<![\w&$])#[A-Za-z0-9_]+/g)].filter(m => /[A-Za-z_]/.test(m[0])).length;
// Setup posts close on "…? 👇"; AI Trade School lessons lead the line with 👇.
const hasCta = t => /\? 👇$/m.test(t) || /^👇 .*\?$/m.test(t);
const JARGON_ONLY = /\b(CMF|RSI|RVOL|VWAP|ATR|SMA|EMA|BB)\b/;

/**
 * Shared shape rules for any kind. Setup posts run 0-2 tags; the video, launch
 * lesson and intro posts allow a third — the #AITradeSchool archive tag that
 * makes the whole back catalogue one tap away. AI Trade School explainers run
 * exactly two: they carry the branding in the header line instead.
 */
function common(kind, text, { maxTags = 2 } = {}) {
  const lines = text.split('\n');
  assert.ok(lines.length <= MAX_LINES, `${kind}: ${lines.length} lines (max ${MAX_LINES})\n${text}`);
  for (const l of lines) assert.ok(l.length <= MAX_LINE_CHARS, `${kind}: line too long for a phone (${l.length}): ${l}`);
  assert.ok(hashtags(text) <= maxTags, `${kind}: more than ${maxTags} hashtags`);
  assert.ok(hasCta(text), `${kind}: no reply-driving question line ending in "? 👇"\n${text}`);
  assert.ok(!/\b(will|guaranteed|target|forecast|projected|to the moon|buy now|sell now)\b/i.test(text), `${kind}: forward-looking or promotional wording\n${text}`);
  assert.ok(!/🚀|💎|🙌/u.test(text), `${kind}: promotional emoji`);
  const first = lines[0];
  assert.ok(/^[\p{Extended_Pictographic}]/u.test(first), `${kind}: first line is not an iconed hook: ${first}`);
}

describe('content checklist: setup post (Daily Setup Sweep)', () => {
  for (const [label, path] of [['stocks', STOCK_CFG], ['crypto', CRYPTO_CFG]]) {
    it(`${label}: hook, status, reasoning, participation warning, two levels, labelled invalidation, CTA, series line, fixed tag line, compliant`, () => {
      const cfg = load(path);
      const row = ROW();
      const setup = classifySetup(row);
      const model = MODEL([row]);
      const { text } = generatePost(setup, model, cfg, { chart });
      common('setup', text);
      const lines = text.split('\n');
      assert.match(lines[0], /^📈 \$ETH .+ — reclaim confirmed\.$/, 'hook names the ticker and the verdict');
      assert.match(lines[1], /^CMF .+ while RSI .+\.$/, 'one-line reasoning from the indicators');
      assert.match(lines[2], /^⚠️ RVOL 0\.8× — low participation, so confirmation is weaker\.$/, 'a sub-1.0× RVOL is called out as low participation');
      assert.ok(!text.includes('In plain terms'), 'the card subtitle carries the plain reading; the caption does not repeat it');
      assert.match(text, /\n#TechnicalAnalysis #TradingEducation$/, 'closes on the fixed tag line');
      assert.match(text, /\n🎯 Above \$[\d,.]+ → potential breakout\n🛑 Below \$[\d,.]+ → setup invalidated\n/, 'both levels, invalidation labelled');
      assert.match(text, /\nWhich level gets hit first — \$[\d,.]+ or \$[\d,.]+\? 👇\n/, 'level-question CTA');
      assert.match(text, /\nDaily Setup Sweep · tracked to a daily close beyond a level · scored every Friday\n/, 'recurring format + accountability loop named');
      assert.match(text, /\nData: daily · \w{3} \d{1,2}, 20\d\d/, 'timestamped');
      assert.deepEqual(blocking(validatePost(text, { setup, row, model, config: cfg, chart })), []);
    });
  }

  it('a WATCH never reads as confirmed and is labelled a watch (plain-English line says so when enabled)', () => {
    const cfg = load(CRYPTO_CFG);
    const row = ROW({ position: 'in_cloud' });
    const setup = classifySetup(row);
    const { text } = generatePost(setup, MODEL([row]), cfg, { chart });
    assert.ok(!/confirmed/i.test(text.split('\n')[0]));
    assert.match(text.split('\n')[0], /reclaim watch\.$/);
    assert.ok(/\bwatch\b/i.test(text));
    const withPlain = generatePost(setup, MODEL([row]), { ...cfg, plainLanguage: true }, { chart }).text;
    assert.match(withPlain, /\nIn plain terms: .*a watch, not a call\.\n/);
  });

  it('every setup the classifier can name has a plain-English reading with no forward-looking wording', () => {
    const names = ['Basis reclaim', 'Trend continuation', 'Breakout watch', 'Extended momentum — exhaustion watch', 'Breakdown', 'Seller exhaustion watch', 'Bearish exhaustion watch', 'Bullish divergence watch', 'Bearish divergence watch', 'Something new'];
    for (const setup of names) {
      for (const signal of ['CONFIRMED', 'WATCH']) {
        const line = plainLine({ setup, signal });
        assert.match(line, /^In plain terms: .+[.]$/, `${setup}/${signal}`);
        assert.ok(!JARGON_ONLY.test(line), `${setup}/${signal}: jargon in the plain line`);
        assert.ok(!/\b(will|target|forecast|expect|should)\b/i.test(line), `${setup}/${signal}: forward-looking wording`);
        if (signal === 'WATCH') assert.ok(!/\bconfirmed\b/i.test(line), `${setup}/WATCH may not say confirmed`);
      }
    }
  });
});

describe('content checklist: follow-ups (accountability)', () => {
  const cfg = () => { const c = load(CRYPTO_CFG); return { ...c, charts: { ...c.charts, enabled: false, requireForPublish: false } }; };
  const audit = { id: '2026-09-07-ETH-abc123', queue: 'crypto', reportDate: '2026-09-07', reportPath: '/r.html', publication: { xPostId: '1', url: 'u', at: '2026-09-07T16:00:00Z' } };
  const rec = openFromSetup(audit, classifySetup(ROW()), { queue: 'crypto', assetClass: 'crypto', now: new Date('2026-09-07T16:00:00Z') });
  const events = {
    BREAKOUT: { type: EVENT.BREAKOUT, bar: '2026-09-09', price: 2610.40, level: 2578.88, pct: 4.49 },
    LEVEL_TEST: { type: EVENT.LEVEL_TEST, bar: '2026-09-08', price: 2560.20, level: 2578.88, extreme: 2585.10, pct: 2.48 },
    INVALIDATED: { type: EVENT.INVALIDATED, bar: '2026-09-10', price: 2430.00, level: 2448.62, pct: -2.73 },
  };

  for (const [name, ev] of Object.entries(events)) {
    it(`${name}: lifecycle label in the hook, result vs the original post, what changes it next, CTA, compliant`, () => {
      const c = cfg();
      const { text } = generateFollowUp(rec, ev, c);
      common(`followup/${name}`, text);
      assert.match(text.split('\n')[0], new RegExp(`^\\S+ \\$ETH — ${name.replace('_', ' ')}( UPDATE)?\\.`), 'stage label leads');
      assert.match(text, /\nPrice: \$[\d,.]+ \(daily close\) · [+−][\d.]+% from \$[\d,.]+ at the setup\n/, 'result measured against the setup price');
      assert.match(text, /Setup posted Sep 7 as RECLAIM CONFIRMED/, 'points back at the original call');
      if (name !== 'INVALIDATED') assert.match(text, /\n🛑 /, 'names what negates it next');
      else assert.match(text, /\nThe lesson: the level did its job/, 'a miss carries the lesson');
      const setup = followUpSetup(rec, ev);
      const issues = validatePost(text, { setup, row: followUpRow(rec, ev), model: followUpModel(rec, ev), config: c, kind: 'followup', stage: setup.stage, now: new Date(`${ev.bar}T23:00:00Z`) });
      assert.deepEqual(blocking(issues), [], JSON.stringify(blocking(issues)));
    });
  }
});

describe('content checklist: weekly scorecard', () => {
  it('counts, pending hit rate, lesson of the week, full watch list, accountability, CTA, two education tags, compliant', () => {
    const c = load(STOCK_CFG);
    const stats = { from: '2026-09-07', to: '2026-09-11', posted: 4, breakouts: 2, invalidated: 1, expired: 1, active: 1, resolved: 3, hitRate: 67, allTime: { setups: 6, breakouts: 2, invalidated: 2, resolved: 4, hitRate: 50 }, best: null, worst: null, symbols: { posted: [], breakouts: ['NVDA', 'CRCL'], invalidated: ['AMD'], expired: ['LLY'], active: ['RKLB'] } };
    for (const st of [stats, { ...stats, breakouts: 0, invalidated: 0, expired: 0, resolved: 0, hitRate: null, active: 4, symbols: { ...stats.symbols, breakouts: [], invalidated: [], expired: [], active: ['CRCL', 'MSTR', 'LLY', 'RKLB'] } }]) {
      const { text } = generateScorecard(st, c);
      common('scorecard', text);
      assert.match(text, /^📊 Weekly Setup Scorecard · /, 'recurring format named in the hook');
      for (const must of [`Setups Tracked: ${st.posted}`, `Active: ${st.active}`, `🎯 Targets Hit: ${st.breakouts}`, `🛑 Invalidated: ${st.invalidated}`, '🧠 Lesson of the Week: ', `🔭 Watching Next Week: ${st.symbols.active.map(s => '$' + s).join(' ')}`, 'No deleting losers. No cherry-picking winners.', 'Which setup should we break down next? 👇']) {
        assert.ok(text.includes(must), `scorecard missing "${must}"\n${text}`);
      }
      assert.ok(text.includes(st.hitRate == null ? 'Hit Rate: Pending' : `Hit Rate: ${st.hitRate}%`));
      if (st.expired) assert.ok(text.includes(`⏳ Expired (not scored): ${st.expired}`), 'expiries shown, not hidden');
      assert.equal(text.split('\n').at(-1), '#TechnicalAnalysis #TradingEducation');
      // "target" appears only inside the past-outcome "Targets Hit"/"targets hit" wording
      assert.equal(text.replace(/\btargets? hit\b/gi, '').match(/target/i), null);
      const ctx = { setup: null, row: null, model: { reportDate: '2026-09-11', dataAsOf: new Date().toISOString() }, config: c, kind: 'scorecard', scorecard: st, chart: { path: '/tmp/s.png' } };
      assert.deepEqual(blocking(validatePost(text, ctx)), []);
    }
  });
});

describe('content checklist: educational explainer', () => {
  it('every topic: lesson header, title, hook, two plain-language lines, bullish/bearish/neutral takeaways, CTA, no ticker, exactly two tags', () => {
    const c = load(STOCK_CFG);
    for (const topic of TOPICS) {
      const { text } = generateEducationPost(topic, c, { lesson: 7 });
      common(`education/${topic.id}`, text, { maxTags: 2 });
      const head = text.split('\n');
      assert.equal(head[0], '🎓 AI Trade School — Lesson #07');
      assert.equal(head[1], topic.title);
      assert.equal(head[2], topic.definition, 'the hook is the topic definition');
      assert.match(text, /\n✅ Bullish — /); assert.match(text, /\n🛑 Bearish — /); assert.match(text, /\n⚖️ Neutral — /);
      assert.ok(!/\$[A-Z]{1,6}\b/.test(text), `${topic.id}: names a ticker`);
      const ctx = { setup: null, row: null, model: { reportDate: '2026-09-08', dataAsOf: new Date().toISOString() }, config: c, kind: 'education', chart: { path: '/tmp/e.png' } };
      assert.deepEqual(blocking(validatePost(text, ctx)), [], topic.id);
    }
  });
});

describe('content checklist: daily chart-education video', () => {
  it('every topic: 🎬 hook line, the 1–2 s hook, What it means / How traders use it, question CTA, Save-this line, no ticker, ≤3 tags incl. the archive tag; 10–15 s spec with the footer', () => {
    const c = load(STOCK_CFG);
    for (const topic of VIDEO_TOPICS) {
      const { text, lines } = generateVideoPost(topic, c);
      common(`video/${topic.id}`, text, { maxTags: 3 });
      assert.match(lines[0], /^🎬 Chart Education: /);
      assert.match(text, /\nWhat it means: .+\nHow traders use it: .+\n/);
      assert.ok(text.includes(VIDEO_CTA), `${topic.id}: missing "${VIDEO_CTA}"`);
      assert.ok(!/\$[A-Z]{1,6}\b/.test(text), `${topic.id}: names a ticker`);
      const ctx = { setup: null, row: null, model: { reportDate: '2026-09-08', dataAsOf: new Date().toISOString() }, config: c, kind: 'video', chart: { path: '/tmp/v.mp4' } };
      assert.deepEqual(blocking(validatePost(text, ctx)), [], topic.id);
      const spec = buildVideoSpec(topic, c, '/tmp/v.mp4');
      const secs = spec.timing.hook + spec.timing.chart + spec.timing.takeaway + spec.timing.end;
      assert.ok(secs >= 10 && secs <= 15 && spec.timing.hook <= 2, `${topic.id}: ${secs}s`);
      assert.equal(spec.footer, 'Educational only. Not financial advice.');
      assert.equal(spec.width / spec.height, 1080 / 1920, 'mobile-first 9:16');
    }
  });
});

describe('content checklist: premarket market direction', () => {
  const report = () => ({
    reportVersion: 1, kind: 'premarket', date: '2026-09-08', sessionDate: '2026-09-08', holiday: null,
    generatedAt: '2026-09-08T12:00:00Z', dataAsOf: new Date().toISOString(),
    bias: 'Bullish', confidence: 74, composite: 0.31, agreement: 0.78,
    drivers: [
      { key: 'futures', direction: 'supportive', text: 'S&P futures +0.62% overnight' },
      { key: 'trend', direction: 'supportive', text: 'SPY closed 770.19, above both its 20- and 50-day averages (uptrend intact)' },
      { key: 'vix', direction: 'supportive', text: 'VIX 13.8 (-4.10%) — calm' },
    ],
    components: [{ key: 'trend', score: 1 }],
    snapshot: { es: { symbol: 'ES=F', name: 'S&P 500 futures', unit: 'price', price: 7770.25, change: 48, changePct: 0.62 }, vix: { symbol: '^VIX', name: 'VIX', unit: 'price', price: 13.8, change: -0.59, changePct: -4.1 } },
    sectors: { strength: [{ name: 'Semiconductors' }, { name: 'Technology' }], weakness: [{ name: 'Consumer Discretionary' }, { name: 'Real Estate' }], ranked: [] },
    levels: { spy: { name: 'S&P 500 (SPY)', price: 770.19, resistance: [{ label: 'Prior-day high', value: 772.87 }], support: [{ label: 'Prior close', value: 770.19 }] } },
    events: [{ type: 'economic', kind: 'inflation', title: 'Core CPI m/m', at: '2026-09-08T12:30:00Z', date: '2026-09-08', time: '8:30 AM ET', impact: 'High', flipShort: 'hotter than expected → yields up, stocks pressured; cooler → relief' }],
    laterWeek: [], earnings: [], watch: [], missing: {}, sources: {},
  });

  it('hook, bias + confidence, three drivers, SPY levels with the negation, sectors, flip event with time, CTA, disclaimer, ≤2 tags', () => {
    const c = load(STOCK_CFG);
    const r = report();
    const { text, levels } = generatePremarketPost(r, c);
    common('premarket', text);
    const lines = text.split('\n');
    assert.match(lines[0], /^🟢 Premarket read for \w{3} \w{3} \d{1,2} — BULLISH \(confidence 74\/100\)$/);
    assert.equal(lines.filter(l => /^[▲▼•] /.test(l)).length, 3);
    assert.match(text, /\nSPY levels: [\d.]+ above \(.+\) · [\d.]+ below \(.+\)\. Losing [\d.]+ negates the bullish read\.\n/);
    assert.match(text, /\nSectors: strongest .+ · weakest .+\n/);
    assert.match(text, /\nFlip event: 8:30 AM ET Core CPI m\/m — .+\.\n/, 'the event that can change the bias, with its time');
    assert.ok(text.includes(PREMARKET_DISCLAIMER));
    const ctx = { config: c, now: new Date(), setup: null, row: null, model: { reportDate: r.date, dataAsOf: r.dataAsOf }, kind: 'premarket', premarket: { sessionDate: r.sessionDate, bias: r.bias, confidence: r.confidence, levels }, chart: { path: '/tmp/p.png' } };
    assert.deepEqual(blocking(validatePost(text, ctx)), []);
  });
});

describe('content checklist: posting cadence guards (no low-quality overposting)', () => {
  for (const [label, path] of [['stocks', STOCK_CFG], ['crypto', CRYPTO_CFG]]) {
    it(`${label}: one setup per run, Medium+ confidence, cooldown, open setups not re-posted, follow-up updates capped, hashtags ≤ 2`, () => {
      const c = load(path);
      const ap = c.posting.autoPublish;
      assert.equal(ap.maxPostsPerRun, 1);
      assert.ok(['Medium', 'High'].includes(ap.minConfidence), 'a Low-confidence read is never the day\'s post');
      assert.ok(ap.symbolCooldownHours >= 12);
      assert.notEqual(ap.skipTracked, false);
      assert.ok(ap.skipFlaggedRows, 'catalyst-flagged rows (earnings, news) are not posted as setups');
      assert.ok(Number.isFinite(c.followUps.maxUpdatesPerRun) && c.followUps.maxUpdatesPerRun <= 3);
      assert.equal(c.hashtags.maxTotal, 2);
      assert.ok(c.charts.requireForPublish, 'the card carries the disclaimer, so it is mandatory');
    });
  }
});

/**
 * Daily chart-education video — library, rotation, post text, spec,
 * compliance (kind 'video'), queueing, and a short real render.
 * Run: node --test tests/video.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { VIDEO_TOPICS, getVideoTopic, nextVideoTopic, generateVideoPost, buildVideoSpec, videoAltText, renderVideoSpec, VIDEO_CTA, VIDEO_FOOTER } from '../src/social/video.js';
import { TOPICS as EXPLAINER_TOPICS } from '../src/social/education.js';
import { validatePost, blocking } from '../src/social/compliance.js';
import { loadConfig, resetConfigCache } from '../src/social/config.js';
import { SocialWorkflow } from '../src/social/index.js';
import { AuditStore } from '../src/social/audit.js';

const STOCK_CFG = join(process.cwd(), 'config', 'social-compliance.json');
const CRYPTO_CFG = join(process.cwd(), 'config', 'social-compliance-crypto.json');
const load = p => { resetConfigCache(); const c = loadConfig(p); resetConfigCache(); return c; };
const PYTHON = process.env.SOCIAL_PYTHON || 'python3';
const FORWARD = /\b(will|guaranteed|target|forecast|projected|to the moon|buy now|sell now|you should)\b/i;

function haveRenderer() {
  const r = spawnSync(PYTHON, ['-c', 'import PIL, imageio_ffmpeg, shutil; print(1)'], { encoding: 'utf8' });
  const ff = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' });
  return r.status === 0 || ff.status === 0;
}

describe('chart-education video library', () => {
  it('≥ 12 unique topics covering the syllabus, each with hook, captions, takeaway, question and drawable art', () => {
    const ids = VIDEO_TOPICS.map(t => t.id);
    assert.ok(ids.length >= 12, `${ids.length} topics`);
    assert.equal(new Set(ids).size, ids.length, 'ids unique');
    for (const must of ['support-resistance', 'trendlines', 'breakouts', 'fakeouts', 'rsi', 'cmf', 'volume-confirmation', 'bearish-divergence', 'market-structure', 'risk-reward', 'bullish-engulfing', 'double-bottom']) {
      assert.ok(ids.includes(must), `missing ${must}`);
    }
    for (const t of VIDEO_TOPICS) {
      assert.ok(t.hook.length >= 12 && t.hook.length <= 60, `${t.id}: hook length ${t.hook.length}`);
      assert.ok(Array.isArray(t.captions) && t.captions.length >= 1 && t.captions.length <= 3, `${t.id}: captions`);
      for (const c of t.captions) assert.ok(c.length <= 90, `${t.id}: caption too long for a phone: ${c}`);
      assert.ok(t.means.length <= 130 && t.use.length <= 150, `${t.id}: takeaway too long`);
      assert.match(t.question, /\? 👇$/, `${t.id}: question is the CTA`);
      assert.ok(['candles', 'osc', 'line', 'divergence'].includes(t.art.type), `${t.id}: art type`);
      for (const s of [t.hook, ...t.captions, t.means, t.use, t.question]) {
        assert.ok(!FORWARD.test(s), `${t.id}: forward-looking/promotional wording: ${s}`);
        assert.ok(!/\$[A-Z]{1,6}\b/.test(s), `${t.id}: ticker in copy`);
      }
      for (const lv of t.art.levels ?? []) assert.ok(lv.at == null || (lv.at >= 0 && lv.at < 1), `${t.id}: level at`);
      for (const lb of t.art.labels ?? []) assert.ok(lb.at == null || (lb.at >= 0 && lb.at < 1), `${t.id}: label at`);
    }
  });

  it('rotation: never-posted first in library order, then the one posted longest ago; excluded topics are skipped', () => {
    const posted = (topic, at, kind = 'video') => ({ kind, topic, status: 'published', publication: { at } });
    assert.equal(nextVideoTopic([]).id, VIDEO_TOPICS[0].id);
    assert.equal(nextVideoTopic([posted(VIDEO_TOPICS[0].id, '2026-09-01T12:00:00Z')]).id, VIDEO_TOPICS[1].id);
    const all = VIDEO_TOPICS.map((t, i) => posted(t.id, `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00Z`));
    assert.equal(nextVideoTopic(all).id, VIDEO_TOPICS[0].id, 'after a full cycle the oldest comes back');
    assert.equal(nextVideoTopic([]).id, VIDEO_TOPICS[0].id);
    assert.equal(nextVideoTopic([], { exclude: [VIDEO_TOPICS[0].id] }).id, VIDEO_TOPICS[1].id);
    // explainer posts do not count towards the video rotation
    assert.equal(nextVideoTopic([posted(VIDEO_TOPICS[0].id, '2026-09-01T12:00:00Z', 'education')]).id, VIDEO_TOPICS[0].id);
    assert.equal(getVideoTopic('nope'), null);
  });

  it('post text: hook, What it means / How traders use it, question CTA, "Save this • Follow…", ≤ 3 tags, compliance-clean as kind video', () => {
    const cfg = load(STOCK_CFG);
    for (const t of VIDEO_TOPICS) {
      const { text, lines } = generateVideoPost(t, cfg);
      assert.equal(lines[0], `🎬 Chart Education: ${t.title}`);
      assert.equal(lines[1], t.hook);
      assert.match(lines[2], /^What it means: [a-z]/);
      assert.match(lines[3], /^How traders use it: [a-z]/);
      assert.equal(lines[4], t.question);
      assert.equal(lines[5], VIDEO_CTA);
      assert.equal(lines.at(-1), '#TechnicalAnalysis #ChartEducation #AITradeSchool', 'reach tags plus the archive tag');
      assert.ok(lines.length <= 8);
      const ctx = { setup: null, row: null, model: { reportDate: '2026-09-08', dataAsOf: new Date().toISOString() }, config: cfg, kind: 'video', chart: { path: '/tmp/v.mp4' } };
      assert.deepEqual(blocking(validatePost(text, ctx)), [], `${t.id}: ${JSON.stringify(blocking(validatePost(text, ctx)))}`);
      assert.ok(blocking(validatePost(text + '\nLook at $AAPL', ctx)).some(i => i.code === 'ticker_in_education'), `${t.id}: ticker must block`);
      assert.ok(blocking(validatePost(text, { ...ctx, chart: null })).some(i => i.code === 'missing_chart'), `${t.id}: the video file is mandatory`);
    }
  });

  it('spec carries the brand, timing (10–15 s), footer on every frame, CTA and the topic art; alt text ends with the footer', () => {
    const cfg = load(STOCK_CFG);
    const t = getVideoTopic('breakouts');
    const spec = buildVideoSpec(t, cfg, '/tmp/x.mp4', { day: 7 });
    assert.equal(spec.style, 'edu-video');
    assert.equal(spec.width, 1080); assert.equal(spec.height, 1920); assert.equal(spec.fps, 30);
    const total = spec.timing.hook + spec.timing.chart + spec.timing.takeaway + spec.timing.end;
    assert.ok(total >= 10 && total <= 15, `total ${total}s`);
    assert.ok(spec.timing.hook >= 1 && spec.timing.hook <= 2, 'hook is 1–2 s');
    assert.equal(spec.brand, 'Daily Setup Sweep');
    assert.equal(spec.series, 'CHART EDUCATION · DAY 7');
    assert.equal(spec.cta, VIDEO_CTA);
    assert.equal(spec.footer, VIDEO_FOOTER);
    assert.equal(spec.art, t.art);
    assert.match(videoAltText(t, cfg), /Educational only\. Not financial advice\.$/);
  });

  it('queueVideo: one per day on the stocks queue, rotation advances after publication, skips today\'s explainer topic, crypto config refuses', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vid-'));
    const cfg = load(STOCK_CFG);
    cfg.posting = { ...cfg.posting, autoPublish: { ...cfg.posting.autoPublish, enabled: true, via: 'browser' } };
    const audit = new AuditStore(join(dir, 'a.jsonl'));
    const now = () => new Date('2026-09-08T16:00:00Z');
    // an explainer already posted today on the first topic → the video must pick the next one
    audit.append({ id: 'edu', kind: 'education', topic: VIDEO_TOPICS[0].id, status: 'published', reportDate: '2026-09-08', queue: 'stocks', symbol: 'EDU', publication: { at: '2026-09-08T12:00:00Z' }, createdAt: '2026-09-08T12:00:00Z' });
    const wf = new SocialWorkflow({ config: cfg, audit, insights: null, now });
    if (!haveRenderer()) { console.log('skipping: no Pillow/ffmpeg for the renderer'); return; }
    const s = await wf.queueVideo({ chartOpts: { dir: join(dir, 'videos'), python: PYTHON, timing: { hook: 0.3, chart: 0.6, takeaway: 0.3, end: 0.3 } } });
    assert.equal(s.refused, null, s.refused);
    assert.equal(s.topic, VIDEO_TOPICS[1].id);
    const [rec] = wf.ready({ queue: 'stocks' }).filter(r => r.kind === 'video');
    assert.equal(rec.symbol, 'EDU');
    assert.equal(rec.day, 1);
    assert.ok(rec.chart.path.endsWith(`EDU-${VIDEO_TOPICS[1].id}.mp4`));
    assert.ok(existsSync(rec.chart.path) && statSync(rec.chart.path).size > 10_000, 'mp4 written');
    assert.equal(rec.chart.video, true);
    assert.match(rec.originalText, /^🎬 Chart Education: /);
    const dup = await wf.queueVideo({ chartOpts: { dir: join(dir, 'videos'), python: PYTHON } });
    assert.match(dup.refused, /already ready_to_post/);
    wf.recordManualPublication(rec.id, null, { xPostId: '4242' });
    const next = new SocialWorkflow({ config: cfg, audit, insights: null, now: () => new Date('2026-09-09T16:00:00Z') });
    const s2 = await next.queueVideo({ dryRun: true, chartOpts: { dir: join(dir, 'videos'), python: PYTHON, timing: { hook: 0.3, chart: 0.6, takeaway: 0.3, end: 0.3 } } });
    assert.equal(s2.topic, VIDEO_TOPICS[0].id, 'the explainer exclusion was only for that day; rotation continues with the never-filmed topic');
    assert.equal(s2.record.day, 2);
    const unknown = await next.queueVideo({ topic: 'nope' });
    assert.match(unknown.refused, /unknown topic/);
    const crypto = new SocialWorkflow({ config: load(CRYPTO_CFG), audit: new AuditStore(join(dir, 'c.jsonl')), insights: null });
    assert.match((await crypto.queueVideo({})).refused, /disabled/);
  });

  it('renderer: a short real render produces an MP4 with the expected frame count (skipped without Pillow/ffmpeg)', () => {
    if (!haveRenderer()) { console.log('skipping: no Pillow/ffmpeg'); return; }
    const cfg = load(STOCK_CFG);
    const dir = mkdtempSync(join(tmpdir(), 'vidr-'));
    const spec = buildVideoSpec(getVideoTopic('bearish-divergence'), cfg, join(dir, 'd.mp4'), { day: 3 });
    spec.timing = { hook: 0.4, chart: 0.8, takeaway: 0.4, end: 0.4 };
    spec.fps = 15;
    const r = renderVideoSpec(spec, { python: PYTHON });
    assert.equal(r.path, spec.out);
    assert.equal(r.meta.frames, 30);
    assert.equal(r.meta.width, 1080);
    assert.equal(r.meta.height, 1920);
    assert.ok(statSync(spec.out).size > 5_000);
  });

  it('every explainer topic that has a video twin shares its concept, so the daily pair never contradicts itself', () => {
    const videoIds = new Set(VIDEO_TOPICS.map(t => t.id));
    const twins = EXPLAINER_TOPICS.filter(t => videoIds.has(t.id));
    assert.ok(twins.length >= 5);
    for (const e of twins) assert.equal(getVideoTopic(e.id).series === 'Risk Management', false);
  });
});

/**
 * Crypto education video library (video.library "crypto") — every topic fits
 * 280 characters and passes compliance kind 'video', diagrams are well-formed,
 * and rotation / the once-a-day guard are per queue.
 * Run: node --test tests/crypto-video.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { CRYPTO_VIDEO_TOPICS } from '../src/social/crypto-video.js';
import { VIDEO_TOPICS, videoLibrary, nextVideoTopic, generateVideoPost, buildVideoSpec } from '../src/social/video.js';
import { validatePost, blocking, xWeightedLength } from '../src/social/compliance.js';
import { loadConfig, resetConfigCache } from '../src/social/config.js';

const NOW = new Date('2026-09-11T10:00:00Z');
const load = p => { resetConfigCache?.(); const c = loadConfig(join(process.cwd(), 'config', p)); resetConfigCache?.(); return c; };
const crypto = () => load('social-compliance-crypto.json');

describe('crypto video library', () => {
  it('is what the crypto config selects, and the stock config still gets the chart topics', () => {
    assert.equal(videoLibrary(crypto()), CRYPTO_VIDEO_TOPICS);
    assert.equal(videoLibrary(load('social-compliance.json')), VIDEO_TOPICS);
    assert.equal(crypto().video.queue, 'crypto');
  });

  it('has unique ids, no overlap with the chart topics, and diagrams whose edges point at real nodes', () => {
    const ids = CRYPTO_VIDEO_TOPICS.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.ok(!VIDEO_TOPICS.some(t => t.id === id), `${id} collides with a chart topic`);
    for (const t of CRYPTO_VIDEO_TOPICS) {
      assert.equal(t.art.type, 'diagram', t.id);
      const nodes = new Set(t.art.nodes.map(x => x.id));
      for (const ed of t.art.edges ?? []) assert.ok(nodes.has(ed.from) && nodes.has(ed.to), `${t.id}: edge ${ed.from}→${ed.to}`);
      for (const nd of t.art.nodes) {
        assert.ok(nd.x - nd.w / 2 >= 0 && nd.x + nd.w / 2 <= 100 && nd.y - nd.h / 2 >= 0 && nd.y + nd.h / 2 <= 100, `${t.id}: node ${nd.id} leaves the frame`);
      }
      assert.equal(t.captions.length, 2, t.id);
    }
  });

  for (const t of CRYPTO_VIDEO_TOPICS) {
    it(`${t.id}: post fits 280 and is compliance-clean (no ticker, disclosure last, tags)`, () => {
      const cfg = crypto();
      const { text, lines } = generateVideoPost(t, cfg);
      assert.ok(xWeightedLength(text) <= 280, `${xWeightedLength(text)} > 280:\n${text}`);
      assert.equal(lines[0], `🎬 Crypto Explained: ${t.title}`);
      assert.equal(lines.at(-1), '#Crypto #Blockchain');
      assert.equal(lines.at(-2), cfg.disclosure);
      const issues = validatePost(text, { config: cfg, now: NOW, priorRecords: [], setup: null, row: null, model: { reportDate: '2026-09-11', dataAsOf: NOW.toISOString() }, kind: 'video', chart: { path: 'v.mp4' } });
      assert.deepEqual(issues.filter(i => i.severity !== 'info').map(i => `${i.code}: ${i.message}`), []);
      // The takeaway text on the video is not trimmed; keep it phone-readable.
      assert.ok(t.means.length <= 110 && t.use.length <= 110, `${t.id}: takeaway too long for three lines`);
    });
  }

  it('builds a spec with the crypto series name, labels, CTA and end line', () => {
    const spec = buildVideoSpec(CRYPTO_VIDEO_TOPICS[0], crypto(), '/tmp/x.mp4', { day: 3 });
    assert.equal(spec.series, 'CRYPTO EDUCATION · DAY 3');
    assert.deepEqual(spec.labels, { means: 'WHAT IT IS', use: 'WHY IT MATTERS' });
    assert.equal(spec.cta, 'Save this • Follow for daily crypto education');
    assert.equal(spec.endLine, 'Every day · one network · one idea');
    assert.equal(spec.brand, 'GameKing');
    assert.equal(spec.art.type, 'diagram');
  });

  it('rotates per queue: stock chart videos never advance the crypto series', () => {
    const recs = [
      { kind: 'video', queue: 'stocks', topic: 'l2-rollups', status: 'published', createdAt: '2026-09-10T00:00:00Z' },
      { kind: 'video', queue: 'crypto', topic: 'l2-rollups', status: 'published', createdAt: '2026-09-11T00:00:00Z' },
    ];
    assert.equal(nextVideoTopic(recs, { topics: CRYPTO_VIDEO_TOPICS, queue: 'crypto' }).id, CRYPTO_VIDEO_TOPICS[1].id);
    assert.equal(nextVideoTopic(recs.slice(0, 1), { topics: CRYPTO_VIDEO_TOPICS, queue: 'crypto' }).id, CRYPTO_VIDEO_TOPICS[0].id);
  });
});

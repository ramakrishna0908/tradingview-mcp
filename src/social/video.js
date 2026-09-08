/**
 * Daily Technical Analysis Education Video — one topic per day, rotated.
 *
 * Each topic is a 10–15 second, 9:16, sound-off video: a 1–2 second hook,
 * an animated chart (candles, an oscillator or a line) with levels, arrows
 * and a couple of captions drawn in one at a time, a "What it means / How
 * traders use it" takeaway, and an end card — "Save this • Follow for daily
 * chart education" — over the standing footer "Educational only. Not
 * financial advice." The renderer is scripts/render-edu-video.py (Pillow
 * frames piped into ffmpeg); this module owns the library, the rotation, the
 * post text, the spec and the alt text.
 *
 * Nothing here is market data: every illustration is drawn from the spec
 * below, and compliance (kind 'video') blocks any cashtag in the text.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const RENDERER_VIDEO = join(ROOT, 'scripts', 'render-edu-video.py');
export const DEFAULT_VIDEO_DIR = join(ROOT, 'docs', 'social', 'videos');

export const VIDEO_CTA = 'Save this • Follow for daily chart education';
export const VIDEO_FOOTER = 'Educational only. Not financial advice.';

// ─── illustration helpers (0–100 coordinate space, y up) ─────────────────────

function drift(from, to, n, wick = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = from + ((to - from) * i) / n;
    const c = from + ((to - from) * (i + 1)) / n;
    out.push([o, Math.max(o, c) + wick, Math.min(o, c) - wick, c]);
  }
  return out;
}
const bar = (o, h, l, c) => [o, h, l, c];

// ─── the library ─────────────────────────────────────────────────────────────
//
// `at` values are fractions of the chart phase (0 = chart starts drawing,
// 1 = chart phase ends). Bars/points draw in over the first ~55 % of the
// phase, so anything that should appear once the move is visible sits at
// ≥ 0.6. Captions are shown in order across the chart phase.

export const VIDEO_TOPICS = [
  {
    id: 'support-resistance', series: 'Chart Basics', title: 'Support & Resistance',
    hook: 'Support is not a line. It is a zone.',
    captions: ['Buyers stepped in here — twice.', 'The zone matters more than the exact price.'],
    means: 'A price area where buyers (support) or sellers (resistance) have shown up before.',
    use: 'Mark the zone, then wait for the reaction at it — a bounce, or a daily close through it.',
    question: 'Do you mark zones or single lines? 👇',
    art: { type: 'candles', bars: [...drift(60, 40, 4), bar(40, 46, 34, 45), ...drift(45, 62, 3), ...drift(62, 42, 3), bar(42, 48, 35, 47), ...drift(47, 66, 3)],
      zones: [{ y1: 33, y2: 40, color: 'green', at: 0.62 }], levels: [{ y: 36, label: 'Support', color: 'green', at: 0.6 }], markers: [{ i: 4, dir: 'up', at: 0.7 }, { i: 11, dir: 'up', at: 0.8 }] },
  },
  {
    id: 'bullish-engulfing', series: 'Candlesticks', title: 'Bullish Engulfing',
    hook: 'One candle can flip the story.',
    captions: ['A green body swallows the red one before it.', 'Buyers took control inside a single session.'],
    means: 'The close is above the prior open — the whole prior candle was reversed.',
    use: 'Strongest at support after a pullback; weak in the middle of nowhere. The next candle confirms or fails it.',
    question: 'Do you wait for the next candle to confirm? 👇',
    art: { type: 'candles', bars: [...drift(64, 50, 4), bar(50, 52, 44, 46), bar(44, 62, 43, 60), ...drift(60, 70, 3)], highlight: [4, 5], markers: [{ i: 5, dir: 'up', at: 0.65 }], labels: [{ i: 5, y: 66, text: 'Engulfs', color: 'green', at: 0.7 }] },
  },
  {
    id: 'double-bottom', series: 'Chart Patterns', title: 'Double Bottom',
    hook: 'The "W" that traders watch for.',
    captions: ['Two lows at the same level — sellers failed twice.', 'The neckline break is the trigger, not the second low.'],
    means: 'A reversal pattern: two tests of support with a bounce between them.',
    use: 'The pattern is only complete on a close above the neckline; the second low is the invalidation.',
    question: 'Do you enter on the neckline or the retest? 👇',
    art: { type: 'candles', bars: [...drift(70, 42, 5), bar(42, 44, 36, 40), ...drift(40, 58, 4), ...drift(58, 42, 4), bar(42, 45, 36, 41), ...drift(41, 58, 3), bar(58, 66, 57, 65), ...drift(65, 72, 2)],
      levels: [{ y: 37, label: 'Support', color: 'green', at: 0.45 }, { y: 60, label: 'Neckline', color: 'blue', at: 0.6 }], markers: [{ i: 5, dir: 'up', at: 0.5 }, { i: 14, dir: 'up', at: 0.62 }], highlight: [19], labels: [{ i: 19, y: 74, text: 'Neckline break', color: 'green', at: 0.8 }] },
  },
  {
    id: 'head-and-shoulders', series: 'Chart Patterns', title: 'Head & Shoulders',
    hook: 'Three peaks. One warning.',
    captions: ['Left shoulder, head, right shoulder — highs that stop rising.', 'The neckline break confirms the pattern.'],
    means: 'A topping pattern: a higher high the market could not build on.',
    use: 'It is not a pattern until the neckline is lost on a close; a reclaim of the neckline invalidates it.',
    question: 'Pattern first, or structure first? 👇',
    art: { type: 'line', points: [[0, 30], [10, 55], [20, 42], [32, 70], [44, 42], [56, 56], [68, 40], [78, 30], [90, 24], [100, 20]],
      levels: [{ y: 41, label: 'Neckline', color: 'blue', at: 0.55 }], labels: [{ x: 10, y: 60, text: 'L', color: 'amber', at: 0.3 }, { x: 32, y: 75, text: 'Head', color: 'amber', at: 0.4 }, { x: 56, y: 61, text: 'R', color: 'amber', at: 0.5 }, { x: 78, y: 25, text: 'Break', color: 'red', at: 0.75 }], pointMarkers: [{ x: 78, y: 30, dir: 'down', at: 0.72 }] },
  },
  {
    id: 'trendlines', series: 'Chart Basics', title: 'Trendlines',
    hook: 'Two touches draw it. The third proves it.',
    captions: ['Connect the swing lows in an uptrend.', 'Each pullback that respects the line adds weight to it.'],
    means: 'A straight line under the higher lows (or over the lower highs) — the pace of the trend.',
    use: 'Watch how price behaves at the line; a close through it puts the trend in question.',
    question: 'Wicks or closes when you draw yours? 👇',
    art: { type: 'line', points: [[0, 30], [12, 44], [22, 36], [35, 54], [46, 44], [58, 64], [70, 54], [82, 74], [100, 68]], trend: { from: [0, 28], to: [100, 60], color: 'green', at: 0.6 }, pointMarkers: [{ x: 22, y: 36, dir: 'up', at: 0.68 }, { x: 46, y: 44, dir: 'up', at: 0.74 }, { x: 70, y: 54, dir: 'up', at: 0.8 }] },
  },
  {
    id: 'breakouts', series: 'Price Action', title: 'Breakouts',
    hook: 'A wick through a level is not a breakout.',
    captions: ['Price pokes the ceiling, then closes above it.', 'The old ceiling becomes the new floor on the retest.'],
    means: 'A close beyond a level that held before — and price staying there.',
    use: 'The close, not the poke, is the signal; a close back under the level negates it.',
    question: 'Enter on the break, or wait for the retest? 👇',
    art: { type: 'candles', bars: [...drift(42, 58, 4), bar(58, 64, 56, 57), bar(57, 74, 56, 72), bar(72, 76, 63, 65), bar(65, 78, 64, 77), ...drift(77, 84, 2)], levels: [{ y: 62, label: 'Resistance → support', color: 'blue', at: 0.3 }], highlight: [5], markers: [{ i: 5, dir: 'up', at: 0.62 }, { i: 7, dir: 'up', at: 0.78 }], labels: [{ i: 7, y: 58, text: 'Retest holds', color: 'green', at: 0.8 }] },
  },
  {
    id: 'fakeouts', series: 'Price Action', title: 'Fakeouts (Bull Trap)',
    hook: 'The breakout that trapped everyone.',
    captions: ['Price pops above resistance… and closes back below it.', 'Late buyers are now stuck above the level.'],
    means: 'A break that fails fast — price snaps back through the level within a bar or two.',
    use: 'A failed break often moves harder the other way; the reclaim of the level is the tell.',
    question: 'Ever been caught in one? What tipped you off? 👇',
    art: { type: 'candles', bars: [...drift(42, 56, 4), bar(56, 72, 55, 68), bar(68, 69, 50, 52), ...drift(52, 36, 3)], levels: [{ y: 61, label: 'Resistance', color: 'red', at: 0.3 }], highlight: [4, 5], markers: [{ i: 5, dir: 'down', at: 0.68 }], labels: [{ i: 4, y: 76, text: 'Trap', color: 'red', at: 0.62 }] },
  },
  {
    id: 'rsi', series: 'Indicators', title: 'RSI (Relative Strength Index)',
    hook: 'RSI 70 is not a sell signal.',
    captions: ['RSI measures how fast price moved — not where it goes next.', 'Above 50 momentum favours buyers; above 70 it is stretched, not finished.'],
    means: 'A 0–100 momentum gauge: 50 is the midline, 70 stretched, 30 washed out.',
    use: 'Read it with the trend: in an uptrend, pullbacks that hold 40–50 keep momentum with the buyers.',
    question: 'Warning sign or strength — how do you read RSI 70? 👇',
    art: { type: 'osc', points: [[0, 42], [15, 46], [30, 44], [45, 52], [60, 58], [75, 63], [90, 72], [100, 74]], bands: [{ y: 70, label: '70' }, { y: 50, label: '50' }, { y: 30, label: '30' }], shade: { top: 70, bottom: 30 }, labels: [{ x: 45, y: 57, text: 'Crosses 50', color: 'green', at: 0.5 }, { x: 88, y: 80, text: 'Stretched, not done', color: 'amber', at: 0.8 }] },
  },
  {
    id: 'cmf', series: 'Indicators', title: 'CMF (Chaikin Money Flow)',
    hook: 'Price can rise while money leaves.',
    captions: ['CMF asks: are closes landing near the highs on volume?', 'Above zero = accumulation. Below zero = distribution.'],
    means: 'A 20-bar read of whether volume is flowing into or out of an asset.',
    use: 'Positive and rising with price confirms the move; negative while price rises is a warning.',
    question: 'Price first, or the flow behind it? 👇',
    art: { type: 'osc', points: [[0, 48], [15, 52], [30, 55], [45, 54], [60, 60], [75, 64], [90, 67], [100, 68]], bands: [{ y: 50, label: '0' }], zero: 50, fill: true, labels: [{ x: 70, y: 74, text: 'Money flowing in', color: 'green', at: 0.7 }] },
  },
  {
    id: 'volume-confirmation', series: 'Indicators', title: 'Volume Confirmation',
    hook: 'No volume, no conviction.',
    captions: ['The breakout candle prints the biggest volume bar in weeks.', 'Broad participation is what makes a move stick.'],
    means: 'Volume shows how many traders agreed with a move.',
    use: 'A break on rising volume has conviction; a break on thin volume is easy to reverse.',
    question: 'Do you check volume before or after you spot the setup? 👇',
    art: { type: 'candles', bars: [...drift(42, 56, 5), bar(56, 72, 55, 70), ...drift(70, 76, 2)], vols: [30, 28, 34, 30, 32, 95, 60, 55], levels: [{ y: 60, label: 'Resistance', color: 'red', at: 0.3 }], highlight: [5], markers: [{ i: 5, dir: 'up', at: 0.65 }], labels: [{ i: 5, y: 80, text: 'Volume spike', color: 'amber', at: 0.72 }] },
  },
  {
    id: 'bearish-divergence', series: 'Indicators', title: 'Bearish Divergence',
    hook: 'New high in price. Lower high in momentum.',
    captions: ['Price makes a higher high…', '…but RSI makes a lower high. Momentum is fading under the surface.'],
    means: 'Price and momentum disagree — the move is getting tired.',
    use: 'Not a signal by itself: it warns; a loss of the last swing low is what confirms it.',
    question: 'Do you act on divergence, or just tighten up? 👇',
    art: { type: 'divergence', price: [[0, 40], [15, 58], [30, 48], [45, 66], [60, 56], [75, 72], [90, 62], [100, 55]], osc: [[0, 45], [15, 68], [30, 55], [45, 64], [60, 52], [75, 58], [90, 46], [100, 40]],
      priceGuide: { from: [45, 66], to: [75, 72], color: 'red', at: 0.6 }, oscGuide: { from: [45, 64], to: [75, 58], color: 'red', at: 0.7 }, labels: [{ x: 75, y: 78, text: 'Higher high', color: 'red', at: 0.62, panel: 'price' }, { x: 75, y: 66, text: 'Lower high', color: 'red', at: 0.72, panel: 'osc' }] },
  },
  {
    id: 'market-structure', series: 'Structure', title: 'Market Structure',
    hook: 'Trend = higher highs and higher lows. Until it is not.',
    captions: ['HH, HL, HH, HL — the uptrend has structure.', 'A close below the last higher low breaks it.'],
    means: 'The sequence of swing highs and lows tells you which side is in control.',
    use: 'Track the last higher low: while it holds, the trend is intact; when it breaks, structure has shifted.',
    question: 'Which swing low is your line in the sand right now? 👇',
    art: { type: 'line', points: [[0, 30], [12, 48], [22, 40], [34, 60], [46, 50], [58, 70], [70, 58], [82, 66], [92, 44], [100, 40]],
      labels: [{ x: 12, y: 53, text: 'HH', color: 'green', at: 0.2 }, { x: 22, y: 34, text: 'HL', color: 'green', at: 0.28 }, { x: 34, y: 65, text: 'HH', color: 'green', at: 0.36 }, { x: 46, y: 44, text: 'HL', color: 'green', at: 0.42 }, { x: 58, y: 75, text: 'HH', color: 'green', at: 0.5 }, { x: 70, y: 52, text: 'HL', color: 'green', at: 0.56 }, { x: 92, y: 38, text: 'Structure broken', color: 'red', at: 0.8 }],
      levels: [{ y: 58, label: 'Last higher low', color: 'amber', at: 0.62 }], pointMarkers: [{ x: 92, y: 44, dir: 'down', at: 0.78 }] },
  },
  {
    id: 'moving-averages', series: 'Indicators', title: 'Moving Averages',
    hook: 'The 20-day is the swing trader\'s base.',
    captions: ['Price above a rising average: trend up.', 'Pullbacks to the line that hold are the healthy kind.'],
    means: 'The average close over the last N bars — a smoothed view of the trend.',
    use: 'Above a rising 20-day, buy-side setups have the wind at their back; below it, patience.',
    question: 'Which average lives on every one of your charts? 👇',
    art: { type: 'line', points: [[0, 34], [12, 46], [22, 42], [35, 56], [46, 50], [58, 64], [70, 58], [82, 72], [100, 70]], ma: [[0, 30], [25, 38], [50, 48], [75, 58], [100, 64]], maColor: 'blue', maAt: 0.15, pointMarkers: [{ x: 22, y: 42, dir: 'up', at: 0.62 }, { x: 46, y: 50, dir: 'up', at: 0.7 }, { x: 70, y: 58, dir: 'up', at: 0.78 }], labels: [{ x: 84, y: 60, text: '20-day MA', color: 'blue', at: 0.4 }] },
  },
  {
    id: 'bollinger-squeeze', series: 'Indicators', title: 'Bollinger Band Squeeze',
    hook: 'Quiet charts get loud.',
    captions: ['The bands pinch together as volatility dries up.', 'Expansion usually follows — direction unknown until the break.'],
    means: 'Bands two standard deviations around a moving average; narrow bands mean a quiet market.',
    use: 'The squeeze is the setup, the break is the trade; the direction of the first close outside the bands decides it.',
    question: 'Squeeze or band-ride — which do you find more useful? 👇',
    art: { type: 'line', points: [[0, 52], [15, 47], [30, 53], [45, 49], [60, 51], [72, 50], [82, 50], [90, 62], [100, 70]], band: { upper: [[0, 66], [50, 58], [82, 54], [100, 66]], lower: [[0, 36], [50, 42], [82, 46], [100, 42]] }, labels: [{ x: 70, y: 40, text: 'Squeeze', color: 'amber', at: 0.55 }, { x: 92, y: 76, text: 'Expansion', color: 'green', at: 0.85 }] },
  },
  {
    id: 'risk-reward', series: 'Risk Management', title: 'Risk : Reward',
    hook: 'Define the loss before the trade.',
    captions: ['Stop below the level that invalidates the idea.', 'Reward at least 2× the risk, or the setup is not worth taking.'],
    means: 'Risk = distance from entry to stop. Reward = distance to the next level. The ratio is the whole edge.',
    use: 'Size the position from the stop distance, so a stop-out costs a fixed small slice of the account.',
    question: 'What minimum R:R do you demand? 👇',
    art: { type: 'candles', bars: [...drift(48, 40, 3), bar(40, 44, 36, 43), ...drift(43, 50, 3), ...drift(50, 47, 2)], levels: [{ y: 36, label: 'Stop · 1R', color: 'red', at: 0.5 }, { y: 47, label: 'Entry', color: 'blue', at: 0.4 }, { y: 69, label: 'Next level · 2R', color: 'green', at: 0.62 }], zones: [{ y1: 36, y2: 47, color: 'red', at: 0.72 }, { y1: 47, y2: 69, color: 'green', at: 0.8 }] },
  },
];

export function getVideoTopic(id) {
  return VIDEO_TOPICS.find(t => t.id === id) ?? null;
}

/**
 * Next topic to film: never-posted first (library order), then the one
 * posted longest ago — so the series cycles without repeating until every
 * topic has run. `auditRecords` are `AuditStore#latest()`.
 */
export function nextVideoTopic(auditRecords, { exclude = [] } = {}) {
  const last = new Map();
  for (const r of auditRecords) {
    if (r.kind !== 'video' || !r.topic) continue;
    if (!['published', 'ready_to_post', 'approved', 'publishing'].includes(r.status)) continue;
    const at = r.publication?.at ?? r.createdAt ?? '';
    if (!last.has(r.topic) || at > last.get(r.topic)) last.set(r.topic, at);
  }
  const pool = VIDEO_TOPICS.filter(t => !exclude.includes(t.id));
  const never = pool.find(t => !last.has(t.id));
  if (never) return never;
  return [...pool].sort((a, b) => last.get(a.id).localeCompare(last.get(b.id)))[0] ?? null;
}

// ─── post text ───────────────────────────────────────────────────────────────

/**
 *   🎬 Chart Education: Support & Resistance
 *   Support is not a line. It is a zone.
 *   What it means: a price area where buyers (support) or sellers (resistance) have shown up before.
 *   How traders use it: mark the zone, then wait for the reaction at it — a bounce, or a daily close through it.
 *   Do you mark zones or single lines? 👇
 *   Save this • Follow for daily chart education
 *   #TechnicalAnalysis #ChartEducation
 */
export function generateVideoPost(topic, config) {
  const v = config.video ?? {};
  const tags = (v.hashtags ?? []).slice(0, Math.min(2, config.hashtags?.maxTotal ?? 2));
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
  const lines = [
    `🎬 Chart Education: ${topic.title}`,
    topic.hook,
    `What it means: ${lc(topic.means)}`,
    `How traders use it: ${lc(topic.use)}`,
    topic.question,
    VIDEO_CTA,
    config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    tags.length ? tags.join(' ') : null,
  ].filter(Boolean);
  return { text: lines.join('\n'), lines };
}

/** Spec for scripts/render-edu-video.py. */
export function buildVideoSpec(topic, config, outPath, { day = null } = {}) {
  const v = config.video ?? {};
  return {
    style: 'edu-video',
    out: outPath,
    width: v.width ?? 1080,
    height: v.height ?? 1920,
    fps: v.fps ?? 30,
    timing: { hook: 1.6, chart: 7.4, takeaway: 3.0, end: 1.6, ...(v.timing ?? {}) },
    brand: config.brand?.name || 'Daily Setup Sweep',
    tagline: config.brand?.tagline || null,
    series: `CHART EDUCATION${day ? ` · DAY ${day}` : ''}`,
    topicSeries: topic.series.toUpperCase(),
    title: topic.title,
    hook: topic.hook,
    captions: topic.captions,
    means: topic.means,
    use: topic.use,
    cta: VIDEO_CTA,
    footer: v.footer ?? VIDEO_FOOTER,
    art: topic.art,
  };
}

/** Alt text / accessibility description for the video (X media description). */
export function videoAltText(topic, config) {
  const v = config.video ?? {};
  const bits = [`Chart education, ${topic.series}: ${topic.title}.`, topic.hook, ...topic.captions, `What it means: ${topic.means}`, `How traders use it: ${topic.use}`, VIDEO_CTA, v.footer ?? VIDEO_FOOTER];
  return bits.join(' ').slice(0, 1000);
}

/**
 * Render the video. Frames come from Pillow; encoding needs an ffmpeg binary
 * (FFMPEG env, `ffmpeg` on PATH, or the one bundled with imageio-ffmpeg).
 */
export function renderVideoSpec(spec, { python = process.env.SOCIAL_PYTHON || 'python3', timeoutMs = 240_000 } = {}) {
  mkdirSync(dirname(spec.out), { recursive: true });
  const r = spawnSync(python, [RENDERER_VIDEO], { input: JSON.stringify(spec), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`video renderer failed: ${(r.stderr || r.stdout || '').trim().split('\n').at(-1)}`);
  if (!existsSync(spec.out)) throw new Error('video renderer produced no file');
  let meta = null;
  try { meta = JSON.parse((r.stdout || '').trim().split('\n').at(-1)); } catch { /* renderer printed nothing parseable */ }
  return { path: spec.out, meta };
}

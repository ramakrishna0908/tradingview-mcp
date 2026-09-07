/**
 * Educational explainer posts — one technical-analysis topic at a time.
 *
 * Each topic carries a one-line definition, three labelled examples (each a
 * small drawn illustration, a short definition and a bullish / bearish /
 * neutral takeaway), and a question to close on. The text is deliberately
 * minimal and beginner-friendly; the card does the teaching.
 *
 * Nothing here references a real ticker or a live price — the illustrations
 * are drawn from the specs below, not from market data — and compliance
 * enforces that (validation ctx.kind = 'education': no cashtags, the usual
 * prohibited-wording and forward-looking-claim checks still apply).
 *
 * Rotation: `nextTopic` picks the topic posted longest ago (never-posted first,
 * in library order), so the curriculum cycles. Topic-level engagement shows up
 * in `tv social metrics report` (byTopic) once metrics are collected.
 */

export const TAKEAWAY = Object.freeze({ BULLISH: 'bullish', BEARISH: 'bearish', NEUTRAL: 'neutral' });

// ─── illustration helpers (0–100 coordinate space, y up) ─────────────────────

/** Candles that grind up from `from` to `to` with small bodies. */
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

export const TOPICS = [
  {
    id: 'support-resistance',
    series: 'Chart Basics',
    title: 'Support & Resistance',
    definition: 'Price levels where buyers or sellers have repeatedly stepped in.',
    lines: ['Support = a floor where buyers have shown up before.', 'Resistance = a ceiling where sellers have shown up before.'],
    examples: [
      { label: 'Support holds', text: 'Price dips to the floor and bounces — again.', takeaway: TAKEAWAY.BULLISH, note: 'Buyers keep defending the level.',
        art: { type: 'candles', bars: [...drift(60, 40, 4), bar(40, 46, 34, 45), ...drift(45, 62, 3), ...drift(62, 42, 3), bar(42, 48, 35, 47), ...drift(47, 66, 3)], levels: [{ y: 36, label: 'Support', color: 'green' }], markers: [{ i: 4, dir: 'up' }, { i: 11, dir: 'up' }] } },
      { label: 'Resistance rejects', text: 'Price rallies to the ceiling and gets sold — again.', takeaway: TAKEAWAY.BEARISH, note: 'Sellers keep defending the level.',
        art: { type: 'candles', bars: [...drift(40, 60, 4), bar(60, 68, 55, 56), ...drift(56, 42, 3), ...drift(42, 61, 3), bar(61, 69, 54, 55), ...drift(55, 38, 3)], levels: [{ y: 68, label: 'Resistance', color: 'red' }], markers: [{ i: 4, dir: 'down' }, { i: 11, dir: 'down' }] } },
      { label: 'Stuck in the range', text: 'Price ping-pongs between the two levels.', takeaway: TAKEAWAY.NEUTRAL, note: 'Wait for a decisive break of either level.',
        art: { type: 'candles', bars: [...drift(45, 62, 3), ...drift(62, 40, 3), ...drift(40, 63, 3), ...drift(63, 41, 3), ...drift(41, 60, 3)], levels: [{ y: 66, label: 'Resistance', color: 'red' }, { y: 37, label: 'Support', color: 'green' }] } },
    ],
    question: 'Which do you mark first on a fresh chart — support or resistance?',
  },
  {
    id: 'candlestick-basics',
    series: 'Chart Basics',
    title: 'Candlestick Patterns 101',
    definition: 'One candle = open, high, low, close. Two or three together tell a story.',
    lines: ['Green body: closed above the open. Red body: closed below.', 'Wicks show where price went but could not stay.'],
    examples: [
      { label: 'Bullish engulfing', text: 'A green candle swallows the prior red one.', takeaway: TAKEAWAY.BULLISH, note: 'Buyers took control inside one session.',
        art: { type: 'candles', bars: [...drift(64, 50, 4), bar(50, 52, 44, 46), bar(44, 62, 43, 60), ...drift(60, 70, 3)], highlight: [4, 5], markers: [{ i: 5, dir: 'up' }] } },
      { label: 'Bearish engulfing', text: 'A red candle swallows the prior green one.', takeaway: TAKEAWAY.BEARISH, note: 'Sellers took control inside one session.',
        art: { type: 'candles', bars: [...drift(38, 54, 4), bar(54, 60, 52, 58), bar(60, 61, 42, 44), ...drift(44, 34, 3)], highlight: [4, 5], markers: [{ i: 5, dir: 'down' }] } },
      { label: 'Doji', text: 'Open and close almost equal — a tiny body, long wicks.', takeaway: TAKEAWAY.NEUTRAL, note: 'Indecision. Let the next candle decide.',
        art: { type: 'candles', bars: [...drift(40, 58, 5), bar(58, 68, 48, 58.5), bar(58, 62, 52, 55), bar(55, 60, 50, 57)], highlight: [5] } },
    ],
    question: 'Which pattern do you spot most often on your charts?',
  },
  {
    id: 'rsi',
    series: 'Indicators',
    title: 'RSI (Relative Strength Index)',
    definition: 'A 0–100 momentum gauge. Above 70 is stretched, below 30 is washed out.',
    lines: ['RSI measures how fast price has been moving, not where it is going.', '50 is the midline: above it momentum favours buyers, below it sellers.'],
    examples: [
      { label: 'Rising through 50', text: 'RSI climbs from the 40s into the 60s and holds.', takeaway: TAKEAWAY.BULLISH, note: 'Momentum is with the buyers and not yet stretched.',
        art: { type: 'osc', points: [[0, 42], [15, 46], [30, 44], [45, 52], [60, 58], [75, 63], [90, 66], [100, 65]], bands: [{ y: 70, label: '70' }, { y: 50, label: '50' }, { y: 30, label: '30' }], shade: { top: 70, bottom: 30 } } },
      { label: 'Falling under 50', text: 'RSI drops through the midline and keeps sliding.', takeaway: TAKEAWAY.BEARISH, note: 'Momentum is with the sellers.',
        art: { type: 'osc', points: [[0, 58], [15, 55], [30, 57], [45, 48], [60, 42], [75, 38], [90, 34], [100, 35]], bands: [{ y: 70, label: '70' }, { y: 50, label: '50' }, { y: 30, label: '30' }], shade: { top: 70, bottom: 30 } } },
      { label: 'Flat around 50', text: 'RSI drifts sideways between 45 and 55.', takeaway: TAKEAWAY.NEUTRAL, note: 'No momentum edge either way.',
        art: { type: 'osc', points: [[0, 50], [15, 53], [30, 48], [45, 52], [60, 47], [75, 51], [90, 49], [100, 50]], bands: [{ y: 70, label: '70' }, { y: 50, label: '50' }, { y: 30, label: '30' }], shade: { top: 70, bottom: 30 } } },
    ],
    question: 'Do you treat RSI 70 as a warning or as strength?',
  },
  {
    id: 'cmf',
    series: 'Indicators',
    title: 'CMF (Chaikin Money Flow)',
    definition: 'Measures whether volume is flowing into or out of an asset over the last 20 bars.',
    lines: ['Above zero: closes are landing near the highs on volume — accumulation.', 'Below zero: closes near the lows on volume — distribution.'],
    examples: [
      { label: 'Positive and rising', text: 'CMF holds above zero and climbs.', takeaway: TAKEAWAY.BULLISH, note: 'Money is flowing in while price rises.',
        art: { type: 'osc', points: [[0, 48], [15, 52], [30, 55], [45, 54], [60, 60], [75, 64], [90, 67], [100, 68]], bands: [{ y: 50, label: '0' }], zero: 50, fill: true } },
      { label: 'Negative and falling', text: 'CMF stays below zero and sinks.', takeaway: TAKEAWAY.BEARISH, note: 'Money is leaving even on up days.',
        art: { type: 'osc', points: [[0, 52], [15, 47], [30, 44], [45, 45], [60, 40], [75, 36], [90, 33], [100, 32]], bands: [{ y: 50, label: '0' }], zero: 50, fill: true } },
      { label: 'Hugging zero', text: 'CMF wobbles just above and below the line.', takeaway: TAKEAWAY.NEUTRAL, note: 'No conviction from volume yet.',
        art: { type: 'osc', points: [[0, 50], [15, 52], [30, 48], [45, 51], [60, 49], [75, 52], [90, 48], [100, 50]], bands: [{ y: 50, label: '0' }], zero: 50, fill: true } },
    ],
    question: 'Do you look at price first, or the flow behind it?',
  },
  {
    id: 'breakouts',
    series: 'Price Action',
    title: 'Breakouts',
    definition: 'Price closes beyond a level that held before — and stays there.',
    lines: ['The close matters more than the poke: a wick through a level is not a breakout.', 'The old ceiling often becomes the new floor.'],
    examples: [
      { label: 'Clean breakout', text: 'A full candle closes above resistance, then holds.', takeaway: TAKEAWAY.BULLISH, note: 'Confirmed by the close and the retest.',
        art: { type: 'candles', bars: [...drift(42, 58, 4), bar(58, 64, 56, 57), bar(57, 74, 56, 72), bar(72, 76, 66, 68), bar(68, 78, 67, 77)], levels: [{ y: 62, label: 'Resistance', color: 'red' }], highlight: [5], markers: [{ i: 5, dir: 'up' }] } },
      { label: 'Clean breakdown', text: 'A full candle closes below support, then fails to reclaim it.', takeaway: TAKEAWAY.BEARISH, note: 'The old floor becomes the ceiling.',
        art: { type: 'candles', bars: [...drift(60, 44, 4), bar(44, 46, 40, 42), bar(42, 43, 28, 30), bar(30, 38, 29, 36), bar(36, 37, 26, 27)], levels: [{ y: 39, label: 'Support', color: 'green' }], highlight: [5], markers: [{ i: 5, dir: 'down' }] } },
      { label: 'Poke, no close', text: 'Price trades above the level intraday but closes back under it.', takeaway: TAKEAWAY.NEUTRAL, note: 'Not confirmed. Wait for a close beyond the level.',
        art: { type: 'candles', bars: [...drift(42, 58, 4), bar(58, 70, 56, 59), bar(59, 63, 52, 54), bar(54, 60, 50, 57)], levels: [{ y: 62, label: 'Resistance', color: 'red' }], highlight: [4] } },
    ],
    question: 'Do you enter on the break or wait for the retest?',
  },
  {
    id: 'fakeouts',
    series: 'Price Action',
    title: 'Fakeouts (Bull & Bear Traps)',
    definition: 'A break that fails fast — price snaps back through the level.',
    lines: ['Bull trap: breaks above resistance, then closes back below it.', 'Bear trap: breaks below support, then reclaims it.'],
    examples: [
      { label: 'Bear trap', text: 'Price dips under support, then closes back above it.', takeaway: TAKEAWAY.BULLISH, note: 'Sellers got trapped; the snap-back is the signal.',
        art: { type: 'candles', bars: [...drift(58, 44, 4), bar(44, 45, 30, 34), bar(34, 50, 32, 48), ...drift(48, 64, 3)], levels: [{ y: 40, label: 'Support', color: 'green' }], highlight: [4, 5], markers: [{ i: 5, dir: 'up' }] } },
      { label: 'Bull trap', text: 'Price pops above resistance, then closes back below it.', takeaway: TAKEAWAY.BEARISH, note: 'Buyers got trapped; the failure is the signal.',
        art: { type: 'candles', bars: [...drift(42, 56, 4), bar(56, 72, 55, 68), bar(68, 69, 50, 52), ...drift(52, 36, 3)], levels: [{ y: 61, label: 'Resistance', color: 'red' }], highlight: [4, 5], markers: [{ i: 5, dir: 'down' }] } },
      { label: 'Unresolved', text: 'Price sits right on the level after the break.', takeaway: TAKEAWAY.NEUTRAL, note: 'Neither side has won yet — give it a close.',
        art: { type: 'candles', bars: [...drift(42, 56, 4), bar(56, 66, 55, 63), bar(63, 65, 58, 61), bar(61, 64, 58, 62)], levels: [{ y: 61, label: 'Resistance', color: 'red' }], highlight: [5, 6] } },
    ],
    question: 'Ever been caught in a trap? What tipped you off?',
  },
  {
    id: 'trendlines',
    series: 'Chart Basics',
    title: 'Trendlines',
    definition: 'A straight line connecting swing lows (uptrend) or swing highs (downtrend).',
    lines: ['Two touches draw the line; a third confirms it.', 'A trendline is a guide, not a wall — watch how price behaves at it.'],
    examples: [
      { label: 'Higher lows', text: 'Each pullback stops at a rising line.', takeaway: TAKEAWAY.BULLISH, note: 'Buyers step in earlier every time.',
        art: { type: 'line', points: [[0, 30], [12, 44], [22, 36], [35, 54], [46, 44], [58, 64], [70, 54], [82, 74], [100, 68]], trend: { from: [0, 28], to: [100, 60], color: 'green' } } },
      { label: 'Lower highs', text: 'Each bounce fails at a falling line.', takeaway: TAKEAWAY.BEARISH, note: 'Sellers step in earlier every time.',
        art: { type: 'line', points: [[0, 72], [12, 58], [22, 66], [35, 48], [46, 58], [58, 40], [70, 48], [82, 30], [100, 34]], trend: { from: [0, 74], to: [100, 40], color: 'red' } } },
      { label: 'Line broken', text: 'Price closes through the trendline.', takeaway: TAKEAWAY.NEUTRAL, note: 'The trend is in question — wait for new structure.',
        art: { type: 'line', points: [[0, 30], [12, 44], [22, 36], [35, 54], [46, 44], [58, 62], [70, 48], [82, 40], [100, 42]], trend: { from: [0, 28], to: [100, 60], color: 'green', broken: true } } },
    ],
    question: 'Do you draw trendlines on wicks or on closes?',
  },
  {
    id: 'volume-confirmation',
    series: 'Indicators',
    title: 'Volume Confirmation',
    definition: 'Volume shows how many traders agreed with a move.',
    lines: ['A break on rising volume has conviction behind it.', 'A break on thin volume is easy to reverse.'],
    examples: [
      { label: 'Breakout with volume', text: 'The breakout candle prints the biggest volume bar in weeks.', takeaway: TAKEAWAY.BULLISH, note: 'Broad participation confirms the move.',
        art: { type: 'candles', bars: [...drift(42, 56, 5), bar(56, 72, 55, 70), ...drift(70, 76, 2)], vols: [30, 28, 34, 30, 32, 95, 60, 55], levels: [{ y: 60, label: 'Resistance', color: 'red' }], highlight: [5] } },
      { label: 'Breakdown with volume', text: 'The breakdown candle comes with a volume spike.', takeaway: TAKEAWAY.BEARISH, note: 'Sellers showed up in size.',
        art: { type: 'candles', bars: [...drift(60, 46, 5), bar(46, 47, 30, 32), ...drift(32, 26, 2)], vols: [30, 28, 34, 30, 32, 95, 60, 55], levels: [{ y: 42, label: 'Support', color: 'green' }], highlight: [5] } },
      { label: 'Break on thin volume', text: 'Price clears the level but volume is below average.', takeaway: TAKEAWAY.NEUTRAL, note: 'Low conviction — treat it as unconfirmed.',
        art: { type: 'candles', bars: [...drift(42, 56, 5), bar(56, 66, 55, 64), bar(64, 65, 58, 60), bar(60, 61, 54, 56)], vols: [40, 42, 38, 44, 40, 22, 20, 24], levels: [{ y: 60, label: 'Resistance', color: 'red' }], highlight: [5] } },
    ],
    question: 'Do you check volume before or after you spot the setup?',
  },
  {
    id: 'moving-averages',
    series: 'Indicators',
    title: 'Moving Averages',
    definition: 'The average close over the last N bars, drawn as a line — a smoothed view of trend.',
    lines: ['Price above a rising average: trend up. Below a falling one: trend down.', 'The 20-day is a common "base" swing traders watch.'],
    examples: [
      { label: 'Above a rising average', text: 'Pullbacks stop at the line and price turns back up.', takeaway: TAKEAWAY.BULLISH, note: 'The average acts as dynamic support.',
        art: { type: 'line', points: [[0, 34], [12, 46], [22, 42], [35, 56], [46, 50], [58, 64], [70, 58], [82, 72], [100, 70]], ma: [[0, 30], [25, 38], [50, 48], [75, 58], [100, 64]], maColor: 'blue' } },
      { label: 'Below a falling average', text: 'Bounces fail at the line and price rolls over.', takeaway: TAKEAWAY.BEARISH, note: 'The average acts as dynamic resistance.',
        art: { type: 'line', points: [[0, 70], [12, 58], [22, 62], [35, 48], [46, 54], [58, 40], [70, 46], [82, 32], [100, 34]], ma: [[0, 74], [25, 66], [50, 56], [75, 46], [100, 40]], maColor: 'blue' } },
      { label: 'Chopping through it', text: 'Price crosses the average back and forth.', takeaway: TAKEAWAY.NEUTRAL, note: 'No trend to lean on — the average is flat.',
        art: { type: 'line', points: [[0, 48], [12, 56], [22, 46], [35, 55], [46, 45], [58, 54], [70, 47], [82, 53], [100, 49]], ma: [[0, 50], [25, 51], [50, 50], [75, 50], [100, 50]], maColor: 'blue' } },
    ],
    question: 'Which average do you keep on every chart?',
  },
  {
    id: 'bollinger-bands',
    series: 'Indicators',
    title: 'Bollinger Bands',
    definition: 'A moving average with bands two standard deviations above and below it.',
    lines: ['Wide bands: volatile. Narrow bands (a squeeze): quiet — expansion often follows.', 'Riding a band is strength, not automatically "overbought".'],
    examples: [
      { label: 'Riding the upper band', text: 'Price walks up the upper band as the bands widen.', takeaway: TAKEAWAY.BULLISH, note: 'Strong, persistent buying.',
        art: { type: 'line', points: [[0, 46], [15, 52], [30, 56], [45, 62], [60, 66], [75, 72], [90, 76], [100, 78]], band: { upper: [[0, 54], [50, 66], [100, 82]], lower: [[0, 38], [50, 40], [100, 44]] } } },
      { label: 'Riding the lower band', text: 'Price walks down the lower band as the bands widen.', takeaway: TAKEAWAY.BEARISH, note: 'Strong, persistent selling.',
        art: { type: 'line', points: [[0, 56], [15, 50], [30, 46], [45, 40], [60, 36], [75, 30], [90, 26], [100, 24]], band: { upper: [[0, 64], [50, 62], [100, 60]], lower: [[0, 48], [50, 36], [100, 20]] } } },
      { label: 'The squeeze', text: 'The bands pinch together as price goes quiet.', takeaway: TAKEAWAY.NEUTRAL, note: 'A bigger move often follows — direction unknown until it breaks.',
        art: { type: 'line', points: [[0, 52], [15, 47], [30, 53], [45, 49], [60, 51], [75, 50], [90, 50], [100, 50]], band: { upper: [[0, 66], [50, 58], [100, 54]], lower: [[0, 36], [50, 42], [100, 46]] } } },
    ],
    question: 'Squeeze or band-ride — which do you find more useful?',
  },
];

export function getTopic(id) {
  return TOPICS.find(t => t.id === id) ?? null;
}

/**
 * The topic to post next: never-posted topics first (library order), then the
 * one posted longest ago. `auditRecords` are `AuditStore#latest()`.
 */
export function nextTopic(auditRecords, { exclude = [] } = {}) {
  const lastPosted = new Map();
  for (const r of auditRecords) {
    if (r.kind !== 'education' || !r.topic) continue;
    if (!['published', 'ready_to_post', 'approved', 'publishing'].includes(r.status)) continue;
    const at = r.publication?.at ?? r.createdAt ?? '';
    if (!lastPosted.has(r.topic) || at > lastPosted.get(r.topic)) lastPosted.set(r.topic, at);
  }
  const pool = TOPICS.filter(t => !exclude.includes(t.id));
  const never = pool.find(t => !lastPosted.has(t.id));
  if (never) return never;
  return [...pool].sort((a, b) => lastPosted.get(a.id).localeCompare(lastPosted.get(b.id)))[0] ?? null;
}

// ─── post text ───────────────────────────────────────────────────────────────

const ICON = { [TAKEAWAY.BULLISH]: '✅', [TAKEAWAY.BEARISH]: '🛑', [TAKEAWAY.NEUTRAL]: '⚖️' };
const WORD = { [TAKEAWAY.BULLISH]: 'Bullish', [TAKEAWAY.BEARISH]: 'Bearish', [TAKEAWAY.NEUTRAL]: 'Neutral' };

/**
 *   📚 Chart Basics: Support & Resistance
 *   Support = a floor where buyers have shown up before.
 *   Resistance = a ceiling where sellers have shown up before.
 *   ✅ Bullish — Support holds: buyers keep defending the level.
 *   🛑 Bearish — Resistance rejects: sellers keep defending the level.
 *   ⚖️ Neutral — Stuck in the range: wait for a decisive break of either level.
 *   Which do you mark first on a fresh chart — support or resistance? 👇
 *   #TechnicalAnalysis #Trading
 */
export function generateEducationPost(topic, config) {
  const ed = config.education ?? {};
  const tags = (ed.hashtags ?? []).slice(0, config.hashtags?.maxTotal ?? 6);
  const lines = [
    `📚 ${topic.series}: ${topic.title}`,
    ...topic.lines,
    ...topic.examples.map(e => `${ICON[e.takeaway]} ${WORD[e.takeaway]} — ${e.label}: ${e.note.charAt(0).toLowerCase() + e.note.slice(1)}`),
    `${topic.question} 👇`,
    config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    tags.length ? tags.join(' ') : null,
  ].filter(Boolean);
  const text = lines.join('\n');
  return { text, lines };
}

/** Spec for the explainer card (scripts/render-chart-sweep.py, style "explainer"). */
export function buildEducationSpec(topic, config, outPath) {
  const ed = config.education ?? {};
  return {
    style: 'explainer',
    out: outPath,
    width: ed.width ?? 1080,
    height: ed.height ?? 1350,
    brand: config.brand?.name || null,
    tagline: config.brand?.tagline || null,
    series: topic.series.toUpperCase(),
    title: topic.title,
    definition: topic.definition,
    examples: topic.examples.map(e => ({ label: e.label, text: e.text, note: e.note, takeaway: e.takeaway, takeawayWord: WORD[e.takeaway], art: e.art })),
    question: topic.question,
    footer: ed.footer ?? 'Educational only. Not financial advice.',
  };
}

export function educationAltText(topic, config) {
  const ed = config.education ?? {};
  const bits = [`${topic.series}: ${topic.title}. ${topic.definition}`];
  for (const e of topic.examples) bits.push(`${e.label} (${WORD[e.takeaway]}): ${e.text} ${e.note}`);
  bits.push(ed.footer ?? 'Educational only. Not financial advice.');
  return bits.join(' ').slice(0, 1000);
}

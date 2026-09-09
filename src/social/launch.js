/**
 * The account launch sequence — the first 14 posts, in order.
 *
 * This is the curriculum's front door: a fixed running order that establishes
 * what the account teaches before the daily rotations (education / video /
 * setups) take over. `LAUNCH_SEQUENCE` is the plan of record; each item names
 * the generator that builds it, so `tv social launch --list` always shows what
 * is shippable today and what is still unimplemented.
 *
 * Every item is educational content and carries the archive tag
 * (config.education.archiveTag, #AITradeSchool) so one tap on any post opens the
 * whole back catalogue.
 *
 * Only `intro` is implemented here. Items whose `generator` is null are
 * planned, not buildable — `queueLaunch` refuses them rather than improvising
 * post text, because nothing may go out that the compliance workflow has not
 * generated and validated.
 */

/** Ordered plan. `generator`: the workflow method that builds it, or null = not built yet. */
export const LAUNCH_SEQUENCE = [
  { n: 1, id: 'intro', title: 'Pinned introduction: what this account teaches and who it is for', kind: 'intro', generator: 'queueLaunch', pin: true },
  { n: 2, id: 'long-wick-rejection', title: 'Chart lesson: long-wick rejection on a 1-hour chart', kind: 'education', generator: null },
  { n: 3, id: 'breakout-questions', title: 'Carousel/image: 4 questions before entering any breakout', kind: 'education', generator: null },
  { n: 4, id: 'setup-anatomy', title: 'Short setup: support, resistance, trigger, invalidation', kind: 'education', generator: null },
  { n: 5, id: 'mid-range-entries', title: 'Lesson: why entries in the middle of a range are lower quality', kind: 'education', generator: null },
  { n: 6, id: 'struggle-poll', title: 'Poll: what do you struggle with most?', kind: 'poll', generator: null },
  { n: 7, id: 'sr-mapping-thread', title: 'Thread: how I map support and resistance', kind: 'thread', generator: null },
  { n: 8, id: 'before-after', title: 'Before/after chart follow-up to an earlier setup', kind: 'followup', generator: 'queueFollowUps' },
  { n: 9, id: 'vwap-reclaim-reject', title: 'Lesson: VWAP reclaim vs. VWAP rejection', kind: 'education', generator: 'queueEducation', topic: 'vwap' },
  { n: 10, id: 'stop-placement', title: 'Risk post: the correct stop is where the trade idea is invalidated', kind: 'education', generator: null },
  { n: 11, id: 'flag-or-range-quiz', title: 'Chart quiz: bull flag, bear flag, or range?', kind: 'quiz', generator: null },
  { n: 12, id: 'volume-is-context', title: 'Lesson: a high-volume candle is context, not a trade signal by itself', kind: 'education', generator: 'queueEducation', topic: 'volume-confirmation' },
  { n: 13, id: 'weekly-recap', title: 'Weekly recap: three market-structure lessons from the week', kind: 'scorecard', generator: null },
  { n: 14, id: 'setup-watchlist', title: 'Setup watchlist: 1–3 names with levels and conditional language', kind: 'setup', generator: 'auto' },
];

export function launchItem(id) {
  return LAUNCH_SEQUENCE.find(i => i.id === id || String(i.n) === String(id)) ?? null;
}

/**
 * The next launch post to publish: the lowest-numbered item that has not been
 * posted yet. `auditRecords` are `AuditStore#latest()`.
 */
export function nextLaunchItem(auditRecords) {
  const posted = new Set();
  for (const r of auditRecords) {
    if (!r.launchItem) continue;
    if (['published', 'ready_to_post', 'approved', 'publishing'].includes(r.status)) posted.add(r.launchItem);
  }
  return LAUNCH_SEQUENCE.find(i => !posted.has(i.id)) ?? null;
}

// ─── item 1: the pinned introduction ─────────────────────────────────────────

/**
 * The account's promise, as bullets. Deliberately describes what is taught,
 * never what the reader will earn — the wording is checked by compliance like
 * any other post (no performance claims, no "guarantee", no ticker).
 */
export const INTRO_TEACHES = [
  'Price action and market structure',
  'Support/resistance and breakout quality',
  'VWAP and EMA context',
  'Risk, invalidation, and trade planning',
  'Occasional educational daily setups',
];

export const INTRO_HOOK = 'Learning technical analysis does not mean predicting every move.';
export const INTRO_PROMISE = ['No hype. No promises.', 'Just chart-based learning.'];
export const INTRO_CTA = 'Follow if you want to read charts with more structure.';

/**
 *   Learning technical analysis does not mean predicting every move.
 *
 *   This account breaks down:
 *   • Price action and market structure
 *   • Support/resistance and breakout quality
 *   • VWAP and EMA context
 *   • Risk, invalidation, and trade planning
 *   • Occasional educational daily setups
 *
 *   No hype. No promises.
 *   Just chart-based learning.
 *
 *   Follow if you want to read charts with more structure.
 *   Educational only — not financial advice.
 *   #AITradeSchool
 */
export function generateIntroPost(config) {
  const ed = config.education ?? {};
  const tag = ed.archiveTag ?? null;
  const lines = [
    INTRO_HOOK,
    '',
    'This account breaks down:',
    ...INTRO_TEACHES.map(b => `• ${b}`),
    '',
    ...INTRO_PROMISE,
    '',
    INTRO_CTA,
    'Educational only — not financial advice.',
    tag,
  ].filter(l => l !== null && l !== undefined);
  const text = lines.join('\n');
  return { text, lines };
}

/** Spec for the intro card (scripts/render-chart-sweep.py, style "intro"). */
export function buildIntroSpec(config, outPath) {
  const ed = config.education ?? {};
  return {
    style: 'intro',
    out: outPath,
    width: ed.width ?? 1080,
    height: ed.height ?? 1350,
    brand: config.brand?.name || null,
    tagline: config.brand?.tagline || null,
    handle: config.brand?.handle || null,
    chip: 'START HERE',
    archiveTag: ed.archiveTag ?? null,
    hook: INTRO_HOOK,
    heading: 'This account breaks down:',
    bullets: INTRO_TEACHES,
    promise: INTRO_PROMISE,
    cta: INTRO_CTA,
    footer: ed.footer ?? 'Educational only. Not financial advice.',
  };
}

export function introAltText(config) {
  const ed = config.education ?? {};
  return [
    `${config.brand?.name ?? 'Daily Setup Sweep'} — start here.`,
    INTRO_HOOK,
    `This account breaks down: ${INTRO_TEACHES.join('; ')}.`,
    ...INTRO_PROMISE,
    INTRO_CTA,
    ed.footer ?? 'Educational only. Not financial advice.',
  ].join(' ').slice(0, 1000);
}

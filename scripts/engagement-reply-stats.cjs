#!/usr/bin/env node
// Reply performance from docs/social/engagement/replies.jsonl, by creator and by thread crowding.
// Usage: node scripts/engagement-reply-stats.cjs [replies.jsonl] [--json] [--min-n 5]
//
// The number that matters is CAPTURE RATE — our impressions / target.views — because raw
// impressions mostly track how big the creator is rather than anything we chose. Capture rate
// needs the `target` block (added 2026-09-19); older lines are counted but reported separately
// as "no target data" instead of being silently dropped. Educational tracking only.
const fs = require('fs'); const path = require('path');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const minN = Number(args[args.indexOf('--min-n') + 1]) || 5;   // the account's standing bar for a recommendation
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--min-n');
const file = positional[0] || path.join(__dirname, '..', 'docs', 'social', 'engagement', 'replies.jsonl');

const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l, i) => {
  try { return JSON.parse(l); } catch { throw new Error(`replies.jsonl line ${i + 1} is not valid JSON`); }
});

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rows = lines.map(l => {
  // Latest reading wins: metrics is an append-only series of re-reads of the same reply.
  const last = (l.metrics || [])[(l.metrics || []).length - 1] || {};
  const imp = num(last.impressions);
  const tv = num(l.target?.views);
  return {
    handle: l.handle || '(unknown)',
    at: l.at,
    impressions: imp,
    likes: num(last.likes) || 0,
    replies: num(last.replies) || 0,
    bookmarks: num(last.bookmarks) || 0,
    targetViews: tv,
    targetReplies: num(l.target?.replies),
    ageMin: num(l.target?.ageMinAtReply),
    // Only defined when both sides are real readings; a 0-view target would divide by zero.
    capture: imp != null && tv ? imp / tv : null,
  };
});

const measured = rows.filter(r => r.impressions != null);
const withTarget = rows.filter(r => r.capture != null);
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pctFmt = v => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
const n0 = v => (v == null ? '—' : String(Math.round(v)));

// Crowding buckets: the question is whether arriving before the pile-up pays off.
const BUCKETS = [
  { label: '0–9 replies', hit: r => r.targetReplies != null && r.targetReplies < 10 },
  { label: '10–24 replies', hit: r => r.targetReplies != null && r.targetReplies >= 10 && r.targetReplies < 25 },
  { label: '25–49 replies', hit: r => r.targetReplies != null && r.targetReplies >= 25 && r.targetReplies < 50 },
  { label: '50+ replies', hit: r => r.targetReplies != null && r.targetReplies >= 50 },
];

const byHandle = {};
for (const r of rows) (byHandle[r.handle] = byHandle[r.handle] || []).push(r);
const creators = Object.entries(byHandle).map(([handle, rs]) => {
  const m = rs.filter(r => r.impressions != null);
  const c = rs.filter(r => r.capture != null);
  return {
    handle, replies: rs.length, measured: m.length, withTarget: c.length,
    totalImpressions: m.reduce((a, r) => a + r.impressions, 0),
    medianImpressions: med(m.map(r => r.impressions)),
    medianCapture: med(c.map(r => r.capture)),
    conversations: rs.reduce((a, r) => a + r.replies, 0),
    likes: rs.reduce((a, r) => a + r.likes, 0),
  };
}).sort((a, b) => (b.medianCapture ?? -1) - (a.medianCapture ?? -1) || b.totalImpressions - a.totalImpressions);

const buckets = BUCKETS.map(b => {
  const rs = withTarget.filter(b.hit);
  return { bucket: b.label, replies: rs.length, medianCapture: med(rs.map(r => r.capture)), medianImpressions: med(rs.map(r => r.impressions)) };
});

const overall = {
  replies: rows.length, measured: measured.length, withTargetData: withTarget.length,
  medianImpressions: med(measured.map(r => r.impressions)),
  medianCapture: med(withTarget.map(r => r.capture)),
  totalImpressions: measured.reduce((a, r) => a + r.impressions, 0),
  conversations: rows.reduce((a, r) => a + r.replies, 0),
};

if (asJson) { console.log(JSON.stringify({ overall, creators, buckets, minN }, null, 2)); process.exit(0); }

const out = [];
out.push(`# Reply performance — ${new Date().toISOString().slice(0, 10)}`, '');
out.push(`${overall.replies} replies logged · ${overall.measured} with impressions · ${overall.withTargetData} with target data (capture rate).`);
out.push(`Median ${n0(overall.medianImpressions)} impressions · median capture ${pctFmt(overall.medianCapture)} · ${overall.totalImpressions} total impressions · ${overall.conversations} replies back.`);
if (overall.withTargetData === 0) {
  out.push('', 'No line carries a `target` block yet, so capture rate is not measurable — only raw impressions are, and those mostly track creator size. The `target` block is written by the engagement task at reply time from 2026-09-19 on.');
}
out.push('', '## By thread crowding (how many replies were already there when we arrived)', '');
out.push('| existing replies | our replies | median capture | median impressions |', '|---|---|---|---|');
for (const b of buckets) out.push(`| ${b.bucket} | ${b.replies} | ${pctFmt(b.medianCapture)} | ${n0(b.medianImpressions)} |`);
if (withTarget.length < minN) out.push('', `Fewer than ${minN} replies carry target data, so this table is a hypothesis, not a finding — do not re-target the reply budget on it yet.`);

out.push('', '## By creator', '');
out.push('| creator | replies | measured | median capture | median impr. | total impr. | replies back |', '|---|---|---|---|---|---|---|');
for (const c of creators) out.push(`| @${c.handle} | ${c.replies} | ${c.measured} | ${pctFmt(c.medianCapture)} | ${n0(c.medianImpressions)} | ${c.totalImpressions} | ${c.conversations} |`);

// Only creators that clear the standing bar (n >= minN measured, >= 2x off the median) get named.
const base = overall.medianImpressions;
const flagged = creators.filter(c => c.measured >= minN && base && c.medianImpressions != null && (c.medianImpressions <= base / 2 || c.medianImpressions >= base * 2));
out.push('', '## Recommendations', '');
if (!flagged.length) out.push(`No creator clears the bar yet (n ≥ ${minN} measured replies and a ≥ 2× difference from the ${n0(base)}-impression median). Everything above is descriptive; keep the current allocation.`);
for (const c of flagged) {
  const weak = c.medianImpressions <= base / 2;
  out.push(`- @${c.handle}: ${c.replies} replies, median ${n0(c.medianImpressions)} impressions vs the ${n0(base)} median — ${weak ? 'cut the allocation' : 'worth more of the budget'} (n=${c.measured}).`);
}
console.log(out.join('\n'));

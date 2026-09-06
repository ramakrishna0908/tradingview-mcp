/**
 * Financial-compliance validation for generated X posts.
 *
 * Every check returns an issue { code, severity: 'block' | 'warn', message }.
 * Blocking issues stop approval and publishing. All wording lists, the
 * disclosure, and the freshness limit come from config/social-compliance.json.
 */
import { createHash } from 'node:crypto';
import { SIGNAL } from './setup.js';

// ─── X weighted length ───────────────────────────────────────────────────────
// X counts code points in a few "cheap" ranges as 1 and everything else
// (emoji, CJK, most symbols) as 2. URLs are normalised to 23 regardless of
// length. This mirrors twitter-text's default configuration (v3).

const CHEAP_RANGES = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
const URL_RE = /https?:\/\/[^\s]+|(?:^|\s)(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ai|gov|edu)(?:\/[^\s]*)?/gi;

export function xWeightedLength(text) {
  const normalised = text.normalize('NFC');
  let total = 0;
  let rest = normalised.replace(URL_RE, m => {
    total += 23 + (m.startsWith(' ') ? 1 : 0);
    return m.startsWith(' ') ? ' ' : '';
  });
  // The replaced leading-space placeholder was already counted above.
  rest = rest.replace(/^ /, '');
  for (const ch of rest) {
    const cp = ch.codePointAt(0);
    const cheap = CHEAP_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
    total += cheap ? 1 : 2;
  }
  return total;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function normalizeForDedupe(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function textHash(text) {
  return createHash('sha256').update(normalizeForDedupe(text)).digest('hex');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRe(phrase) {
  // Word-bounded, whitespace-tolerant, case-insensitive.
  const body = phrase.trim().split(/\s+/).map(escapeRe).join('\\s+');
  return new RegExp(`(?<![\\w$])${body}(?![\\w])`, 'i');
}

function money(v) {
  return v == null ? null : Number(v.toFixed(2));
}

export function isHashtagLine(line) {
  const l = line.trim();
  return l.length > 0 && l.split(/\s+/).every(w => /^#[A-Za-z0-9_]+$/.test(w));
}

/** All numeric values the post is allowed to cite, from the report row/setup. */
export function allowedNumbers(setup, row) {
  const vals = new Set();
  const add = v => { if (v != null && Number.isFinite(v)) vals.add(money(v)); };
  add(row?.price ?? setup.price);
  add(row?.bbLower); add(row?.bbBasis); add(row?.bbUpper);
  add(row?.vwap); add(row?.cloudA); add(row?.cloudB); add(row?.atr);
  add(setup.support?.value); add(setup.resistance?.value);
  add(setup.nextSupport?.value); add(setup.nextResistance?.value);
  return vals;
}

// ─── validation ──────────────────────────────────────────────────────────────

/**
 * @param {string} text            post text
 * @param {object} ctx
 * @param {object} ctx.setup       classified setup (from classifySetup)
 * @param {object} ctx.row         raw report row
 * @param {object} ctx.model       report model (for dataAsOf)
 * @param {object} ctx.config      compliance config
 * @param {Date}   [ctx.now]
 * @param {Array}  [ctx.priorRecords]   audit records to check duplicates against
 * @param {string} [ctx.draftId]        current draft id (excluded from dedupe)
 * @param {boolean}[ctx.staleAcknowledged]
 */
export function validatePost(text, ctx) {
  const { setup, row, model, config } = ctx;
  const now = ctx.now ?? new Date();
  const issues = [];
  const push = (code, severity, message) => issues.push({ code, severity, message });
  const t = text ?? '';

  // 1. character limit
  const len = xWeightedLength(t);
  if (len > config.charLimit) push('char_limit', 'block', `Post is ${len}/${config.charLimit} weighted characters`);
  if (!t.trim()) push('empty', 'block', 'Post is empty');

  // 2. prohibited / promotional wording
  for (const phrase of config.prohibitedPhrases ?? []) {
    if (phraseRe(phrase).test(t)) push('prohibited_wording', 'block', `Prohibited phrase: "${phrase}"`);
  }
  for (const pat of config.personalizedAdvicePatterns ?? []) {
    if (new RegExp(pat, 'i').test(t)) push('personalized_advice', 'block', `Reads as personalized advice (pattern ${pat})`);
  }
  if (/🚀|💎|🙌/u.test(t)) push('promotional_emoji', 'warn', 'Promotional emoji (🚀/💎/🙌) discouraged');

  // 3. disclosure
  const disclosure = config.disclosure.trim();
  const lines = t.trimEnd().split('\n');
  const lastNonTagLine = [...lines].reverse().find(l => !isHashtagLine(l)) ?? '';
  if (config.disclosurePlacement !== 'bio') {
    if (!t.includes(disclosure)) push('missing_disclosure', 'block', `Required disclosure missing: "${disclosure}"`);
    else if (lastNonTagLine.trim() !== disclosure) push('disclosure_position', 'warn', 'Disclosure should be the final line (a hashtag-only line may follow it)');
  }

  // 3b. hashtags — required tags present, nothing promotional, not spammy
  const tags = [...t.matchAll(/(?<![\w&])#([A-Za-z0-9_]+)/g)].map(m => '#' + m[1]);
  const tagSet = new Set(tags.map(x => x.toLowerCase()));
  for (const req of config.hashtags?.required ?? []) {
    if (!tagSet.has(req.toLowerCase())) push('missing_hashtag', 'block', `Required hashtag missing: ${req}`);
  }
  for (const bad of config.hashtags?.prohibited ?? []) {
    if (tagSet.has(bad.toLowerCase())) push('prohibited_hashtag', 'block', `Prohibited hashtag: ${bad}`);
  }
  if (config.hashtags?.maxTotal && tags.length > config.hashtags.maxTotal) {
    push('too_many_hashtags', 'warn', `${tags.length} hashtags (max ${config.hashtags.maxTotal})`);
  }

  // 4. stale data
  const asOf = model?.dataAsOf ? new Date(model.dataAsOf) : null;
  if (!asOf || Number.isNaN(asOf.getTime())) {
    push('missing_data_timestamp', 'block', 'Report model has no data timestamp');
  } else {
    const ageH = (now - asOf) / 3600_000;
    if (ageH > config.maxReportAgeHours) {
      const msg = `Report data is ${ageH.toFixed(1)}h old (limit ${config.maxReportAgeHours}h)`;
      if (ctx.staleAcknowledged) push('stale_data_acknowledged', 'warn', `${msg} — publishing with explicit acknowledgement`);
      else push('stale_data', 'block', msg);
    }
  }

  // 5. unsupported claims / projections presented as fact
  for (const pat of config.unsupportedClaimPatterns ?? []) {
    if (new RegExp(pat, 'i').test(t)) push('unsupported_claim', 'block', `Unsupported/forward-looking claim (pattern ${pat})`);
  }

  // 6. duplicates
  const hash = textHash(t);
  for (const rec of ctx.priorRecords ?? []) {
    if (rec.id === ctx.draftId) continue;
    const live = ['approved', 'published', 'publishing'].includes(rec.status);
    if (rec.textHash === hash && live) push('duplicate_post', 'block', `Identical text already ${rec.status} (${rec.id})`);
    else if (live && rec.symbol === setup?.symbol && rec.reportDate === model?.reportDate) {
      push('duplicate_post', 'block', `${setup.symbol} already ${rec.status} for report ${model.reportDate} (${rec.id})`);
    }
  }

  // 7. required indicators
  for (const ind of config.requiredIndicators ?? []) {
    if (!new RegExp(`\\b${escapeRe(ind)}\\b`, 'i').test(t)) push('missing_indicator', 'block', `Missing indicator: ${ind}`);
  }
  if (config.requireSupportOrResistance && !/\b(support|resistance)\b/i.test(t)) {
    push('missing_indicator', 'block', 'Missing support/resistance level');
  }

  // 8. ticker / numeric value integrity
  if (setup && row) {
    const cashtags = [...t.matchAll(/\$([A-Z]{1,6})\b/g)].map(m => m[1]);
    if (!cashtags.includes(setup.symbol)) push('ticker_mismatch', 'block', `Post does not mention $${setup.symbol}`);
    for (const tag of new Set(cashtags)) {
      if (tag !== setup.symbol) push('ticker_mismatch', 'block', `Unexpected ticker $${tag} (setup is $${setup.symbol})`);
    }
    const priceMatch = t.match(/Price:?\s*\$?([\d,]+(?:\.\d+)?)/i);
    if (!priceMatch) push('price_mismatch', 'block', 'No "Price:" value found');
    else if (Math.abs(Number(priceMatch[1].replace(/,/g, '')) - row.price) > 0.005) {
      push('price_mismatch', 'block', `Price ${priceMatch[1]} does not match report price ${row.price}`);
    }
    const allowed = allowedNumbers(setup, row);
    for (const m of t.matchAll(/\$([\d,]+\.\d{1,2})\b/g)) {
      const v = Number(m[1].replace(/,/g, ''));
      if (![...allowed].some(a => Math.abs(a - v) < 0.006)) {
        push('value_mismatch', 'block', `Dollar value $${m[1]} is not a level from the report`);
      }
    }
    const rsiMatch = t.match(/RSI:?\s*([\d.]+)/i);
    if (rsiMatch && row.rsi != null && Math.abs(Number(rsiMatch[1]) - row.rsi) > 0.55) {
      push('value_mismatch', 'block', `RSI ${rsiMatch[1]} does not match report RSI ${row.rsi}`);
    }
    const cmfMatch = t.match(/CMF:?\s*([+\-−]?\d*\.\d+)/i);
    if (cmfMatch && row.cmf != null && Math.abs(Number(cmfMatch[1].replace('−', '-')) - row.cmf) > 0.006) {
      push('value_mismatch', 'block', `CMF ${cmfMatch[1]} does not match report CMF ${row.cmf}`);
    }

    // 9. signal integrity — never upgrade WATCH to CONFIRMED for engagement
    const claimsConfirmed = /\bconfirmed\s+(setup|breakout|breakdown|move)\b/i.test(t.split('\n')[0] ?? '');
    if (setup.signal === SIGNAL.WATCH && claimsConfirmed) {
      push('signal_upgraded', 'block', 'Post labels a WATCH as confirmed — signal may not be upgraded');
    }
    if (setup.signal === SIGNAL.CONFIRMED && !/\bconfirmed\b/i.test(t)) {
      push('signal_label', 'warn', 'Confirmed setup is not labelled as such');
    }
    if (setup.signal === SIGNAL.WATCH && !/\bwatch\b/i.test(t)) {
      push('signal_label', 'block', 'WATCH setups must be labelled as a watch');
    }
  }

  // 10. balanced presentation: risk context + timestamp
  if (config.requireRiskContext) {
    const kws = config.riskContextKeywords ?? [];
    const body = t.replace(disclosure, '').toLowerCase(); // the disclosure's "risk" does not count
    if (!kws.some(k => body.includes(k.toLowerCase()))) {
      push('missing_risk_context', 'block', 'No downside/invalidation context in the post');
    }
  }
  if (config.requireDataTimestamp && !/\bData:\s*(?:[\w]+ · )?\w{3} \d{1,2}, 20\d\d/i.test(t)) {
    push('missing_timestamp', 'block', 'Missing "Data: <date>" line');
  }

  return issues;
}

export function blocking(issues) {
  return issues.filter(i => i.severity === 'block');
}

export function isPublishable(issues) {
  return blocking(issues).length === 0;
}

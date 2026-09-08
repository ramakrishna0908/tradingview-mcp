/**
 * Financial-compliance validation for generated X posts.
 *
 * Every check returns an issue { code, severity: 'block' | 'warn', message }.
 * Blocking issues stop approval and publishing. All wording lists, the
 * disclosure, and the freshness limit come from config/social-compliance.json.
 */
import { createHash } from 'node:crypto';
import { SIGNAL } from './setup.js';
import { priceDecimals, roundPrice } from './money.js';

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
  return v == null ? null : roundPrice(v);
}

/**
 * How far a quoted value may sit from a report value before it is a mismatch.
 * A post prints each price rounded to `priceDecimals`, so anything within half
 * a unit of the last shown decimal is the same number. Values at two decimals
 * (every stock) keep the original fixed tolerances.
 */
export function valueTolerance(v, floor) {
  const d = priceDecimals(v);
  return d <= 2 ? floor : 0.5 * Math.pow(10, -d) + 1e-12;
}

/**
 * Tolerance for a value as it was PRINTED. "$2,579" (no decimals) is the
 * report's 2,578.88 rounded for display, so anything within half a dollar is
 * that level; "$0.090922" (six decimals) must match to half a millionth. This
 * is what lets the compact sweep format round for readability without the
 * integrity check losing its teeth: the number must still round FROM a report
 * value, not merely be near one.
 */
export function shownTolerance(shown, floor) {
  const m = String(shown).match(/\.(\d+)$/);
  const d = m ? m[1].length : 0;
  const half = 0.5 * Math.pow(10, -d) + 1e-9;
  return d <= 2 ? Math.max(floor, half) : half;
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
  for (const x of setup.extraLevels ?? []) add(x?.value ?? x);
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
 * @param {object} [ctx.chart]          chart record ({ volumeRatio }) backing a Volume line
 */
export function validatePost(text, ctx) {
  const { setup, row, model, config } = ctx;
  const kind = ctx.kind ?? 'setup'; // 'setup' | 'followup' | 'scorecard' | 'education' | 'video' | 'premarket'
  const educational = kind === 'education' || kind === 'video'; // concept posts: no ticker, no levels, no data line
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
    // A follow-up is dated by the bar that triggered it, and the next run after
    // a Friday close is Monday morning — so follow-ups carry their own window
    // (followUps.maxEventAgeHours, default long enough for a holiday weekend).
    const limit = kind === 'followup' ? (config.followUps?.maxEventAgeHours ?? config.maxReportAgeHours) : config.maxReportAgeHours;
    if (ageH > limit) {
      const msg = `Report data is ${ageH.toFixed(1)}h old (limit ${limit}h)`;
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

  // 7. required indicators — a follow-up or scorecard has no fresh RSI/CMF
  // reading to cite, so only the price is required there.
  const requiredIndicators = kind === 'setup' ? (config.requiredIndicators ?? []) : kind === 'followup' ? ['Price'] : [];
  // An educational explainer teaches a concept; it must not read as a call on
  // a specific name, so no cashtags at all.
  if (educational && /\$[A-Z]{1,6}\b/.test(t)) push('ticker_in_education', 'block', 'Educational posts must not name a ticker');
  for (const ind of requiredIndicators) {
    if (!new RegExp(`\\b${escapeRe(ind)}\\b`, 'i').test(t)) push('missing_indicator', 'block', `Missing indicator: ${ind}`);
  }
  // The post must name a price level with its role. Classic: the words
  // support/resistance. Sweep: the "Above/Below $X →" level lines. Each format
  // keeps its own structural test so neither is loosened for the other.
  const namesLevel = kind === 'scorecard' || educational ? true
    : kind === 'premarket' ? /\b\d[\d,]*(?:\.\d+)? above \(.+?\) · \d[\d,]*(?:\.\d+)? below \(/.test(t)
    : kind === 'followup' ? /\$[\d,]+(?:\.\d+)? (cleared|lost|intraday)|\b(Above|Below|above|below) \$[\d,]+(?:\.\d+)?/.test(t)
    : config.postFormat === 'sweep'
      ? /\b(Above|Below) \$[\d,]+(?:\.\d+)? →/.test(t)
      : /\b(support|resistance)\b/i.test(t);
  if (config.requireSupportOrResistance && !namesLevel) {
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
    else if (Math.abs(Number(priceMatch[1].replace(/,/g, '')) - row.price) > Math.max(valueTolerance(row.price, 0.005), shownTolerance(priceMatch[1], 0.005))) {
      push('price_mismatch', 'block', `Price ${priceMatch[1]} does not match report price ${row.price}`);
    }
    const allowed = allowedNumbers(setup, row);
    for (const m of t.matchAll(/\$([\d,]+(?:\.\d+)?)\b/g)) {
      const v = Number(m[1].replace(/,/g, ''));
      const tol = shownTolerance(m[1], 0.006);
      if (![...allowed].some(a => Math.abs(a - v) < Math.max(tol, valueTolerance(a, 0.006)))) {
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

    const deltaMatch = t.match(/\(([+−-])(\d\.\d\d) vs prior day\)/);
    if (deltaMatch) {
      const v = (deltaMatch[1] === '+' ? 1 : deltaMatch[1] === '±' ? 0 : -1) * Number(deltaMatch[2]);
      if (setup.cmfDelta == null) push('value_mismatch', 'block', 'Post cites a prior-day CMF change but no prior report is available');
      else if (Math.abs(v - setup.cmfDelta) > 0.006) push('value_mismatch', 'block', `CMF change ${deltaMatch[1]}${deltaMatch[2]} does not match the report-derived ${setup.cmfDelta}`);
    }

    const volMatch = t.match(/(?:Volume:?|RVOL:?)\s*(\d+(?:\.\d+)?)×/);
    if (volMatch) {
      const v = Number(volMatch[1]);
      if (ctx.chart?.volumeRatio == null) push('value_mismatch', 'block', 'Post cites a volume ratio but no chart data backs it');
      else if (Math.abs(v - ctx.chart.volumeRatio) > 0.06) push('value_mismatch', 'block', `Volume ratio ${v}× does not match the chart data ${ctx.chart.volumeRatio}×`);
    }

    const scoreMatch = t.match(/Setup score:?\s*([+\-−]?\d+(?:\.\d+)?)/i);
    if (scoreMatch) {
      const v = Number(scoreMatch[1].replace('−', '-'));
      if (row.score == null || Math.abs(v - row.score) > 0.06) push('value_mismatch', 'block', `Setup score ${scoreMatch[1]} does not match the report score ${row.score}`);
    }

    // 9. signal integrity — never upgrade WATCH to CONFIRMED for engagement.
    // The word "confirmed" in the headline is reserved for CONFIRMED signals in
    // any phrasing ("Confirmed Setup", "reclaim confirmed", "RECLAIM CONFIRMED").
    const headline = t.split('\n')[0] ?? '';
    const claimsConfirmed = /\bconfirmed\b/i.test(headline);
    if (kind === 'followup') {
      // A follow-up is labelled by its lifecycle stage; "confirmed" may appear
      // only once the setup has actually reached CONFIRMED or BREAKOUT.
      const stage = setup.stage ?? ctx.stage ?? null;
      if (claimsConfirmed && !['CONFIRMED', 'BREAKOUT'].includes(stage)) {
        push('signal_upgraded', 'block', `Follow-up at stage ${stage} may not say "confirmed"`);
      }
      if (!/\b(DEVELOPING|CONFIRMED|BREAKOUT UPDATE|BREAKDOWN UPDATE|LEVEL TEST|INVALIDATED)\b/.test(headline)) {
        push('signal_label', 'block', 'Follow-up headline must carry its lifecycle label');
      }
    } else {
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
  }

  // 9c. scorecard integrity — every published count must equal the tracker's.
  if (kind === 'scorecard' && ctx.scorecard) {
    const st = ctx.scorecard;
    const check = (label, re, expected) => {
      const m = t.match(re);
      if (!m) { push('value_mismatch', 'block', `Scorecard is missing "${label}"`); return; }
      if (Number(m[1]) !== Number(expected)) push('value_mismatch', 'block', `Scorecard ${label} ${m[1]} does not match the tracker (${expected})`);
    };
    check('Setups posted', /Setups posted:\s*(\d+)/, st.posted);
    check('Breakouts', /levels reached:\s*(\d+)/, st.breakouts);
    check('Invalidated', /Invalidated:\s*(\d+)/, st.invalidated);
    check('Still active', /Still active:\s*(\d+)/, st.active);
    if (st.hitRate != null) check('Hit rate', /Hit rate this week:\s*(\d+)%/, st.hitRate);
    if (st.allTime?.hitRate != null) check('All-time hit rate', /All-time: \d+ setups · (\d+)% hit rate/, st.allTime.hitRate);
  }

  // 9d. premarket integrity — the bias word, the confidence score and the
  // SPY levels must be the report's; the short disclaimer is part of the format.
  if (kind === 'premarket' && ctx.premarket) {
    const pm = ctx.premarket;
    const headline = t.split('\n')[0] ?? '';
    const words = ['BULLISH', 'NEUTRAL', 'BEARISH'];
    const want = String(pm.bias ?? '').toUpperCase();
    if (!headline.includes(want)) push('value_mismatch', 'block', `Headline does not carry the report bias ${want}`);
    for (const w of words) if (w !== want && headline.includes(w)) push('value_mismatch', 'block', `Headline names ${w} but the report bias is ${want}`);
    const cm = t.match(/confidence (\d+)\/100/i);
    if (!cm) push('value_mismatch', 'block', 'Missing "confidence N/100"');
    else if (Number(cm[1]) !== Number(pm.confidence)) push('value_mismatch', 'block', `Confidence ${cm[1]} does not match the report (${pm.confidence})`);
    const lm = t.match(/SPY levels: ([\d,.]+) above .*? · ([\d,.]+) below/);
    if (lm && Array.isArray(pm.levels) && pm.levels.length === 2) {
      const [r, sp] = pm.levels.map(Number);
      if (Math.abs(Number(lm[1].replace(/,/g, '')) - r) > 0.011 || Math.abs(Number(lm[2].replace(/,/g, '')) - sp) > 0.011) push('value_mismatch', 'block', `SPY levels ${lm[1]}/${lm[2]} do not match the report (${r}/${sp})`);
    }
    if (!t.includes('Educational market analysis only. Not investment advice.')) push('missing_disclosure', 'block', 'Premarket post must carry "Educational market analysis only. Not investment advice."');
  }

  // 9b. the chart is part of the post when the policy says so. With the
  // disclosure in the bio and no marker hashtags, the chart card is the only
  // place the disclaimer appears — so a draft with no rendered chart must not
  // be approvable, queueable for the browser poster, or recordable. This is
  // checked here, not only in publish(), so the browser path (via: 'browser')
  // is covered too.
  if (config.charts?.enabled && config.charts?.requireForPublish && !ctx.chart?.path) {
    push('missing_chart', 'block', `Chart is required for publishing but none was rendered${ctx.chart?.error ? ` (${ctx.chart.error})` : ''}`);
  }

  // 10. balanced presentation: risk context + timestamp
  if (config.requireRiskContext && !educational) {
    const kws = config.riskContextKeywords ?? [];
    const body = t.replace(disclosure, '').toLowerCase(); // the disclosure's "risk" does not count
    if (!kws.some(k => body.includes(k.toLowerCase()))) {
      push('missing_risk_context', 'block', 'No downside/invalidation context in the post');
    }
  }
  if (config.requireDataTimestamp && !educational && !/\bData:\s*(?:[\w]+ · )?\w{3} \d{1,2}, 20\d\d/i.test(t)) {
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

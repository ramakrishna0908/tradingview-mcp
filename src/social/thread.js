/**
 * Thread replies and the close-of-day check.
 *
 * THREAD ("Also on today's sweep"): the day's surplus quality setups are not
 * posted as standalone tweets — the cap is one hero setup per run — but as
 * short replies under the hero post. Each reply is a compressed setup card:
 * headline, the two levels, price · RSI · CMF, one hashtag. They pass the same
 * validator as a setup (kind 'thread': ticker, price, level and indicator
 * integrity, signal never upgraded) and are NOT tracked or scored — they are
 * "also on the sweep" mentions, and the text says so.
 *
 * CLOSE UPDATE ("3:50 PM close check"): a reply under the morning hero post
 * with the last traded price vs the setup price and the state of the 🎯/🛑
 * levels so far that day. It answers the morning question before the bell
 * without pre-empting the daily close: level outcomes are only ever settled
 * on closes by the tracker, and the text says that too.
 */
import { fmtPrice } from './money.js';
import { fmtCmf } from './setup.js';
import { sweepLabels, sweepLevels } from './sweep-labels.js';
import { formatDataTimestamp } from './generate.js';
import { xWeightedLength } from './compliance.js';

function tagLine(symbol, config) {
  const h = config.hashtags ?? {};
  const out = [...(h.required ?? [])];
  if (h.symbolTag) out.push(`#${symbol}`);
  if (h.assetTag) out.push(h.assetTag);
  return out.slice(0, h.maxTotal ?? 6).join(' ') || null;
}

/**
 * Reply text for one surplus setup. Layout:
 *
 *   Also on today's sweep: $MSTR is holding above its 20-day base — trend confirmed.
 *   🎯 Above $149.20 → potential breakout · 🛑 Below $124.70 → setup invalidated
 *   Price: $139.87 · RSI 64 · CMF +0.20
 *   Not tracked — the hero setup above is today's scored call.
 *   Data: daily · Sep 8, 2026 9:57 AM ET
 *   #MSTR
 */
export function generateThreadReply(setup, model, config, { index = 1 } = {}) {
  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const $ = v => fmtPrice(v, mo);
  const words = sweepLabels(setup);
  const { target, stop } = sweepLevels(setup);
  const stamp = formatDataTimestamp(model.dataAsOf);
  const lead = index === 1 ? "Also on today's sweep:" : 'And:';
  const levels = [
    target ? `🎯 ${target.side} ${$(target.value)} → ${target.outcome}` : null,
    stop ? `🛑 ${stop.side} ${$(stop.value)} → ${stop.outcome}` : null,
  ].filter(Boolean).join(' · ');
  const lines = [
    `${lead} $${setup.symbol} ${words.headline}`,
    levels || null,
    `Price: ${$(setup.price)} · RSI ${setup.rsi.toFixed(0)} · CMF ${fmtCmf(setup.cmf)}`,
    'Not tracked — the setup above is today\'s scored call; this one is a watch from the same sweep.',
    `Data: daily · ${stamp}`,
    config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    tagLine(setup.symbol, config),
  ];
  const text = lines.filter(Boolean).join('\n');
  return { text, length: xWeightedLength(text) };
}

// ─── close-of-day check ──────────────────────────────────────────────────────

/** Where each level stands so far today, from the session's high/low and last. */
export function levelStatus(tr, quote) {
  const bull = tr.direction !== 'bearish';
  const reached = lvl => (bull ? quote.high >= lvl : quote.low <= lvl);
  const lost = lvl => (bull ? quote.low <= lvl : quote.high >= lvl);
  return {
    target: tr.target ? (reached(tr.target.value) ? (bull ? quote.last > tr.target.value : quote.last < tr.target.value) ? 'trading through' : 'tagged intraday' : 'not reached') : null,
    stop: tr.stop ? (lost(tr.stop.value) ? (bull ? quote.last < tr.stop.value : quote.last > tr.stop.value) ? 'trading through' : 'tagged intraday' : 'intact') : null,
  };
}

/** Model-shaped object for validation: the quote time is the data timestamp. */
export function closeUpdateModel(tr, quote) {
  return { reportDate: quote.date, dataAsOf: quote.asOf, timeframe: 'D', rows: [] };
}

/** Setup-shaped object for validation/chart (price = last trade; levels = the original 🎯/🛑). */
export function closeUpdateSetup(tr, quote) {
  const bull = tr.direction !== 'bearish';
  return {
    symbol: tr.symbol,
    direction: tr.direction,
    signal: tr.signal,
    setup: tr.setupName,
    score: tr.score,
    price: quote.last,
    rsi: null, cmf: null,
    resistance: bull ? tr.target : tr.stop,
    support: bull ? tr.stop : tr.target,
    nextResistance: bull ? tr.nextTarget : null,
    nextSupport: bull ? null : tr.nextTarget,
    extraLevels: [tr.entryPrice, quote.high, quote.low].filter(v => v != null).map(value => ({ value })),
    stage: tr.stage,
  };
}

export function closeUpdateRow(tr, quote) {
  return { symbol: tr.symbol, price: quote.last, score: tr.score, rsi: null, cmf: null, flags: '', biasNext: '' };
}

function pctStr(from, to) {
  if (!from) return null;
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}

/**
 * Close-check text. Layout:
 *
 *   ⏱ $CRCL — CLOSE CHECK. Last $97.20 at 3:50 PM ET (+1.4% from $95.86 at the setup).
 *   🎯 $104.40: not reached · 🛑 $89.00: intact
 *   Levels only count on the daily close — if one closes through, the update posts tomorrow morning.
 *   Does it close above $104.40 or hold $89.00 into the bell? 👇
 *   Data: intraday · Sep 8, 2026 3:50 PM ET
 *   #CRCL
 */
export function generateCloseUpdate(tr, quote, config) {
  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const $ = v => fmtPrice(v, mo);
  const st = levelStatus(tr, quote);
  const move = pctStr(tr.entryPrice, quote.last);
  const stamp = formatDataTimestamp(quote.asOf);
  const timeOnly = stamp.replace(/^\w{3} \d{1,2}, 20\d\d /, '');
  const bull = tr.direction !== 'bearish';
  const lines = [
    `⏱ $${tr.symbol} — CLOSE CHECK. Price: ${$(quote.last)} at ${timeOnly}${move ? ` (${move} from ${$(tr.entryPrice)} at the setup)` : ''}.`,
    [tr.target ? `🎯 ${$(tr.target.value)}: ${st.target}` : null, tr.stop ? `🛑 ${$(tr.stop.value)}: ${st.stop}` : null].filter(Boolean).join(' · ') || null,
    `Session range ${$(quote.low)}–${$(quote.high)}. Levels only count on the daily close — if one closes through, the update posts next morning.`,
    tr.target && tr.stop ? `Does it close ${bull ? 'above' : 'below'} ${$(tr.target.value)} or ${bull ? 'hold' : 'stay under'} ${$(tr.stop.value)} into the bell? 👇` : null,
    `Data: intraday · ${stamp}`,
    config.disclosurePlacement === 'bio' ? null : config.disclosure.trim(),
    tagLine(tr.symbol, config),
  ];
  const text = lines.filter(Boolean).join('\n');
  return { text, length: xWeightedLength(text), status: st };
}

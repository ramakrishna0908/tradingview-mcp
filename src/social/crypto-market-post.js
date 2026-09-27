/**
 * The daily crypto market-read post, built from the nightly crypto sweep
 * (docs/reports/crypto/daily-<date>.html → report model). It is the market
 * context that runs ahead of the day's one setup post.
 *
 * Layout (every number comes from the report model, nothing is typed by hand):
 *   tone + breadth · BTC line · ETH line · BTC levels + what negates the read ·
 *   money flow · leaders / laggards · CTA · short disclaimer · Data line ·
 *   0–2 hashtags
 *
 * Compliance re-checks the finished text against the same model (kind
 * 'cryptomarket'): the tone word, the breadth count and the BTC level numbers
 * must be the report's, and the short disclaimer must be present.
 */
import { formatDataTimestamp } from './generate.js';
import { xWeightedLength } from './compliance.js';
import { fmtPrice } from './money.js';
import { shortSession, longSession } from './premarket-post.js';

export const CRYPTO_MARKET_DISCLAIMER = 'Educational market analysis only. Not investment advice.';
export const TONES = Object.freeze(['RISK-ON', 'MIXED', 'RISK-OFF']);
const ICON = Object.freeze({ 'RISK-ON': '🟢', 'RISK-OFF': '🔴', MIXED: '🟡' });
const COLOR = Object.freeze({ 'RISK-ON': 'green', 'RISK-OFF': 'red', MIXED: 'amber' });
const STRUCTURE = { 'HH-up': 'higher highs', 'LL-down': 'lower lows', Rng: 'ranging', diverge: 'diverging' };

const usable = r => Number.isFinite(r?.price) && Number.isFinite(r?.bbBasis);

/** The numbers the post and the card are built from. */
export function marketStats(model) {
  const rows = (model.rows ?? []).filter(usable);
  const n = rows.length;
  const above = rows.filter(r => r.price > r.bbBasis).length;
  const cmfPos = rows.filter(r => Number.isFinite(r.cmf) && r.cmf > 0).length;
  const avgScore = n ? rows.reduce((s, r) => s + (Number(r.score) || 0), 0) / n : 0;
  const breadthPct = n ? Math.round((100 * above) / n) : 0;
  const find = sym => rows.find(r => r.symbol === sym) ?? null;
  // BTC leads the tape: a one-sided tone also needs BTC on that side of its basis.
  const btc = find('BTC');
  const btcUp = btc ? btc.price > btc.bbBasis : null;
  const tone = breadthPct >= 60 && avgScore > 0 && btcUp !== false ? 'RISK-ON' : breadthPct <= 40 && avgScore < 0 && btcUp !== true ? 'RISK-OFF' : 'MIXED';
  const ranked = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.cmf ?? 0) - (a.cmf ?? 0) || a.symbol.localeCompare(b.symbol));
  const leaders = ranked.filter(r => (r.score ?? 0) > 0).slice(0, 3).map(r => r.symbol);
  const laggards = ranked.filter(r => (r.score ?? 0) < 0 && !leaders.includes(r.symbol)).slice(-3).reverse().map(r => r.symbol);
  return { n, above, cmfPos, avgScore, breadthPct, tone, leaders, laggards, btc, eth: find('ETH') };
}

const money = config => v => fmtPrice(v, { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' });
const shown = s => Number(String(s).replace(/[$,]/g, ''));

function coinLine(sym, row, $) {
  if (!row) return null;
  const side = row.price > row.bbBasis ? 'above' : 'below';
  const st = STRUCTURE[row.structure] ? `${STRUCTURE[row.structure]}, ` : '';
  const rsi = Number.isFinite(row.rsi) ? ` · RSI ${row.rsi.toFixed(1)}` : '';
  return `${sym}: ${$(row.price)}${rsi} · ${st}${side} its 20-day basis ${$(row.bbBasis)}`;
}

/**
 * BTC's two levels. Above the basis the basis is the floor and the upper band
 * the ceiling; below it the basis becomes the ceiling and the lower band the floor.
 */
export function btcLevels(btc, config) {
  if (!btc || !Number.isFinite(btc.bbUpper) || !Number.isFinite(btc.bbLower)) return null;
  const $ = money(config);
  const up = btc.price > btc.bbBasis;
  const hi = up ? { v: btc.bbUpper, label: 'upper band' } : { v: btc.bbBasis, label: '20-day basis' };
  const lo = up ? { v: btc.bbBasis, label: '20-day basis' } : { v: btc.bbLower, label: 'lower band' };
  const H = $(hi.v), L = $(lo.v);
  const negate = up ? `A daily close under ${L} negates the hold.` : `A daily close back above ${H} negates the weak read.`;
  const SHORT_LABEL = { '20-day basis': 'basis' };
  const short = l => SHORT_LABEL[l] ?? l;
  return {
    text: `BTC levels: ${H} above (${hi.label}) · ${L} below (${lo.label}). ${negate}`,
    compact: `BTC levels: ${H} above (${short(hi.label)}) · ${L} below (${short(lo.label)}). ${up ? `Under ${L} negates it.` : `Back above ${H} negates it.`}`,
    above: H, below: L, aboveLabel: hi.label, belowLabel: lo.label, numbers: [shown(H), shown(L)], up,
  };
}

/**
 * Fit ladder (charLimit — 280 on an account without long posts): drop the
 * leaders line, the money-flow line and the ETH line, switch to the compact
 * headline, drop the BTC line, compact the levels line, then drop the CTA.
 * The headline (tone + breadth), the BTC levels with what negates the read,
 * the Data line, the disclosure and the tags always stay.
 */
export function generateCryptoMarketPost(model, config) {
  const cm = config.cryptoMarket ?? {};
  const tags = (cm.hashtags ?? []).slice(0, Math.min(2, config.hashtags?.maxTotal ?? 2));
  const s = marketStats(model);
  const $ = money(config);
  const lv = btcLevels(s.btc, config);
  const day = shortSession(model.reportDate);
  const parts = {
    headline: `${ICON[s.tone]} Crypto market read for ${day} — ${s.tone} (breadth ${s.above}/${s.n} above the 20-day basis)`,
    headlineCompact: `${ICON[s.tone]} Crypto read ${day} — ${s.tone} (breadth ${s.above}/${s.n})`,
    btc: coinLine('BTC', s.btc, $),
    eth: coinLine('ETH', s.eth, $),
    levels: lv?.text ?? null,
    levelsCompact: lv?.compact ?? null,
    money: `Money flow: CMF positive on ${s.cmfPos}/${s.n} coins`,
    leaders: s.leaders.length || s.laggards.length ? `Leaders: ${s.leaders.join(', ') || '—'} · Laggards: ${s.laggards.join(', ') || '—'}` : null,
    cta: 'Risk-on or risk-off from here? 👇',
    timestamp: `Data: ${formatDataTimestamp(model.dataAsOf)}`,
    // With the disclosure in the post, the policy line must be the last line before the tags.
    disclosure: config.disclosurePlacement === 'bio' ? CRYPTO_MARKET_DISCLAIMER : config.disclosure.trim(),
    tags: tags.length ? tags.join(' ') : null,
  };
  const assemble = ({ leaders = true, money = true, eth = true, compactHead = false, btc = true, compactLevels = false, cta = true } = {}) => [
    compactHead ? parts.headlineCompact : parts.headline,
    btc ? parts.btc : null,
    eth ? parts.eth : null,
    compactLevels ? parts.levelsCompact : parts.levels,
    money ? parts.money : null,
    leaders ? parts.leaders : null,
    cta ? parts.cta : null,
    parts.timestamp,
    parts.disclosure,
    parts.tags,
  ].filter(Boolean);
  const steps = [{ leaders: false }, { money: false }, { eth: false }, { compactHead: true }, { btc: false }, { compactLevels: true }, { cta: false }];
  let opts = {};
  let lines = assemble(opts);
  for (const step of steps) {
    if (xWeightedLength(lines.join('\n')) <= config.charLimit) break;
    opts = { ...opts, ...step };
    lines = assemble(opts);
  }
  return {
    text: lines.join('\n'),
    lines,
    stats: { tone: s.tone, above: s.above, n: s.n, cmfPos: s.cmfPos, levels: lv?.numbers ?? [] },
  };
}

/** Spec for the card (scripts/render-chart-sweep.py, style "premarket" with crypto labels). */
export function buildCryptoMarketSpec(model, config, outPath) {
  const s = marketStats(model);
  const $ = money(config);
  const lv = btcLevels(s.btc, config);
  const tile = (label, row) => row
    ? { label, value: $(row.price), sub: Number.isFinite(row.rsi) ? `RSI ${row.rsi.toFixed(1)}` : '', color: row.price > row.bbBasis ? 'green' : 'red' }
    : { label, value: '—', sub: '', color: 'blue' };
  const drv = (row, sym) => row && ({ text: coinLine(sym, row, $), direction: row.price > row.bbBasis ? 'supportive' : 'headwind', color: row.price > row.bbBasis ? 'green' : 'red' });
  return {
    style: 'premarket',
    out: outPath,
    width: config.charts?.width ?? 1200,
    height: config.charts?.height ?? 1000,
    brand: config.brand?.name || null,
    tagline: config.brand?.tagline || null,
    title: 'CRYPTO MARKET READ',
    session: longSession(model.reportDate),
    bias: s.tone,
    biasColor: COLOR[s.tone],
    confidence: s.breadthPct,
    confidenceLabel: 'Breadth',
    confidenceText: `${s.above}/${s.n}`,
    confidenceNote: 'coins above their 20-day basis — not a probability',
    hook: lv?.text ?? '',
    tiles: [
      tile('Bitcoin', s.btc),
      tile('Ether', s.eth),
      { label: 'Above 20-day basis', value: `${s.above}/${s.n}`, sub: `${s.breadthPct}% of the sweep`, color: COLOR[s.tone] === 'amber' ? 'blue' : COLOR[s.tone] },
      { label: 'Money flow (CMF > 0)', value: `${s.cmfPos}/${s.n}`, sub: 'coins with net inflow', color: s.cmfPos * 2 >= s.n ? 'green' : 'red' },
    ],
    driversLabel: 'MAJORS',
    drivers: [drv(s.btc, 'BTC'), drv(s.eth, 'ETH'), { text: `Money flow: CMF positive on ${s.cmfPos}/${s.n} coins`, direction: s.cmfPos * 2 >= s.n ? 'supportive' : 'headwind', color: s.cmfPos * 2 >= s.n ? 'green' : 'red' }].filter(Boolean),
    levels: lv ? { label: 'BTC', above: `${lv.above}  ·  ${lv.aboveLabel}`, below: `${lv.below}  ·  ${lv.belowLabel}` } : null,
    sectorsLabel: 'COINS',
    sectors: { strong: s.leaders, weak: s.laggards },
    event: lv ? { today: true, when: 'Daily close', title: `BTC vs ${lv.up ? lv.below : lv.above}`, text: lv.up ? `A daily close under ${lv.below} negates the hold; a close above ${lv.above} extends the move.` : `A daily close back above ${lv.above} negates the weak read; losing ${lv.below} extends it.` } : null,
    holiday: null,
    footer: `Data: ${formatDataTimestamp(model.dataAsOf)} · top crypto by market cap, daily bars`,
    source: 'Tone = breadth above the 20-day Bollinger basis plus the average sweep score.',
    disclosure: (config.cardDisclosure ?? config.disclosure).trim(),
  };
}

export function cryptoMarketAltText(model, config) {
  const s = marketStats(model);
  const $ = money(config);
  const lv = btcLevels(s.btc, config);
  const bits = [`Crypto market read for ${longSession(model.reportDate)}: ${s.tone}, ${s.above} of ${s.n} coins above their 20-day basis.`];
  const b = coinLine('BTC', s.btc, $), e = coinLine('ETH', s.eth, $);
  if (b) bits.push(`${b}.`);
  if (e) bits.push(`${e}.`);
  if (lv) bits.push(lv.text);
  bits.push(`Money flow positive on ${s.cmfPos} of ${s.n}. Leaders ${s.leaders.join(', ') || 'none'}; laggards ${s.laggards.join(', ') || 'none'}.`);
  bits.push((config.cardDisclosure ?? config.disclosure).trim());
  return bits.join(' ').slice(0, 1000);
}

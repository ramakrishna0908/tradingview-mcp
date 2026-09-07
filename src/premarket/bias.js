/**
 * Premarket bias engine.
 *
 * Eight inputs, each scored on −1…+1 and weighted, give one composite in
 * −1…+1. The composite maps to Bullish / Neutral / Bearish and the
 * confidence score says how much the inputs agree with each other — it is
 * confidence in the *read*, not a probability that the market goes up.
 *
 * Everything is a plain function of the quote set, so the same inputs
 * always give the same report and the tests can pin every threshold.
 */
import { sma, pctOver, hiLo } from './data.js';

const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const r2 = v => (v == null ? null : Number(v.toFixed(2)));

export const WEIGHTS = Object.freeze({
  futures: 3,     // ES overnight move
  breadth: 1,     // how many of ES/NQ/YM/RTY are up
  vix: 2,         // volatility level and change
  yields: 1.5,    // 10-year move (bp)
  dollar: 1,      // DXY move
  crude: 1,       // WTI move — rising oil reads as an inflation/geopolitical headwind
  trend: 2,       // SPY versus its 20- and 50-day averages
  sectors: 1,     // share of sector ETFs above their 20-day average
  crypto: 0.5,    // BTC as a 24h risk-appetite gauge
});

export const BIAS_THRESHOLD = 0.15;

// ─── component scores ────────────────────────────────────────────────────────

function futuresScore(q) {
  if (!q?.es) return null;
  const pct = q.es.changePct;
  return { score: clamp(pct / 0.75), value: pct, text: `S&P futures ${fmtPct(pct)} overnight` };
}

function breadthScore(q) {
  const xs = ['es', 'nq', 'ym', 'rty'].map(k => q[k]).filter(Boolean);
  if (!xs.length) return null;
  const up = xs.filter(x => x.changePct > 0.05).length;
  const down = xs.filter(x => x.changePct < -0.05).length;
  return { score: (up - down) / xs.length, value: `${up} up / ${down} down of ${xs.length}`, text: `${up} of ${xs.length} index futures up (${xs.map(x => `${x.name.split(' ')[0]} ${fmtPct(x.changePct)}`).join(', ')})` };
}

export function vixLevelScore(v) {
  if (v < 14) return 0.6;
  if (v < 18) return 0.2;
  if (v < 22) return -0.2;
  if (v < 28) return -0.6;
  return -1;
}

function vixScore(q) {
  if (!q?.vix) return null;
  const v = q.vix.price;
  const chg = q.vix.changePct;
  const score = clamp(vixLevelScore(v) + clamp(-chg / 8, -0.5, 0.5));
  const regime = v < 14 ? 'calm' : v < 18 ? 'contained' : v < 22 ? 'elevated' : v < 28 ? 'stressed' : 'crisis-level';
  return { score, value: v, text: `VIX ${v.toFixed(1)} (${fmtPct(chg)}) — ${regime}` };
}

function yieldsScore(q) {
  if (!q?.us10y) return null;
  const bp = q.us10y.change == null ? 0 : q.us10y.change * 100;
  const level = q.us10y.price;
  return { score: clamp(-bp / 8), value: bp, text: `10-year ${level.toFixed(2)}% (${bp >= 0 ? '+' : ''}${bp.toFixed(0)} bp)` };
}

function dollarScore(q) {
  if (!q?.dxy) return null;
  const pct = q.dxy.changePct;
  return { score: clamp(-pct / 0.5), value: pct, text: `Dollar index ${q.dxy.price.toFixed(2)} (${fmtPct(pct)})` };
}

function crudeScore(q) {
  if (!q?.wti) return null;
  const pct = q.wti.changePct;
  return { score: clamp(-pct / 2.5), value: pct, text: `WTI $${q.wti.price.toFixed(2)} (${fmtPct(pct)})` };
}

export function trendScore(q) {
  const spy = q?.spy;
  if (!spy?.candles?.length) return null;
  const s20 = sma(spy.candles, 20);
  const s50 = sma(spy.candles, 50);
  const px = spy.candles.at(-1).c;
  if (s20 == null || s50 == null) return null;
  const above20 = px > s20, above50 = px > s50;
  const score = above20 && above50 ? 1 : !above20 && above50 ? 0.25 : above20 && !above50 ? -0.25 : -1;
  const words = above20 && above50 ? 'above both its 20- and 50-day averages (uptrend intact)' : !above20 && above50 ? 'below its 20-day but above its 50-day average (pullback inside an uptrend)' : above20 && !above50 ? 'above its 20-day but below its 50-day average (bounce inside a downtrend)' : 'below both its 20- and 50-day averages (downtrend)';
  return { score, value: { close: px, sma20: s20, sma50: s50 }, text: `SPY closed ${px.toFixed(2)}, ${words}` };
}

function sectorsScore(q, sectors) {
  const xs = sectors.filter(s => s.aboveSma20 != null);
  if (!xs.length) return null;
  const above = xs.filter(s => s.aboveSma20).length;
  const f = above / xs.length;
  return { score: 2 * f - 1, value: `${above}/${xs.length}`, text: `${above} of ${xs.length} sector ETFs above their 20-day average` };
}

function cryptoScore(q) {
  if (!q?.btc) return null;
  const pct = q.btc.changePct;
  return { score: clamp(pct / 3), value: pct, text: `Bitcoin ${fmtPct(pct)} over 24h (risk-appetite gauge)` };
}

export function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

// ─── sectors ─────────────────────────────────────────────────────────────────

/**
 * Rank the sector ETFs on a blend of yesterday's move and 5-day performance
 * relative to SPY; flag whether each is above its 20-day average.
 */
export function rankSectors(quotes, sectorList) {
  const spy5 = pctOver(quotes.spy?.candles, 5) ?? 0;
  const rows = sectorList.map(inst => {
    const q = quotes[inst.key];
    if (!q) return null;
    const s20 = sma(q.candles, 20);
    const last = q.candles.at(-1)?.c ?? q.price;
    const p5 = pctOver(q.candles, 5);
    const rel5 = p5 == null ? null : Number((p5 - spy5).toFixed(2));
    const rank = (q.changePct ?? 0) * 0.5 + (rel5 ?? 0) * 0.5;
    return { key: inst.key, symbol: inst.symbol, name: inst.name, price: q.price, changePct: q.changePct, pct5d: p5, rel5d: rel5, sma20: s20, aboveSma20: s20 == null ? null : last > s20, rank: r2(rank) };
  }).filter(Boolean);
  rows.sort((a, b) => b.rank - a.rank);
  return rows;
}

// ─── levels ──────────────────────────────────────────────────────────────────

/**
 * Key levels for one instrument from its completed candles: prior-day
 * high/low/close, the 10-day range and the 20/50-day averages, split into
 * the nearest two supports below price and resistances above.
 */
export function keyLevels(q, { refPrice = null } = {}) {
  if (!q?.candles?.length) return null;
  const c = q.candles;
  const pd = c.at(-1);
  const r10 = hiLo(c, 10);
  const s20 = sma(c, 20), s50 = sma(c, 50);
  const px = refPrice ?? q.price;
  const cands = [
    { label: 'Prior-day high', value: pd.h },
    { label: 'Prior-day low', value: pd.l },
    { label: 'Prior close', value: pd.c },
    { label: '10-day high', value: r10.high },
    { label: '10-day low', value: r10.low },
    s20 != null && { label: '20-day average', value: s20 },
    s50 != null && { label: '50-day average', value: s50 },
  ].filter(Boolean);
  const support = cands.filter(l => l.value <= px).sort((a, b) => b.value - a.value);
  const resistance = cands.filter(l => l.value > px).sort((a, b) => a.value - b.value);
  const dedupe = xs => { const out = []; for (const l of xs) { if (!out.some(o => Math.abs(o.value - l.value) / px < 0.0015)) out.push(l); } return out; };
  return {
    symbol: q.symbol, name: q.name, price: px,
    priorDay: { high: pd.h, low: pd.l, close: pd.c, date: pd.t },
    range10d: r10, sma20: s20, sma50: s50,
    support: dedupe(support).slice(0, 2),
    resistance: dedupe(resistance).slice(0, 2),
  };
}

// ─── composite ───────────────────────────────────────────────────────────────

/**
 * Score the session. `events` are the day's events (for the confidence
 * penalty); `sectors` the ranked sector rows.
 */
export function scoreBias(quotes, { sectors = [], events = [], holiday = false, missing = [] } = {}) {
  const parts = {
    futures: futuresScore(quotes),
    breadth: breadthScore(quotes),
    vix: vixScore(quotes),
    yields: yieldsScore(quotes),
    dollar: dollarScore(quotes),
    crude: crudeScore(quotes),
    trend: trendScore(quotes),
    sectors: sectorsScore(quotes, sectors),
    crypto: cryptoScore(quotes),
  };
  const components = Object.entries(parts).filter(([, p]) => p).map(([key, p]) => ({ key, weight: WEIGHTS[key], score: r2(p.score), contribution: r2(p.score * WEIGHTS[key]), value: p.value, text: p.text }));
  const wsum = components.reduce((s, c) => s + c.weight, 0);
  const composite = wsum ? components.reduce((s, c) => s + c.contribution, 0) / wsum : 0;
  const bias = composite >= BIAS_THRESHOLD ? 'Bullish' : composite <= -BIAS_THRESHOLD ? 'Bearish' : 'Neutral';

  // Confidence: magnitude + agreement, minus what the calendar could undo.
  const sign = Math.sign(composite);
  let agreement;
  if (bias === 'Neutral') agreement = components.length ? components.filter(c => Math.abs(c.score) < 0.35).length / components.length : 0;
  else agreement = components.length ? components.filter(c => Math.sign(c.score) === sign && Math.abs(c.score) >= 0.1).length / components.length : 0;
  const magnitude = bias === 'Neutral' ? 1 - Math.abs(composite) / BIAS_THRESHOLD : Math.min(1, Math.abs(composite) / 0.5);
  let confidence = 20 + magnitude * 40 + agreement * 40;
  const penalties = [];
  const preOpenHigh = events.filter(e => e.impact === 'High' && e.type !== 'news' && (e.at == null || new Date(e.at).getTime() <= sessionOpen(e.date).getTime()));
  if (preOpenHigh.length) { confidence -= 15; penalties.push(`high-impact release before the open (${preOpenHigh.map(e => e.title).slice(0, 2).join(', ')})`); }
  if (events.some(e => e.kind === 'fed' && e.impact === 'High')) { confidence -= 10; penalties.push('Fed decision day'); }
  if (quotes.vix && quotes.vix.price >= 25) { confidence -= 10; penalties.push('VIX at stress levels'); }
  if (holiday) { confidence -= 10; penalties.push('holiday session — thin futures trade'); }
  if (missing.length) { confidence -= Math.min(15, 5 * missing.length); penalties.push(`missing inputs: ${missing.join(', ')}`); }
  confidence = Math.round(clamp(confidence, 5, 95));

  const drivers = [...components].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 4)
    .map(c => ({ key: c.key, direction: c.score > 0.1 ? 'supportive' : c.score < -0.1 ? 'headwind' : 'neutral', text: c.text, contribution: c.contribution }));

  return { bias, composite: Number(composite.toFixed(3)), confidence, agreement: r2(agreement), components, drivers, penalties };
}

/** 9:30 AM New York on `date`, as an instant (DST-aware). */
export function sessionOpen(date) {
  // Find the UTC offset New York uses on that date by probing noon UTC.
  const probe = new Date(`${date}T12:00:00Z`);
  const ny = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(probe);
  const offset = 12 - Number(ny); // 4 in EDT, 5 in EST
  return new Date(`${date}T${String(9 + offset).padStart(2, '0')}:30:00Z`);
}

// ─── narrative ───────────────────────────────────────────────────────────────

/** Sentences for "What investors should watch today". */
export function watchList({ bias, quotes, levels, sectors, events, laterWeek = [] }) {
  const out = [];
  const spy = levels?.spy;
  if (spy) {
    const r = spy.resistance[0], s = spy.support[0];
    if (r && s) {
      const tail = bias === 'Bullish' ? `a hold above ${s.value.toFixed(2)} keeps the bullish read; a close below it would not.`
        : bias === 'Bearish' ? `a failure at ${r.value.toFixed(2)} keeps the bearish read; a close back above it would not.`
        : `the read stays neutral inside that range; a close beyond either side sets the direction.`;
      out.push(`SPY: the first test is ${r.label.toLowerCase()} ${r.value.toFixed(2)} above and ${s.label.toLowerCase()} ${s.value.toFixed(2)} below — ${tail}`);
    }
  }
  const es = levels?.es;
  if (es?.priorDay) out.push(`ES futures: prior session high ${es.priorDay.high.toFixed(2)} / low ${es.priorDay.low.toFixed(2)} — an open outside that range that holds for the first 30 minutes usually sets the day's direction.`);
  if (quotes.vix) {
    const v = quotes.vix.price;
    out.push(v < 18 ? `VIX ${v.toFixed(1)}: a push through 18–20 would be the first sign the calm is breaking.` : v < 25 ? `VIX ${v.toFixed(1)}: below 18 would signal stress easing; above 25 would confirm it building.` : `VIX ${v.toFixed(1)}: stress regime — rallies are fragile until it drops back under 25.`);
  }
  if (quotes.us10y) {
    const y = quotes.us10y.price;
    out.push(`10-year yield ${y.toFixed(2)}%: equities have struggled on days it rises more than ~8 bp; a drop of that size is usually a tailwind for growth and small caps.`);
  }
  if (quotes.wti) out.push(`Crude $${quotes.wti.price.toFixed(2)}: a move of 2% or more either way changes the inflation and energy-sector read.`);
  if (sectors?.length >= 3) {
    const strong = sectors.slice(0, 3).map(s => s.name).join(', ');
    const weak = sectors.slice(-3).map(s => s.name).join(', ');
    out.push(`Sector leadership: strength in ${strong}; weakness in ${weak}. Rotation into defensives during a green tape is a warning sign.`);
  }
  const timed = events.filter(e => e.type === 'economic' && e.impact !== 'Low');
  if (timed.length) out.push(`Scheduled: ${timed.slice(0, 4).map(e => `${e.title} at ${e.time}`).join('; ')}.`);
  const earn = events.filter(e => e.type === 'earnings');
  if (earn.length) out.push(`Earnings: ${earn.slice(0, 5).map(e => `${e.symbol} (${e.session})`).join(', ')} — the post-report reaction sets the tone for their sectors.`);
  if (laterWeek.length) out.push(`Later this week: ${laterWeek.slice(0, 3).map(e => `${e.title} (${e.date.slice(5)})`).join('; ')}.`);
  return out;
}

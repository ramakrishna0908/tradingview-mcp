/**
 * Premarket Market Direction Report — unit tests (fixtures only, no network).
 * Run: node --test tests/premarket.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { quoteFromChart, INSTRUMENTS, allInstruments, sma, pctOver, etDate } from '../src/premarket/data.js';
import { readEvent, normalizeFfEvent, selectEvents, laterThisWeek, isHoliday, selectEarnings, earningsAsEvents, newsAsEvents, nextSession, parseMarketCap } from '../src/premarket/calendar.js';
import { scoreBias, rankSectors, keyLevels, sessionOpen, vixLevelScore, trendScore, watchList, WEIGHTS, BIAS_THRESHOLD } from '../src/premarket/bias.js';
import { buildReport, runReport, summarize, DISCLAIMER } from '../src/premarket/index.js';
import { renderMarkdown, renderHtml } from '../src/premarket/render.js';

// ─── fixtures ────────────────────────────────────────────────────────────────

const DAY = 86_400;
/** A Yahoo chart payload: `closes` daily bars ending the session before `time`. */
function yahoo(symbol, { closes, price, changePct = 0, time = '2026-09-08T12:00:00Z', dayHigh = null, dayLow = null } = {}) {
  const end = Math.floor(new Date(time).getTime() / 1000);
  const n = closes.length;
  const timestamp = closes.map((_, i) => end - (n - i) * DAY + 3600); // strictly earlier days
  return { chart: { result: [{ meta: { symbol, regularMarketPrice: price ?? closes.at(-1), regularMarketChangePercent: changePct, regularMarketTime: end, regularMarketDayHigh: dayHigh, regularMarketDayLow: dayLow },
    timestamp, indicators: { quote: [{ open: closes.map(c => c * 0.995), high: closes.map(c => c * 1.01), low: closes.map(c => c * 0.99), close: closes, volume: closes.map(() => 1000) }] } }] } };
}

function inst(key) { return allInstruments().find(i => i.key === key); }
const ramp = (from, to, n) => Array.from({ length: n }, (_, i) => Number((from + ((to - from) * i) / (n - 1)).toFixed(2)));

/** A full quote set. `over` tweaks per-key changePct / price / closes. */
function quoteSet(over = {}) {
  const base = {
    es: { closes: ramp(7400, 7700, 60), price: 7700, changePct: 0.1 },
    nq: { closes: ramp(28000, 29500, 60), price: 29500, changePct: 0.1 },
    ym: { closes: ramp(51000, 53400, 60), price: 53400, changePct: 0.1 },
    rty: { closes: ramp(2800, 2970, 60), price: 2970, changePct: 0.1 },
    vix: { closes: ramp(16, 15, 60), price: 15, changePct: 0 },
    us2y: { closes: ramp(3.9, 3.95, 60), price: 3.95, changePct: 0 },
    us10y: { closes: ramp(4.7, 4.75, 60), price: 4.75, changePct: 0 },
    us30y: { closes: ramp(5.1, 5.2, 60), price: 5.2, changePct: 0 },
    dxy: { closes: ramp(99, 98.9, 60), price: 98.9, changePct: 0 },
    wti: { closes: ramp(85, 90, 60), price: 90, changePct: 0 },
    brent: { closes: ramp(90, 95, 60), price: 95, changePct: 0 },
    gold: { closes: ramp(4300, 4450, 60), price: 4450, changePct: 0 },
    btc: { closes: ramp(75000, 79000, 60), price: 79000, changePct: 0 },
    spy: { closes: ramp(740, 770, 60), price: 770, changePct: 0.2, time: '2026-09-04T20:00:00Z' },
    qqq: { closes: ramp(690, 719, 60), price: 719, changePct: 0.2, time: '2026-09-04T20:00:00Z' },
    dia: { closes: ramp(500, 530, 60), price: 530, changePct: 0.2, time: '2026-09-04T20:00:00Z' },
    iwm: { closes: ramp(270, 296, 60), price: 296, changePct: 0.2, time: '2026-09-04T20:00:00Z' },
  };
  for (const s of INSTRUMENTS.sectors) base[s.key] = { closes: ramp(100, 110, 60), price: 110, changePct: 0.3, time: '2026-09-04T20:00:00Z' };
  const quotes = {};
  for (const [key, spec] of Object.entries(base)) {
    const merged = { ...spec, ...(over[key] ?? {}) };
    quotes[key] = quoteFromChart(yahoo(inst(key).symbol, merged), inst(key));
  }
  return quotes;
}

const FF = [
  { title: 'Bank Holiday', country: 'USD', date: '2026-09-07T08:00:00-04:00', impact: 'Holiday', forecast: '', previous: '' },
  { title: 'NFIB Small Business Index', country: 'USD', date: '2026-09-08T06:00:00-04:00', impact: 'Low', forecast: '99.2', previous: '99.8' },
  { title: '10-y Bond Auction', country: 'USD', date: '2026-09-08T13:01:00-04:00', impact: 'Low', forecast: '', previous: '4.68|2.5' },
  { title: 'Core CPI m/m', country: 'USD', date: '2026-09-08T08:30:00-04:00', impact: 'High', forecast: '0.2%', previous: '0.2%' },
  { title: 'Core CPI m/m', country: 'USD', date: '2026-09-08T08:30:00-04:00', impact: 'High', forecast: '0.2%', previous: '0.2%' },
  { title: 'FOMC Member Waller Speaks', country: 'USD', date: '2026-09-08T14:00:00-04:00', impact: 'Low', forecast: '', previous: '' },
  { title: 'PPI m/m', country: 'USD', date: '2026-09-10T08:30:00-04:00', impact: 'High', forecast: '0.4%', previous: '0.0%' },
  { title: 'German Industrial Production m/m', country: 'EUR', date: '2026-09-08T02:00:00-04:00', impact: 'Low', forecast: '0.1%', previous: '0.2%' },
];

const EARN = [
  { symbol: 'ORCL', name: 'Oracle Corporation', time: 'time-after-hours', marketCap: '$620,000,000,000', epsForecast: '$1.70' },
  { symbol: 'CASY', name: 'Caseys General Stores, Inc.', time: 'time-after-hours', marketCap: '$28,065,267,700', epsForecast: '$6.60' },
  { symbol: 'TINY', name: 'Tiny Co', time: 'time-pre-market', marketCap: '$400,000,000', epsForecast: '' },
  { symbol: 'SOUN', name: 'SoundHound AI', time: 'time-pre-market', marketCap: '$3,000,000,000', epsForecast: '($0.05)' },
];

// ─── data ────────────────────────────────────────────────────────────────────

describe('premarket data', () => {
  it('keeps the last bar for a cash ETF quoted after the close, drops the live bar for futures', () => {
    const spy = quoteFromChart(yahoo('SPY', { closes: [1, 2, 3], time: '2026-09-04T20:00:00Z' }), inst('spy'));
    // bars are dated the three days before the quote's session, so all three are complete
    assert.equal(spy.candles.length, 3);
    const live = { ...yahoo('ES=F', { closes: [1, 2, 3], time: '2026-09-08T12:00:00Z' }) };
    live.chart.result[0].timestamp[2] = Math.floor(new Date('2026-09-08T04:00:00Z').getTime() / 1000); // today's partial bar
    const es = quoteFromChart(live, inst('es'));
    assert.equal(es.candles.length, 2);
    assert.equal(es.session, '2026-09-08');
  });

  it('derives the previous close from Yahoo change when present, else from the last candle', () => {
    const a = quoteFromChart(yahoo('ES=F', { closes: [100, 101], price: 102, changePct: 1 }), inst('es'));
    assert.equal(Number(a.prevClose.toFixed(2)), 100.99);
    const b = quoteFromChart(yahoo('^TNX', { closes: [4.7, 4.75], price: 4.8, changePct: 0 }), inst('us10y'));
    assert.equal(b.prevClose, 4.75);
    assert.ok(Math.abs(b.change - 0.05) < 1e-9);
  });

  it('sma / pctOver', () => {
    const c = [1, 2, 3, 4, 5].map((v, i) => ({ t: `2026-01-0${i + 1}`, o: v, h: v, l: v, c: v, v: 1 }));
    assert.equal(sma(c, 5), 3);
    assert.equal(sma(c, 6), null);
    assert.equal(pctOver(c, 4), 400);
  });

  it('etDate is New York', () => {
    assert.equal(etDate(new Date('2026-09-08T03:30:00Z')), '2026-09-07');
    assert.equal(etDate(new Date('2026-09-08T04:30:00Z')), '2026-09-08');
  });
});

// ─── calendar ────────────────────────────────────────────────────────────────

describe('premarket calendar', () => {
  it('maps releases to a reading with an expected effect and a flip condition', () => {
    assert.equal(readEvent('Core CPI m/m').kind, 'inflation');
    assert.equal(readEvent('Non-Farm Employment Change').kind, 'labor');
    assert.equal(readEvent('FOMC Statement').kind, 'fed');
    assert.equal(readEvent('Federal Funds Rate').impact, 'High');
    assert.equal(readEvent('30-y Bond Auction').kind, 'auction');
    assert.equal(readEvent('Crude Oil Inventories').kind, 'energy');
    assert.equal(readEvent('Bank Holiday').kind, 'holiday');
    assert.match(readEvent('Core CPI m/m').flip, /hotter/i);
    assert.equal(readEvent('Consumer Credit m/m').kind, 'other');
  });

  it('selects the session\'s USD events: dedupes, drops noise, keeps rate-moving lows, orders by time', () => {
    const ev = selectEvents(FF, '2026-09-08');
    assert.deepEqual(ev.map(e => e.title), ['Core CPI m/m', '10-y Bond Auction', 'FOMC Member Waller Speaks']);
    assert.equal(ev[0].time, '8:30 AM ET');
    assert.equal(ev[0].impact, 'High');
    assert.equal(ev[0].forecast, '0.2%');
    assert.equal(normalizeFfEvent(FF[7]).date, '2026-09-08');
  });

  it('later-this-week lists only high-impact USD events after the date', () => {
    assert.deepEqual(laterThisWeek(FF, '2026-09-08').map(e => e.title), ['PPI m/m']);
  });

  it('detects the holiday and rolls to the next session', () => {
    assert.equal(isHoliday(FF, '2026-09-07'), true);
    assert.equal(isHoliday(FF, '2026-09-08'), false);
    assert.equal(nextSession('2026-09-07'), '2026-09-08');
    assert.equal(nextSession('2026-09-04'), '2026-09-07');
    assert.equal(nextSession('2026-09-04', ['2026-09-07']), '2026-09-08');
  });

  it('earnings: large caps and watchlist names only, largest first, watchlist pinned', () => {
    assert.equal(parseMarketCap('$28,065,267,700'), 28065267700);
    const e = selectEarnings(EARN, { watchlist: ['SOUN'] });
    assert.deepEqual(e.map(x => x.symbol), ['SOUN', 'ORCL', 'CASY']);
    assert.equal(e[1].session, 'AMC');
    const evs = earningsAsEvents(e, '2026-09-08');
    assert.equal(evs.find(x => x.symbol === 'ORCL').impact, 'High');
    assert.equal(evs.find(x => x.symbol === 'SOUN').time, 'before the open');
  });

  it('news items become events with defaults', () => {
    const n = newsAsEvents([{ headline: 'Strait of Hormuz shipping halted', source: 'Reuters', impact: 'High' }, { nope: true }], '2026-09-08');
    assert.equal(n.length, 1);
    assert.equal(n[0].type, 'news');
    assert.equal(n[0].source, 'Reuters');
    assert.match(n[0].flip, /Escalation/);
  });
});

// ─── bias ────────────────────────────────────────────────────────────────────

describe('premarket bias', () => {
  it('scores bullish when futures, VIX, yields and trend agree', () => {
    const q = quoteSet({ es: { changePct: 0.8 }, nq: { changePct: 0.9 }, ym: { changePct: 0.5 }, rty: { changePct: 1.0 }, vix: { price: 13, changePct: -6 }, us10y: { price: 4.66, changePct: -2 }, dxy: { changePct: -0.4 } });
    const s = scoreBias(q, { sectors: rankSectors(q, INSTRUMENTS.sectors) });
    assert.equal(s.bias, 'Bullish');
    assert.ok(s.composite > BIAS_THRESHOLD);
    assert.ok(s.confidence >= 70, `confidence ${s.confidence}`);
    assert.equal(s.drivers[0].direction, 'supportive');
    assert.ok(s.components.every(c => c.weight === WEIGHTS[c.key]));
  });

  it('scores bearish when futures fall, VIX spikes and yields rise', () => {
    const q = quoteSet({ es: { changePct: -1.1 }, nq: { changePct: -1.5 }, ym: { changePct: -0.8 }, rty: { changePct: -1.2 }, vix: { price: 24, changePct: 15 }, us10y: { price: 4.9, changePct: 3 }, wti: { changePct: 3 } });
    const s = scoreBias(q, { sectors: rankSectors(q, INSTRUMENTS.sectors) });
    assert.equal(s.bias, 'Bearish');
    assert.ok(s.drivers.some(d => /VIX/.test(d.text) && d.direction === 'headwind'));
  });

  it('is neutral on a flat overnight and cuts confidence for a pre-open high-impact release', () => {
    // futures flat, VIX mildly elevated, SPY in a pullback inside an uptrend, half the sectors below their 20-day
    const over = { es: { changePct: 0 }, nq: { changePct: 0 }, ym: { changePct: 0 }, rty: { changePct: 0 }, vix: { price: 19 }, spy: { closes: [...ramp(700, 780, 40), ...ramp(780, 760, 20)], price: 760, changePct: 0 } };
    for (const s of INSTRUMENTS.sectors.slice(0, 6)) over[s.key] = { closes: ramp(120, 100, 60), price: 100, changePct: 0 };
    const q = quoteSet(over);
    const flat = scoreBias(q, { sectors: rankSectors(q, INSTRUMENTS.sectors) });
    assert.equal(flat.bias, 'Neutral');
    assert.ok(Math.abs(flat.composite) < BIAS_THRESHOLD);
    const cpi = selectEvents(FF, '2026-09-08');
    const withEvent = scoreBias(q, { sectors: rankSectors(q, INSTRUMENTS.sectors), events: cpi });
    assert.ok(withEvent.confidence <= flat.confidence - 10, `${withEvent.confidence} vs ${flat.confidence}`);
    assert.match(withEvent.penalties[0], /Core CPI/);
    const missing = scoreBias(q, { sectors: [], missing: ['vix', 'es'] });
    assert.ok(missing.penalties.some(p => /missing inputs/.test(p)));
  });

  it('VIX and trend thresholds', () => {
    assert.equal(vixLevelScore(12), 0.6);
    assert.equal(vixLevelScore(19), -0.2);
    assert.equal(vixLevelScore(30), -1);
    const up = trendScore(quoteSet());
    assert.equal(up.score, 1);
    const down = trendScore(quoteSet({ spy: { closes: ramp(800, 740, 60), price: 740 } }));
    assert.equal(down.score, -1);
  });

  it('ranks sectors and flags the 20-day average', () => {
    const q = quoteSet({ xle: { changePct: 2.5, closes: ramp(100, 120, 60) }, xlu: { changePct: -2, closes: ramp(120, 100, 60), price: 100 } });
    const r = rankSectors(q, INSTRUMENTS.sectors);
    assert.equal(r[0].symbol, 'XLE');
    assert.equal(r.at(-1).symbol, 'XLU');
    assert.equal(r.at(-1).aboveSma20, false);
    assert.equal(r[0].aboveSma20, true);
  });

  it('splits key levels into nearest supports and resistances', () => {
    const q = quoteSet();
    const l = keyLevels(q.spy);
    assert.ok(l.support.length <= 2 && l.resistance.length <= 2);
    assert.ok(l.support.every(x => x.value <= l.price));
    assert.ok(l.resistance.every(x => x.value > l.price));
    assert.equal(l.priorDay.close, 770);
    assert.equal(keyLevels(null), null);
  });

  it('sessionOpen is 9:30 New York in both DST regimes', () => {
    assert.equal(sessionOpen('2026-09-08').toISOString(), '2026-09-08T13:30:00.000Z');
    assert.equal(sessionOpen('2026-01-15').toISOString(), '2026-01-15T14:30:00.000Z');
  });

  it('watch list names levels, VIX, yields, crude, sectors, events and earnings', () => {
    const q = quoteSet();
    const sectors = rankSectors(q, INSTRUMENTS.sectors);
    const events = [...selectEvents(FF, '2026-09-08'), ...earningsAsEvents(selectEarnings(EARN), '2026-09-08')];
    const w = watchList({ bias: 'Bullish', quotes: q, levels: { spy: keyLevels(q.spy), es: keyLevels(q.es) }, sectors, events, laterWeek: laterThisWeek(FF, '2026-09-08') });
    assert.ok(w.some(x => /^SPY:/.test(x) && /bullish read/.test(x)));
    assert.ok(w.some(x => /Core CPI m\/m at 8:30 AM ET/.test(x)));
    assert.ok(w.some(x => /ORCL \(AMC\)/.test(x)));
    assert.ok(w.some(x => /Later this week: PPI/.test(x)));
  });
});

// ─── report ──────────────────────────────────────────────────────────────────

describe('premarket report', () => {
  const now = new Date('2026-09-08T12:02:00Z');

  it('builds a timestamped report with bias, confidence, drivers, sectors, levels, watch list and events', () => {
    const q = quoteSet({ es: { changePct: 0.6 }, vix: { price: 14, changePct: -3 } });
    const r = buildReport({ date: '2026-09-08', quotes: q, calendar: FF, earningsRows: EARN, news: [{ headline: 'Overnight: tanker strike in the Gulf', source: 'Reuters', impact: 'High' }], now });
    assert.equal(r.kind, 'premarket');
    assert.equal(r.holiday, null);
    assert.equal(r.sessionDate, '2026-09-08');
    assert.match(r.generatedAtEt, /Tue, Sep 8, 2026 · 8:02 AM ET/);
    assert.ok(['Bullish', 'Neutral', 'Bearish'].includes(r.bias));
    assert.ok(r.confidence >= 5 && r.confidence <= 95);
    assert.ok(r.drivers.length >= 3);
    assert.equal(r.sectors.strength.length, 3);
    assert.equal(r.sectors.weakness.length, 3);
    assert.ok(r.levels.spy && r.levels.es);
    assert.ok(r.watch.length >= 5);
    assert.deepEqual(r.events.map(e => e.type), ['economic', 'economic', 'economic', 'earnings', 'earnings', 'earnings', 'news']); // SOUN is a watchlist name
    assert.equal(r.disclaimer, DISCLAIMER);
    assert.match(summarize(r), /confidence \d+\/100/);
  });

  it('on a holiday the read is for the next session and says so', () => {
    const q = quoteSet();
    const r = buildReport({ date: '2026-09-07', quotes: q, calendar: FF, earningsRows: EARN, now: new Date('2026-09-07T12:00:00Z') });
    assert.equal(r.sessionDate, '2026-09-08');
    assert.equal(r.holiday.name, 'Bank Holiday');
    assert.ok(r.penalties.some(p => /holiday/.test(p)));
    assert.ok(r.events.some(e => e.title === 'Core CPI m/m'));
  });

  it('renders Markdown and HTML with every section and the disclaimer', () => {
    const q = quoteSet();
    const r = buildReport({ date: '2026-09-08', quotes: q, calendar: FF, earningsRows: EARN, quoteErrors: { gold: 'GC=F: HTTP 500' }, now });
    const md = renderMarkdown(r);
    for (const s of ['## Bias:', '### Main drivers', '### Overnight snapshot', '### Sectors', '### Key levels', '### What investors should watch today', '### Market-moving events', 'Flips the bias if', DISCLAIMER, 'Missing inputs this run']) assert.ok(md.includes(s), `markdown missing ${s}`);
    const html = renderHtml(r);
    for (const s of ['<!doctype html>', 'Premarket Market Direction', 'Main drivers', 'Key support / resistance', 'What investors should watch today', 'Market-moving events', DISCLAIMER, 'overflow-x:auto']) assert.ok(html.includes(s), `html missing ${s}`);
    assert.ok(!/<script/i.test(html));
  });

  it('runReport survives feed failures and writes three files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'premarket-'));
    const fetchImpl = async (url) => {
      if (/faireconomy/.test(url)) return { ok: false, status: 503 };
      if (/nasdaq/.test(url)) throw new Error('boom');
      const m = /chart\/([^?]+)\?/.exec(url);
      const symbol = decodeURIComponent(m[1]);
      const i = allInstruments().find(x => x.symbol === symbol);
      if (i.key === 'gold') return { ok: false, status: 500 };
      return { ok: true, json: async () => yahoo(symbol, { closes: ramp(100, 110, 60), price: 110, changePct: 0.3, time: i.group === 'futures' || i.group === 'macro' ? '2026-09-08T12:00:00Z' : '2026-09-04T20:00:00Z' }) };
    };
    const { report, paths } = await runReport({ date: '2026-09-08', outDir: dir, fetchImpl, now, news: [{ headline: 'x', impact: 'Low' }] });
    assert.ok(existsSync(paths.json) && existsSync(paths.md) && existsSync(paths.html));
    assert.deepEqual(Object.keys(report.missing), ['gold']);
    assert.match(report.sources.calendar, /unavailable/);
    assert.equal(report.events.length, 1);
    assert.equal(JSON.parse(readFileSync(paths.json, 'utf8')).bias, report.bias);
  });
});

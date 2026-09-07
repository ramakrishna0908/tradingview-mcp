/**
 * Annotated chart image for a post: real daily candles + the report's levels.
 *
 * Rendering is delegated to scripts/render-chart.py (Pillow) via a JSON spec;
 * this module only decides WHAT is drawn — and it draws nothing the post does
 * not already state: support, resistance, the report price, the 20-day basis,
 * one annotation naming the setup, the data timestamp and the disclosure.
 * No targets or projections are ever drawn.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIGNAL, fmtCmf } from './setup.js';
import { formatDataTimestamp, cmfDeltaNote } from './generate.js';
import { fetchDailyCandles } from './chart-data.js';
import { fmtPrice } from './money.js';
import { sweepLabels, sweepLevels, rsiTile, cmfTile, rvolTile } from './sweep-labels.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const RENDERER = join(ROOT, 'scripts', 'render-chart.py');
export const RENDERER_SWEEP = join(ROOT, 'scripts', 'render-chart-sweep.py');
const UNIVERSE_CACHE = join(ROOT, 'config', 'crypto-universe.json');
export const DEFAULT_CHART_DIR = join(ROOT, 'docs', 'social', 'charts');

const GREEN = '#3ddc84', RED = '#ff6b6b', BLUE = '#7dd3fc', GREY = '#8b8f98';

function money(v, opts) { return fmtPrice(v, opts); }

/** Build the renderer spec from a classified setup + report model + candles. */
export function buildChartSpec(setup, model, candles, config, outPath) {
  const mo = { grouping: !!config.priceGrouping };
  const row = model.rows.find(r => r.symbol === setup.symbol) ?? {};
  const label = setup.signal === SIGNAL.CONFIRMED ? config.signalLabels.CONFIRMED : config.signalLabels.WATCH;
  const name = /watch$/i.test(setup.setup) && setup.signal === SIGNAL.WATCH ? setup.setup : `${setup.setup} · ${label}`;
  const levels = [];
  if (setup.resistance) levels.push({ label: `Resistance ${money(setup.resistance.value, mo)}`, value: setup.resistance.value, color: RED, style: 'solid' });
  if (setup.support) levels.push({ label: `Support ${money(setup.support.value, mo)}`, value: setup.support.value, color: GREEN, style: 'solid' });
  if (row.bbBasis != null && ![setup.support?.value, setup.resistance?.value].includes(row.bbBasis)) {
    levels.push({ label: `20d basis ${money(row.bbBasis, mo)}`, value: row.bbBasis, color: GREY, style: 'dotted' });
  }
  levels.push({ label: `Report price ${money(setup.price, mo)}`, value: setup.price, color: BLUE, style: 'dashed' });

  const stamp = formatDataTimestamp(model.dataAsOf);
  const trend = setup.cmfTrendLabel ? ` · flow ${setup.cmfTrendLabel}` : '';
  const vol = volumeStats(candles);
  return {
    band: row.bbUpper != null && row.bbLower != null ? { upper: row.bbUpper, lower: row.bbLower } : null,
    volumeAvg: vol?.avg ?? null,
    volumeRatio: vol?.ratio ?? null,
    out: outPath,
    width: 1200,
    height: 675,
    symbol: setup.symbol,
    title: `$${setup.symbol} — ${name}`,
    badge: setup.signal === SIGNAL.CONFIRMED ? 'CONFIRMED SETUP' : 'WATCH',
    direction: setup.direction,
    candles: candles.map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v: v ?? null })),
    levels,
    annotation: { text: setup.setup, color: setup.direction === 'bearish' ? RED : GREEN },
    stats: `RSI ${setup.rsi.toFixed(0)} · CMF ${fmtCmf(setup.cmf)}${cmfDeltaNote(setup)}${trend} · daily`,
    footer: `Data: daily · ${stamp} · levels from the daily report`,
    source: 'Price history: Yahoo Finance daily bars',
    disclosure: config.disclosure.trim(),
  };
}

/** Simple moving average of closes, aligned to the candles (null until `n` bars exist). */
export function closeSma(candles, n = 20) {
  const out = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].c;
    if (i >= n) sum -= candles[i - n].c;
    if (i >= n - 1) out[i] = Number((sum / n).toFixed(6));
  }
  return out;
}

/** Full asset name for the header, when the universe cache knows it (crypto only). */
function assetName(symbol, config) {
  if (config.assetClass !== 'crypto' || !existsSync(UNIVERSE_CACHE)) return null;
  try {
    const u = JSON.parse(readFileSync(UNIVERSE_CACHE, 'utf8'));
    return [...(u.universe ?? []), ...(u.reserves ?? [])].find(c => c.symbol === symbol)?.name ?? null;
  } catch { return null; }
}

/**
 * Spec for the Daily Setup Sweep chart: header, verdict badge, candles with a
 * 20-day MA, the two levels the post names plus the current price, volume,
 * four stat tiles, the bull/bear/question strip, disclaimer.
 *
 * Same integrity rule as the classic spec: every level and every number is
 * the report's, formatted with the same options as the post text so the two
 * always show the same figure. The only derived series is the MA line, which
 * is computed from the same Yahoo closes the candles come from and is labelled
 * as such in the footer — it is context behind the report's levels, not a
 * level itself. Nothing forward-looking is drawn.
 */
export function buildSweepChartSpec(setup, model, candles, config, outPath, overrides = {}) {
  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const $ = v => fmtPrice(v, mo);
  // `overrides` lets a lifecycle follow-up relabel the card (badge, chip,
  // subtitle, annotation, verdict colour) without touching the levels.
  const words = { ...sweepLabels(setup), ...overrides };
  const { target, stop } = sweepLevels(setup);
  const stamp = formatDataTimestamp(model.dataAsOf);
  const vol = volumeStats(candles);

  const levels = [];
  if (target) levels.push({ value: target.value, label: $(target.value), role: target.tile, color: target.value > setup.price ? RED : GREEN, style: 'dashed' });
  levels.push({ value: setup.price, label: $(setup.price), role: 'Current price', color: BLUE, style: 'dashed' });
  if (stop) levels.push({ value: stop.value, label: $(stop.value), role: stop.tile, color: stop.value > setup.price ? RED : GREEN, style: 'dashed' });

  let bottom = [];
  if (target) bottom.push({ icon: target.side === 'Above' ? 'up' : 'down', text: `${target.side} ${$(target.value)}`, sub: target.outcome[0].toUpperCase() + target.outcome.slice(1) });
  if (stop) bottom.push({ icon: stop.side === 'Above' ? 'up' : 'down', text: `${stop.side} ${$(stop.value)}`, sub: 'Setup invalidated' });
  if (target && stop) bottom.push({ icon: 'question', text: 'Which level gets hit first?', sub: `${$(target.value)} or ${$(stop.value)}` });
  else if (stop) bottom.push({ icon: 'question', text: `Does ${$(stop.value)} hold?`, sub: 'Invalidation level' });
  if (overrides.bottom) bottom = overrides.bottom;

  // A follow-up has no fresh RSI/CMF reading; it supplies its own tiles, with
  // `{ rvol: true }` standing in for the RVOL tile computed here.
  const rvolTileSpec = { label: 'Volume (RVOL)', value: vol?.ratio != null ? `${vol.ratio.toFixed(1)}×` : '—', sub: rvolTile(vol?.ratio ?? null) ?? 'No volume data' };
  const tiles = overrides.tiles
    ? overrides.tiles.map(t => (t.rvol ? rvolTileSpec : t))
    : [
      { label: 'Price', value: $(setup.price), sub: null },
      { label: 'RSI (14)', value: setup.rsi != null ? setup.rsi.toFixed(0) : '—', sub: setup.rsi != null ? rsiTile(setup.rsi) : 'No fresh reading' },
      { label: 'CMF (20)', value: setup.cmf != null ? fmtCmf(setup.cmf) : '—', sub: setup.cmf != null ? cmfTile(setup.cmf) : 'No fresh reading' },
      rvolTileSpec,
    ];

  return {
    style: 'sweep',
    out: outPath,
    width: config.charts?.width ?? 1200,
    height: config.charts?.height ?? 1000,
    symbol: setup.symbol,
    name: assetName(setup.symbol, config),
    brand: config.brand?.name || null,
    tagline: config.brand?.tagline || null,
    chip: words.chip ?? 'TECHNICAL SETUP',
    badge: words.badge,
    confirmed: words.confirmed,
    verdictColor: words.verdictColor ?? null,
    stage: words.stage ?? null,
    direction: setup.direction,
    subtitle: words.subtitle,
    candles: candles.map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v: v ?? null })),
    ma: closeSma(candles, 20),
    maLabel: '20-day MA',
    levels,
    annotation: { text: words.annotation, color: words.verdictColor === 'red' ? RED : setup.direction === 'bearish' ? RED : GREEN },
    volumeAvg: vol?.avg ?? null,
    volumeRatio: vol?.ratio ?? null,
    tiles,
    bottom,
    footer: `Data: daily · ${stamp}`,
    source: 'Price history: Yahoo Finance daily bars · 20-day MA from those closes · levels from the daily report',
    disclosure: config.disclosure.trim(),
  };
}

/** Last bar's volume vs the 20-bar average (excluding the last bar). */
export function volumeStats(candles, window = 20) {
  const withVol = candles.filter(c => c.v != null && c.v > 0);
  if (withVol.length < 6) return null;
  const last = withVol.at(-1);
  const prior = withVol.slice(-(window + 1), -1);
  const avg = prior.reduce((a, c) => a + c.v, 0) / prior.length;
  if (!avg) return null;
  return { last: last.v, avg: Math.round(avg), ratio: Number((last.v / avg).toFixed(1)), bars: prior.length };
}

/** Alt text for accessibility — restates what the chart shows, nothing more. */
export function sweepChartAltText(setup, model, config) {
  const mo = { grouping: !!config.priceGrouping, compact: config.priceDisplay === 'compact' };
  const $ = v => fmtPrice(v, mo);
  const words = sweepLabels(setup);
  const { target, stop } = sweepLevels(setup);
  const bits = [`Daily candlestick chart of ${setup.symbol}: ${words.badge}.`, `Current price ${$(setup.price)}.`];
  if (target) bits.push(`${target.tile} ${$(target.value)}.`);
  if (stop) bits.push(`${stop.tile} ${$(stop.value)}.`);
  if (setup.rsi != null && setup.cmf != null) bits.push(`RSI ${setup.rsi.toFixed(0)}, CMF ${fmtCmf(setup.cmf)}.`);
  bits.push(`Data as of ${formatDataTimestamp(model.dataAsOf)}. ${config.disclosure.trim()}`);
  return bits.join(' ').slice(0, 1000);
}

export function chartAltText(setup, model) {
  const bits = [`Daily candlestick chart of ${setup.symbol} with the report's levels.`];
  bits.push(`Report price ${money(setup.price)}.`);
  if (setup.support) bits.push(`Support ${money(setup.support.value)}.`);
  if (setup.resistance) bits.push(`Resistance ${money(setup.resistance.value)}.`);
  bits.push(`Setup: ${setup.setup} (${setup.signal === SIGNAL.CONFIRMED ? 'confirmed setup' : 'watch'}).`);
  bits.push(`Data as of ${formatDataTimestamp(model.dataAsOf)}. Educational market analysis only, not investment advice.`);
  return bits.join(' ').slice(0, 1000);
}

/** Run the Pillow renderer. Returns the PNG path, or throws. */
export function renderChartSpec(spec, { python = process.env.SOCIAL_PYTHON || 'python3' } = {}) {
  mkdirSync(dirname(spec.out), { recursive: true });
  const renderer = ['sweep', 'scorecard', 'explainer', 'premarket'].includes(spec.style) ? RENDERER_SWEEP : RENDERER;
  const r = spawnSync(python, [renderer], { input: JSON.stringify(spec), encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0) throw new Error(`chart renderer failed: ${(r.stderr || r.stdout || '').trim().split('\n').at(-1)}`);
  if (!existsSync(spec.out)) throw new Error('chart renderer produced no file');
  return spec.out;
}

/**
 * Fetch candles, build the spec, render. Never throws — returns
 * { path, altText } on success or { error } so the caller can post text-only.
 */
export async function makeChart(setup, model, config, { dir = DEFAULT_CHART_DIR, fetchImpl, candles = null, python, overrides = null, name = null } = {}) {
  try {
    const bars = config.charts?.bars ?? 60;
    let data = candles ?? await fetchDailyCandles(setup.symbol, { bars, endDate: model.reportDate, fetchImpl, assetClass: config.assetClass ?? 'equity' });
    // Candles handed in by a caller (the tracker) may run past the event bar.
    if (candles && model.reportDate) data = data.filter(c => c.t <= model.reportDate).slice(-bars);
    if (!data || data.length < 10) throw new Error(`only ${data?.length ?? 0} candles available`);
    const out = join(dir, model.reportDate, `${name ?? setup.symbol}.png`);
    const sweep = config.charts?.style === 'sweep';
    const spec = sweep ? buildSweepChartSpec(setup, model, data, config, out, overrides ?? {}) : buildChartSpec(setup, model, data, config, out);
    renderChartSpec(spec, { python });
    const vol = volumeStats(data);
    const altText = sweep ? sweepChartAltText(setup, model, config) : chartAltText(setup, model);
    return { path: out, altText, bars: data.length, lastBar: data.at(-1).t, volumeRatio: vol?.ratio ?? null, volumeAvg: vol?.avg ?? null };
  } catch (err) {
    return { error: err.message };
  }
}

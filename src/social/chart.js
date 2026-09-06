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
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIGNAL, fmtCmf } from './setup.js';
import { formatDataTimestamp, cmfDeltaNote } from './generate.js';
import { fetchDailyCandles } from './chart-data.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const RENDERER = join(ROOT, 'scripts', 'render-chart.py');
export const DEFAULT_CHART_DIR = join(ROOT, 'docs', 'social', 'charts');

const GREEN = '#3ddc84', RED = '#ff6b6b', BLUE = '#7dd3fc', GREY = '#8b8f98';

function money(v) { return '$' + v.toFixed(2); }

/** Build the renderer spec from a classified setup + report model + candles. */
export function buildChartSpec(setup, model, candles, config, outPath) {
  const row = model.rows.find(r => r.symbol === setup.symbol) ?? {};
  const label = setup.signal === SIGNAL.CONFIRMED ? config.signalLabels.CONFIRMED : config.signalLabels.WATCH;
  const name = /watch$/i.test(setup.setup) && setup.signal === SIGNAL.WATCH ? setup.setup : `${setup.setup} · ${label}`;
  const levels = [];
  if (setup.resistance) levels.push({ label: `Resistance ${money(setup.resistance.value)}`, value: setup.resistance.value, color: RED, style: 'solid' });
  if (setup.support) levels.push({ label: `Support ${money(setup.support.value)}`, value: setup.support.value, color: GREEN, style: 'solid' });
  if (row.bbBasis != null && ![setup.support?.value, setup.resistance?.value].includes(row.bbBasis)) {
    levels.push({ label: `20d basis ${money(row.bbBasis)}`, value: row.bbBasis, color: GREY, style: 'dotted' });
  }
  levels.push({ label: `Report price ${money(setup.price)}`, value: setup.price, color: BLUE, style: 'dashed' });

  const stamp = formatDataTimestamp(model.dataAsOf);
  const trend = setup.cmfTrendLabel ? ` · flow ${setup.cmfTrendLabel}` : '';
  return {
    out: outPath,
    width: 1200,
    height: 675,
    symbol: setup.symbol,
    title: `$${setup.symbol} — ${name}`,
    badge: setup.signal === SIGNAL.CONFIRMED ? 'CONFIRMED SETUP' : 'WATCH',
    direction: setup.direction,
    candles: candles.map(({ t, o, h, l, c }) => ({ t, o, h, l, c })),
    levels,
    annotation: { text: setup.setup, color: setup.direction === 'bearish' ? RED : GREEN },
    stats: `RSI ${setup.rsi.toFixed(0)} · CMF ${fmtCmf(setup.cmf)}${cmfDeltaNote(setup)}${trend} · daily`,
    footer: `Data: daily · ${stamp} · levels from the daily report`,
    source: 'Price history: Yahoo Finance daily bars',
    disclosure: config.disclosure.trim(),
  };
}

/** Alt text for accessibility — restates what the chart shows, nothing more. */
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
  const r = spawnSync(python, [RENDERER], { input: JSON.stringify(spec), encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0) throw new Error(`chart renderer failed: ${(r.stderr || r.stdout || '').trim().split('\n').at(-1)}`);
  if (!existsSync(spec.out)) throw new Error('chart renderer produced no file');
  return spec.out;
}

/**
 * Fetch candles, build the spec, render. Never throws — returns
 * { path, altText } on success or { error } so the caller can post text-only.
 */
export async function makeChart(setup, model, config, { dir = DEFAULT_CHART_DIR, fetchImpl, candles = null, python } = {}) {
  try {
    const bars = config.charts?.bars ?? 60;
    const data = candles ?? await fetchDailyCandles(setup.symbol, { bars, endDate: model.reportDate, fetchImpl });
    if (!data || data.length < 10) throw new Error(`only ${data?.length ?? 0} candles available`);
    const out = join(dir, model.reportDate, `${setup.symbol}.png`);
    const spec = buildChartSpec(setup, model, data, config, out);
    renderChartSpec(spec, { python });
    return { path: out, altText: chartAltText(setup, model), bars: data.length, lastBar: data.at(-1).t };
  } catch (err) {
    return { error: err.message };
  }
}

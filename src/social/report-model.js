/**
 * Structured model of a daily report.
 *
 * The daily sweep (scripts/daily-report.sh) writes a self-contained HTML
 * report and no machine-readable sidecar. This module turns that report into
 * a typed model ONCE and caches it as `<report>.json` next to the HTML. Every
 * later step (summary table, post generator, compliance checks) reads the
 * JSON model — the HTML is only parsed when no model exists yet.
 *
 * Nothing here recomputes any indicator or score: values are lifted verbatim
 * from the report so the trading calculations stay the single source of truth.
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const MODEL_VERSION = 2;

// ─── text helpers ────────────────────────────────────────────────────────────

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  minus: '−', middot: '·', ge: '≥', le: '≤', hellip: '…', rarr: '→', larr: '←',
};

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m);
}

export function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Parse a number that may use a unicode minus, a leading "+", or "$". */
export function num(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[−–]/g, '-').replace(/[$,+\s]/g, '');
  if (cleaned === '' || /^(n\/a|na|-|—)$/i.test(cleaned)) return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

function splitSlash(s) {
  return String(s).split('/').map(x => x.trim());
}

// ─── HTML parsing ────────────────────────────────────────────────────────────

const HEADER_MATCHERS = [
  ['symbol', /^sym/i],
  ['price', /^(px|price)/i],
  ['rsi', /^rsi/i],
  ['cmfTrend', /cmf\s*trend/i],
  ['cmf', /^cmf$/i],
  ['atr', /^atr/i],
  ['bb', /^bb/i],
  ['vwap', /vwap/i],
  ['cloud', /cloud/i],
  ['position', /^pos/i],
  ['structure', /hh|ll|struct/i],
  ['score', /^score/i],
  ['bias', /bias|next/i],
];

function mapHeaders(ths) {
  return ths.map(th => {
    for (const [key, re] of HEADER_MATCHERS) if (re.test(th)) return key;
    return null;
  });
}

function parseSymbolCell(text) {
  // "ACN A" (Anness), "USO ◉" (macro cross-check), "META ⚑" (catalyst flag)
  const m = text.match(/^([A-Z][A-Z0-9.!]{0,9})\b(.*)$/);
  if (!m) return null;
  const rest = m[2].trim();
  let group = 'main';
  if (/\bA\b/.test(rest)) group = 'anness';
  if (/\bD\b/.test(rest)) group = 'defense';
  if (/◉/.test(rest)) group = 'macro';
  return { symbol: m[1], group, flags: rest.replace(/\b[AD]\b/g, '').trim() };
}

function parsePosition(text) {
  if (/▲|above/i.test(text)) return 'above_cloud';
  if (/▼|below/i.test(text)) return 'below_cloud';
  if (/in cloud|inside|—|–/i.test(text)) return 'in_cloud';
  return null;
}

function parseStructure(text) {
  if (/hh-?up|hh/i.test(text)) return 'HH-up';
  if (/ll-?down|ll/i.test(text)) return 'LL-down';
  if (/div/i.test(text)) return 'divergence';
  if (/rng|range/i.test(text)) return 'range';
  return text || null;
}

function parseRow(cells, keys, sectionGroup) {
  const rec = {};
  keys.forEach((k, i) => { if (k) rec[k] = cells[i] ?? ''; });
  if (!rec.symbol) return null;
  const sym = parseSymbolCell(rec.symbol);
  if (!sym) return null;

  const [rsi, rsiMa] = splitSlash(rec.rsi ?? '');
  const bb = splitSlash(rec.bb ?? '');
  const cloud = splitSlash(rec.cloud ?? '');
  const price = num(rec.price);
  if (price == null) return null;

  const group = sym.group !== 'main' ? sym.group : sectionGroup;

  return {
    symbol: sym.symbol,
    group,
    flags: sym.flags,
    price,
    rsi: num(rsi),
    rsiMa: num(rsiMa),
    cmf: num(rec.cmf),
    cmfTrend: rec.cmfTrend ? rec.cmfTrend.trim() : null,
    atr: num(rec.atr),
    bbLower: num(bb[0]),
    bbBasis: num(bb[1]),
    bbUpper: num(bb[2]),
    vwap: num(rec.vwap),
    cloudA: num(cloud[0]),
    cloudB: num(cloud[1]),
    position: parsePosition(rec.position ?? ''),
    structure: parseStructure(rec.structure ?? ''),
    score: num(rec.score),
    biasNext: (rec.bias ?? '').trim(),
  };
}

function sectionGroupFor(html, tableIndex) {
  // Group is decided by the nearest preceding <h2>; defense tables are
  // explicitly labelled in every report variant.
  const before = html.slice(0, tableIndex);
  const h2s = [...before.matchAll(/<h2[^>]*>(.*?)<\/h2>/gis)];
  const last = h2s.length ? stripTags(h2s[h2s.length - 1][1]) : '';
  if (/defen[cs]e|aerospace/i.test(last)) return 'defense';
  return 'main';
}

export function parseReportHtml(html, { sourcePath = null, runLog = null } = {}) {
  const titleMatch = html.match(/<title>(.*?)<\/title>/is);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';
  const dateMatch = (title + ' ' + html.slice(0, 4000)).match(/(20\d\d-\d\d-\d\d)/);
  if (!dateMatch) throw new Error('Report date not found in HTML');
  const reportDate = dateMatch[1];

  const rows = [];
  const tableRe = /<table[^>]*>(.*?)<\/table>/gis;
  let t;
  while ((t = tableRe.exec(html))) {
    const tableHtml = t[1];
    const ths = [...tableHtml.matchAll(/<th[^>]*>(.*?)<\/th>/gis)].map(m => stripTags(m[1]));
    if (!ths.length) continue;
    const keys = mapHeaders(ths);
    if (!keys.includes('symbol') || !keys.includes('price')) continue;
    const group = sectionGroupFor(html, t.index);
    for (const tr of tableHtml.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)) {
      const cells = [...tr[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map(m => stripTags(m[1]));
      if (cells.length < 6) continue;
      const row = parseRow(cells, keys, group);
      if (row) rows.push(row);
    }
  }
  if (!rows.length) throw new Error('No data rows found in report');

  const themeMatch = html.match(/Market Theme<\/h2>\s*<p[^>]*>(.*?)<\/p>/is);
  const footerMatch = html.match(/<footer[^>]*>(.*?)<\/footer>/is);

  // Data timestamp: the daily sweep is an intraday snapshot (launchd, ~9:35 ET).
  // Prefer the "report ready" line from the run log; fall back to file mtime.
  let dataAsOf = null;
  let dataAsOfSource = 'unknown';
  if (runLog) {
    const m = runLog.match(/^(\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \w+ \d{4}): report ready/m);
    if (m) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) { dataAsOf = d.toISOString(); dataAsOfSource = 'run-log'; }
    }
  }
  if (!dataAsOf && sourcePath && existsSync(sourcePath)) {
    dataAsOf = statSync(sourcePath).mtime.toISOString();
    dataAsOfSource = 'file-mtime';
  }
  if (!dataAsOf) {
    dataAsOf = `${reportDate}T13:35:00.000Z`; // 09:35 ET default sweep time (EDT)
    dataAsOfSource = 'schedule-default';
  }

  return {
    modelVersion: MODEL_VERSION,
    reportDate,
    title,
    sourcePath,
    dataAsOf,
    dataAsOfSource,
    timeframe: 'D',
    marketTheme: themeMatch ? stripTags(themeMatch[1]) : null,
    footer: footerMatch ? stripTags(footerMatch[1]) : null,
    cohort: parseCohort(html, rows),
    rows,
  };
}

// ─── cohort summary (the report's own Calls / Puts / Watches lists) ──────────

/**
 * Symbols the report itself put in a cohort block, in order of first mention.
 * The report formats vary day to day (comma lists, "SYM (+2.5) and SYM",
 * "SYM +2.0 · CMF …", prose), so membership is decided by two facts that are
 * stable across every variant:
 *   1. the symbol is mentioned inside the Calls (or Puts) block, and
 *   2. its table row actually clears that cohort's score bar (≥ +2 / ≤ −2).
 * Anything the report moved to Watches is removed again, so a demoted or
 * "removed from Puts" name can never be promoted back by a prose mention.
 */
function cohortSymbols(block, rowsBySymbol, dir, watchSet) {
  const found = [];
  for (const m of block.matchAll(/\b([A-Z]{2,5})\b/g)) {
    const sym = m[1];
    if (!rowsBySymbol.has(sym) || found.includes(sym) || watchSet.has(sym)) continue;
    const sc = rowsBySymbol.get(sym).score;
    if (sc == null) continue;
    if (dir === 'calls' ? sc >= 2 : sc <= -2) found.push(sym);
  }
  return found.map(sym => ({ symbol: sym, score: rowsBySymbol.get(sym).score }));
}

export function parseCohort(html, rows) {
  const rowsBySymbol = new Map(rows.map(r => [r.symbol, r]));
  const text = stripTags(html);
  let start = text.search(/Cohort (Summary|read)/i);
  if (start < 0) start = text.search(/\bCalls\b/);
  if (start < 0) return null;
  const sect = text.slice(start);
  const iCalls = sect.search(/\bCalls\b/);
  const iPuts = sect.search(/\bPuts\b/);
  const iWatch = sect.search(/\bWatch(?:es|list)?\b/);
  const iEndRaw = sect.search(/Flow breadth|Defense|Aerospace|Generated 20\d\d/);
  const iEnd = iEndRaw > 0 ? iEndRaw : sect.length;
  if (iCalls < 0 && iPuts < 0) return null;
  const cut = (from, ...stops) => {
    if (from < 0) return '';
    const ends = stops.filter(x => x > from);
    return sect.slice(from, ends.length ? Math.min(...ends) : iEnd);
  };
  const callsBlock = cut(iCalls, iPuts, iWatch, iEnd);
  const putsBlock = cut(iPuts, iWatch, iEnd);
  const watchBlock = cut(iWatch, iEnd);
  const watches = [];
  for (const m of watchBlock.matchAll(/\b([A-Z]{2,5})\b/g)) if (rowsBySymbol.has(m[1]) && !watches.includes(m[1])) watches.push(m[1]);
  const watchSet = new Set(watches);
  return {
    source: 'cohort-summary',
    calls: cohortSymbols(callsBlock, rowsBySymbol, 'calls', watchSet),
    puts: cohortSymbols(putsBlock, rowsBySymbol, 'puts', watchSet),
    watches,
  };
}

// ─── loading with JSON cache ─────────────────────────────────────────────────

export function modelPathFor(htmlPath) {
  return htmlPath.replace(/\.html?$/i, '') + '.json';
}

export function runLogPathFor(htmlPath) {
  const m = basename(htmlPath).match(/(20\d\d-\d\d-\d\d)/);
  return m ? join(dirname(htmlPath), `run-${m[1]}.log`) : null;
}

/**
 * Load the structured model for a report. Uses the cached JSON model when it
 * exists (and is not older than the HTML), otherwise parses the HTML once and
 * writes the model next to it.
 */
export function loadReportModel(htmlPath, { refresh = false, withPrior = true } = {}) {
  const jsonPath = modelPathFor(htmlPath);
  let result = null;
  if (!refresh && existsSync(jsonPath)) {
    const fresh = !existsSync(htmlPath) || statSync(jsonPath).mtimeMs >= statSync(htmlPath).mtimeMs;
    if (fresh) {
      const model = JSON.parse(readFileSync(jsonPath, 'utf8'));
      if (model.modelVersion === MODEL_VERSION) result = { model, source: 'json', jsonPath };
    }
  }
  if (!result) {
    if (!existsSync(htmlPath)) throw new Error(`Report not found: ${htmlPath}`);
    const html = readFileSync(htmlPath, 'utf8');
    const logPath = runLogPathFor(htmlPath);
    const runLog = logPath && existsSync(logPath) ? readFileSync(logPath, 'utf8') : null;
    const model = parseReportHtml(html, { sourcePath: htmlPath, runLog });
    writeFileSync(jsonPath, JSON.stringify(model, null, 2));
    result = { model, source: 'html', jsonPath };
  }
  // Day-over-day CMF comes from the previous report in the same directory
  // (parsed with the same code, never re-derived). Attached at load time so
  // the cached model stays a faithful snapshot of its own report.
  if (withPrior) {
    const priorPath = findPriorReportPath(htmlPath);
    if (priorPath) {
      try { attachPriorCmf(result.model, loadReportModel(priorPath, { withPrior: false }).model); }
      catch { /* prior report unparseable → no trend line */ }
    }
  }
  return result;
}

// ─── prior session (day-over-day CMF) ────────────────────────────────────────

/** The most recent daily-YYYY-MM-DD.html in the same directory dated before this report. */
export function findPriorReportPath(htmlPath) {
  const dir = dirname(htmlPath);
  const m = basename(htmlPath).match(/(20\d\d-\d\d-\d\d)/);
  if (!m || !existsSync(dir)) return null;
  const prior = readdirSync(dir)
    .filter(f => /^daily-\d{4}-\d\d-\d\d\.html$/.test(f))
    .map(f => f.slice(6, 16))
    .filter(d => d < m[1])
    .sort()
    .at(-1);
  return prior ? join(dir, `daily-${prior}.html`) : null;
}

export const CMF_TREND_BAND = 0.06; // the report's own thresholds: ≥ +0.06 improving, ≤ −0.06 deteriorating

export function cmfTrendLabel(delta) {
  if (delta == null) return null;
  if (delta >= CMF_TREND_BAND) return 'improving';
  if (delta <= -CMF_TREND_BAND) return 'deteriorating';
  return 'flat';
}

/** Attach cmfPrev / cmfDelta / cmfTrendLabel to each row from the prior session's model. */
export function attachPriorCmf(model, priorModel) {
  if (!priorModel) return model;
  const prev = new Map(priorModel.rows.map(r => [r.symbol, r]));
  for (const row of model.rows) {
    const p = prev.get(row.symbol);
    if (p && p.cmf != null && row.cmf != null) {
      row.cmfPrev = p.cmf;
      row.cmfDelta = Number((row.cmf - p.cmf).toFixed(2));
      row.cmfTrendLabel = cmfTrendLabel(row.cmfDelta);
    } else {
      row.cmfPrev = null; row.cmfDelta = null; row.cmfTrendLabel = null;
    }
  }
  model.priorReportDate = priorModel.reportDate;
  model.priorDataAsOf = priorModel.dataAsOf;
  return model;
}

export function findRow(model, symbol) {
  return model.rows.find(r => r.symbol === symbol.toUpperCase()) ?? null;
}

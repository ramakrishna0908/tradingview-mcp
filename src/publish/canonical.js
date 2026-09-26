/**
 * Canonical research payload — the shape AssetDecoded publishes and renders.
 *
 * The premarket job already builds a structured model before it renders HTML
 * (see src/premarket/index.js `buildReport`), and the daily sweep's model is
 * produced once by src/social/report-model.js and cached beside the report.
 * This module maps those models onto one contract so the HTML report and the
 * web app are two renderings of the SAME report, not two analyses.
 *
 * Hard rule: nothing here computes a market value. Every figure is lifted from
 * the source model verbatim. Sentences are composed only from text the report
 * itself wrote. If the generator did not produce something, the section is
 * omitted rather than filled in.
 */

export const PAYLOAD_VERSION = 1;

const GENERATOR = 'tradingview-mcp';

// ─── helpers ─────────────────────────────────────────────────────────────────

const nz = (v) => (v === undefined || v === null || Number.isNaN(v) ? null : v);

/** Drops sections that ended up with nothing to show. */
function compact(sections) {
  return sections.filter((s) => {
    if (!s) return false;
    if (s.kind === 'prose') return s.paragraphs.length > 0;
    if (s.kind === 'table') return s.rows.length > 0;
    return Array.isArray(s.items) && s.items.length > 0;
  });
}

function longDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Glossary concepts AssetDecoded can explain, keyed by snapshot instrument. */
const CONCEPTS = {
  vix: 'vix',
  us2y: 'treasury-yield',
  us10y: 'treasury-yield',
  us30y: 'treasury-yield',
  spy: 'etf',
  qqq: 'etf',
  dia: 'etf',
  iwm: 'etf',
};

/** One snapshot quote → one canonical metric. */
function metricFrom(key, quote) {
  if (!quote) return null;
  return {
    key,
    label: quote.name ?? key.toUpperCase(),
    value: nz(quote.price),
    unit: quote.unit === 'pct' ? 'pct' : 'price',
    change: nz(quote.change),
    changePct: nz(quote.changePct),
    symbol: quote.symbol,
    group: quote.group,
    asOf: quote.asOf ?? null,
    ...(CONCEPTS[key] ? { concept: CONCEPTS[key] } : {}),
  };
}

function metricsFor(snapshot, keys) {
  return keys.map((k) => metricFrom(k, snapshot[k])).filter(Boolean);
}

// ─── premarket ───────────────────────────────────────────────────────────────

/** The headline grid, in the order the report leads with. */
const SNAPSHOT_KEYS = ['es', 'nq', 'ym', 'rty', 'vix', 'us10y', 'dxy', 'wti', 'gold'];
/** Everything else worth showing, below the fold. */
const GLOBAL_KEYS = ['spy', 'qqq', 'dia', 'iwm', 'us2y', 'us30y', 'brent', 'btc', 'eth'];

function premarketSummary(report) {
  const paragraphs = [];

  const drivers = report.drivers ?? [];
  if (drivers.length) {
    paragraphs.push(
      `The overnight inputs read ${report.bias.toLowerCase()}, with an agreement score of ${report.confidence} out of 100. ${drivers.map((d) => d.text).join('. ')}.`,
    );
  }

  const strength = report.sectors?.strength ?? [];
  const weakness = report.sectors?.weakness ?? [];
  if (strength.length || weakness.length) {
    paragraphs.push(
      `Sector leadership sits with ${strength.map((s) => s.name).join(', ') || '—'}; the laggards are ${weakness.map((s) => s.name).join(', ') || '—'}. Relative strength is measured over the last five sessions against the broad market.`,
    );
  }

  const high = (report.events ?? []).filter((e) => e.impact === 'High');
  if (high.length) {
    paragraphs.push(
      `Scheduled risk today: ${high.map((e) => `${e.title} at ${e.time}`).join('; ')}. ${high[0].flip ?? ''}`.trim(),
    );
  } else if ((report.events ?? []).length) {
    paragraphs.push(
      `No high-impact releases are scheduled for the session. ${report.events.length} event${report.events.length === 1 ? '' : 's'} on the calendar, none of them market-moving by themselves.`,
    );
  }

  if (report.holiday) paragraphs.push(report.holiday.note);

  // A report always needs at least one paragraph of summary.
  if (!paragraphs.length) {
    paragraphs.push(
      `${report.bias} read into the ${longDate(report.sessionDate)} session, with an agreement score of ${report.confidence} out of 100.`,
    );
  }
  return paragraphs;
}

function premarketLevels(report) {
  return Object.entries(report.levels ?? {}).map(([, level]) => ({
    symbol: level.symbol,
    name: level.name,
    price: nz(level.price),
    support: (level.support ?? []).map((s) => ({ label: s.label, value: s.value })),
    resistance: (level.resistance ?? []).map((r) => ({ label: r.label, value: r.value })),
    reference: [
      level.sma20 != null ? { label: '20-day average', value: level.sma20 } : null,
      level.sma50 != null ? { label: '50-day average', value: level.sma50 } : null,
      level.priorDay?.close != null ? { label: 'Prior close', value: level.priorDay.close } : null,
    ].filter(Boolean),
  }));
}

function premarketThemes(report) {
  const strength = (report.sectors?.strength ?? []).map((s) => ({ ...s, tone: 'positive' }));
  const weakness = (report.sectors?.weakness ?? []).map((s) => ({ ...s, tone: 'negative' }));
  return [...strength, ...weakness].map((s) => ({
    name: s.name,
    symbol: s.symbol,
    changePct: nz(s.changePct),
    relativePct: nz(s.rel5d),
    tone: s.tone,
    note: `${s.pct5d != null ? `${s.pct5d > 0 ? '+' : ''}${s.pct5d}% over five sessions` : ''}${
      s.aboveSma20 === true ? ', above its 20-day average' : s.aboveSma20 === false ? ', below its 20-day average' : ''
    }`.replace(/^, /, '') || undefined,
  }));
}

function eventFrom(e) {
  return {
    title: e.title,
    type: e.type === 'news' ? 'news' : e.type === 'earnings' ? 'earnings' : 'economic',
    date: e.date ?? undefined,
    time: e.time ?? undefined,
    at: e.at ?? null,
    impact: e.impact ?? undefined,
    forecast: e.forecast ?? null,
    previous: e.previous ?? null,
    symbol: e.symbol ?? undefined,
    expected: e.expected ?? undefined,
    flip: e.flip ?? undefined,
  };
}

/** Premarket model (src/premarket/index.js) → canonical payload. */
export function premarketToCanonical(report) {
  const events = report.events ?? [];
  const economic = events.filter((e) => e.type === 'economic').map(eventFrom);
  const earnings = events.filter((e) => e.type === 'earnings').map(eventFrom);
  const news = events.filter((e) => e.type === 'news').map(eventFrom);

  // "What could change the view" is the report's own per-event flip text plus
  // whatever it docked confidence for — not a new risk assessment.
  const risks = [
    ...events.filter((e) => e.flip).map((e) => `${e.title}: ${e.flip}`),
    ...(report.penalties ?? []).map((p) => (typeof p === 'string' ? p : p.text)).filter(Boolean),
  ];

  const sections = compact([
    {
      key: 'snapshot',
      title: 'Market snapshot',
      kind: 'metrics',
      intro: 'Futures, volatility, rates and commodities as of the report timestamp.',
      items: metricsFor(report.snapshot ?? {}, SNAPSHOT_KEYS),
    },
    news.length
      ? { key: 'overnight', title: 'Overnight headlines', kind: 'events', items: news }
      : null,
    {
      key: 'global-markets',
      title: 'Global markets and cross-asset',
      kind: 'metrics',
      items: metricsFor(report.snapshot ?? {}, GLOBAL_KEYS),
    },
    {
      key: 'drivers',
      title: 'Main drivers',
      kind: 'list',
      intro: 'The inputs carrying the most weight in this read.',
      items: (report.drivers ?? []).map((d) => d.text),
    },
    {
      key: 'levels',
      title: 'Key levels',
      kind: 'levels',
      intro: 'Support and resistance the report is watching into the open.',
      items: premarketLevels(report),
    },
    {
      key: 'themes',
      title: 'Sector themes',
      kind: 'themes',
      intro: 'Five-day relative strength against the broad market.',
      items: premarketThemes(report),
    },
    {
      key: 'economic-calendar',
      title: 'Economic calendar',
      kind: 'events',
      items: economic,
    },
    { key: 'earnings', title: 'Earnings and corporate events', kind: 'events', items: earnings },
    {
      key: 'watch',
      title: 'What to watch today',
      kind: 'list',
      items: report.watch ?? [],
    },
    {
      key: 'later-week',
      title: 'Later this week',
      kind: 'events',
      items: (report.laterWeek ?? []).map(eventFrom),
    },
    {
      key: 'risks',
      title: 'What could change the view',
      kind: 'list',
      intro: 'Scheduled outcomes that would invalidate the read above.',
      items: risks,
    },
  ]);

  const drivers = report.drivers ?? [];
  const headline = `${report.bias} read into the ${longDate(report.sessionDate)} session (agreement ${report.confidence}/100).${
    drivers.length ? ` ${drivers[0].text}.` : ''
  }`;

  return {
    payloadVersion: PAYLOAD_VERSION,
    reportType: 'PREMARKET',
    reportDate: report.date,
    tradingDate: report.sessionDate,
    generatedAt: report.generatedAt,
    dataAsOf: report.dataAsOf ?? null,
    timezone: 'America/New_York',
    title: `Premarket Brief — ${longDate(report.sessionDate)}`,
    subtitle: null,
    marketBias: report.bias ?? null,
    marketCondition: report.holiday?.note ?? null,
    confidence: typeof report.confidence === 'number' ? Math.round(report.confidence) : null,
    headline,
    executiveSummary: premarketSummary(report),
    sections,
    source: {
      generator: `${GENERATOR} premarket`,
      version: `report v${report.reportVersion ?? 1}`,
      feeds: report.sources ?? {},
      methodology: report.methodology ?? null,
      missing: report.missing ?? {},
    },
    freshness: 'DAILY',
    payload: report,
  };
}

// ─── daily ───────────────────────────────────────────────────────────────────

const COHORT_TITLES = {
  calls: 'Constructive setups',
  puts: 'Deteriorating setups',
  watches: 'On watch',
};

/**
 * Cohort members → movers. The daily model carries a price and the report's
 * own forward-looking note per name, but no percentage change (the sweep is a
 * technical snapshot, not a quote feed), so `changePct` stays null rather than
 * being back-computed from anything.
 */
function cohortMovers(symbols, rowsBySymbol, direction) {
  return symbols
    .map((entry) => {
      const symbol = typeof entry === 'string' ? entry : entry.symbol;
      const row = rowsBySymbol.get(symbol);
      if (!row) return null;
      return {
        symbol,
        name: row.sector ?? undefined,
        price: nz(row.price),
        changePct: null,
        direction,
        reason: row.biasNext || undefined,
        level: row.bbBasis != null ? `BB basis ${row.bbBasis}` : undefined,
        tags: [row.structure, row.cmfTrendLabel].filter(Boolean),
      };
    })
    .filter(Boolean);
}

/** Sector blocks, ranked by the report's own scores — the report's ordering. */
function dailySectors(rows) {
  const bySector = new Map();
  for (const row of rows) {
    // USO is swept as a macro cross-check, not a constituent. The report says
    // so explicitly; ranking it as a sector would contradict that.
    if (!row.sector || row.group === 'macro' || /macro/i.test(row.sector)) continue;
    const bucket = bySector.get(row.sector) ?? [];
    bucket.push(row);
    bySector.set(row.sector, bucket);
  }

  const ranked = [...bySector.entries()]
    .map(([name, members]) => {
      const scored = members.filter((m) => m.score != null);
      // The report groups by sector and orders by mean score; this reproduces
      // that ordering from the same numbers rather than inventing a measure.
      const avg = scored.length
        ? scored.reduce((sum, m) => sum + m.score, 0) / scored.length
        : null;
      return { name, members, avg };
    })
    .filter((s) => s.avg !== null)
    .sort((a, b) => b.avg - a.avg);

  return ranked.map((s) => ({
    name: s.name,
    changePct: null,
    tone: s.avg > 0.5 ? 'positive' : s.avg < -0.5 ? 'negative' : 'neutral',
    note: `Average score ${s.avg.toFixed(2)} across ${s.members.length} name${s.members.length === 1 ? '' : 's'}: ${s.members.map((m) => m.symbol).join(', ')}.`,
  }));
}

function dailyTable(rows) {
  return {
    columns: [
      { key: 'symbol', label: 'Ticker' },
      { key: 'sector', label: 'Sector' },
      { key: 'price', label: 'Price', align: 'right' },
      { key: 'rsi', label: 'RSI', align: 'right' },
      { key: 'cmf', label: 'CMF', align: 'right' },
      { key: 'cmfTrend', label: 'Flow trend' },
      { key: 'position', label: 'Cloud' },
      { key: 'structure', label: 'Structure' },
      { key: 'score', label: 'Score', align: 'right' },
    ],
    rows: rows.map((r) => ({
      symbol: r.symbol,
      sector: r.sector ?? null,
      price: nz(r.price),
      rsi: nz(r.rsi),
      cmf: nz(r.cmf),
      cmfTrend: r.cmfTrend ?? null,
      position: r.position ? r.position.replace(/_/g, ' ') : null,
      structure: r.structure ?? null,
      score: nz(r.score),
    })),
  };
}

/** Index and macro levels the sweep happens to carry, as a metric grid. */
const DAILY_METRIC_SYMBOLS = ['QQQ', 'IWM', 'SMH', 'USO'];

function dailyMetrics(rowsBySymbol) {
  const metrics = DAILY_METRIC_SYMBOLS.map((symbol) => {
    const row = rowsBySymbol.get(symbol);
    if (!row) return null;
    return {
      key: symbol.toLowerCase(),
      label: symbol,
      value: nz(row.price),
      unit: 'price',
      // The daily sweep records levels, not session changes. Leaving these
      // null is the honest answer — a percentage here would be fabricated.
      changePct: null,
      symbol,
      note: row.structure ? `Structure ${row.structure}` : undefined,
      concept: 'etf',
    };
  }).filter(Boolean);
  return metrics;
}

function flowBreadth(rows) {
  const improving = rows.filter((r) => r.cmfTrendLabel === 'improving').length;
  const deteriorating = rows.filter((r) => r.cmfTrendLabel === 'deteriorating').length;
  if (!improving && !deteriorating) return null;
  return { improving, deteriorating };
}

/** Daily sweep model (src/social/report-model.js) → canonical payload. */
export function dailyToCanonical(model, { generatedAt = null } = {}) {
  const rows = model.rows ?? [];
  const rowsBySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const cohort = model.cohort ?? { calls: [], puts: [], watches: [] };
  const breadth = flowBreadth(rows);

  const summary = [];
  if (model.marketTheme) summary.push(model.marketTheme);
  if (breadth) {
    summary.push(
      `Flow breadth across the ${rows.length} names swept: ${breadth.improving} improving, ${breadth.deteriorating} deteriorating${
        model.priorReportDate ? ` against ${longDate(model.priorReportDate)}` : ''
      }. Money-flow direction is treated as the leading tell; a score on its own is only a snapshot.`,
    );
  }
  summary.push(
    `The sweep covers ${rows.length} names on the daily timeframe: ${cohort.calls?.length ?? 0} clear the constructive bar, ${cohort.puts?.length ?? 0} the deteriorating one, and ${cohort.watches?.length ?? 0} are on watch.`,
  );

  const sections = compact([
    { key: 'snapshot', title: 'Index and macro levels', kind: 'metrics', items: dailyMetrics(rowsBySymbol) },
    {
      key: 'sectors',
      title: 'Sector strength and weakness',
      kind: 'themes',
      intro: "Sectors ranked by the report's own average technical score.",
      items: dailySectors(rows),
    },
    {
      key: 'calls',
      title: COHORT_TITLES.calls,
      kind: 'movers',
      intro: 'Names clearing the score bar with money flow still behind them.',
      items: cohortMovers(cohort.calls ?? [], rowsBySymbol, 'up'),
    },
    {
      key: 'puts',
      title: COHORT_TITLES.puts,
      kind: 'movers',
      items: cohortMovers(cohort.puts ?? [], rowsBySymbol, 'down'),
    },
    {
      key: 'watches',
      title: COHORT_TITLES.watches,
      kind: 'movers',
      intro: 'Held back by fading flow, an upcoming catalyst, or seller exhaustion.',
      items: cohortMovers(cohort.watches ?? [], rowsBySymbol, 'flat'),
    },
    { key: 'universe', title: 'Full technical sweep', kind: 'table', ...dailyTable(rows) },
  ]);

  const headline = model.marketTheme
    ? model.marketTheme.split(/(?<=\.)\s/)[0]
    : `Daily technical sweep of ${rows.length} names for ${longDate(model.reportDate)}.`;

  return {
    payloadVersion: PAYLOAD_VERSION,
    reportType: 'DAILY',
    reportDate: model.reportDate,
    // The daily sweep runs during the session it reports on.
    tradingDate: model.reportDate,
    generatedAt: generatedAt ?? model.dataAsOf ?? new Date().toISOString(),
    dataAsOf: model.dataAsOf ?? null,
    timezone: 'America/New_York',
    title: `Daily Market Report — ${longDate(model.reportDate)}`,
    subtitle: null,
    // The daily sweep scores names, not the market: it states no single bias,
    // and one must not be manufactured from the cohort counts.
    marketBias: null,
    marketCondition: null,
    confidence: null,
    headline,
    executiveSummary: summary,
    sections,
    source: {
      generator: `${GENERATOR} daily sweep`,
      version: `model v${model.modelVersion ?? 1}`,
      feeds: { quotes: 'TradingView desktop (CDP)', timestamp: model.dataAsOfSource ?? 'unknown' },
      methodology:
        'Each name is scored from RSI versus its moving average, position against the Bollinger basis, and Chaikin Money Flow, then gated on the day-over-day CMF trend: a strong score with deteriorating flow is demoted to a watch, and a weak score with improving flow is removed from the bearish cohort. Names reporting earnings within two sessions are never placed in a directional cohort.',
      missing: {},
    },
    freshness: 'DAILY',
    payload: model,
  };
}

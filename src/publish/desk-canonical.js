/**
 * Desk model -> the AssetDecoded research contract.
 *
 * Section order follows the spec's layout exactly, because the order is part of
 * the product: a trader reads the market, then the dashboard, then the two
 * horizons, and only then the 56-name table. Nothing is computed here; every
 * figure is lifted from the model the engine already built.
 */

const n = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const etTime = (iso) => (iso ? new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
}).format(new Date(iso)) : null);

function toSetup(r, horizon) {
  const context = horizon === 'intraday'
    ? {
        'daily bias': r.daily?.ma?.aboveSma200 === true ? 'bullish context' : r.daily?.ma?.aboveSma200 === false ? 'bearish context' : 'N/A',
        RSI: n(r.daily?.rsi, 1),
        CMF: n(r.daily?.cmf, 3),
        'CMF prev': n(r.daily?.cmfTrend?.previous, 3),
        'flow trend': r.daily?.cmfTrend?.direction ?? 'N/A',
        '1H structure': r.structure1h?.structure ?? r.structure1h?.trend ?? 'N/A',
      }
    : {
        'weekly trend': r.weekly?.structure?.trend ?? 'N/A',
        '200 SMA': r.daily?.ma?.aboveSma200 === true ? 'above' : r.daily?.ma?.aboveSma200 === false ? 'below' : 'N/A',
        '50/200': r.daily?.ma?.goldenCross === true ? '50 above 200' : r.daily?.ma?.goldenCross === false ? '50 below 200' : 'N/A',
        '50 SMA slope': n(r.daily?.ma?.sma50Slope, 2),
        '21 EMA': n(r.daily?.ma?.ema21),
        ATR: n(r.daily?.atr),
        CMF: n(r.daily?.cmf, 3),
        'flow trend': r.daily?.cmfTrend?.direction ?? 'N/A',
        '4H timing': r.structure4h?.structure ?? r.structure4h?.trend ?? 'N/A',
      };

  const session = horizon === 'intraday' ? {
    ORH: n(r.openingRange?.high), ORL: n(r.openingRange?.low),
    'OR window': r.openingRange?.window ?? '09:30–10:00 ET',
    position: r.orPosition ?? 'N/A',
    VWAP: n(r.vwap), 'vs VWAP': r.aboveVwap == null ? 'N/A' : r.aboveVwap ? 'above' : 'below',
    RVOL: r.rvol ?? 'N/A',
    'premarket H/L': r.premarket?.high != null ? `${n(r.premarket.high)} / ${n(r.premarket.low)}` : 'N/A',
    'prev day H/L': r.previousDay?.high != null ? `${n(r.previousDay.high)} / ${n(r.previousDay.low)}` : 'N/A',
  } : undefined;

  const o = r.options ?? null;
  return {
    symbol: r.symbol,
    sector: r.sector ?? undefined,
    horizon,
    label: r.label,
    status: r.status,
    statusIcon: r.icon,
    statusReason: r.reason,
    statusAsOf: r.statusAsOf,
    direction: r.direction ?? null,
    price: n(r.price),
    setup: r.setup,
    setupReasons: (r.setupReasons ?? []).slice(0, 8),
    context,
    session,
    trigger: r.confirmation ? {
      condition: r.confirmation.condition,
      level: n(r.confirmation.trigger),
      confirmed: Boolean(r.confirmation.confirmed),
      closedCandleAt: r.confirmation.basis?.closedAt ? etTime(new Date(r.confirmation.basis.closedAt * 1000).toISOString()) : null,
    } : undefined,
    plan: r.plan ? {
      entry: { low: n(r.plan.entry?.low), high: n(r.plan.entry?.high) },
      invalidation: n(r.plan.invalidation),
      invalidationBasis: r.plan.invalidationBasis,
      targets: (r.plan.targets ?? []).map((t) => ({ price: n(t.price), basis: t.basis, projected: t.projected })),
      risk: n(r.plan.risk), reward: n(r.plan.reward), rr: n(r.plan.rr),
    } : undefined,
    options: o ? {
      grade: o.grade,
      reasons: (o.reasons ?? []).slice(0, 6),
      expiry: o.expiry ?? null,
      dte: o.dte ?? null,
      type: o.contract?.type ?? null,
      strike: n(o.contract?.strike),
      delta: n(o.contract?.delta, 3),
      impliedVolPct: o.ivContext?.impliedVol ?? null,
      realisedVolPct: o.ivContext?.realisedVol20d ?? null,
      openInterest: o.contract?.openInterest ?? null,
      contractVolume: o.contract?.volume ?? null,
      spreadPct: o.contract?.spreadPct ?? null,
      expectedMove: n(o.expectedMove?.absolute),
      ivRankNote: o.ivRank?.note,
    } : undefined,
    events: (r.events ?? []).slice(0, 10),
    dataGaps: (r.dataGaps ?? []).slice(0, 10),
  };
}

export function deskToCanonical(model) {
  const statusAsOf = etTime(model.generatedAt);
  const stamp = (r) => ({ ...r, statusAsOf });
  const sections = [];

  const m = model.market;
  sections.push({
    key: 'market', kind: 'metrics',
    title: 'Market overview',
    intro: `Intraday regime: ${m.intraday.regime} (${m.intraday.risk}). Swing environment: ${m.swing.regime}. ${m.intraday.notes.join(' ')}`,
    items: m.instruments.map((i) => ({
      key: i.key, label: i.label, value: n(i.price), unit: 'price',
      changePct: i.changePct, symbol: i.symbol,
      note: i.openingRange?.high != null
        ? `OR ${n(i.openingRange.low)}–${n(i.openingRange.high)}${i.vwap != null ? ` · VWAP ${n(i.vwap)}` : ''}`
        : undefined,
    })),
  });

  if (m.breadth?.complete) {
    sections.push({
      key: 'breadth', kind: 'list', title: 'Breadth',
      items: [
        `${m.breadth.aboveEma21} of ${m.breadth.sample} names (${m.breadth.aboveEma21Pct}%) are above their 21 EMA.`,
        `${m.breadth.above200} of ${m.breadth.sample} (${m.breadth.above200Pct}%) are above their 200 SMA.`,
        `Money flow is improving on ${m.breadth.flowImproving} names and deteriorating on ${m.breadth.flowDeteriorating}, of ${m.breadth.flowSample} with a readable trend.`,
      ],
    });
  }

  // The dashboard answers "what do the two horizons say" in one glance.
  const symbols = [...new Set([...model.intraday.candidates.map((r) => r.symbol), ...model.swing.candidates.map((r) => r.symbol)])];
  if (symbols.length) {
    sections.push({
      key: 'dashboard', kind: 'table',
      title: 'Combined timeframe dashboard',
      intro: 'Intraday and swing are assessed independently. A conflict between them is an expected outcome, not an error.',
      columns: [
        { key: 'symbol', label: 'Ticker' }, { key: 'price', label: 'Price', align: 'right' },
        { key: 'intradayBias', label: 'Intraday bias' }, { key: 'intradayStatus', label: 'Intraday status' },
        { key: 'swingBias', label: 'Swing bias' }, { key: 'swingStatus', label: 'Swing status' },
        { key: 'conflict', label: 'Conflict' }, { key: 'event', label: 'Event' },
      ],
      rows: symbols.map((sym) => {
        const i = model.intraday.candidates.find((r) => r.symbol === sym);
        const s = model.swing.candidates.find((r) => r.symbol === sym);
        const conflict = i?.direction && s?.direction && i.direction !== s.direction;
        return {
          symbol: sym,
          price: n(i?.price ?? s?.price),
          intradayBias: i?.direction ?? '—',
          intradayStatus: i?.status ?? '—',
          swingBias: s?.direction ?? '—',
          swingStatus: s?.status ?? '—',
          conflict: conflict ? 'YES' : 'no',
          event: (i?.events ?? s?.events ?? [])[0]?.title ?? '—',
        };
      }),
    });
  }

  sections.push({
    key: 'intraday-top', kind: 'setups', horizon: 'intraday',
    title: 'Top intraday / 0DTE setups',
    intro: `Status reflects the market snapshot at ${statusAsOf} ET and is not continuously updated. A WATCH setup will not change on its own — the trigger is stated so it can be followed manually.${model.freshness.onSchedule === false ? ' This run was taken outside the usual 10:10 AM window.' : ''}`,
    items: model.intraday.top.map((r) => toSetup(stamp(r), 'intraday')),
  });

  const intradayRest = model.intraday.candidates.filter((r) => !model.intraday.top.includes(r));
  if (intradayRest.length) {
    sections.push({
      key: 'intraday-watchlist', kind: 'setups', horizon: 'intraday',
      title: 'Intraday watchlist',
      intro: 'Shortlisted names that did not qualify as a top setup, with the reason each fell short.',
      items: intradayRest.map((r) => toSetup(stamp(r), 'intraday')),
    });
  }

  sections.push({
    key: 'swing-top', kind: 'setups', horizon: 'swing',
    title: 'Top swing / 90–120 DTE setups',
    intro: 'Assessed on weekly, daily and 4H structure. Intraday weakness does not invalidate these, and a 15m move never will.',
    items: model.swing.top.map((r) => toSetup(stamp(r), 'swing')),
  });

  const swingRest = model.swing.candidates.filter((r) => !model.swing.top.includes(r));
  if (swingRest.length) {
    sections.push({
      key: 'swing-watchlist', kind: 'setups', horizon: 'swing',
      title: 'Swing watchlist',
      items: swingRest.map((r) => toSetup(stamp(r), 'swing')),
    });
  }

  if (model.conflicts.length) {
    sections.push({
      key: 'conflicts', kind: 'conflicts',
      title: 'Timeframe conflicts',
      intro: 'The same name reading differently on two horizons. Both readings stand.',
      items: model.conflicts.map((c) => ({
        symbol: c.symbol,
        intraday: `${c.intraday.direction} / ${c.intraday.status}`,
        swing: `${c.swing.direction} / ${c.swing.status}`,
        explanation: c.explanation,
      })),
    });
  }

  sections.push({
    key: 'sectors', kind: 'themes',
    title: 'Sector rotation',
    intro: 'Ranked on the direction of money flow first and the static picture second.',
    items: model.sectors.map((s) => ({
      name: `${s.name} — ${s.classification}`,
      changePct: s.avgChangePct,
      relativePct: s.relativeStrength,
      tone: s.classification === 'LEADING' || s.classification === 'IMPROVING' ? 'positive'
        : s.classification === 'LAGGING' || s.classification === 'WEAKENING' ? 'negative' : 'neutral',
      note: `Participation ${s.score ?? 'N/A'}${s.scoreChange != null ? ` (${s.scoreChange >= 0 ? '+' : ''}${s.scoreChange} vs prior session)` : ''} · flow ${s.flowDirection ?? 'N/A'} · ${s.improving} improving / ${s.deteriorating} deteriorating of ${s.flowSample} · ${s.structure}.`,
    })),
  });

  sections.push({
    key: 'sweep', kind: 'table',
    title: 'Full technical sweep',
    intro: 'Context and filtering for the whole universe. Deep intraday and options analysis is run only on shortlisted names.',
    columns: [
      { key: 'symbol', label: 'Ticker' }, { key: 'sector', label: 'Sector' },
      { key: 'price', label: 'Price', align: 'right' }, { key: 'changePct', label: 'Change %', align: 'right' },
      { key: 'rsi', label: 'RSI', align: 'right' }, { key: 'cmf', label: 'CMF', align: 'right' },
      { key: 'cmfTrend', label: 'Flow trend' }, { key: 'structure', label: 'Structure' },
      { key: 'sma200', label: '200 SMA' }, { key: 'sma50', label: '50 SMA' }, { key: 'ema21', label: '21 EMA' },
    ],
    rows: model.sweep.map((r) => ({
      symbol: r.symbol, sector: r.sector, price: n(r.price), changePct: r.changePct,
      rsi: r.rsi, cmf: r.cmf, cmfTrend: r.cmfTrend ?? 'N/A', structure: r.structure ?? 'N/A',
      sma200: r.aboveSma200 == null ? 'N/A' : r.aboveSma200 ? 'above' : 'below',
      sma50: r.aboveSma50 == null ? 'N/A' : r.aboveSma50 ? 'above' : 'below',
      ema21: r.aboveEma21 == null ? 'N/A' : r.aboveEma21 ? 'above' : 'below',
    })),
  });

  const f = model.freshness;
  sections.push({
    key: 'freshness', kind: 'list', title: 'Data freshness',
    intro: f.note,
    items: [
      `Report snapshot: ${statusAsOf} ET.`,
      `Opening range: ${f.openingRangeWindow}, fixed and unchanged between sessions.`,
      f.lastClosed15m ? `Last closed 15-minute candle: ${f.lastClosed15m} ET.` : 'Last closed 15-minute candle: N/A.',
      'The candle in progress at snapshot time is excluded from every confirmation test.',
      ...(Object.keys(model.errors ?? {}).length
        ? [`Data unavailable for: ${Object.keys(model.errors).join(', ')}. Affected names are capped at WATCH or NO TRADE.`]
        : []),
    ],
  });

  sections.push({
    key: 'methodology', kind: 'prose', title: 'Methodology',
    paragraphs: [
      'The universe is filtered before any expensive analysis runs. All names are screened on daily trend, money-flow direction and sector, which narrows the field to roughly twelve intraday and twelve swing candidates chosen independently of each other. Only those receive 1H and 15-minute structure, opening-range and VWAP analysis, relative volume and an option-chain assessment.',
      'A directional bias is not a trade. An intraday setup becomes CONFIRMED only when a closed 15-minute candle has already satisfied a stated trigger and the reward-to-risk, money-flow and option-liquidity gates all pass. Anything short of that is WATCH, with the exact condition printed so it can be followed manually.',
      'The two horizons never share rules. Intraday invalidation comes from 15-minute and 1H structure; swing invalidation from daily and 4H structure. A 15-minute breakdown cannot invalidate a three-month thesis, and a bullish weekly trend cannot rescue a failed intraday setup.',
      'Targets are levels the market has already reacted to. Where no such level sits ahead of the entry, the setup is not promoted, because a projection chosen to produce an attractive ratio is not a target. Missing data reduces confidence rather than being passed over: an unreadable money-flow trend, an unavailable chain or an incomplete opening range each cap a setup below CONFIRMED and are listed on the card.',
      'This is educational and analytical material, not personalised financial advice.',
    ],
  });

  const intradayLine = `${model.market.intraday.regime} intraday, ${model.market.swing.regime.toLowerCase()} on the swing horizon`;
  return {
    payloadVersion: 1,
    reportType: 'DAILY',
    reportDate: model.date,
    tradingDate: model.date,
    generatedAt: model.generatedAt,
    dataAsOf: model.generatedAt,
    freshness: 'DELAYED',
    title: `Daily Market Report — ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'long' }).format(new Date(model.generatedAt))}`,
    headline: `${intradayLine}. ${model.intraday.top.length} intraday and ${model.swing.top.length} swing setups cleared the funnel from ${model.sweep.length} names.`,
    marketBias: null,
    executiveSummary: [
      `Intraday regime is ${model.market.intraday.regime.toLowerCase()} with a ${model.market.intraday.risk} tone. ${model.market.intraday.notes[0] ?? ''}`.trim(),
      `The swing environment reads ${model.market.swing.regime.toLowerCase()}. ${model.market.swing.notes[0] ?? ''}`.trim(),
      model.intraday.top.length
        ? `${model.intraday.top.length} intraday setup${model.intraday.top.length === 1 ? '' : 's'} cleared every gate: ${model.intraday.top.map((r) => `${r.symbol} (${r.status.toLowerCase()})`).join(', ')}.`
        : 'No intraday setup cleared the trigger, risk and options gates at this snapshot. The funnel exists to reject, and an empty list is a result rather than a gap.',
      model.swing.top.length
        ? `${model.swing.top.length} swing setup${model.swing.top.length === 1 ? '' : 's'} qualified on weekly, daily and 4H structure: ${model.swing.top.map((r) => `${r.symbol} (${r.status.toLowerCase()})`).join(', ')}.`
        : 'No swing candidate qualified on weekly, daily and 4H structure with workable reward-to-risk.',
      ...(model.conflicts.length
        ? [`${model.conflicts.length} name${model.conflicts.length === 1 ? '' : 's'} read differently across the two horizons: ${model.conflicts.map((c) => c.symbol).join(', ')}. Both readings stand.`]
        : []),
    ],
    source: {
      generator: 'tradingview-mcp desk',
      version: String(model.modelVersion),
      feeds: {
        bars: 'Yahoo Finance chart API — daily, weekly, 1H and 15m including pre/post session',
        options: 'Cboe delayed quotes — implied volatility, greeks, open interest and contract volume',
        universe: 'Daily technical sweep taxonomy (56 names)',
      },
      methodology: 'Funnel: full universe screened on daily trend, money flow and sector, narrowed to roughly twelve intraday and twelve swing candidates chosen independently, then 1H/15m structure, opening range, VWAP, relative volume and option-chain quality on the survivors only. CONFIRMED requires a closed-candle trigger plus reward-to-risk, flow and option-liquidity gates.',
      missing: model.errors ?? {},
    },
    sections,
  };
}

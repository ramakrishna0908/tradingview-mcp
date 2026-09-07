/**
 * tv premarket — Daily Premarket Market Direction Report.
 *
 *   tv premarket                       build today's report (JSON + Markdown + HTML)
 *   tv premarket --news news.json      include overnight headlines collected by the morning task
 *   tv premarket --date 2026-09-08     build for a specific New York date
 *   tv premarket --print               print the Markdown instead of the JSON summary
 *   tv premarket --open                open the HTML report in the default browser (macOS)
 *
 * Inputs are public feeds (Yahoo quotes, ForexFactory calendar, Nasdaq
 * earnings); a feed failure is reported inside the report, never fatal.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { register } from '../router.js';
import { runReport, summarize, DEFAULT_OUT_DIR } from '../../premarket/index.js';
import { etDate } from '../../premarket/data.js';

register('premarket', {
  description: 'Daily Premarket Market Direction Report (futures, VIX, yields, dollar, crude, sectors, levels, events)',
  options: {
    date: { type: 'string', description: 'New York date YYYY-MM-DD (default today)' },
    news: { type: 'string', description: 'JSON file of overnight headlines: [{headline, source, impact, note, flip, time}]' },
    out: { type: 'string', description: `Output directory (default ${DEFAULT_OUT_DIR})` },
    print: { type: 'boolean', description: 'Print the Markdown report to stdout' },
    open: { type: 'boolean', description: 'Open the HTML report in the default browser' },
    quiet: { type: 'boolean', description: 'No progress lines on stderr' },
  },
  handler: async (values) => {
    const date = values.date || etDate();
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error('--date must be YYYY-MM-DD');
    let news = [];
    let newsSource = null;
    if (values.news) {
      const raw = JSON.parse(readFileSync(resolve(values.news), 'utf8'));
      news = Array.isArray(raw) ? raw : (raw.items ?? []);
      newsSource = raw.source ?? `morning task (${values.news})`;
    }
    const log = values.quiet ? () => {} : m => console.error(`[premarket] ${m}`);
    const { report, paths } = await runReport({ date, outDir: values.out ? resolve(values.out) : DEFAULT_OUT_DIR, news, newsSource, log });
    if (values.open && process.platform === 'darwin') spawn('/usr/bin/open', [paths.html], { detached: true, stdio: 'ignore' }).unref();
    if (values.print) {
      console.log(readFileSync(paths.md, 'utf8'));
      process.exit(0);
    }
    return {
      date: report.date,
      sessionDate: report.sessionDate,
      holiday: report.holiday?.name ?? null,
      bias: report.bias,
      confidence: report.confidence,
      composite: report.composite,
      drivers: report.drivers.map(d => d.text),
      strength: report.sectors.strength.map(s => s.name),
      weakness: report.sectors.weakness.map(s => s.name),
      highImpact: report.events.filter(e => e.impact === 'High').map(e => `${e.time} ${e.title}`),
      eventCount: report.events.length,
      newsCount: report.events.filter(e => e.type === 'news').length,
      missing: Object.keys(report.missing),
      summary: summarize(report),
      paths,
    };
  },
});

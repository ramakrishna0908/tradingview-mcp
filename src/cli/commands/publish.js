/**
 * tv publish — send a generated report to AssetDecoded.
 *
 *   tv publish --type premarket                 publish today's premarket brief
 *   tv publish --type daily --date 2026-09-24   publish a specific session
 *   tv publish --type premarket --dry-run       build the payload, post nothing
 *
 * This runs AFTER the report and its files exist. It reads the model the
 * generator already wrote and posts it; it never regenerates or edits a
 * report. Exit code 0 on success, 3 on a publish failure — distinct from the
 * generic error code so a caller can tell "the report is fine but did not
 * publish" from "the report failed".
 */
import { register } from '../router.js';
import { publish, loadConfig, PublishError } from '../../publish/index.js';
import { etDate } from '../../premarket/data.js';

register('publish', {
  description: 'Publish a generated report to AssetDecoded (premarket | daily)',
  options: {
    type: { type: 'string', description: 'premarket | daily' },
    date: { type: 'string', description: 'New York date YYYY-MM-DD (default today)' },
    'dry-run': { type: 'boolean', description: 'Build and print the payload without posting' },
    quiet: { type: 'boolean', description: 'No progress lines on stderr' },
  },
  handler: async (values) => {
    const type = values.type;
    if (type !== 'premarket' && type !== 'daily') {
      throw new Error('--type must be "premarket" or "daily"');
    }
    const date = values.date || etDate();
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error('--date must be YYYY-MM-DD');

    const log = values.quiet ? () => {} : (m) => console.error(`[publish] ${m}`);

    if (values['dry-run']) {
      // Reach for the mappers through the same path a real publish uses, but
      // swap in a fetch that never leaves the machine.
      const fake = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, action: 'dry-run' }),
      });
      const { payload } = await publish({
        type, date, log,
        fetchImpl: fake,
        baseUrl: 'https://dry-run.invalid',
        secret: 'dry-run',
      });
      return {
        dryRun: true,
        reportType: payload.reportType,
        tradingDate: payload.tradingDate,
        reportDate: payload.reportDate,
        generatedAt: payload.generatedAt,
        dataAsOf: payload.dataAsOf,
        marketBias: payload.marketBias,
        headline: payload.headline,
        sections: payload.sections.map((s) => ({
          key: s.key,
          kind: s.kind,
          size: s.items?.length ?? s.rows?.length ?? s.paragraphs?.length ?? 0,
        })),
        bytes: JSON.stringify(payload).length,
      };
    }

    const { baseUrl } = loadConfig();
    try {
      const { payload, result } = await publish({ type, date, log });
      log(`ok — ${result.action ?? 'published'} ${payload.reportType} ${payload.tradingDate}`);
      return {
        published: true,
        target: baseUrl,
        reportType: payload.reportType,
        tradingDate: payload.tradingDate,
        generatedAt: payload.generatedAt,
        publishedAt: result.publishedAt ?? null,
        action: result.action ?? null,
        sections: payload.sections.length,
      };
    } catch (err) {
      const detail = err instanceof PublishError ? err.detail : null;
      log(`FAILED — ${err.message}${detail ? ` :: ${JSON.stringify(detail)}` : ''}`);
      // A publish failure must not read as a report failure.
      console.log(JSON.stringify({
        published: false,
        target: baseUrl,
        reportType: type.toUpperCase(),
        date,
        error: err.message,
        detail,
      }, null, 2));
      process.exit(3);
    }
  },
});

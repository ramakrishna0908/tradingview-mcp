/**
 * tv desk — the 10:10 ET decision-support report.
 *
 *   tv desk                     run and write the model
 *   tv desk --publish           also publish it to AssetDecoded
 *   tv desk --dry-run           build the payload, post nothing
 *   tv desk --limit 8           smaller universe, for a quick check
 *
 * Exit codes: 0 success, 3 the report ran but publishing failed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from '../router.js';
import { runDesk, loadUniverse } from '../../desk/index.js';
import { deskToCanonical } from '../../publish/desk-canonical.js';
import { postReport, loadConfig, PublishError } from '../../publish/index.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = join(REPO, 'docs', 'reports', 'desk');

register('desk', {
  description: 'Intraday/0DTE and swing/90-120 DTE decision-support report',
  options: {
    date: { type: 'string', description: 'Label the run with this New York date' },
    limit: { type: 'string', description: 'Only analyse the first N universe names' },
    publish: { type: 'boolean', description: 'Publish the report to AssetDecoded' },
    'dry-run': { type: 'boolean', description: 'Build the payload without posting' },
    out: { type: 'string', description: `Output directory (default ${OUT_DIR})` },
    quiet: { type: 'boolean', description: 'No progress lines on stderr' },
  },
  handler: async (values) => {
    const log = values.quiet ? () => {} : (m) => console.error(`[desk] ${m}`);
    let universe = loadUniverse();
    if (values.limit) universe = universe.slice(0, Number(values.limit));

    const model = await runDesk({ log, universe });
    const canonical = deskToCanonical(model);

    const outDir = values.out ? values.out : OUT_DIR;
    mkdirSync(outDir, { recursive: true });
    const base = join(outDir, `desk-${model.date}`);
    writeFileSync(`${base}.model.json`, JSON.stringify(model, null, 2));
    writeFileSync(`${base}.payload.json`, JSON.stringify(canonical, null, 2));
    log(`model -> ${base}.model.json`);

    const summary = {
      date: model.date,
      intradayRegime: model.market.intraday.regime,
      swingRegime: model.market.swing.regime,
      universe: model.sweep.length,
      intradayCandidates: model.intraday.candidates.length,
      intradayTop: model.intraday.top.map((r) => `${r.symbol} ${r.status}`),
      swingCandidates: model.swing.candidates.length,
      swingTop: model.swing.top.map((r) => `${r.symbol} ${r.status}`),
      conflicts: model.conflicts.map((c) => c.symbol),
      sections: canonical.sections.length,
      dataErrors: Object.keys(model.errors ?? {}).length,
      paths: { model: `${base}.model.json`, payload: `${base}.payload.json` },
    };

    if (values['dry-run']) return { ...summary, published: false, dryRun: true };
    if (!values.publish) return summary;

    try {
      const res = await postReport(canonical, { ...loadConfig(), log });
      return { ...summary, published: true, target: res?.target ?? null, action: res?.action ?? null };
    } catch (err) {
      // The report itself is on disk and correct; only the post failed.
      const detail = err instanceof PublishError ? err.detail ?? null : null;
      console.error(`[desk] publish FAILED — ${err.message}`);
      if (detail) console.error(JSON.stringify(detail, null, 2));
      process.exitCode = 3;
      return { ...summary, published: false, error: err.message, detail };
    }
  },
});

/**
 * tv social — Social summary table + compliance-gated X post workflow.
 *
 *   tv social table   --report docs/reports/daily-2026-08-31.html [--format md|text|json]
 *   tv social draft   --report <html> [--symbol AAPL]
 *   tv social list    [--status approved]
 *   tv social show    <draftId>
 *   tv social validate <draftId>
 *   tv social edit    <draftId> --file new-text.txt | --text "..."
 *   tv social approve <draftId> [--acknowledge-stale "reason"]
 *   tv social reject  <draftId> --reason "..."
 *   tv social publish <draftId>            (official X API, env credentials)
 *   tv social record  <draftId> --post-id <id> [--url <url>]
 *   tv social auto    [--report <html>] [--dry-run]   policy-gated unattended publish
 *
 * Manual commands never auto-publish. `auto` publishes only what passes every
 * guard in config posting.autoPublish and is audited like a human approval.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from '../router.js';
import { SocialWorkflow, renderMarkdownTable, renderTextTable, tableRow, TABLE_COLUMNS } from '../../social/index.js';
import { loadReportModel } from '../../social/report-model.js';

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const REPORTS_DIR = join(ROOT, 'docs', 'reports');

function latestReport() {
  if (!existsSync(REPORTS_DIR)) return null;
  const files = readdirSync(REPORTS_DIR).filter(f => /^daily-\d{4}-\d\d-\d\d\.html$/.test(f)).sort();
  return files.length ? join(REPORTS_DIR, files.at(-1)) : null;
}

function reportPathFrom(values, rec = null) {
  let p = values.report || rec?.reportPath || latestReport();
  if (!p) throw new Error('No report found; pass --report <path>');
  p = p.replace(/^file:\/\//, '');
  return resolve(p);
}

// The router prints a handler's return value as JSON; human-readable modes
// print themselves and exit explicitly so nothing extra is echoed.
function out(obj) {
  return obj;
}

function done(code = 0) {
  process.exit(code);
}

function summarizeIssues(issues) {
  return issues.map(i => `${i.severity === 'block' ? '✖' : '⚠'} ${i.code}: ${i.message}`);
}

function printRecord(rec) {
  const text = rec.editedText ?? rec.originalText;
  console.log(`# ${rec.id}  [${rec.status}]  ${rec.setup.signal} · ${rec.setup.confidence} · ${rec.setup.setup}`);
  console.log(`report ${rec.reportDate} · data as of ${rec.dataAsOf}`);
  if (rec.approval) console.log(`approved by ${rec.approval.by} at ${rec.approval.at}`);
  if (rec.staleAcknowledged) console.log(`stale data acknowledged by ${rec.staleAcknowledged.by}: ${rec.staleAcknowledged.reason}`);
  if (rec.publication) console.log(`published ${rec.publication.at} · ${rec.publication.url} (${rec.publication.method})`);
  if (rec.error) console.log(`error: ${rec.error}`);
  if (rec.chart) console.log(rec.chart.path ? `chart: ${rec.chart.path} (${rec.chart.bars} bars to ${rec.chart.lastBar})` : `chart: none — ${rec.chart.error}`);
  console.log('\n' + text + '\n');
  if (rec.issues?.length) console.log(summarizeIssues(rec.issues).join('\n'));
  else console.log('✔ no compliance issues');
}

const reportOpt = { report: { type: 'string', short: 'r', description: 'Path to daily report HTML (default: latest in docs/reports)' } };
const jsonOpt = { json: { type: 'boolean', description: 'JSON output' } };

const subcommands = new Map([
  ['table', {
    description: 'Social summary table for a report',
    options: { ...reportOpt, format: { type: 'string', short: 'f', description: 'md | text | json (default md)' }, all: { type: 'boolean', description: 'Include defense/macro rows' } },
    handler: async (values) => {
      const wf = new SocialWorkflow();
      const { model, source } = loadReportModel(reportPathFrom(values));
      const table = wf.summaryTable(model, values.all ? { groups: ['main', 'anness', 'defense', 'macro'] } : undefined);
      const fmt = values.format || 'md';
      if (fmt === 'json') return out({ reportDate: model.reportDate, dataAsOf: model.dataAsOf, modelSource: source, columns: TABLE_COLUMNS, rows: table.map(tableRow), setups: table });
      console.log(`Report ${model.reportDate} · data as of ${model.dataAsOf} (${source === 'json' ? 'cached model' : 'parsed from HTML → model cached'})`);
      if (model.cohort) console.log(`Report cohort — Calls: ${model.cohort.calls.map(x => x.symbol).join(', ') || '—'} · Puts: ${model.cohort.puts.map(x => x.symbol).join(', ') || '—'}`);
      console.log('');
      console.log(fmt === 'text' ? renderTextTable(table) : renderMarkdownTable(table));
      done();
    },
  }],
  ['draft', {
    description: 'Generate drafts for the highest-quality setups (or --symbol)',
    options: { ...reportOpt, symbol: { type: 'string', short: 's', description: 'Draft one specific ticker' }, ...jsonOpt },
    handler: async (values) => {
      const wf = new SocialWorkflow();
      const path = reportPathFrom(values);
      const { model } = loadReportModel(path);
      const recs = await wf.draft(model, { symbol: values.symbol, reportPath: path });
      if (values.json) return out(recs);
      if (!recs.length) console.log('No setups meet the posting bar (see config/social-compliance.json → posting).');
      for (const r of recs) { printRecord(r); console.log('─'.repeat(60)); }
      done();
    },
  }],
  ['list', {
    description: 'List drafts and their status',
    options: { status: { type: 'string', description: 'Filter by status' }, ...jsonOpt },
    handler: async (values) => {
      const wf = new SocialWorkflow();
      let recs = wf.audit.latest();
      if (values.status) recs = recs.filter(r => r.status === values.status);
      if (values.json) return out(recs);
      for (const r of recs) {
        const blockers = (r.issues || []).filter(i => i.severity === 'block').length;
        console.log(`${r.id.padEnd(30)} ${r.status.padEnd(10)} ${r.setup.signal.padEnd(9)} ${r.setup.confidence.padEnd(6)} ${blockers ? `${blockers} blocking` : 'clean'}${r.publication ? '  ' + r.publication.url : ''}`);
      }
      if (!recs.length) console.log('(no drafts)');
      done();
    },
  }],
  ['show', {
    description: 'Show a draft, its text and compliance issues',
    options: { ...jsonOpt, history: { type: 'boolean', description: 'Show full audit history' } },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const rec = wf.mustGet(positionals[0]);
      if (values.history) return out(wf.audit.history(rec.id));
      if (values.json) return out(rec);
      printRecord(rec);
      done();
    },
  }],
  ['validate', {
    description: 'Re-run compliance validation on a draft',
    options: { ...reportOpt, ...jsonOpt },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const rec = wf.mustGet(positionals[0]);
      const { model } = loadReportModel(reportPathFrom(values, rec));
      const next = wf.validate(rec.id, model);
      if (values.json) return out(next);
      printRecord(next);
      done(next.issues.some(i => i.severity === 'block') ? 1 : 0);
    },
  }],
  ['edit', {
    description: 'Replace the post text (invalidates any approval)',
    options: { ...reportOpt, file: { type: 'string', description: 'Read new text from file' }, text: { type: 'string', description: 'New text inline' }, ...jsonOpt },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const rec = wf.mustGet(positionals[0]);
      const text = values.file ? readFileSync(values.file, 'utf8').replace(/\n$/, '') : values.text;
      if (!text) throw new Error('Provide --file or --text');
      const { model } = loadReportModel(reportPathFrom(values, rec));
      const next = wf.edit(rec.id, text, model);
      if (values.json) return out(next);
      printRecord(next);
      done();
    },
  }],
  ['approve', {
    description: 'Approve a draft (refused if any blocking issue remains)',
    options: { ...reportOpt, 'acknowledge-stale': { type: 'string', description: 'Reason for publishing data older than the freshness limit (audited)' }, ...jsonOpt },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const rec = wf.mustGet(positionals[0]);
      const { model } = loadReportModel(reportPathFrom(values, rec));
      try {
        const next = wf.approve(rec.id, model, { acknowledgeStale: values['acknowledge-stale'] });
        if (values.json) return out(next);
        printRecord(next);
        done();
      } catch (err) {
        if (err.issues) {
          console.error(err.message);
          console.error(summarizeIssues(err.issues).join('\n'));
          process.exit(1);
        }
        throw err;
      }
    },
  }],
  ['reject', {
    description: 'Reject a draft with a reason',
    options: { reason: { type: 'string', description: 'Why' }, ...jsonOpt },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const next = wf.reject(positionals[0], values.reason || '');
      if (values.json) return out(next);
      printRecord(next);
      done();
    },
  }],
  ['publish', {
    description: 'Publish an APPROVED draft via the official X API',
    options: { ...reportOpt, ...jsonOpt },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const rec = wf.mustGet(positionals[0]);
      const { model } = loadReportModel(reportPathFrom(values, rec));
      const next = await wf.publish(rec.id, model);
      if (values.json) return out(next);
      printRecord(next);
      done(next.status === 'published' ? 0 : 1);
    },
  }],
  ['record', {
    description: 'Record an approved draft that was posted manually (audit only)',
    options: { ...reportOpt, 'post-id': { type: 'string', description: 'X post id' }, url: { type: 'string', description: 'X post URL' }, ...jsonOpt },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const rec = wf.mustGet(positionals[0]);
      const { model } = loadReportModel(reportPathFrom(values, rec));
      const next = wf.recordManualPublication(rec.id, model, { xPostId: values['post-id'], url: values.url });
      if (values.json) return out(next);
      printRecord(next);
      done();
    },
  }],
]);

subcommands.set('auto', {
  description: 'Policy-gated auto-publish for the latest report (see config posting.autoPublish)',
  options: { ...reportOpt, 'dry-run': { type: 'boolean', description: 'Evaluate the policy and show what would be posted, without posting' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const path = reportPathFrom(values);
    const { model } = loadReportModel(path);
    const summary = await wf.autoPublish(model, { reportPath: path, dryRun: !!values['dry-run'] });
    if (values.json) return out(summary);
    console.log(`auto-publish · report ${summary.reportDate}${summary.dryRun ? ' · DRY RUN' : ''}`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    if (summary.cohort) console.log(`report cohort — Calls: ${summary.cohort.calls.join(', ') || '—'} · Puts: ${summary.cohort.puts.join(', ') || '—'}`);
    for (const p of summary.published) {
      console.log(`\n${p.dryRun ? 'WOULD POST' : 'POSTED'} ${p.symbol}${p.cohort ? ' [' + p.cohort + ']' : ''} (${p.id})${p.url ? ' → ' + p.url : ''}\n${p.text}`);
      if (p.chart) console.log(`chart: ${p.chart}${p.chartNote ? ' — ' + p.chartNote : ''}`);
      else if (p.chartError) console.log(`chart: none — ${p.chartError}`);
    }
    for (const s of summary.skipped) console.log(`skip ${s.symbol.padEnd(6)} ${s.signal}/${s.confidence.padEnd(6)} ${s.setup} — ${s.reason}`);
    if (summary.capped) console.log(`(stopped at maxPostsPerRun = ${summary.policy.maxPostsPerRun})`);
    if (!summary.published.length) console.log('\nnothing published');
    done(0);
  },
});

register('social', {
  description: 'Social summary table + compliance-gated X post workflow',
  subcommands,
});

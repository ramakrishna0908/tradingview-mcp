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
 *   tv social retract <draftId> --reason "..."    post was deleted on X
 *   tv social auto    [--report <html>] [--dry-run]   policy-gated unattended publish
 *   tv social launch  [--item <id|n>] [--list]         the 14-post launch sequence
 *
 * Manual commands never auto-publish. `auto` publishes only what passes every
 * guard in config posting.autoPublish and is audited like a human approval.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from '../router.js';
import { SocialWorkflow, renderMarkdownTable, renderTextTable, tableRow, TABLE_COLUMNS, collectPostMetrics, collectAccountMetrics, recordManual, buildReport, writeInsights, renderReportMarkdown, METRIC_FIELDS } from '../../social/index.js';
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
  ['retract', {
    description: 'Record that a published post was deleted on X (keeps the publication in the trail, frees the slot)',
    options: { reason: { type: 'string', description: 'Why it came down' } },
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      if (!values.reason) throw new Error('--reason is required');
      const rec = wf.retract(positionals[0], values.reason);
      console.log(`retracted ${rec.id} · was ${rec.retraction.url ?? '(no url)'} · ${rec.retraction.reason}`);
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
      // Only setup, thread and follow-up records are backed by a sweep report;
      // a scorecard, explainer or premarket record carries its own numbers.
      const model = ['setup', 'thread', 'followup'].includes(rec.kind ?? 'setup') ? loadReportModel(reportPathFrom(values, rec)).model : null;
      const next = wf.recordManualPublication(rec.id, model, { xPostId: values['post-id'], url: values.url });
      if (values.json) return out(next);
      printRecord(next);
      done();
    },
  }],
]);

subcommands.set('ready', {
  description: 'Policy-approved posts waiting for the browser poster (status ready_to_post)',
  options: { ...jsonOpt, queue: { type: 'string', description: "Only this sweep's queue: stocks | crypto" } },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const expired = wf.expireStaleReady({ queue: values.queue ?? null });
    if (expired.length && !values.json) for (const e of expired) console.error(`expired ${e.id} — ${e.expiredReason}`);
    const recs = wf.ready({ queue: values.queue ?? null }).map(r => ({ id: r.id, queue: r.queue ?? 'stocks', kind: r.kind ?? 'setup', stage: r.stage ?? null, topic: r.topic ?? null, symbol: r.symbol, reportDate: r.reportDate, text: r.editedText ?? r.originalText, chart: r.chart?.path ?? null, altText: r.chart?.altText ?? null, replyTo: r.replyToPost ?? null }));
    if (values.json) return out(recs);
    for (const r of recs) { console.log(`# ${r.id}\n${r.text}\nchart: ${r.chart ?? 'none'}\n`); }
    if (!recs.length) console.log('(nothing ready to post)');
    done();
  },
});

subcommands.set('rehearse', {
  description: 'Rehearsal queue for the browser poster: text + chart from the latest report, no guards, no audit, cannot be recorded',
  options: { ...reportOpt, limit: { type: 'string', description: 'How many (default 1)' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const path = reportPathFrom(values);
    const { model } = loadReportModel(path);
    const recs = await wf.rehearse(model, { limit: Number(values.limit || 1) });
    if (values.json) return out(recs);
    for (const r of recs) console.log(`# ${r.id} (REHEARSAL — do not post)\n${r.text}\nchart: ${r.chart ?? 'none'}\n`);
    done();
  },
});

subcommands.set('close-update', {
  description: 'CLOSE CHECK reply under today\'s setup post: last price vs the setup price and the 🎯/🛑 status so far (run ~3:50 PM ET)',
  options: { 'dry-run': { type: 'boolean', description: 'Draft and show, queue nothing' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const summary = await wf.closeUpdate({ dryRun: !!values['dry-run'] });
    if (values.json) return out(summary);
    console.log(`close-update · queue ${summary.queue}${summary.dryRun ? ' · DRY RUN' : ''} · ${summary.checked} setup(s) posted today`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    for (const q of summary.queued) console.log(`\n${q.dryRun ? 'WOULD QUEUE' : q.ready ? 'READY (browser reply)' : 'POSTED'} ${q.symbol} (${q.id})${q.replyToUrl ? ' ↩ ' + q.replyToUrl : ''}${q.url ? ' → ' + q.url : ''}\n${q.text}`);
    for (const s of summary.skipped) console.log(`skip ${s.symbol.padEnd(6)} — ${s.reason}`);
    if (!summary.queued.length) console.log('\nnothing queued');
    done(0);
  },
});

subcommands.set('auto', {
  description: 'Policy-gated auto-publish for the latest report (see config posting.autoPublish)',
  options: { ...reportOpt, 'dry-run': { type: 'boolean', description: 'Evaluate the policy and show what would be posted, without posting' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const path = reportPathFrom(values);
    const { model } = loadReportModel(path);
    const summary = await wf.autoPublish(model, { reportPath: path, dryRun: !!values['dry-run'] });
    if (values.json) return out(summary);
    console.log(`auto-publish · report ${summary.reportDate}${summary.dryRun ? ' · DRY RUN' : ''}${summary.via ? ' · via ' + summary.via : ''}`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    if (summary.cohort) console.log(`report cohort — Calls: ${summary.cohort.calls.join(', ') || '—'} · Puts: ${summary.cohort.puts.join(', ') || '—'}`);
    for (const p of summary.published) {
      console.log(`\n${p.dryRun ? 'WOULD POST' : p.ready ? 'READY (browser)' : 'POSTED'} ${p.symbol}${p.cohort ? ' [' + p.cohort + ']' : ''} (${p.id})${p.url ? ' → ' + p.url : ''}\n${p.text}`);
      if (p.chart) console.log(`chart: ${p.chart}${p.chartNote ? ' — ' + p.chartNote : ''}`);
      else if (p.chartError) console.log(`chart: none — ${p.chartError}`);
    }
    for (const s of summary.skipped) console.log(`skip ${s.symbol.padEnd(6)} ${s.signal}/${s.confidence.padEnd(6)} ${s.setup} — ${s.reason}`);
    if (summary.pending?.length) console.log(`already queued for this report: ${summary.pending.join(', ')}`);
    for (const t of summary.thread ?? []) {
      if (t.skipped) console.log(`thread skip ${t.symbol} — ${t.skipped}`);
      else console.log(`\n${t.dryRun ? 'WOULD THREAD' : t.ready ? 'READY (thread reply)' : 'THREADED'} ${t.symbol} (${t.id})${t.url ? ' → ' + t.url : ''}\n${t.text}`);
    }
    if (summary.capped) console.log(`(stopped at maxPostsPerRun = ${summary.policy.maxPostsPerRun})`);
    if (!summary.published.length) console.log('\nnothing published');
    done(0);
  },
});

// ─── lifecycle: track / scorecard / setups ───────────────────────────────────

subcommands.set('track', {
  description: 'Walk every open setup in this queue: graduate, detect breakouts/invalidations/level tests on daily closes, queue follow-ups',
  options: { ...reportOpt, 'dry-run': { type: 'boolean', description: 'Detect and draft, but queue nothing and leave the tracker unchanged' }, 'no-report': { type: 'boolean', description: 'Skip graduation against the latest report' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    let model = null;
    if (!values['no-report']) {
      try { model = loadReportModel(reportPathFrom(values)).model; } catch { model = null; }
    }
    const summary = await wf.trackEvents({ dryRun: !!values['dry-run'], model });
    if (values.json) return out(summary);
    console.log(`track · queue ${summary.queue}${summary.dryRun ? ' · DRY RUN' : ''} · ${summary.checked} open setup(s) checked`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    for (const e of summary.events) console.log(`event  ${e.symbol.padEnd(6)} ${e.type.padEnd(11)} ${e.bar} close ${e.price}${e.pct != null ? ' (' + (e.pct > 0 ? '+' : '') + e.pct + '%)' : ''}`);
    for (const q of summary.queued) console.log(`\n${q.dryRun ? 'WOULD QUEUE' : q.ready ? 'READY (browser)' : 'POSTED'} ${q.symbol} ${q.type} (${q.id})${q.url ? ' → ' + q.url : ''}\n${q.text}\nchart: ${q.chart ?? 'none'}`);
    for (const x of summary.expired) console.log(`expired ${x.symbol} (${x.id}) at ${x.bar}`);
    for (const sk of summary.skipped) console.log(`skip ${sk.symbol} ${sk.type ?? ''} — ${sk.reason}`);
    if (!summary.events.length) console.log('no lifecycle events');
    done(0);
  },
});

subcommands.set('scorecard', {
  description: 'Build, validate and queue the Weekly Setup Scorecard for the week containing --date (default today)',
  options: { date: { type: 'string', description: 'YYYY-MM-DD inside the week to score' }, 'dry-run': { type: 'boolean', description: 'Show the scorecard without queueing it' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const summary = await wf.queueScorecard({ date: values.date, dryRun: !!values['dry-run'] });
    if (values.json) return out(summary);
    const st = summary.stats;
    console.log(`scorecard · week ${summary.from} → ${summary.to}${summary.dryRun ? ' · DRY RUN' : ''}`);
    console.log(`posted ${st.posted} · breakouts ${st.breakouts} · invalidated ${st.invalidated} · expired ${st.expired} · active ${st.active} · hit rate ${st.hitRate ?? '—'}% · all-time ${st.allTime.hitRate ?? '—'}% of ${st.allTime.resolved}`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    if (summary.record) console.log(`\n${summary.record.dryRun ? 'WOULD QUEUE' : summary.record.ready ? 'READY (browser)' : 'POSTED'} (${summary.record.id})${summary.record.url ? ' → ' + summary.record.url : ''}\n${summary.record.text}\nchart: ${summary.record.chart ?? 'none'}`);
    done(0);
  },
});

subcommands.set('setups', {
  description: 'List tracked setups and their lifecycle stage',
  options: { all: { type: 'boolean', description: 'Include closed setups' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const recs = values.all ? wf.tracker.latest() : wf.tracker.active();
    if (values.json) return out(recs);
    for (const r of recs) {
      const last = r.events?.at(-1);
      console.log(`${r.id.padEnd(30)} ${r.queue.padEnd(7)} ${r.symbol.padEnd(6)} ${r.stageLabel.padEnd(20)} ${r.setupName.padEnd(30)} entry ${r.entryPrice} 🎯 ${r.target?.value ?? '—'} 🛑 ${r.stop?.value ?? '—'}${last ? `  last ${last.type} ${last.bar}` : ''}`);
    }
    if (!recs.length) console.log('(no tracked setups)');
    done();
  },
});

subcommands.set('remove', {
  description: 'Mark a published post as removed on X (audit status removed; its lifecycle record closes as REMOVED, unscored)',
  options: { reason: { type: 'string', description: 'Why (audited)' }, ...jsonOpt },
  handler: async (values, positionals) => {
    const wf = new SocialWorkflow();
    if (!positionals.length) throw new Error('Give one or more audit ids');
    const outRecs = positionals.map(id => wf.removePost(id, { reason: values.reason ?? 'post removed on X' }));
    if (values.json) return out(outRecs);
    for (const r of outRecs) console.log(`${r.audit.id.padEnd(30)} audit → removed${r.tracked ? ` · tracker ${r.tracked.symbol} → ${r.tracked.stageLabel}` : ''}`);
    done();
  },
});

subcommands.set('educate', {
  description: 'Build, render, validate and queue one educational explainer (next topic in rotation, or --topic <id>)',
  options: { topic: { type: 'string', description: 'Topic id (see --list)' }, list: { type: 'boolean', description: 'List topics and when each was last posted' }, 'dry-run': { type: 'boolean', description: 'Show the post without queueing it' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    if (values.list) {
      const { TOPICS, lessonNumbers, lessonLabel } = await import('../../social/education.js');
      const last = new Map();
      for (const r of wf.audit.latest()) if (r.kind === 'education' && r.status === 'published') { const at = r.publication?.at ?? ''; if (!last.has(r.topic) || at > last.get(r.topic)) last.set(r.topic, at); }
      const lessons = lessonNumbers(wf.audit.latest());
      if (values.json) return out(TOPICS.map(t => ({ id: t.id, series: t.series, title: t.title, lesson: lessons.get(t.id) ?? null, lastPosted: last.get(t.id) ?? null })));
      for (const t of TOPICS) console.log(`${t.id.padEnd(22)} ${(lessons.has(t.id) ? lessonLabel(lessons.get(t.id)) : '—').padEnd(11)} ${t.series.padEnd(13)} ${t.title.padEnd(32)} ${last.get(t.id) ? 'last ' + last.get(t.id).slice(0, 10) : 'never posted'}`);
      done();
    }
    const summary = await wf.queueEducation({ topic: values.topic ?? null, dryRun: !!values['dry-run'] });
    if (values.json) return out(summary);
    console.log(`educate · topic ${summary.topic ?? '—'}${summary.dryRun ? ' · DRY RUN' : ''}`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    if (summary.record) console.log(`\n${summary.record.dryRun ? 'WOULD QUEUE' : summary.record.ready ? 'READY (browser)' : 'POSTED'} (${summary.record.id})${summary.record.url ? ' → ' + summary.record.url : ''}\n${summary.record.text}\ncard: ${summary.record.chart ?? 'none'}`);
    done(0);
  },
});

subcommands.set('launch', {
  description: 'Build, render, validate and queue the next post in the 14-post launch sequence (or --item <id|n>)',
  options: { item: { type: 'string', description: 'Launch item id or number (see --list)' }, list: { type: 'boolean', description: 'List the launch sequence and what has been posted' }, 'dry-run': { type: 'boolean', description: 'Show the post without queueing it' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    if (values.list) {
      const { LAUNCH_SEQUENCE } = await import('../../social/launch.js');
      const posted = new Map();
      for (const r of wf.audit.latest()) {
        if (!r.launchItem) continue;
        if (['published', 'ready_to_post', 'approved', 'publishing'].includes(r.status)) posted.set(r.launchItem, r.status);
      }
      if (values.json) return out(LAUNCH_SEQUENCE.map(i => ({ ...i, status: posted.get(i.id) ?? null })));
      for (const i of LAUNCH_SEQUENCE) {
        const state = posted.get(i.id) ?? (i.generator ? 'buildable' : 'not built yet');
        console.log(`${String(i.n).padStart(2)}. ${i.id.padEnd(22)} ${i.kind.padEnd(10)} ${state.padEnd(14)} ${i.title}`);
      }
      done();
    }
    const summary = await wf.queueLaunch({ item: values.item ?? null, dryRun: !!values['dry-run'] });
    if (values.json) return out(summary);
    console.log(`launch · item ${summary.item ?? '—'}${summary.dryRun ? ' · DRY RUN' : ''}`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    if (summary.record) console.log(`\n${summary.record.dryRun ? 'WOULD QUEUE' : summary.record.ready ? 'READY (browser)' : 'POSTED'} (${summary.record.id})${summary.record.url ? ' → ' + summary.record.url : ''}${summary.record.pin ? '  [PIN THIS POST]' : ''}\n${summary.record.text}\ncard: ${summary.record.chart ?? 'none'}`);
    done(0);
  },
});

subcommands.set('video', {
  description: 'Render, validate and queue the daily chart-education video (next topic in rotation, or --topic <id>)',
  options: { topic: { type: 'string', description: 'Topic id (see --list)' }, list: { type: 'boolean', description: 'List topics and when each was last posted' }, 'dry-run': { type: 'boolean', description: 'Render and show the post without queueing it' }, open: { type: 'boolean', description: 'Open the rendered video' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    if (values.list) {
      const { VIDEO_TOPICS } = await import('../../social/video.js');
      const last = new Map();
      for (const r of wf.audit.latest()) if (r.kind === 'video' && r.status === 'published') { const at = r.publication?.at ?? ''; if (!last.has(r.topic) || at > last.get(r.topic)) last.set(r.topic, at); }
      if (values.json) return out(VIDEO_TOPICS.map(t => ({ id: t.id, series: t.series, title: t.title, hook: t.hook, lastPosted: last.get(t.id) ?? null })));
      for (const t of VIDEO_TOPICS) console.log(`${t.id.padEnd(22)} ${t.series.padEnd(16)} ${t.title.padEnd(30)} ${last.get(t.id) ? 'last ' + last.get(t.id).slice(0, 10) : 'never posted'}`);
      done();
    }
    const summary = await wf.queueVideo({ topic: values.topic ?? null, dryRun: !!values['dry-run'], chartOpts: { python: process.env.SOCIAL_PYTHON } });
    if (values.open && summary.record?.video) { const { spawn } = await import('node:child_process'); spawn('open', [summary.record.video], { detached: true, stdio: 'ignore' }).unref(); }
    if (values.json) return out(summary);
    console.log(`video · topic ${summary.topic ?? '—'}${summary.record?.day ? ` · day ${summary.record.day}` : ''}${summary.dryRun ? ' · DRY RUN' : ''}`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    if (summary.record) console.log(`\n${summary.record.dryRun ? 'WOULD QUEUE' : summary.record.ready ? 'READY (browser)' : 'POSTED'} (${summary.record.id})${summary.record.url ? ' → ' + summary.record.url : ''}\n${summary.record.text}\nvideo: ${summary.record.video ?? 'none'}${summary.record.seconds ? ` (${summary.record.seconds}s)` : ''}`);
    done(0);
  },
});

subcommands.set('premarket', {
  description: 'Build, render, validate and queue the premarket market-direction post from docs/reports/premarket/premarket-<date>.json',
  options: { date: { type: 'string', description: 'Report date YYYY-MM-DD (default today, New York)' }, 'dry-run': { type: 'boolean', description: 'Show the post without queueing it' }, ...jsonOpt },
  handler: async (values) => {
    const wf = new SocialWorkflow();
    const summary = await wf.queuePremarket({ date: values.date ?? null, dryRun: !!values['dry-run'] });
    if (values.json) return out(summary);
    console.log(`premarket · ${summary.sessionDate ?? '—'} · ${summary.bias ?? '—'}${summary.dryRun ? ' · DRY RUN' : ''}`);
    if (summary.refused) { console.log(`refused: ${summary.refused}`); done(2); }
    if (summary.record) console.log(`\n${summary.record.dryRun ? 'WOULD QUEUE' : summary.record.ready ? 'READY (browser)' : 'POSTED'} (${summary.record.id})${summary.record.url ? ' → ' + summary.record.url : ''}\n${summary.record.text}\ncard: ${summary.record.chart ?? 'none'}`);
    done(0);
  },
});

// ─── metrics: collect / record / report ──────────────────────────────────────

const metricsSub = new Map([
  ['collect', {
    description: 'Pull impressions/engagement for every published post (and follower count) from the X API into docs/social/metrics.jsonl',
    options: { since: { type: 'string', description: 'Only posts published on/after YYYY-MM-DD (default: last 30 days)' }, ...jsonOpt },
    handler: async (values) => {
      const wf = new SocialWorkflow();
      const since = values.since ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const posts = wf.audit.latest().filter(r => r.status === 'published' && r.publication?.xPostId && r.publication.at >= since);
      const ids = posts.map(r => r.publication.xPostId);
      const byId = new Map(posts.map(r => [r.publication.xPostId, r.id]));
      const snaps = ids.length ? await collectPostMetrics(ids) : [];
      for (const m of snaps) wf.metrics.append({ ...m, auditId: byId.get(m.xPostId) ?? null });
      let acct = null;
      try { acct = wf.metrics.append(await collectAccountMetrics()); } catch (err) { acct = { error: err.message }; }
      if (values.json) return out({ posts: snaps.length, account: acct });
      for (const m of snaps) console.log(`${m.xPostId} impressions ${m.impressions ?? '—'} likes ${m.likes ?? '—'} replies ${m.replies ?? '—'} reposts ${m.reposts ?? '—'} bookmarks ${m.bookmarks ?? '—'} profile clicks ${m.profileClicks ?? '—'}`);
      console.log(acct?.error ? `account: ${acct.error}` : `account: ${acct.followers} followers`);
      if (!snaps.length) console.log('(no published posts in range)');
      done();
    },
  }],
  ['record', {
    description: 'Record metrics read from the X analytics page for one post: tv social metrics record <xPostId> --impressions N --likes N …',
    options: Object.fromEntries([...METRIC_FIELDS.map(k => [k, { type: 'string', description: k }]), ['followers', { type: 'string', description: 'Account follower count (writes an account snapshot)' }], ['source', { type: 'string', description: 'manual | browser (default manual)' }], ['json', { type: 'boolean', description: 'JSON output' }]]),
    handler: async (values, positionals) => {
      const wf = new SocialWorkflow();
      const outRecs = [];
      if (positionals[0]) {
        const rec = wf.audit.latest().find(r => r.publication?.xPostId === positionals[0]);
        outRecs.push(wf.metrics.append({ ...recordManual(positionals[0], values, { source: values.source ?? 'manual' }), auditId: rec?.id ?? null }));
      }
      if (values.followers != null) outRecs.push(wf.metrics.append({ kind: 'account', followers: Number(values.followers), source: values.source ?? 'manual' }));
      if (!outRecs.length) throw new Error('Give an xPostId with metric flags, and/or --followers N');
      if (values.json) return out(outRecs);
      for (const r of outRecs) console.log(JSON.stringify(r));
      done();
    },
  }],
  ['report', {
    description: 'Performance by asset class / setup type / kind / hour, recommendations, and refresh docs/social/insights.json',
    options: { ...jsonOpt, 'no-write': { type: 'boolean', description: 'Do not refresh insights.json' } },
    handler: async (values) => {
      const wf = new SocialWorkflow();
      const rep = buildReport({ metrics: wf.metrics, auditRecords: wf.audit.latest(), trackerRecords: wf.tracker.latest() });
      const path = values['no-write'] ? null : writeInsights(rep);
      if (values.json) return out({ ...rep, insightsPath: path });
      console.log(renderReportMarkdown(rep));
      if (path) console.log(`insights → ${path}`);
      done();
    },
  }],
]);

// The router dispatches one level deep, so `metrics` routes on its first
// positional: tv social metrics collect | record <xPostId> … | report
subcommands.set('metrics', {
  description: 'Post performance: metrics collect (X API) · metrics record <xPostId> --impressions N … · metrics report (aggregates + insights.json)',
  options: Object.assign({}, ...[...metricsSub.values()].map(m => m.options)),
  handler: async (values, positionals) => {
    const [op, ...rest] = positionals;
    const sub = metricsSub.get(op);
    if (!sub) throw new Error(`Usage: tv social metrics <collect|record|report> — ${[...metricsSub.entries()].map(([k, v]) => `${k}: ${v.description}`).join(' · ')}`);
    return sub.handler(values, rest);
  },
});

register('social', {
  description: 'Social summary table + compliance-gated X post workflow',
  subcommands,
});

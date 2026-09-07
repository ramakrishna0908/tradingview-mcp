/**
 * Social post workflow:
 *
 *   Report → Generate Draft → Compliance Validation → Preview/Edit
 *          → User Approval → Publish to X
 *
 * No step auto-advances. Publishing requires an `approved` record, re-runs
 * validation against the frozen approved text, and only then calls the X API.
 */
import { loadConfig } from './config.js';
import { loadReportModel, findRow } from './report-model.js';
import { buildSummaryTable, selectPostCandidates, classifySetup, cohortCandidates, CONFIDENCE_RANK, qualityRank } from './setup.js';
import { SetupTracker, openFromSetup, detectEvents, graduate, scorecardStats, weekBounds, EVENT, markRemoved } from './tracker.js';
import { generateFollowUp, followUpModel, followUpSetup, followUpRow, followUpChartOverrides, generateScorecard, buildScorecardSpec, scorecardAltText } from './followup.js';
import { MetricsStore, readInsights, insightsBoost } from './metrics.js';
import { TOPICS, getTopic, nextTopic, generateEducationPost, buildEducationSpec, educationAltText } from './education.js';
import { initialStage } from './sweep-labels.js';
import { generatePremarketPost, buildPremarketSpec, premarketAltText } from './premarket-post.js';
import { loadReport as loadPremarketReport, DEFAULT_OUT_DIR as PREMARKET_DIR } from '../premarket/index.js';
import { etDate } from '../premarket/data.js';
import { join, dirname } from 'node:path';
import { generatePost } from './generate.js';
import { validatePost, blocking, textHash, isHashtagLine } from './compliance.js';
import { AuditStore } from './audit.js';
import { postTweet, uploadMedia, getCredentialsFromEnv } from './x-client.js';
import { makeChart, renderChartSpec, DEFAULT_CHART_DIR } from './chart.js';
import { fetchDailyCandles } from './chart-data.js';

export * from './setup.js';
export * from './compliance.js';
export * from './report-model.js';
export { generatePost, formatDataTimestamp } from './generate.js';
export { loadConfig } from './config.js';
export { AuditStore } from './audit.js';
export { makeChart, buildChartSpec, chartAltText } from './chart.js';
export { fetchDailyCandles, parseYahooChart } from './chart-data.js';
export * from './tracker.js';
export * from './followup.js';
export * from './metrics.js';
export * from './education.js';
export { STAGE, stageLabel, initialStage, sweepLabels } from './sweep-labels.js';

export class SocialWorkflow {
  constructor({ config = loadConfig(), audit = new AuditStore(), tracker = null, metrics = null, now = () => new Date(), actor = process.env.USER || 'user', insights = undefined } = {}) {
    this.config = config;
    this.audit = audit;
    // The lifecycle tracker and the metrics log live next to the audit log, so
    // a workflow pointed at a scratch audit file (tests, dry runs) never touches
    // the real docs/social/ state. Explicit env paths still win.
    this.tracker = tracker ?? new SetupTracker(process.env.SOCIAL_TRACKER_PATH || join(dirname(audit.path), 'setups.jsonl'));
    this.metrics = metrics ?? new MetricsStore(process.env.SOCIAL_METRICS_PATH || join(dirname(audit.path), 'metrics.jsonl'));
    this.now = now;
    this.actor = actor;
    this.insights = insights; // undefined = read docs/social/insights.json lazily; null = none
  }

  get queue() {
    return this.config.queue ?? 'stocks';
  }

  // ─── report → table ────────────────────────────────────────────────────────

  loadReport(reportPath, opts) {
    return loadReportModel(reportPath, opts);
  }

  summaryTable(model, opts) {
    return buildSummaryTable(model, opts);
  }

  // ─── draft ─────────────────────────────────────────────────────────────────

  currentText(rec) {
    return rec.editedText ?? rec.originalText;
  }

  validateRecord(rec, model, { staleAcknowledged = !!rec.staleAcknowledged } = {}) {
    const common = { config: this.config, now: this.now(), priorRecords: this.audit.latest(), draftId: rec.id, staleAcknowledged, chart: rec.chart ?? null };
    if (rec.kind === 'followup') {
      // Numbers come from the tracker record + the event, never from a report row.
      const tr = this.tracker.get(rec.followUpOf);
      if (!tr) return [{ code: 'missing_tracker', severity: 'block', message: `No tracked setup ${rec.followUpOf} for this follow-up` }];
      const setup = followUpSetup(tr, rec.event);
      return validatePost(this.currentText(rec), { ...common, setup, row: followUpRow(tr, rec.event), model: followUpModel(tr, rec.event), kind: 'followup', stage: setup.stage });
    }
    if (rec.kind === 'scorecard') {
      return validatePost(this.currentText(rec), { ...common, setup: null, row: null, model: { reportDate: rec.reportDate, dataAsOf: rec.dataAsOf }, kind: 'scorecard', scorecard: rec.scorecard });
    }
    if (rec.kind === 'education') {
      return validatePost(this.currentText(rec), { ...common, setup: null, row: null, model: { reportDate: rec.reportDate, dataAsOf: rec.dataAsOf }, kind: 'education' });
    }
    if (rec.kind === 'premarket') {
      return validatePost(this.currentText(rec), { ...common, setup: null, row: null, model: { reportDate: rec.reportDate, dataAsOf: rec.dataAsOf }, kind: 'premarket', premarket: rec.premarket });
    }
    const row = findRow(model, rec.symbol);
    const setup = row ? classifySetup(row) : null;
    return validatePost(this.currentText(rec), { ...common, setup, row, model });
  }

  /**
   * Generate drafts for the highest-quality setups (or one given symbol).
   * When charts are enabled, the annotated chart is rendered now (best-effort)
   * so `show`/dry-runs can preview it; the record carries `chart`.
   */
  async draft(model, { symbol = null, reportPath = model.sourcePath, chartOpts = {} } = {}) {
    const table = this.summaryTable(model);
    let candidates;
    if (symbol) {
      const s = table.find(x => x.symbol === symbol.toUpperCase());
      if (!s) throw new Error(`${symbol} not found in report or not classifiable`);
      candidates = [s];
    } else {
      candidates = selectPostCandidates(table, this.config.posting);
    }
    const created = [];
    for (const setup of candidates) {
      // Chart first: its candle data can feed the Volume line of the text.
      let chartRec = null;
      if (this.config.charts?.enabled) {
        const chart = await makeChart(setup, model, this.config, chartOpts);
        chartRec = chart.error
          ? { path: null, error: chart.error }
          : { path: chart.path, altText: chart.altText, bars: chart.bars, lastBar: chart.lastBar, volumeRatio: chart.volumeRatio, volumeAvg: chart.volumeAvg };
      }
      const { text } = generatePost(setup, model, this.config, { chart: chartRec });
      const id = this.audit.newId(setup.symbol, model.reportDate);
      const base = {
        id,
        kind: 'setup',
        stage: initialStage(setup),
        queue: this.queue,
        symbol: setup.symbol,
        reportDate: model.reportDate,
        reportPath,
        dataAsOf: model.dataAsOf,
        setup: { setup: setup.setup, signal: setup.signal, confidence: setup.confidence, direction: setup.direction, score: setup.score },
        originalText: text,
        editedText: null,
        textHash: textHash(text),
        status: 'draft',
        issues: [],
        staleAcknowledged: null,
        approval: null,
        publication: null,
        error: null,
        createdAt: this.now().toISOString(),
      };
      base.chart = chartRec;
      base.issues = this.validateRecord(base, model);
      created.push(this.audit.append(base));
    }
    return created;
  }

  // ─── validate / edit ───────────────────────────────────────────────────────

  validate(id, model) {
    const rec = this.mustGet(id);
    const issues = this.validateRecord(rec, model);
    return this.audit.append({ ...rec, issues });
  }

  edit(id, newText, model) {
    const rec = this.mustGet(id);
    if (['published', 'publishing'].includes(rec.status)) throw new Error(`Cannot edit a ${rec.status} post`);
    const next = {
      ...rec,
      editedText: newText,
      textHash: textHash(newText),
      status: 'edited',
      approval: null, // any edit invalidates a prior approval
      editedBy: this.actor,
    };
    next.issues = this.validateRecord(next, model);
    return this.audit.append(next);
  }

  // ─── approve / reject ──────────────────────────────────────────────────────

  approve(id, model, { acknowledgeStale = null } = {}) {
    const rec = this.mustGet(id);
    if (['published', 'publishing'].includes(rec.status)) throw new Error(`Post is already ${rec.status}`);
    const staleAcknowledged = acknowledgeStale
      ? { by: this.actor, reason: acknowledgeStale, at: this.now().toISOString() }
      : rec.staleAcknowledged;
    const issues = this.validateRecord({ ...rec, staleAcknowledged }, model, { staleAcknowledged: !!staleAcknowledged });
    const blockers = blocking(issues);
    if (blockers.length) {
      this.audit.append({ ...rec, issues });
      const err = new Error(`Approval refused: ${blockers.map(b => b.message).join('; ')}`);
      err.issues = issues;
      throw err;
    }
    return this.audit.append({
      ...rec,
      issues,
      staleAcknowledged,
      status: 'approved',
      approval: { by: this.actor, at: this.now().toISOString(), textHash: rec.textHash },
    });
  }

  reject(id, reason) {
    const rec = this.mustGet(id);
    if (rec.status === 'published') throw new Error('Cannot reject a published post');
    return this.audit.append({ ...rec, status: 'rejected', rejection: { by: this.actor, reason, at: this.now().toISOString() } });
  }

  // ─── publish ───────────────────────────────────────────────────────────────

  /**
   * Publish an approved draft through the official X API. The text published
   * is the exact text that was approved (hash-checked), re-validated first.
   */
  async publish(id, model, { fetchImpl, creds = getCredentialsFromEnv() } = {}) {
    const rec = this.mustGet(id);
    if (rec.status !== 'approved') throw new Error(`Only approved drafts can be published (status: ${rec.status})`);
    const text = this.currentText(rec);
    if (textHash(text) !== rec.approval?.textHash) throw new Error('Approved text hash mismatch — re-approve');
    const issues = this.validateRecord(rec, model);
    const blockers = blocking(issues);
    if (blockers.length) {
      this.audit.append({ ...rec, issues });
      throw new Error(`Publish refused: ${blockers.map(b => b.message).join('; ')}`);
    }
    if (!creds) throw new Error('No X API credentials in environment — see README "Social posting"');

    // Attach the chart when one exists. A failed upload is audited and — unless
    // charts.requireForPublish — the post still goes out text-only.
    let mediaIds = [];
    let chartNote = null;
    if (this.config.charts?.enabled && rec.chart?.path) {
      const up = await uploadMedia(rec.chart.path, { altText: rec.chart.altText, creds, fetchImpl });
      if (up.ok) mediaIds = [up.mediaId];
      else chartNote = `chart upload failed: ${up.error}`;
    } else if (this.config.charts?.enabled) {
      chartNote = `no chart: ${rec.chart?.error ?? 'not rendered'}`;
    }
    if (chartNote && this.config.charts?.requireForPublish) {
      return this.audit.append({ ...rec, issues, status: 'failed', error: chartNote, publication: null });
    }

    this.audit.append({ ...rec, issues, status: 'publishing' });
    const result = await postTweet(text, { creds, fetchImpl, mediaIds });
    if (!result.ok) {
      return this.audit.append({ ...rec, issues, status: 'failed', error: result.error, publication: null });
    }
    const pub = this.audit.append({
      ...rec,
      issues,
      status: 'published',
      error: null,
      publication: { at: this.now().toISOString(), xPostId: result.id, url: result.url, method: 'x-api', mediaIds, chartNote },
    });
    this.afterPublished(pub, model);
    return pub;
  }

  /**
   * Once a post is live, the tracker learns about it: a setup post opens (or
   * completes) its lifecycle record; a follow-up is appended to the record it
   * belongs to. Scorecards are not tracked.
   */
  afterPublished(pub, model) {
    const post = { stage: pub.stage ?? null, auditId: pub.id, xPostId: pub.publication?.xPostId ?? null, url: pub.publication?.url ?? null, at: pub.publication?.at ?? this.now().toISOString() };
    if (pub.kind === 'followup') {
      const tr = this.tracker.get(pub.followUpOf);
      if (tr && !tr.posts.some(p => p.auditId === pub.id)) this.tracker.append({ ...tr, posts: [...tr.posts, post] });
      return;
    }
    if (pub.kind === 'scorecard' || pub.kind === 'education' || pub.kind === 'premarket') return;
    const existing = this.tracker.get(pub.id);
    if (existing) {
      this.tracker.append({ ...existing, posts: existing.posts.map(p => (p.auditId === pub.id ? { ...p, ...post } : p)) });
      return;
    }
    const row = model ? findRow(model, pub.symbol) : null;
    const setup = row ? classifySetup(row) : null;
    if (!setup) return;
    // Records written before queues existed are stock posts; only a record
    // tagged with this job's own queue inherits this config's asset class.
    const queue = pub.queue ?? 'stocks';
    const assetClass = queue === this.queue ? (this.config.assetClass ?? 'equity') : queue === 'crypto' ? 'crypto' : 'equity';
    this.tracker.append(openFromSetup(pub, setup, { queue, assetClass, now: this.now() }));
  }

  /**
   * Record a publication that happened outside the API (e.g. the approved
   * text was posted by hand in the browser). Still requires approval and a
   * clean validation pass so the audit trail is complete either way.
   */
  recordManualPublication(id, model, { xPostId, url }) {
    const rec = this.mustGet(id);
    if (!['approved', 'ready_to_post'].includes(rec.status)) throw new Error(`Only approved drafts can be recorded as published (status: ${rec.status})`);
    if (!xPostId) throw new Error('xPostId is required');
    const issues = this.validateRecord(rec, model);
    const pub = this.audit.append({
      ...rec,
      issues,
      status: 'published',
      publication: { at: this.now().toISOString(), xPostId, url: url ?? `https://x.com/i/web/status/${xPostId}`, method: rec.status === 'ready_to_post' ? 'browser' : 'manual' },
    });
    this.afterPublished(pub, model);
    return pub;
  }

  /**
   * Drafts approved by the auto-publish policy that are waiting for the browser
   * poster. `queue` scopes the result to one sweep ('stocks' | 'crypto'); records
   * written before queues existed are treated as 'stocks'.
   */
  ready({ queue = null } = {}) {
    return this.audit.latest()
      .filter(r => r.status === 'ready_to_post')
      .filter(r => queue == null || (r.queue ?? 'stocks') === queue);
  }

  // ─── auto-publish (policy-gated, unattended) ───────────────────────────────

  /**
   * Evaluate the auto-publish policy for one report and, unless dryRun, publish
   * the qualifying posts through the X API. Every decision is written to the
   * audit log: published posts carry approval.by = 'auto-publish policy', and
   * skipped candidates are stored with status 'auto_skipped' and the reason.
   *
   * Hard guards (not configurable away):
   *   - policy.enabled must be true and SOCIAL_AUTO_PUBLISH != 0
   *   - report data must be within maxReportAgeHours (no stale override, ever)
   *   - zero blocking issues; zero warnings unless policy.allowWarnings
   *   - API credentials must exist (no browser/manual path)
   */
  async autoPublish(model, { reportPath = model.sourcePath, dryRun = false, creds = getCredentialsFromEnv(), fetchImpl, fetchImplForCharts, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    const policy = this.config.posting.autoPublish ?? {};
    const now = this.now();
    const summary = { reportDate: model.reportDate, dryRun, policy, published: [], skipped: [], refused: null };
    const refuse = reason => { summary.refused = reason; return summary; };

    if (!policy.enabled) return refuse(policy.disabledBy ? `auto-publish disabled by ${policy.disabledBy}` : 'auto-publish is disabled in config (posting.autoPublish.enabled)');
    // Session calendar. 'nyse' (the default) refuses on exchange holidays and
    // weekends, when a report can only be re-showing the prior session. '24x7'
    // markets — crypto — have no closed days, so neither gate applies there.
    if ((this.config.marketCalendar ?? 'nyse') !== '24x7') {
      if ((this.config.marketHolidays ?? []).includes(model.reportDate)) return refuse(`${model.reportDate} is a market holiday — the report only re-shows the prior session`);
      const dow = new Date(model.reportDate + 'T12:00:00Z').getUTCDay();
      if (dow === 0 || dow === 6) return refuse(`${model.reportDate} is a weekend`);
    }
    const ageH = (now - new Date(model.dataAsOf)) / 3600_000;
    if (!Number.isFinite(ageH) || ageH > this.config.maxReportAgeHours) {
      return refuse(`report data is ${Number.isFinite(ageH) ? ageH.toFixed(1) + 'h' : 'of unknown age'} (limit ${this.config.maxReportAgeHours}h) — auto mode never overrides freshness`);
    }
    const via = policy.via ?? 'api';
    summary.via = via;
    if (!dryRun && via === 'api' && !creds) return refuse('no X API credentials in environment');

    const minRank = CONFIDENCE_RANK[policy.minConfidence] ?? 3;
    const cooldownMs = policy.symbolCooldownHours != null
      ? policy.symbolCooldownHours * 3600_000
      : (policy.symbolCooldownDays ?? 3) * 86400_000;
    const cooldownLabel = policy.symbolCooldownHours != null ? `${policy.symbolCooldownHours}-hour` : `${policy.symbolCooldownDays ?? 3}-day`;
    const recent = this.audit.latest().filter(r => r.status === 'published' && r.publication?.at && now - new Date(r.publication.at) < cooldownMs);
    const keywords = (policy.skipBiasKeywords ?? []).map(k => k.toLowerCase());

    const table = this.summaryTable(model);
    const source = policy.candidateSource ?? 'table';
    let candidates;
    if (source === 'report-cohort') {
      if (!model.cohort || (!model.cohort.calls?.length && !model.cohort.puts?.length)) {
        return refuse('report has no Calls/Puts cohort lists (cohort summary not found) — nothing to post');
      }
      candidates = cohortCandidates(model, table);
      summary.cohort = { calls: model.cohort.calls.map(x => x.symbol), puts: model.cohort.puts.map(x => x.symbol) };
      for (const x of [...model.cohort.calls, ...model.cohort.puts]) {
        if (!candidates.some(c => c.symbol === x.symbol)) {
          summary.skipped.push({ symbol: x.symbol, setup: '-', signal: '-', confidence: '-', reason: 'cohort direction contradicts the row data (not relabelled)' });
        }
      }
    } else {
      candidates = table;
    }

    // "1 highest-quality setup": rank by the classifier's quality (confirmed,
    // confidence, |score|), then by what has historically engaged (a tiebreak
    // read from docs/social/insights.json), then alphabetically — and cap by
    // maxPostsPerRun below. When nothing clears minConfidence/requireSignal the
    // run publishes nothing; a post is never forced.
    if ((policy.candidateOrder ?? 'report') === 'quality') {
      const insights = this.insights === undefined ? readInsights() : this.insights;
      candidates = [...candidates].sort((a, b) =>
        qualityRank(b) - qualityRank(a)
        || insightsBoost(insights, b, this.queue) - insightsBoost(insights, a, this.queue)
        || Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0)
        || a.symbol.localeCompare(b.symbol));
      summary.candidateOrder = candidates.map(c => `${c.symbol}:${c.signal}/${c.confidence}`);
    }

    for (const setup of candidates) {
      if (summary.published.length >= (policy.maxPostsPerRun ?? 1)) { summary.capped = true; break; }
      const row = findRow(model, setup.symbol);
      const skip = reason => summary.skipped.push({ symbol: setup.symbol, setup: setup.setup, signal: setup.signal, confidence: setup.confidence, reason });

      if (policy.requireSignal && setup.signal !== policy.requireSignal) { skip(`signal ${setup.signal} (policy requires ${policy.requireSignal})`); continue; }
      if ((CONFIDENCE_RANK[setup.confidence] ?? 0) < minRank) { skip(`confidence ${setup.confidence} below ${policy.minConfidence}`); continue; }
      if (policy.skipFlaggedRows && row?.flags) { skip(`row carries a catalyst flag (${row.flags})`); continue; }
      const bias = (row?.biasNext ?? '').toLowerCase();
      const kw = keywords.find(k => bias.includes(k));
      if (kw) { skip(`report note mentions "${kw}": ${row.biasNext}`); continue; }
      const cool = recent.find(r => r.symbol === setup.symbol);
      if (cool) { skip(`posted ${cool.publication.at.slice(0, 16)}Z — within ${cooldownLabel} cooldown (${cool.id})`); continue; }
      if (policy.skipTracked !== false) {
        const open = this.tracker.openFor(setup.symbol, this.queue);
        if (open) { skip(`already tracked as ${open.stageLabel} since ${open.reportDate} (${open.id}) — follow-ups cover it`); continue; }
      }

      const [rec] = await this.draft(model, { symbol: setup.symbol, reportPath, chartOpts: { fetchImpl: fetchImplForCharts } });
      const issues = rec.issues;
      const blockers = blocking(issues);
      const warns = issues.filter(i => i.severity === 'warn');
      if (blockers.length || (warns.length && !policy.allowWarnings)) {
        const reason = [...blockers, ...warns].map(i => `${i.code}: ${i.message}`).join('; ');
        this.audit.append({ ...rec, status: 'auto_skipped', autoSkipReason: reason });
        skip(reason);
        continue;
      }
      const text = this.currentText(rec);
      if (policy.requireDisclosureLast && this.config.disclosurePlacement !== 'bio') {
        const lines = text.trimEnd().split('\n');
        const lastNonTag = [...lines].reverse().find(l => !isHashtagLine(l)) ?? '';
        if (lastNonTag.trim() !== this.config.disclosure.trim()) {
          this.audit.append({ ...rec, status: 'auto_skipped', autoSkipReason: 'disclosure is not the final line' });
          skip('disclosure is not the final line');
          continue;
        }
      }

      if (dryRun) {
        this.audit.append({ ...rec, status: 'auto_dry_run' });
        summary.published.push({ id: rec.id, symbol: setup.symbol, cohort: setup.cohort, text, chart: rec.chart?.path ?? null, chartError: rec.chart?.error ?? null, dryRun: true });
        continue;
      }

      // Space posts out so a morning run reads like a feed, not a dump.
      if (via === 'api' && summary.published.length > 0 && (policy.spacingSeconds ?? 0) > 0) await sleep(policy.spacingSeconds * 1000);

      const approver = new SocialWorkflow({ config: this.config, audit: this.audit, now: this.now, actor: 'auto-publish policy' });
      const approved = approver.approve(rec.id, model);
      if (via === 'browser') {
        // Policy-approved; the scheduled browser task posts it and calls `record`.
        const ready = this.audit.append({ ...approved, status: 'ready_to_post' });
        summary.published.push({ id: ready.id, symbol: setup.symbol, cohort: setup.cohort, text, chart: rec.chart?.path ?? null, ready: true });
        continue;
      }
      const pub = await approver.publish(approved.id, model, { creds, fetchImpl });
      if (pub.status === 'published') summary.published.push({ id: pub.id, symbol: setup.symbol, cohort: setup.cohort, text, url: pub.publication.url, xPostId: pub.publication.xPostId, chart: rec.chart?.path ?? null, chartNote: pub.publication.chartNote });
      else skip(`publish failed: ${pub.error}`);
    }
    if (!summary.published.length && !summary.refused) summary.noSetup = 'no setup met the quality bar — nothing posted (by design)';
    return summary;
  }

  /**
   * A published post has been taken down on X. The audit record moves to
   * status 'removed' (so it holds no cooldown, no duplicate claim and no
   * metrics), and its lifecycle record — if it is a setup — closes as REMOVED,
   * which the scorecard neither counts nor scores.
   */
  removePost(id, { reason = 'post removed on X' } = {}) {
    const rec = this.mustGet(id);
    if (rec.status !== 'published') throw new Error(`Only published posts can be marked removed (status: ${rec.status})`);
    const audit = this.audit.append({ ...rec, status: 'removed', removal: { by: this.actor, reason, at: this.now().toISOString() } });
    const tr = this.tracker.get(rec.followUpOf ?? rec.id);
    let tracked = null;
    if (tr && rec.kind !== 'followup') tracked = this.tracker.append(markRemoved(tr, { reason, now: this.now() }));
    return { audit, tracked };
  }

  // ─── lifecycle follow-ups ──────────────────────────────────────────────────

  /** Draft one follow-up post for a lifecycle event on a tracked setup. */
  async draftFollowUp(tr, event, { chartOpts = {} } = {}) {
    const model = followUpModel(tr, event);
    const setup = followUpSetup(tr, event);
    let chartRec = null;
    if (this.config.charts?.enabled) {
      const chart = await makeChart(setup, model, this.config, { ...chartOpts, overrides: followUpChartOverrides(tr, event, this.config), name: `${tr.symbol}-${event.type}` });
      chartRec = chart.error
        ? { path: null, error: chart.error }
        : { path: chart.path, altText: chart.altText, bars: chart.bars, lastBar: chart.lastBar, volumeRatio: chart.volumeRatio, volumeAvg: chart.volumeAvg };
    }
    const { text } = generateFollowUp(tr, event, this.config);
    const base = {
      id: this.audit.newId(`${tr.symbol}-${event.type}`, event.bar),
      kind: 'followup',
      stage: setup.stage,
      followUpOf: tr.id,
      event,
      queue: tr.queue ?? this.queue,
      symbol: tr.symbol,
      reportDate: event.bar,
      reportPath: tr.reportPath ?? null,
      dataAsOf: model.dataAsOf,
      setup: { setup: tr.setupName, signal: tr.signal, confidence: tr.confidence, direction: tr.direction, score: tr.score },
      originalText: text,
      editedText: null,
      textHash: textHash(text),
      status: 'draft',
      issues: [],
      staleAcknowledged: null,
      approval: null,
      publication: null,
      error: null,
      createdAt: this.now().toISOString(),
      chart: chartRec,
    };
    base.issues = this.validateRecord(base, model);
    return this.audit.append(base);
  }

  /**
   * Walk every open setup in this queue: graduate DEVELOPING ones the latest
   * report now confirms, detect breakouts / invalidations / level tests on the
   * daily closes since the post, and queue a follow-up for each event through
   * the same approval path as a daily post. Expiries close the record quietly.
   */
  async trackEvents({ dryRun = false, model = null, fetchImplForCandles, fetchImplForCharts, creds = getCredentialsFromEnv(), fetchImpl } = {}) {
    const fu = this.config.followUps ?? {};
    const policy = this.config.posting.autoPublish ?? {};
    const via = policy.via ?? 'api';
    const now = this.now();
    const summary = { dryRun, queue: this.queue, checked: 0, events: [], queued: [], skipped: [], expired: [], refused: null };
    if (fu.enabled === false) { summary.refused = 'follow-ups are disabled in config (followUps.enabled)'; return summary; }
    if (policy.disabledBy) { summary.refused = `auto-publish disabled by ${policy.disabledBy}`; return summary; }

    for (const rec of this.tracker.active().filter(r => (r.queue ?? 'stocks') === this.queue)) {
      summary.checked++;
      let candles;
      try {
        candles = await fetchDailyCandles(rec.symbol, { bars: 120, fetchImpl: fetchImplForCandles, assetClass: rec.assetClass ?? 'equity' });
      } catch (err) {
        summary.skipped.push({ id: rec.id, symbol: rec.symbol, reason: `no candles: ${err.message}` });
        continue;
      }
      let next = rec;
      const events = [];
      if (model) {
        const row = findRow(model, rec.symbol);
        const s = row ? classifySetup(row) : null;
        const g = s ? graduate(next, s, model, { now }) : null;
        if (g) { events.push(g.event); next = g.next; }
      }
      // `pre` is the record as it stood before this run's bars were applied
      // (after any graduation). A level test is drafted against that state —
      // it happened while the setup was still open — while terminal events
      // are drafted against the closed record.
      const pre = next;
      const det = detectEvents(next, candles, { maxAgeSessions: fu.maxAgeSessions ?? 15, now });
      events.push(...det.events);
      next = det.next;

      for (const ev of events) {
        summary.events.push({ id: rec.id, symbol: rec.symbol, type: ev.type, bar: ev.bar, price: ev.price, pct: ev.pct });
        if (ev.type === EVENT.EXPIRED) { summary.expired.push({ id: rec.id, symbol: rec.symbol, bar: ev.bar }); continue; }
        if (ev.type === EVENT.LEVEL_TEST && fu.postLevelTests === false) continue;
        const basis = ev.type === EVENT.LEVEL_TEST || ev.type === EVENT.CONFIRMED ? pre : next;
        const d = await this.draftFollowUp(basis, ev, { chartOpts: { fetchImpl: fetchImplForCharts, candles } });
        const blockers = blocking(d.issues);
        const warns = d.issues.filter(i => i.severity === 'warn');
        if (blockers.length || (warns.length && !policy.allowWarnings)) {
          const reason = [...blockers, ...warns].map(i => `${i.code}: ${i.message}`).join('; ');
          this.audit.append({ ...d, status: 'auto_skipped', autoSkipReason: reason });
          summary.skipped.push({ id: d.id, symbol: rec.symbol, type: ev.type, reason });
          continue;
        }
        const text = this.currentText(d);
        if (dryRun) {
          this.audit.append({ ...d, status: 'auto_dry_run' });
          summary.queued.push({ id: d.id, symbol: rec.symbol, type: ev.type, text, chart: d.chart?.path ?? null, dryRun: true });
          continue;
        }
        const approver = new SocialWorkflow({ config: this.config, audit: this.audit, tracker: this.tracker, metrics: this.metrics, now: this.now, actor: 'lifecycle policy', insights: this.insights });
        const approved = approver.approve(d.id, null);
        if (via === 'browser') {
          const ready = this.audit.append({ ...approved, status: 'ready_to_post' });
          summary.queued.push({ id: ready.id, symbol: rec.symbol, type: ev.type, text, chart: d.chart?.path ?? null, ready: true });
        } else {
          const pub = await approver.publish(approved.id, null, { creds, fetchImpl });
          if (pub.status === 'published') summary.queued.push({ id: pub.id, symbol: rec.symbol, type: ev.type, text, url: pub.publication.url, chart: d.chart?.path ?? null });
          else summary.skipped.push({ id: pub.id, symbol: rec.symbol, type: ev.type, reason: `publish failed: ${pub.error}` });
        }
      }
      if (!dryRun && (events.length || next.lastCheckedBar !== rec.lastCheckedBar)) this.tracker.append(next);
    }
    return summary;
  }

  // ─── weekly scorecard ──────────────────────────────────────────────────────

  /** Build, validate and queue the weekly scorecard for the week containing `date`. */
  async queueScorecard({ date = this.now().toISOString().slice(0, 10), dryRun = false, chartOpts = {}, creds = getCredentialsFromEnv(), fetchImpl } = {}) {
    const sc = this.config.scorecard ?? {};
    const policy = this.config.posting.autoPublish ?? {};
    const via = policy.via ?? 'api';
    const { from, to } = weekBounds(date);
    const stats = scorecardStats(this.tracker.latest(), { from, to });
    const summary = { dryRun, from, to, stats, refused: null, record: null };
    if (sc.enabled === false) { summary.refused = 'scorecard is disabled in config (scorecard.enabled)'; return summary; }
    if (policy.disabledBy) { summary.refused = `auto-publish disabled by ${policy.disabledBy}`; return summary; }
    const dup = this.audit.latest().find(r => r.kind === 'scorecard' && r.reportDate === to && ['approved', 'ready_to_post', 'published', 'publishing'].includes(r.status));
    if (dup) { summary.refused = `scorecard for the week ending ${to} is already ${dup.status} (${dup.id})`; return summary; }

    const { text } = generateScorecard(stats, this.config);
    let chartRec = null;
    if (this.config.charts?.enabled) {
      try {
        const out = join(chartOpts.dir ?? DEFAULT_CHART_DIR, to, 'SCORECARD.png');
        renderChartSpec(buildScorecardSpec(stats, this.config, out), { python: chartOpts.python });
        chartRec = { path: out, altText: scorecardAltText(stats, this.config) };
      } catch (err) {
        chartRec = { path: null, error: err.message };
      }
    }
    const base = {
      id: this.audit.newId('SCORECARD', to),
      kind: 'scorecard',
      stage: null,
      queue: sc.queue ?? 'stocks',
      symbol: 'SCORECARD',
      reportDate: to,
      reportPath: null,
      dataAsOf: this.now().toISOString(),
      scorecard: stats,
      setup: { setup: 'Weekly Setup Scorecard', signal: 'SCORECARD', confidence: '-', direction: 'neutral', score: null },
      originalText: text,
      editedText: null,
      textHash: textHash(text),
      status: 'draft',
      issues: [],
      staleAcknowledged: null,
      approval: null,
      publication: null,
      error: null,
      createdAt: this.now().toISOString(),
      chart: chartRec,
    };
    base.issues = this.validateRecord(base, null);
    const rec = this.audit.append(base);
    const blockers = blocking(rec.issues);
    const warns = rec.issues.filter(i => i.severity === 'warn');
    if (blockers.length || (warns.length && !policy.allowWarnings)) {
      const reason = [...blockers, ...warns].map(i => `${i.code}: ${i.message}`).join('; ');
      this.audit.append({ ...rec, status: 'auto_skipped', autoSkipReason: reason });
      summary.refused = reason;
      return summary;
    }
    if (dryRun) { this.audit.append({ ...rec, status: 'auto_dry_run' }); summary.record = { id: rec.id, text, chart: chartRec?.path ?? null, dryRun: true }; return summary; }
    const approver = new SocialWorkflow({ config: this.config, audit: this.audit, tracker: this.tracker, metrics: this.metrics, now: this.now, actor: 'scorecard policy', insights: this.insights });
    const approved = approver.approve(rec.id, null);
    if (via === 'browser') {
      const ready = this.audit.append({ ...approved, status: 'ready_to_post' });
      summary.record = { id: ready.id, text, chart: chartRec?.path ?? null, ready: true };
    } else {
      const pub = await approver.publish(approved.id, null, { creds, fetchImpl });
      summary.record = pub.status === 'published' ? { id: pub.id, text, url: pub.publication.url, chart: chartRec?.path ?? null } : null;
      if (pub.status !== 'published') summary.refused = `publish failed: ${pub.error}`;
    }
    return summary;
  }

  /**
   * Rehearsal: build what the browser poster would receive (text + chart) for
   * the latest report WITHOUT any guard, approval or audit record. Used once to
   * walk the Chrome steps and pre-approve tools; nothing here can be posted
   * because the ids are not audit ids and `record` will not find them.
   */
  async rehearse(model, { limit = 1, chartOpts = {} } = {}) {
    const table = this.summaryTable(model);
    let candidates = cohortCandidates(model, table);
    if (!candidates.length) candidates = selectPostCandidates(table, this.config.posting);
    const out = [];
    for (const setup of candidates.slice(0, limit)) {
      let chart = null;
      if (this.config.charts?.enabled) {
        const c = await makeChart(setup, model, this.config, chartOpts);
        chart = c.error ? { path: null, error: c.error } : { path: c.path, altText: c.altText, volumeRatio: c.volumeRatio };
      }
      const { text } = generatePost(setup, model, this.config, { chart });
      out.push({ id: `rehearsal-${model.reportDate}-${setup.symbol}`, rehearsal: true, symbol: setup.symbol, reportDate: model.reportDate, text, chart: chart?.path ?? null, altText: chart?.altText ?? null });
    }
    return out;
  }

  // ─── educational explainers ────────────────────────────────────────────────

  /**
   * Build, render, validate and queue one educational explainer. Picks the
   * next topic in rotation unless `topic` is given. Same approval path and
   * audit trail as every other post (kind 'education', symbol 'EDU').
   */
  async queueEducation({ topic = null, dryRun = false, chartOpts = {}, creds = getCredentialsFromEnv(), fetchImpl } = {}) {
    const ed = this.config.education ?? {};
    const policy = this.config.posting.autoPublish ?? {};
    const via = policy.via ?? 'api';
    const today = this.now().toISOString().slice(0, 10);
    const summary = { dryRun, topic: null, refused: null, record: null, topics: TOPICS.map(t => t.id) };
    if (ed.enabled === false) { summary.refused = 'education posts are disabled in config (education.enabled)'; return summary; }
    if (policy.disabledBy) { summary.refused = `auto-publish disabled by ${policy.disabledBy}`; return summary; }
    const t = topic ? getTopic(topic) : nextTopic(this.audit.latest());
    if (!t) { summary.refused = topic ? `unknown topic "${topic}" (known: ${TOPICS.map(x => x.id).join(', ')})` : 'no topic available'; return summary; }
    summary.topic = t.id;
    const dup = this.audit.latest().find(r => r.kind === 'education' && r.reportDate === today && ['approved', 'ready_to_post', 'published', 'publishing'].includes(r.status));
    if (dup) { summary.refused = `an education post for ${today} is already ${dup.status} (${dup.id}, topic ${dup.topic})`; return summary; }

    const { text } = generateEducationPost(t, this.config);
    let chartRec = null;
    if (this.config.charts?.enabled) {
      try {
        const out = join(chartOpts.dir ?? DEFAULT_CHART_DIR, today, `EDU-${t.id}.png`);
        renderChartSpec(buildEducationSpec(t, this.config, out), { python: chartOpts.python });
        chartRec = { path: out, altText: educationAltText(t, this.config) };
      } catch (err) {
        chartRec = { path: null, error: err.message };
      }
    }
    const base = {
      id: this.audit.newId(`EDU-${t.id}`, today),
      kind: 'education',
      topic: t.id,
      stage: null,
      queue: ed.queue ?? 'stocks',
      symbol: 'EDU',
      reportDate: today,
      reportPath: null,
      dataAsOf: this.now().toISOString(),
      setup: { setup: `${t.series}: ${t.title}`, signal: 'EDUCATION', confidence: '-', direction: 'neutral', score: null },
      originalText: text,
      editedText: null,
      textHash: textHash(text),
      status: 'draft',
      issues: [],
      staleAcknowledged: null,
      approval: null,
      publication: null,
      error: null,
      createdAt: this.now().toISOString(),
      chart: chartRec,
    };
    base.issues = this.validateRecord(base, null);
    const rec = this.audit.append(base);
    const blockers = blocking(rec.issues);
    const warns = rec.issues.filter(i => i.severity === 'warn');
    if (blockers.length || (warns.length && !policy.allowWarnings)) {
      const reason = [...blockers, ...warns].map(i => `${i.code}: ${i.message}`).join('; ');
      this.audit.append({ ...rec, status: 'auto_skipped', autoSkipReason: reason });
      summary.refused = reason;
      return summary;
    }
    if (dryRun) { this.audit.append({ ...rec, status: 'auto_dry_run' }); summary.record = { id: rec.id, topic: t.id, text, chart: chartRec?.path ?? null, dryRun: true }; return summary; }
    const approver = new SocialWorkflow({ config: this.config, audit: this.audit, tracker: this.tracker, metrics: this.metrics, now: this.now, actor: 'education policy', insights: this.insights });
    const approved = approver.approve(rec.id, null);
    if (via === 'browser') {
      const ready = this.audit.append({ ...approved, status: 'ready_to_post' });
      summary.record = { id: ready.id, topic: t.id, text, chart: chartRec?.path ?? null, ready: true };
    } else {
      const pub = await approver.publish(approved.id, null, { creds, fetchImpl });
      summary.record = pub.status === 'published' ? { id: pub.id, topic: t.id, text, url: pub.publication.url, chart: chartRec?.path ?? null } : null;
      if (pub.status !== 'published') summary.refused = `publish failed: ${pub.error}`;
    }
    return summary;
  }

  // ─── premarket market-direction post ───────────────────────────────────────

  /**
   * Build, render, validate and queue the X post for the premarket report of
   * `date` (docs/reports/premarket/premarket-<date>.json, written by
   * `tv premarket`). One post per session date; same approval path and audit
   * trail as every other kind (kind 'premarket', symbol 'MKT').
   */
  async queuePremarket({ date = null, dryRun = false, chartOpts = {}, creds = getCredentialsFromEnv(), fetchImpl } = {}) {
    const pm = this.config.premarket ?? {};
    const policy = this.config.posting.autoPublish ?? {};
    const via = policy.via ?? 'api';
    const day = date ?? etDate(this.now());
    const summary = { dryRun, date: day, sessionDate: null, bias: null, refused: null, record: null };
    if (pm.enabled === false) { summary.refused = 'premarket posts are disabled in config (premarket.enabled)'; return summary; }
    if (policy.disabledBy) { summary.refused = `auto-publish disabled by ${policy.disabledBy}`; return summary; }
    const report = loadPremarketReport(chartOpts.reportDir ?? PREMARKET_DIR, day);
    if (!report) { summary.refused = `no premarket report for ${day} — run "tv premarket" first`; return summary; }
    summary.sessionDate = report.sessionDate;
    summary.bias = report.bias;
    const dup = this.audit.latest().find(r => r.kind === 'premarket' && r.premarket?.sessionDate === report.sessionDate && ['approved', 'ready_to_post', 'published', 'publishing'].includes(r.status));
    if (dup) { summary.refused = `a premarket post for session ${report.sessionDate} is already ${dup.status} (${dup.id})`; return summary; }

    const { text, levels } = generatePremarketPost(report, this.config);
    let chartRec = null;
    if (this.config.charts?.enabled) {
      try {
        const out = join(chartOpts.dir ?? DEFAULT_CHART_DIR, day, `MKT-premarket-${report.sessionDate}.png`);
        renderChartSpec(buildPremarketSpec(report, this.config, out), { python: chartOpts.python });
        chartRec = { path: out, altText: premarketAltText(report, this.config) };
      } catch (err) {
        chartRec = { path: null, error: err.message };
      }
    }
    const base = {
      id: this.audit.newId('MKT-premarket', day),
      kind: 'premarket',
      topic: null,
      stage: null,
      queue: pm.queue ?? 'stocks',
      symbol: 'MKT',
      reportDate: day,
      reportPath: join(chartOpts.reportDir ?? PREMARKET_DIR, `premarket-${day}.json`),
      dataAsOf: report.dataAsOf ?? report.generatedAt,
      premarket: { sessionDate: report.sessionDate, bias: report.bias, confidence: report.confidence, composite: report.composite, levels, holiday: report.holiday?.name ?? null },
      setup: { setup: `Premarket: ${report.bias}`, signal: 'PREMARKET', confidence: `${report.confidence}/100`, direction: report.bias === 'Bullish' ? 'bullish' : report.bias === 'Bearish' ? 'bearish' : 'neutral', score: report.composite },
      originalText: text,
      editedText: null,
      textHash: textHash(text),
      status: 'draft',
      issues: [],
      staleAcknowledged: null,
      approval: null,
      publication: null,
      error: null,
      createdAt: this.now().toISOString(),
      chart: chartRec,
    };
    base.issues = this.validateRecord(base, null);
    const rec = this.audit.append(base);
    const blockers = blocking(rec.issues);
    const warns = rec.issues.filter(i => i.severity === 'warn');
    if (blockers.length || (warns.length && !policy.allowWarnings)) {
      const reason = [...blockers, ...warns].map(i => `${i.code}: ${i.message}`).join('; ');
      this.audit.append({ ...rec, status: 'auto_skipped', autoSkipReason: reason });
      summary.refused = reason;
      return summary;
    }
    if (dryRun) { this.audit.append({ ...rec, status: 'auto_dry_run' }); summary.record = { id: rec.id, text, chart: chartRec?.path ?? null, dryRun: true }; return summary; }
    const approver = new SocialWorkflow({ config: this.config, audit: this.audit, tracker: this.tracker, metrics: this.metrics, now: this.now, actor: 'premarket policy', insights: this.insights });
    const approved = approver.approve(rec.id, null);
    if (via === 'browser') {
      const ready = this.audit.append({ ...approved, status: 'ready_to_post' });
      summary.record = { id: ready.id, text, chart: chartRec?.path ?? null, ready: true };
    } else {
      const pub = await approver.publish(approved.id, null, { creds, fetchImpl });
      summary.record = pub.status === 'published' ? { id: pub.id, text, url: pub.publication.url, chart: chartRec?.path ?? null } : null;
      if (pub.status !== 'published') summary.refused = `publish failed: ${pub.error}`;
    }
    return summary;
  }

  mustGet(id) {
    const rec = this.audit.get(id);
    if (!rec) throw new Error(`Draft not found: ${id}`);
    return rec;
  }
}

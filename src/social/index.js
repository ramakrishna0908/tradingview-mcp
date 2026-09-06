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
import { buildSummaryTable, selectPostCandidates, classifySetup, cohortCandidates, CONFIDENCE_RANK } from './setup.js';
import { generatePost } from './generate.js';
import { validatePost, blocking, textHash, isHashtagLine } from './compliance.js';
import { AuditStore } from './audit.js';
import { postTweet, uploadMedia, getCredentialsFromEnv } from './x-client.js';
import { makeChart } from './chart.js';

export * from './setup.js';
export * from './compliance.js';
export * from './report-model.js';
export { generatePost, formatDataTimestamp } from './generate.js';
export { loadConfig } from './config.js';
export { AuditStore } from './audit.js';
export { makeChart, buildChartSpec, chartAltText } from './chart.js';
export { fetchDailyCandles, parseYahooChart } from './chart-data.js';

export class SocialWorkflow {
  constructor({ config = loadConfig(), audit = new AuditStore(), now = () => new Date(), actor = process.env.USER || 'user' } = {}) {
    this.config = config;
    this.audit = audit;
    this.now = now;
    this.actor = actor;
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
    const row = findRow(model, rec.symbol);
    const setup = row ? classifySetup(row) : null;
    return validatePost(this.currentText(rec), {
      setup, row, model, config: this.config,
      now: this.now(),
      priorRecords: this.audit.latest(),
      draftId: rec.id,
      staleAcknowledged,
    });
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
      const { text } = generatePost(setup, model, this.config);
      const id = this.audit.newId(setup.symbol, model.reportDate);
      const base = {
        id,
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
      base.issues = this.validateRecord(base, model);
      if (this.config.charts?.enabled) {
        const chart = await makeChart(setup, model, this.config, chartOpts);
        base.chart = chart.error ? { path: null, error: chart.error } : { path: chart.path, altText: chart.altText, bars: chart.bars, lastBar: chart.lastBar };
      }
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
    return this.audit.append({
      ...rec,
      issues,
      status: 'published',
      error: null,
      publication: { at: this.now().toISOString(), xPostId: result.id, url: result.url, method: 'x-api', mediaIds, chartNote },
    });
  }

  /**
   * Record a publication that happened outside the API (e.g. the approved
   * text was posted by hand in the browser). Still requires approval and a
   * clean validation pass so the audit trail is complete either way.
   */
  recordManualPublication(id, model, { xPostId, url }) {
    const rec = this.mustGet(id);
    if (rec.status !== 'approved') throw new Error(`Only approved drafts can be recorded as published (status: ${rec.status})`);
    if (!xPostId) throw new Error('xPostId is required');
    const issues = this.validateRecord(rec, model);
    return this.audit.append({
      ...rec,
      issues,
      status: 'published',
      publication: { at: this.now().toISOString(), xPostId, url: url ?? `https://x.com/i/web/status/${xPostId}`, method: 'manual' },
    });
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
    const ageH = (now - new Date(model.dataAsOf)) / 3600_000;
    if (!Number.isFinite(ageH) || ageH > this.config.maxReportAgeHours) {
      return refuse(`report data is ${Number.isFinite(ageH) ? ageH.toFixed(1) + 'h' : 'of unknown age'} (limit ${this.config.maxReportAgeHours}h) — auto mode never overrides freshness`);
    }
    if (!dryRun && !creds) return refuse('no X API credentials in environment');

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
      if (summary.published.length > 0 && (policy.spacingSeconds ?? 0) > 0) await sleep(policy.spacingSeconds * 1000);

      const approver = new SocialWorkflow({ config: this.config, audit: this.audit, now: this.now, actor: 'auto-publish policy' });
      const approved = approver.approve(rec.id, model);
      const pub = await approver.publish(approved.id, model, { creds, fetchImpl });
      if (pub.status === 'published') summary.published.push({ id: pub.id, symbol: setup.symbol, cohort: setup.cohort, text, url: pub.publication.url, xPostId: pub.publication.xPostId, chart: rec.chart?.path ?? null, chartNote: pub.publication.chartNote });
      else skip(`publish failed: ${pub.error}`);
    }
    return summary;
  }

  mustGet(id) {
    const rec = this.audit.get(id);
    if (!rec) throw new Error(`Draft not found: ${id}`);
    return rec;
  }
}

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
import { buildSummaryTable, selectPostCandidates, classifySetup } from './setup.js';
import { generatePost } from './generate.js';
import { validatePost, blocking, textHash } from './compliance.js';
import { AuditStore } from './audit.js';
import { postTweet, getCredentialsFromEnv } from './x-client.js';

export * from './setup.js';
export * from './compliance.js';
export * from './report-model.js';
export { generatePost, formatDataTimestamp } from './generate.js';
export { loadConfig } from './config.js';
export { AuditStore } from './audit.js';

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

  /** Generate drafts for the highest-quality setups (or one given symbol). */
  draft(model, { symbol = null, reportPath = model.sourcePath } = {}) {
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

    this.audit.append({ ...rec, issues, status: 'publishing' });
    const result = await postTweet(text, { creds, fetchImpl });
    if (!result.ok) {
      return this.audit.append({ ...rec, issues, status: 'failed', error: result.error, publication: null });
    }
    return this.audit.append({
      ...rec,
      issues,
      status: 'published',
      error: null,
      publication: { at: this.now().toISOString(), xPostId: result.id, url: result.url, method: 'x-api' },
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

  mustGet(id) {
    const rec = this.audit.get(id);
    if (!rec) throw new Error(`Draft not found: ${id}`);
    return rec;
  }
}

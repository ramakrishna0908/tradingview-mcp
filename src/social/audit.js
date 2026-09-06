/**
 * Append-only audit store for social posts (JSON Lines).
 *
 * Every state change appends a full record snapshot, so the file is a
 * complete history; `latest()` folds it down to the current state per draft.
 *
 * Record shape:
 * {
 *   id, symbol, reportDate, reportPath, dataAsOf,
 *   setup: { setup, signal, confidence },
 *   originalText, editedText, textHash,
 *   status: 'draft' | 'edited' | 'approved' | 'publishing' | 'published' | 'failed' | 'rejected',
 *   issues: [...last validation issues],
 *   staleAcknowledged: { by, reason, at } | null,
 *   approval: { by, at } | null,
 *   publication: { at, xPostId, url, method: 'x-api' | 'manual' } | null,
 *   error, createdAt, updatedAt
 * }
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DEFAULT_AUDIT_PATH = join(ROOT, 'docs', 'social', 'audit.jsonl');

export class AuditStore {
  constructor(path = process.env.SOCIAL_AUDIT_PATH || DEFAULT_AUDIT_PATH) {
    this.path = path;
  }

  newId(symbol, reportDate) {
    return `${reportDate}-${symbol}-${randomBytes(3).toString('hex')}`;
  }

  all() {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }

  /** Current state of every draft (last record wins). */
  latest() {
    const byId = new Map();
    for (const rec of this.all()) byId.set(rec.id, rec);
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id) {
    return this.latest().find(r => r.id === id) ?? null;
  }

  history(id) {
    return this.all().filter(r => r.id === id);
  }

  append(record) {
    mkdirSync(dirname(this.path), { recursive: true });
    const rec = { ...record, updatedAt: new Date().toISOString() };
    appendFileSync(this.path, JSON.stringify(rec) + '\n');
    return rec;
  }
}

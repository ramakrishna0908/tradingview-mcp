/**
 * Publish generated research to AssetDecoded.
 *
 *   publishPremarket({ date })  → load the day's premarket model, POST it
 *   publishDaily({ date })      → load the day's sweep model, POST it
 *
 * Publishing is a step AFTER the report has been generated and its files
 * written. It never mutates the report, and a failure here is reported but not
 * fatal: the HTML on disk is the system of record for the local workflow, and
 * a missed publish is recoverable by re-running this command for the date.
 *
 * Configuration (environment, or config/assetdecoded.json):
 *   ASSETDECODED_URL             base URL, e.g. https://assetdecoded.vercel.app
 *   RESEARCH_PUBLISH_SECRET      shared secret for the internal endpoint
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReport, DEFAULT_OUT_DIR as PREMARKET_DIR } from '../premarket/index.js';
import { loadReportModel } from '../social/report-model.js';
import { premarketToCanonical, dailyToCanonical } from './canonical.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DAILY_DIR = join(ROOT, 'docs', 'reports');
const CONFIG_PATH = join(ROOT, 'config', 'assetdecoded.json');

const PUBLISH_PATH = '/api/internal/research/publish';

/** Environment first, then the optional config file, so launchd can stay bare. */
export function loadConfig() {
  let file = {};
  if (existsSync(CONFIG_PATH)) {
    try { file = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); }
    catch { /* a broken config must not take down report generation */ }
  }
  const baseUrl = process.env.ASSETDECODED_URL || file.url || null;
  const secret = process.env.RESEARCH_PUBLISH_SECRET || file.secret || null;
  return { baseUrl, secret };
}

export class PublishError extends Error {
  constructor(message, { status = null, detail = null } = {}) {
    super(message);
    this.name = 'PublishError';
    this.status = status;
    this.detail = detail;
  }
}

/** POST one canonical payload. Retries only what is worth retrying. */
export async function postReport(payload, { baseUrl, secret, fetchImpl = fetch, retries = 3, log = () => {} } = {}) {
  if (!baseUrl) throw new PublishError('ASSETDECODED_URL is not set');
  if (!secret) throw new PublishError('RESEARCH_PUBLISH_SECRET is not set');

  const url = `${baseUrl.replace(/\/+$/, '')}${PUBLISH_PATH}`;
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* non-JSON error page */ }

      if (res.ok) return body ?? { ok: true };

      // 4xx other than 429 means the payload or the secret is wrong. Retrying
      // an identical request will fail identically, so stop and say why.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new PublishError(body?.error ?? `Rejected with ${res.status}`, {
          status: res.status,
          detail: body?.issues ?? text.slice(0, 500),
        });
      }
      lastError = new PublishError(body?.error ?? `Server returned ${res.status}`, {
        status: res.status,
        detail: text.slice(0, 500),
      });
    } catch (err) {
      if (err instanceof PublishError && err.status) throw err;
      lastError = err;
    }

    if (attempt < retries) {
      const waitMs = 2 ** attempt * 1000;
      log(`attempt ${attempt} failed (${lastError.message}); retrying in ${waitMs / 1000}s`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError ?? new PublishError('Publish failed');
}

/** Load a premarket model from disk and publish it. */
export async function publishPremarket({ date, outDir = PREMARKET_DIR, log = () => {}, ...opts } = {}) {
  const report = loadReport(outDir, date);
  if (!report) throw new PublishError(`No premarket report on disk for ${date}`);
  const payload = premarketToCanonical(report);
  log(`publishing premarket ${payload.tradingDate} (${payload.sections.length} sections)`);
  const result = await postReport(payload, { ...loadConfig(), ...opts, log });
  return { payload, result };
}

/** Load a daily sweep model from disk and publish it. */
export async function publishDaily({ date, outDir = DAILY_DIR, log = () => {}, ...opts } = {}) {
  const htmlPath = join(outDir, `daily-${date}.html`);
  if (!existsSync(htmlPath)) throw new PublishError(`No daily report on disk for ${date}`);
  const { model } = loadReportModel(htmlPath);
  const payload = dailyToCanonical(model);
  log(`publishing daily ${payload.tradingDate} (${payload.sections.length} sections)`);
  const result = await postReport(payload, { ...loadConfig(), ...opts, log });
  return { payload, result };
}

export async function publish({ type, date, ...opts }) {
  if (type === 'premarket') return publishPremarket({ date, ...opts });
  if (type === 'daily') return publishDaily({ date, ...opts });
  throw new PublishError(`Unknown report type: ${type}`);
}

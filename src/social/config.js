/**
 * Compliance configuration loader.
 *
 * The rules live in config/social-compliance.json so legal/compliance can
 * change disclosures, prohibited wording, and freshness limits without a
 * code change. An alternative file can be pointed to with
 * SOCIAL_COMPLIANCE_CONFIG=/path/to/file.json.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DEFAULT_CONFIG_PATH = join(ROOT, 'config', 'social-compliance.json');

export const DEFAULT_DISCLOSURE =
  'Educational market analysis only. Not investment advice. Trading involves risk.';

const FALLBACK = {
  disclosure: DEFAULT_DISCLOSURE,
  charLimit: 280,
  maxReportAgeHours: 24,
  requiredIndicators: ['Price', 'RSI', 'CMF'],
  requireSupportOrResistance: true,
  requireRiskContext: true,
  requireDataTimestamp: true,
  prohibitedPhrases: ['guaranteed', 'easy profit', 'you should buy', 'must buy', 'risk-free'],
  personalizedAdvicePatterns: [],
  unsupportedClaimPatterns: [],
  preferredPhrases: ['Watch', 'Potential setup', 'Technical signal', 'Breakout watch', 'Bearish exhaustion watch'],
  riskContextKeywords: ['risk', 'invalidat', 'rejection', 'back under', 'lose'],
  signalLabels: { WATCH: 'Watch', CONFIRMED: 'Confirmed Setup' },
  posting: { autoPublish: false, maxDraftsPerReport: 3, minConfidence: 'Medium', allowedSignals: ['CONFIRMED', 'WATCH'] },
};

let cached = null;

export function loadConfig(path = process.env.SOCIAL_COMPLIANCE_CONFIG || DEFAULT_CONFIG_PATH) {
  if (cached && cached.__path === path) return cached;
  let parsed = {};
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Invalid compliance config at ${path}: ${err.message}`);
  }
  const cfg = {
    ...FALLBACK,
    ...parsed,
    posting: { ...FALLBACK.posting, ...(parsed.posting || {}) },
    signalLabels: { ...FALLBACK.signalLabels, ...(parsed.signalLabels || {}) },
  };
  if (typeof cfg.disclosure !== 'string' || !cfg.disclosure.trim()) {
    throw new Error('Compliance config: "disclosure" must be a non-empty string');
  }
  // autoPublish is never honoured: the workflow requires a human approval step.
  cfg.posting.autoPublish = false;
  Object.defineProperty(cfg, '__path', { value: path, enumerable: false });
  cached = cfg;
  return cfg;
}

export function resetConfigCache() {
  cached = null;
}

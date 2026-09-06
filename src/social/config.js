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

/** Auto-publish is opt-in and every guard has a conservative default. */
export const AUTO_PUBLISH_OFF = Object.freeze({
  enabled: false,
  candidateSource: 'report-cohort', // 'report-cohort' = the report's own Calls/Puts lists; 'table' = classifier ranking
  requireSignal: null,              // null = any label (the cohort list is the gate); 'CONFIRMED' to tighten
  minConfidence: 'Low',
  maxPostsPerRun: 1,
  spacingSeconds: 120,
  symbolCooldownHours: 20,
  skipFlaggedRows: true,
  skipBiasKeywords: ['earnings', 'trial', 'avoid', 'no position', 'pre-news', 'stale'],
  allowWarnings: false,
  requireDisclosureLast: true,
});

const FALLBACK = {
  disclosure: DEFAULT_DISCLOSURE,
  disclosurePlacement: 'post', // 'post' | 'bio'
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
  cta: { enabled: false, text: '' },
  charts: { enabled: false, bars: 60, requireForPublish: false },
  hashtags: { required: ['#NFA', '#DYOR'], engagement: { default: [], bullish: [], bearish: [] }, maxTotal: 6, prohibited: [] },
  posting: { maxDraftsPerReport: 3, minConfidence: 'Medium', allowedSignals: ['CONFIRMED', 'WATCH'], autoPublish: AUTO_PUBLISH_OFF },
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
    cta: { ...FALLBACK.cta, ...(parsed.cta || {}) },
    charts: { ...FALLBACK.charts, ...(parsed.charts || {}) },
    hashtags: { ...FALLBACK.hashtags, ...(parsed.hashtags || {}), engagement: { ...FALLBACK.hashtags.engagement, ...(parsed.hashtags?.engagement || {}) } },
    signalLabels: { ...FALLBACK.signalLabels, ...(parsed.signalLabels || {}) },
  };
  // autoPublish: a bare boolean is not enough — it must be the full policy object,
  // and the kill switch SOCIAL_AUTO_PUBLISH=0 always wins.
  const ap = parsed.posting?.autoPublish;
  cfg.posting.autoPublish = ap && typeof ap === 'object' ? { ...AUTO_PUBLISH_OFF, ...ap } : { ...AUTO_PUBLISH_OFF };
  if (process.env.SOCIAL_AUTO_PUBLISH === '0') cfg.posting.autoPublish = { ...cfg.posting.autoPublish, enabled: false, disabledBy: 'SOCIAL_AUTO_PUBLISH=0' };
  if (!['post', 'bio'].includes(cfg.disclosurePlacement)) throw new Error('Compliance config: "disclosurePlacement" must be "post" or "bio"');
  if (typeof cfg.disclosure !== 'string' || !cfg.disclosure.trim()) {
    throw new Error('Compliance config: "disclosure" must be a non-empty string');
  }
  Object.defineProperty(cfg, '__path', { value: path, enumerable: false });
  cached = cfg;
  return cfg;
}

export function resetConfigCache() {
  cached = null;
}

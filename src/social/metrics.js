/**
 * Post performance metrics and the feedback loop into candidate ranking.
 *
 * Snapshots (docs/social/metrics.jsonl, append-only) record, per published
 * post: impressions, likes, replies, reposts, quotes, bookmarks, profile
 * clicks; and per account: follower count. Two collectors write the same
 * shape:
 *
 *   - `collectPostMetrics` / `collectAccountMetrics` pull them from the X API
 *     (v2 tweets with public + non-public metrics; requires OAuth 1.0a user
 *     context — the same credentials the publisher uses).
 *   - `recordManual` takes numbers read from the X analytics page by the
 *     scheduled browser task, for accounts posting without API access.
 *
 * `buildReport` joins the latest snapshot per post with the audit log (queue,
 * setup type, post kind, posting hour) and the tracker (outcome) and produces
 * aggregates by asset class, setup type, kind, weekday and hour, plus
 * recommendations. `writeInsights` persists the aggregates; `insightsBoost`
 * reads them back so `autoPublish` can break ties between equally-ranked
 * candidates in favour of what has historically engaged — a tiebreak only,
 * never an override of the quality ranking.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { oauth1Header, getCredentialsFromEnv } from './x-client.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DEFAULT_METRICS_PATH = join(ROOT, 'docs', 'social', 'metrics.jsonl');
export const DEFAULT_INSIGHTS_PATH = join(ROOT, 'docs', 'social', 'insights.json');
export const X_TWEETS_LOOKUP = 'https://api.x.com/2/tweets';
export const X_ME = 'https://api.x.com/2/users/me';

export const METRIC_FIELDS = ['impressions', 'likes', 'replies', 'reposts', 'quotes', 'bookmarks', 'profileClicks', 'engagements'];

export class MetricsStore {
  constructor(path = process.env.SOCIAL_METRICS_PATH || DEFAULT_METRICS_PATH) {
    this.path = path;
  }

  all() {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }

  append(record) {
    mkdirSync(dirname(this.path), { recursive: true });
    const rec = { at: new Date().toISOString(), ...record };
    appendFileSync(this.path, JSON.stringify(rec) + '\n');
    return rec;
  }

  /** Latest post snapshot per xPostId. */
  latestByPost() {
    const by = new Map();
    for (const r of this.all()) if (r.kind === 'post' && r.xPostId) {
      const prev = by.get(r.xPostId);
      if (!prev || r.at > prev.at) by.set(r.xPostId, r);
    }
    return by;
  }

  /** Account snapshots, oldest first. */
  account() {
    return this.all().filter(r => r.kind === 'account').sort((a, b) => a.at.localeCompare(b.at));
  }
}

// ─── normalisation ───────────────────────────────────────────────────────────

export function engagementsOf(m) {
  if (m.engagements != null) return m.engagements;
  return ['likes', 'replies', 'reposts', 'quotes', 'bookmarks', 'profileClicks'].reduce((a, k) => a + (m[k] ?? 0), 0);
}

export function engagementRate(m) {
  const imp = m.impressions ?? 0;
  return imp > 0 ? Number((engagementsOf(m) / imp).toFixed(4)) : null;
}

/** Normalise one X API v2 tweet object into a snapshot. */
export function parseTweetMetrics(tweet) {
  const pub = tweet.public_metrics ?? {};
  const priv = tweet.non_public_metrics ?? {};
  const m = {
    kind: 'post',
    xPostId: tweet.id,
    impressions: pub.impression_count ?? priv.impression_count ?? null,
    likes: pub.like_count ?? null,
    replies: pub.reply_count ?? null,
    reposts: pub.retweet_count ?? null,
    quotes: pub.quote_count ?? null,
    bookmarks: pub.bookmark_count ?? null,
    profileClicks: priv.user_profile_clicks ?? null,
    source: 'api',
  };
  m.engagements = engagementsOf(m);
  return m;
}

// ─── collectors ──────────────────────────────────────────────────────────────

/** Fetch metrics for up to 100 posts per call from the X API. */
export async function collectPostMetrics(xPostIds, { creds = getCredentialsFromEnv(), fetchImpl = fetch } = {}) {
  if (!creds) throw new Error('No X API credentials in environment');
  const out = [];
  for (let i = 0; i < xPostIds.length; i += 100) {
    const ids = xPostIds.slice(i, i + 100).join(',');
    const params = { ids, 'tweet.fields': 'public_metrics,non_public_metrics' };
    const url = `${X_TWEETS_LOOKUP}?${new URLSearchParams(params)}`;
    const headers = creds.type === 'oauth2'
      ? { Authorization: `Bearer ${creds.accessToken}` }
      : { Authorization: oauth1Header({ method: 'GET', url: X_TWEETS_LOOKUP, creds, extraParams: params }) };
    const res = await fetchImpl(url, { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`X API ${res.status}: ${json?.detail ?? json?.title ?? 'metrics lookup failed'}`);
    for (const t of json.data ?? []) out.push(parseTweetMetrics(t));
  }
  return out;
}

/** Follower / following counts for the authenticated account. */
export async function collectAccountMetrics({ creds = getCredentialsFromEnv(), fetchImpl = fetch } = {}) {
  if (!creds) throw new Error('No X API credentials in environment');
  const params = { 'user.fields': 'public_metrics' };
  const url = `${X_ME}?${new URLSearchParams(params)}`;
  const headers = creds.type === 'oauth2'
    ? { Authorization: `Bearer ${creds.accessToken}` }
    : { Authorization: oauth1Header({ method: 'GET', url: X_ME, creds, extraParams: params }) };
  const res = await fetchImpl(url, { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API ${res.status}: ${json?.detail ?? json?.title ?? 'account lookup failed'}`);
  const pm = json.data?.public_metrics ?? {};
  return { kind: 'account', handle: json.data?.username ?? null, followers: pm.followers_count ?? null, following: pm.following_count ?? null, posts: pm.tweet_count ?? null, source: 'api' };
}

/** A snapshot typed in from the X analytics page (browser task or a human). */
export function recordManual(xPostId, fields, { source = 'manual' } = {}) {
  const m = { kind: 'post', xPostId, source };
  for (const k of METRIC_FIELDS) if (fields[k] != null && fields[k] !== '') m[k] = Number(fields[k]);
  if (m.engagements == null) m.engagements = engagementsOf(m);
  return m;
}

// ─── report ──────────────────────────────────────────────────────────────────

const ET = { timeZone: 'America/New_York' };

function etHour(iso) {
  return Number(new Intl.DateTimeFormat('en-US', { ...ET, hour: 'numeric', hour12: false }).format(new Date(iso)));
}

function etWeekday(iso) {
  return new Intl.DateTimeFormat('en-US', { ...ET, weekday: 'short' }).format(new Date(iso));
}

function median(xs) {
  const a = xs.filter(x => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function bucket(rows, keyFn) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = {};
  for (const [k, rs] of groups) {
    const withMetrics = rs.filter(r => r.impressions != null);
    const resolved = rs.filter(r => r.outcome === 'breakout' || r.outcome === 'invalidated');
    out[k] = {
      n: rs.length,
      withMetrics: withMetrics.length,
      impressions: withMetrics.reduce((a, r) => a + r.impressions, 0),
      medianImpressions: median(withMetrics.map(r => r.impressions)),
      engagementRate: withMetrics.length ? Number((withMetrics.reduce((a, r) => a + (r.engagementRate ?? 0), 0) / withMetrics.length).toFixed(4)) : null,
      bookmarks: withMetrics.reduce((a, r) => a + (r.bookmarks ?? 0), 0),
      replies: withMetrics.reduce((a, r) => a + (r.replies ?? 0), 0),
      profileClicks: withMetrics.reduce((a, r) => a + (r.profileClicks ?? 0), 0),
      hitRate: resolved.length ? Math.round((resolved.filter(r => r.outcome === 'breakout').length / resolved.length) * 100) : null,
      resolved: resolved.length,
    };
  }
  return out;
}

/**
 * Join metrics with the audit log and tracker and aggregate. `auditRecords`
 * are `AuditStore#latest()`, `trackerRecords` are `SetupTracker#latest()`.
 */
export function buildReport({ metrics, auditRecords, trackerRecords = [], minN = 3 }) {
  const latest = metrics.latestByPost();
  const byTracker = new Map(trackerRecords.map(t => [t.id, t]));
  const posts = auditRecords
    .filter(r => r.status === 'published' && r.publication?.xPostId)
    .map(r => {
      const m = latest.get(r.publication.xPostId) ?? {};
      const t = byTracker.get(r.followUpOf ?? r.id) ?? null;
      const row = {
        auditId: r.id,
        xPostId: r.publication.xPostId,
        url: r.publication.url,
        queue: r.queue ?? 'stocks',
        kind: r.kind ?? 'setup',
        symbol: r.symbol,
        setupType: r.setup?.setup ?? null,
        topic: r.topic ?? null,
        signal: r.setup?.signal ?? null,
        stage: r.stage ?? null,
        postedAt: r.publication.at,
        hourET: etHour(r.publication.at),
        weekdayET: etWeekday(r.publication.at),
        outcome: t?.outcome ?? null,
        impressions: m.impressions ?? null,
        likes: m.likes ?? null, replies: m.replies ?? null, reposts: m.reposts ?? null, quotes: m.quotes ?? null,
        bookmarks: m.bookmarks ?? null, profileClicks: m.profileClicks ?? null,
        engagements: m.impressions != null ? engagementsOf(m) : null,
        engagementRate: m.impressions != null ? engagementRate(m) : null,
        metricsAt: m.at ?? null,
      };
      return row;
    });

  const setups = posts.filter(p => p.kind === 'setup');
  const byQueue = bucket(posts, p => p.queue);
  const bySetupType = bucket(setups, p => p.setupType);
  const byKind = bucket(posts, p => p.kind);
  const byHour = bucket(posts, p => `${String(p.hourET).padStart(2, '0')}:00 ET`);
  const byWeekday = bucket(posts, p => p.weekdayET);
  const byQueueSetup = bucket(setups, p => `${p.queue}/${p.setupType}`);
  const byTopic = bucket(posts.filter(p => p.kind === 'education' || p.kind === 'video'), p => p.topic);

  const acct = metrics.account();
  const followers = acct.length ? { latest: acct.at(-1).followers, first: acct[0].followers, delta: acct.at(-1).followers - acct[0].followers, snapshots: acct.length } : null;

  const recommendations = [];
  const top = (obj, key) => Object.entries(obj).filter(([, v]) => v.withMetrics >= minN && v[key] != null).sort((a, b) => b[1][key] - a[1][key]);
  const t1 = top(bySetupType, 'engagementRate')[0];
  if (t1) recommendations.push(`Setup type "${t1[0]}" has the highest engagement rate (${(t1[1].engagementRate * 100).toFixed(2)}% over ${t1[1].withMetrics} posts).`);
  const t2 = top(byHour, 'medianImpressions')[0];
  if (t2) recommendations.push(`Posts at ${t2[0]} draw the most impressions (median ${t2[1].medianImpressions}).`);
  const t3 = top(byQueue, 'engagementRate')[0];
  if (t3 && Object.keys(byQueue).length > 1) recommendations.push(`${t3[0]} posts engage better than the other asset class (${(t3[1].engagementRate * 100).toFixed(2)}%).`);
  const t4 = Object.entries(bySetupType).filter(([, v]) => v.resolved >= minN && v.hitRate != null).sort((a, b) => b[1].hitRate - a[1].hitRate)[0];
  if (t4) recommendations.push(`Setup type "${t4[0]}" resolves to a breakout most often (${t4[1].hitRate}% of ${t4[1].resolved}).`);
  const t5 = top(byKind, 'engagementRate');
  if (t5.length > 1) recommendations.push(`By post kind, "${t5[0][0]}" engages best (${(t5[0][1].engagementRate * 100).toFixed(2)}%).`);
  const t6 = top(byTopic, 'engagementRate')[0];
  if (t6) recommendations.push(`Educational topic "${t6[0]}" engages best (${(t6[1].engagementRate * 100).toFixed(2)}% over ${t6[1].withMetrics} posts) — lead the next cycle with it.`);
  if (!recommendations.length) recommendations.push(`Not enough posts with metrics yet (need ${minN} per bucket) — keep collecting.`);

  return {
    generatedAt: new Date().toISOString(),
    posts: posts.length,
    postsWithMetrics: posts.filter(p => p.impressions != null).length,
    totals: {
      impressions: posts.reduce((a, p) => a + (p.impressions ?? 0), 0),
      engagements: posts.reduce((a, p) => a + (p.engagements ?? 0), 0),
      replies: posts.reduce((a, p) => a + (p.replies ?? 0), 0),
      bookmarks: posts.reduce((a, p) => a + (p.bookmarks ?? 0), 0),
      profileClicks: posts.reduce((a, p) => a + (p.profileClicks ?? 0), 0),
    },
    followers,
    byQueue, bySetupType, byKind, byHour, byWeekday, byQueueSetup, byTopic,
    recommendations,
    rows: posts,
  };
}

// ─── insights (the feedback loop) ────────────────────────────────────────────

export function writeInsights(report, path = DEFAULT_INSIGHTS_PATH) {
  const { rows, ...insights } = report;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(insights, null, 2) + '\n');
  return path;
}

export function readInsights(path = DEFAULT_INSIGHTS_PATH) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * Tiebreak score for a candidate: the historical engagement rate of its
 * queue/setup-type bucket (falling back to setup type, then queue), only when
 * that bucket has at least `minN` measured posts. Returns 0 when nothing is
 * known, so ranking is unchanged until there is evidence.
 */
export function insightsBoost(insights, setup, queue, { minN = 3 } = {}) {
  if (!insights) return 0;
  const pick = (obj, key) => { const v = obj?.[key]; return v && v.withMetrics >= minN && v.engagementRate != null ? v.engagementRate : null; };
  return pick(insights.byQueueSetup, `${queue}/${setup.setup}`) ?? pick(insights.bySetupType, setup.setup) ?? pick(insights.byQueue, queue) ?? 0;
}

/** Markdown summary for the terminal / a report file. */
export function renderReportMarkdown(rep) {
  const pct = v => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
  const num = v => (v == null ? '—' : String(v));
  const table = (title, obj) => {
    const keys = Object.keys(obj);
    if (!keys.length) return `### ${title}\n(no data)\n`;
    const lines = [`### ${title}`, '| bucket | posts | with metrics | median impr. | eng. rate | bookmarks | replies | hit rate |', '|---|---|---|---|---|---|---|---|'];
    for (const k of keys.sort()) { const v = obj[k]; lines.push(`| ${k} | ${v.n} | ${v.withMetrics} | ${num(v.medianImpressions)} | ${pct(v.engagementRate)} | ${v.bookmarks} | ${v.replies} | ${v.hitRate == null ? '—' : v.hitRate + '% (' + v.resolved + ')'} |`); }
    return lines.join('\n') + '\n';
  };
  const head = [`# Post performance — ${rep.generatedAt.slice(0, 10)}`, '',
    `${rep.posts} published posts, ${rep.postsWithMetrics} with metrics. Impressions ${rep.totals.impressions} · engagements ${rep.totals.engagements} · replies ${rep.totals.replies} · bookmarks ${rep.totals.bookmarks} · profile clicks ${rep.totals.profileClicks}.`,
    rep.followers ? `Followers: ${rep.followers.latest} (${rep.followers.delta >= 0 ? '+' : ''}${rep.followers.delta} over ${rep.followers.snapshots} snapshots).` : 'Followers: no account snapshots yet.', ''];
  const recs = ['### Recommendations', ...rep.recommendations.map(r => `- ${r}`), ''];
  return [...head, ...recs, table('By asset class', rep.byQueue), table('By setup type', rep.bySetupType), table('By post kind', rep.byKind), table('By educational topic', rep.byTopic), table('By hour posted (ET)', rep.byHour), table('By weekday (ET)', rep.byWeekday)].join('\n');
}

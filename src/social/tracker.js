/**
 * Setup lifecycle tracker.
 *
 * Every setup the account posts is opened here with the two levels the post
 * named. Each tracking run walks the daily bars since the post and moves the
 * setup through the lifecycle on closes only — no intraday noise:
 *
 *   DEVELOPING / CONFIRMED  ──close beyond 🎯──▶  BREAKOUT     (terminal, a hit)
 *                           ──close beyond 🛑──▶  INVALIDATED  (terminal, a miss)
 *                           ──touched 🎯, no close beyond──▶  LEVEL_TEST event (once)
 *                           ──no resolution in N sessions──▶  EXPIRED (terminal, not scored)
 *
 * A DEVELOPING setup can also graduate to CONFIRMED when a later report's
 * classifier confirms the same symbol in the same direction.
 *
 * Storage is append-only JSON Lines (docs/social/setups.jsonl); the latest
 * record per id is the current state, exactly like the audit log. The weekly
 * scorecard and the metrics report are computed from this file, so the
 * numbers an account publishes about itself are always reproducible.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGE, initialStage, stageLabel } from './sweep-labels.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DEFAULT_TRACKER_PATH = join(ROOT, 'docs', 'social', 'setups.jsonl');

export const TERMINAL = new Set([STAGE.BREAKOUT, STAGE.INVALIDATED, STAGE.EXPIRED, STAGE.REMOVED]);

/** Close a record because its post no longer exists on X. Not a hit, not a miss. */
export function markRemoved(rec, { reason = 'post removed on X', now = new Date() } = {}) {
  if (TERMINAL.has(rec.stage)) return rec;
  const ev = { type: STAGE.REMOVED, bar: null, price: null, level: null, pct: null, at: now.toISOString(), reason };
  return { ...rec, stage: STAGE.REMOVED, stageLabel: stageLabel(STAGE.REMOVED), outcome: 'removed', closedAt: now.toISOString(), closedBar: null, closePrice: null, events: [...(rec.events ?? []), ev] };
}
export const EVENT = Object.freeze({ CONFIRMED: 'CONFIRMED', BREAKOUT: 'BREAKOUT', INVALIDATED: 'INVALIDATED', LEVEL_TEST: 'LEVEL_TEST', EXPIRED: 'EXPIRED' });

export class SetupTracker {
  constructor(path = process.env.SOCIAL_TRACKER_PATH || DEFAULT_TRACKER_PATH) {
    this.path = path;
  }

  all() {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }

  /** Current state of every tracked setup (last record wins). */
  latest() {
    const byId = new Map();
    for (const rec of this.all()) byId.set(rec.id, rec);
    return [...byId.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }

  get(id) {
    return this.latest().find(r => r.id === id) ?? null;
  }

  append(record) {
    mkdirSync(dirname(this.path), { recursive: true });
    const rec = { ...record, updatedAt: new Date().toISOString() };
    appendFileSync(this.path, JSON.stringify(rec) + '\n');
    return rec;
  }

  active() {
    return this.latest().filter(r => !TERMINAL.has(r.stage));
  }

  /** The open setup for a symbol in a queue, if any (used to avoid re-posting it). */
  openFor(symbol, queue) {
    return this.active().find(r => r.symbol === symbol && r.queue === queue) ?? null;
  }
}

// ─── opening ─────────────────────────────────────────────────────────────────

/**
 * Tracker record for a setup that has just been posted. `auditRec` is the
 * audit record of the post; `setup` is the classifier output it was built from.
 */
export function openFromSetup(auditRec, setup, { queue = auditRec.queue ?? 'stocks', assetClass = 'equity', now = new Date() } = {}) {
  const bearish = setup.direction === 'bearish';
  const target = bearish ? setup.support : setup.resistance;
  const stop = bearish ? setup.resistance : setup.support;
  const nextTarget = bearish ? setup.nextSupport : setup.nextResistance;
  const stage = initialStage(setup);
  return {
    id: auditRec.id,
    kind: 'setup',
    queue,
    assetClass,
    symbol: setup.symbol,
    reportDate: auditRec.reportDate,
    reportPath: auditRec.reportPath ?? null,
    direction: setup.direction,
    setupName: setup.setup,
    signal: setup.signal,
    confidence: setup.confidence,
    score: setup.score ?? null,
    entryPrice: setup.price,
    target: target ? { value: target.value, label: target.label } : null,
    stop: stop ? { value: stop.value, label: stop.label } : null,
    nextTarget: nextTarget ? { value: nextTarget.value, label: nextTarget.label } : null,
    stage,
    stageLabel: stageLabel(stage, { setup: setup.setup, direction: setup.direction }),
    openedAt: now.toISOString(),
    lastCheckedBar: auditRec.reportDate,
    levelTested: false,
    closedAt: null,
    closedBar: null,
    outcome: null,
    closePrice: null,
    posts: [{ stage, auditId: auditRec.id, xPostId: auditRec.publication?.xPostId ?? null, url: auditRec.publication?.url ?? null, at: auditRec.publication?.at ?? now.toISOString() }],
    events: [],
  };
}

// ─── event detection ─────────────────────────────────────────────────────────

export function pctMove(rec, price) {
  if (!rec.entryPrice) return null;
  return Number((((price - rec.entryPrice) / rec.entryPrice) * 100).toFixed(2));
}

/**
 * Walk the daily bars after the setup's report date and return the lifecycle
 * events they trigger, with the updated record. Terminal events stop the walk.
 * Only bars strictly after `lastCheckedBar` are considered, so re-running on
 * the same data is a no-op.
 *
 * Priority within one bar: invalidation before breakout (a bar that closes
 * beyond both is treated as the failure — conservative), then a level test.
 */
export function detectEvents(rec, candles, { maxAgeSessions = 15, now = new Date() } = {}) {
  if (TERMINAL.has(rec.stage)) return { events: [], next: rec };
  const bull = rec.direction !== 'bearish';
  const tgt = rec.target?.value ?? null;
  const stp = rec.stop?.value ?? null;
  const since = candles.filter(c => c.t > rec.reportDate).sort((a, b) => a.t.localeCompare(b.t));
  const fresh = since.filter(c => !rec.lastCheckedBar || c.t > rec.lastCheckedBar);
  const events = [];
  const next = { ...rec, events: [...(rec.events ?? [])], levelTested: !!rec.levelTested };

  const close = (type, bar, price, level) => {
    const ev = { type, bar, price, level, pct: pctMove(rec, price), at: now.toISOString() };
    events.push(ev);
    next.events.push(ev);
    next.stage = type;
    next.stageLabel = stageLabel(type, { setup: rec.setupName, direction: rec.direction });
    next.outcome = type === STAGE.BREAKOUT ? 'breakout' : type === STAGE.INVALIDATED ? 'invalidated' : 'expired';
    next.closedAt = now.toISOString();
    next.closedBar = bar;
    next.closePrice = price;
  };

  for (const c of fresh) {
    next.lastCheckedBar = c.t;
    const failed = stp != null && (bull ? c.c < stp : c.c > stp);
    const broke = tgt != null && (bull ? c.c > tgt : c.c < tgt);
    if (failed) { close(STAGE.INVALIDATED, c.t, c.c, stp); break; }
    if (broke) { close(STAGE.BREAKOUT, c.t, c.c, tgt); break; }
    const touched = tgt != null && !next.levelTested && (bull ? c.h >= tgt : c.l <= tgt);
    if (touched) {
      next.levelTested = true;
      const ev = { type: EVENT.LEVEL_TEST, bar: c.t, price: c.c, level: tgt, extreme: bull ? c.h : c.l, pct: pctMove(rec, c.c), at: now.toISOString() };
      events.push(ev);
      next.events.push(ev);
    }
  }
  if (!TERMINAL.has(next.stage) && since.length >= maxAgeSessions) {
    const last = since.at(-1);
    close(STAGE.EXPIRED, last.t, last.c, null);
  }
  return { events, next };
}

/** A DEVELOPING setup graduates when a later report confirms the same symbol and direction. */
export function graduate(rec, setup, model, { now = new Date() } = {}) {
  if (rec.stage !== STAGE.DEVELOPING || setup.signal !== 'CONFIRMED' || setup.direction !== rec.direction || setup.symbol !== rec.symbol) return null;
  const ev = { type: EVENT.CONFIRMED, bar: model.reportDate, price: setup.price, level: null, pct: pctMove(rec, setup.price), at: now.toISOString() };
  const next = {
    ...rec,
    stage: STAGE.CONFIRMED,
    stageLabel: stageLabel(STAGE.CONFIRMED, { setup: setup.setup, direction: setup.direction }),
    signal: 'CONFIRMED',
    confidence: setup.confidence,
    setupName: setup.setup,
    events: [...(rec.events ?? []), ev],
  };
  return { event: ev, next };
}

// ─── scorecard ───────────────────────────────────────────────────────────────

/** Monday and Friday (YYYY-MM-DD) of the week containing `date`. */
export function weekBounds(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = d.getUTCDay() || 7; // Mon=1 … Sun=7
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - (dow - 1));
  const fri = new Date(mon); fri.setUTCDate(mon.getUTCDate() + 4);
  const iso = x => x.toISOString().slice(0, 10);
  return { from: iso(mon), to: iso(fri) };
}

/**
 * Week (and all-time) statistics for the scorecard. "This week" counts setups
 * posted in the window and lifecycle events whose bar fell in the window; hit
 * rate is breakouts over resolved (breakouts + invalidations) — expiries are
 * neither a hit nor a miss and are reported separately.
 */
export function scorecardStats(records, { from, to, queue = null }) {
  // `queue` scopes the tally to one queue: the stocks and crypto queues post
  // from different accounts, so a cross-queue scorecard would put crypto
  // symbols on a stocks-only account. Omit it to count every record.
  if (queue) records = records.filter(r => (r.queue ?? 'stocks') === queue);
  const inWin = d => d && d >= from && d <= to;
  const posted = records.filter(r => inWin(r.reportDate));
  const breakouts = records.filter(r => r.outcome === 'breakout' && inWin(r.closedBar));
  const invalidated = records.filter(r => r.outcome === 'invalidated' && inWin(r.closedBar));
  const expired = records.filter(r => r.outcome === 'expired' && inWin(r.closedBar));
  const removed = records.filter(r => r.outcome === 'removed');
  const active = records.filter(r => !TERMINAL.has(r.stage) && r.reportDate <= to);
  const resolved = breakouts.length + invalidated.length;
  // "Setups posted" excludes records whose post was taken down.
  const live = r => r.outcome !== 'removed';
  const allBreak = records.filter(r => r.outcome === 'breakout').length;
  const allInv = records.filter(r => r.outcome === 'invalidated').length;
  const allResolved = allBreak + allInv;
  const moves = [...breakouts, ...invalidated].map(r => ({ symbol: r.symbol, pct: r.events.at(-1)?.pct ?? null })).filter(m => m.pct != null);
  const best = moves.length ? moves.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = moves.length ? moves.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  return {
    from, to,
    posted: posted.filter(live).length,
    breakouts: breakouts.length,
    invalidated: invalidated.length,
    expired: expired.length,
    removed: removed.length,
    active: active.length,
    resolved,
    hitRate: resolved ? Math.round((breakouts.length / resolved) * 100) : null,
    allTime: { setups: records.filter(live).length, breakouts: allBreak, invalidated: allInv, resolved: allResolved, hitRate: allResolved ? Math.round((allBreak / allResolved) * 100) : null },
    best, worst,
    symbols: { posted: posted.filter(live).map(r => r.symbol), breakouts: breakouts.map(r => r.symbol), invalidated: invalidated.map(r => r.symbol), expired: expired.map(r => r.symbol), active: active.map(r => r.symbol) },
  };
}

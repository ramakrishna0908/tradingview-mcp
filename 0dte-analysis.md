# 0DTE Game Plan — QQQ · SPX · META · TSLA

**Session: 2026-07-22 (Wed) — REFRESHED 13:25 ET (~2.5h to close).** Separate from the swing tracker
(`analysisstocks.md`) — this file is intraday, level-based, and goes stale within the session.

> ✅ **Data freshness (VERIFIED):** last 5-min bars stamped 13:20–13:25 ET = current. **SPX fully verified** —
> Σ5-min vol 1.377B ≈ daily tape 1.375B. ⚠️ **QQQ price/levels verified but volume DEGRADED** — Σ5-min 1.54M
> vs 14.1M daily tape (single-venue BATS feed) → use QQQ *relative* volume only; lean on SPX volume as the tell.

> 🔄 **Read flip vs prior session:** tape is **bid, not offered.** Both true-0DTE names are **ABOVE VWAP and
> ABOVE CPR** on narrow-CPR trend days after a morning shakeout-and-reclaim (SPX dipped <CPR to 7486 then
> reclaimed VWAP+CPR = textbook rule-6 CALL). **Bias = CALLS, not puts.** Fuel left (SPX 52% / QQQ 43% ATR used).

> ⚠️ **Expiry reality check:** Only **QQQ and SPX have true same-day (0DTE) expirations today.** **META and TSLA
> do NOT list daily expiries** — **excluded** from today's 0DTE selection per the true-expiry-only rule.

## Method — indicators that matter for 0DTE
Swing indicators (daily RSI, weekly cloud) are noise on 0DTE. This plan is built on the intraday level
stack that actually drives same-day options:
- **CPR (Central Pivot Range)** = BC `(H+L)/2`, Pivot `(H+L+C)/3`, TC `2P−BC` from **prior day**. **Narrow
  CPR → trend day; wide CPR → range day.** Price above CPR = bullish bias, below = bearish.
- **Session VWAP** (volume-weighted, resets at the open) — the intraday line of control. Above = buyers,
  below = sellers. First test of VWAP is the highest-odds intraday trade.
- **Floor pivots** R1–R3 / S1–S3 — the day's magnet/target ladder.
- **PDH / PDL / PDC** — prior-day high/low/close, the reference edges.
- **Opening Range (OR, first 15m)** — break/hold defines early trend.
- **ATR (daily)** — expected range; how much fuel is left. >100% used = exhausted, mean-revert risk.

*(VWAP values are computed from today's 5-min bars, mid-session — approximate, ±a few ticks.)*

---

## 📊 Quick Read

| Sym | 0DTE? | Px | VWAP | vs VWAP | CPR (BC–TC) | vs CPR | ATR used | **Bias** | Trigger line |
|-----|-------|----|------|---------|-------------|--------|----------|----------|--------------|
| **SPX** | ✅ today | 7515.8 | 7510.1 | **above** ▲ | 7491.6–7503.3 | above ▲ | ~52% | 🟢 **CALL (best)** | >7527 R1 break→R2 7545, or 7510 VWAP dip-hold |
| **QQQ** | ✅ today | 708.8 | 707.0 | **above** ▲ | 706.4–708.1 | above ▲ | ~43% | 🟢 **CALL (backup)** | >710 PDH break→R1 711.8, or 707 VWAP dip-hold |
| **META** | ❌ weekly | — | — | — | — | — | — | ⛔ **not 0DTE** | excluded — no daily expiry |
| **TSLA** | ❌ weekly | — | — | — | — | — | — | ⛔ **not 0DTE** | excluded — no daily expiry |

**One-liner:** Both true-0DTE names are **bid above VWAP + CPR** on narrow-CPR trend days = **CALL bias** — but
both are **coiling mid-range just under resistance** (SPX <R1 7527/sessH 7526; QQQ <PDH 710/sessH 709.65). The
trade is the **trigger, not the current print.** **SPX = best vehicle** (fully-verified data incl. volume, most
fuel, clean R2 7545 target). **QQQ = backup** (degraded volume feed, tiny 6-pt range). At 7516/708.8 = **NO
TRADE** until a VWAP-retest-hold or an R1/PDH break on volume.

---

## 📋 All-Indicators Master Table

| Indicator | **SPX** ✅ (best) | **QQQ** ✅ (backup) |
|-----------|------------------|---------------------|
| **Price** | 7515.83 | 708.84 |
| **Session VWAP** | 7510.05 | 707.04 |
| **vs VWAP** | ▲ above +5.78 | ▲ above +1.80 |
| **CPR — TC** | 7503.33 | 708.12 |
| **CPR — Pivot** | 7497.46 | 707.27 |
| **CPR — BC** | 7491.59 | 706.42 |
| **CPR width** | 11.74 (0.16%) narrow | 1.70 (0.24%) narrow |
| **CPR signal** | trend day | trend day |
| **vs CPR** | ▲ above | ▲ above |
| **R3** | 7574.50 | 719.00 |
| **R2** | 7544.91 | 714.52 |
| **R1** | 7527.05 | 711.75 |
| **S1** | 7479.60 | 704.50 |
| **S2** | 7450.01 | 700.02 |
| **S3** | 7432.15 | 697.25 |
| **PDH** | 7515.31 | 710.05 |
| **PDL** | 7467.86 | 702.80 |
| **PDC** | 7509.20 | 708.97 |
| **Today Open** | 7497.47 | 703.62 |
| **Today High** | 7525.94 | 709.65 |
| **Today Low** | 7485.84 | 703.57 |
| **OR (15m)** | 7485.84–7502.51 | 703.57–705.90 |
| **OR break** | ▲ up (reclaim) | ▲ up (reclaim) |
| **ATR (daily)** | 77.04 | 14.24 |
| **ATR used** | ~52% | ~43% |
| **Daily RSI** | 53.5 | 47.9 |
| **Daily CMF** | +0.12 | +0.06 |
| **0DTE today?** | ✅ yes | ✅ yes |
| **BIAS** | 🟢 CALL (best) | 🟢 CALL (backup) |
| **Trigger** | >7527 R1 → R2 7545 | >710 PDH → R1 711.75 |
| **Status** | above VWAP/CPR, coiling <R1 | above VWAP/CPR, coiling <PDH |

*VWAP + ATR-used computed from today's 5-min bars (SPX Σvol reconciles to daily tape; QQQ volume single-venue).
Pivots/CPR exact from prior-day (7/21) HLC. META/TSLA excluded — no true 0DTE expiry.*

---

## SPX — 🟢 CALL / BEST (true 0DTE — SPXW)
**Px 7515.83** · Open 7497.47 / H 7525.94 / L 7485.84 · Range 40.1 (~52% of 77 ATR — **fuel left**)

- **CPR:** BC 7491.59 / P 7497.46 / TC 7503.33 — **width 11.7 pt (0.16%) = narrow → trend day.**
- **Pivots:** R1 7527.05 · R2 7544.91 · R3 7574.50 | S1 7479.60 · S2 7450.01 · S3 7432.15
- **PDH/PDL/PDC:** 7515.31 / 7467.86 / 7509.20 — **price reclaimed PDH & PDC (bullish).**
- **VWAP 7510.05 (price +5.78 above)** · **OR 15m** 7485.84–7502.51 (opened low, broke **above** = reclaim)
- **Structure:** opened 7497 → shook out to **7486 (below CPR, near S1)** → **reclaimed VWAP + CPR** and ran to
  session high **7525.9 (just under R1 7527)** — textbook rule-6 below-CPR-VWAP-reclaim → CALL. Now coiling
  7515–7525 under R1 with slight lower-highs (mild momentum cooldown near resistance).

**Play (CALL):** Two triggers — **(a) primary/dip-buy:** pullback to **VWAP 7510 that holds** (5-min close stays
>7510) → long back to R1 7527 → **R2 7544.9**; **(b) momentum:** **5-min close >7527 (R1/sessH) on rising
volume** → R2 7544.9, stretch R3. **Invalidation:** 5-min close **<7510 VWAP** = stand down; **<7503 CPR-TC**
confirms failure → no longs. Best vehicle today — fully-verified data, most ATR left, clean 7545 target.

## QQQ — 🟢 CALL / BACKUP (true 0DTE)
**Px 708.84** · Open 703.62 / H 709.65 / L 703.57 · Range 6.1 (~43% of 14.2 ATR — quiet grind)

- **CPR:** BC 706.42 / P 707.27 / TC 708.12 — width 1.70 pt (0.24%) narrow → trend day.
- **Pivots:** R1 711.75 · R2 714.52 · R3 719.00 | S1 704.50 · S2 700.02 · S3 697.25
- **PDH/PDL/PDC:** 710.05 / 702.80 / 708.97
- **VWAP 707.04 (price +1.80 above)** · **OR 15m** 703.57–705.90 (opened at low, broke **above** = reclaim)
- **Structure:** same shape as SPX — opened at the low 703.57, climbed through VWAP + CPR, now coiling under
  **PDH 710.05 / sessH 709.65.** Tight 6-pt range = low volatility. ⚠️ intraday volume feed degraded.

**Play (CALL, backup):** **>710.05 PDH break** (5-min close, ideally with SPX confirming) → **R1 711.75** → R2
714.5; or **707 VWAP dip-hold** → 709.65/710. **Invalidation:** 5-min close **<707 VWAP / <706.4 CPR-BC.**
Backup only — smaller target, tiny range, and volume can't be trusted for confirmation (defer to SPX's tape).

## META / TSLA — ⛔ EXCLUDED (no true 0DTE today)
Neither lists a same-day expiry (weekly-only). Per the true-expiry-only rule they are **out of scope for today's
0DTE selection** — see the swing tracker (`analysisstocks.md`) for their multi-day read.

---

## 0DTE discipline (applies to all four)
1. **VWAP is the boss** — longs above it, shorts below it. First test is the trade; don't fight the side.
2. **Narrow CPR (QQQ/SPX today) = trend day** — trade the break of the CPR band, don't fade inside it.
3. **Watch ATR-used** — >~80% spent (QQQ 83%, META 111%) means little range left; chasing = paying the top.
   Fresh entries favor names with fuel (SPX 56%, TSLA 77%).
4. **True 0DTE (QQQ/SPX) = brutal theta/gamma** — be right on direction fast or cut; no "hold and hope."
   META/TSLA are 2-day, slightly more forgiving but still decaying.
5. **Levels are snapshots** — recompute VWAP/pivots as the session evolves; this is a mid-session read.
6. **Below-CPR VWAP-reclaim = CALL trigger, NOT a fade.** ⚠️ Recurring miss (SPX 7532→7560, META 626→651
   on 7/17). When price is *below CPR* but **reclaims session VWAP on above-average volume and then holds
   a retest of it**, that is a mean-reversion LONG signal — buy the reclaim/retest-hold, don't wait to
   fade the next resistance. Below-CPR is day-frame *context*, not a veto on the reclaim. The put only
   triggers if price *loses* VWAP again. Rule of thumb: reclaim + hold VWAP = call; lose VWAP = put —
   let the VWAP test pick the side, and stop defaulting to "below CPR → fade."
7. **A winning 0DTE trade is NEVER allowed to become a loser — scale, don't wait for the bullseye.**
   ⚠️ Cost a full round-trip on 7/20 (SPX put 7460→7440, held for S1 7426, popped back to a loss). Targets
   are **magnets, not guarantees** — pivots frequently undershoot (S1 never printed; PDL 7431 was the real
   floor). The exit protocol: **(a)** bank half/third at the **first interim level** (halfway point or PDL/PDH),
   not at the final pivot; **(b)** move the stop to **breakeven the moment you're +½-way to target**; **(c)**
   **trail** the runner below each lower-high (let the pop stop you out *green*); **(d)** set the final target
   **IN FRONT of the pivot** (PDL 7431, not S1 7426 — front-run the crowd's algo); **(e)** near a target,
   *tighten* (proximity = higher reversal risk), and in the **afternoon with ATR mostly spent, take what it
   gives**. Collecting the trade is a separate skill from calling it — the read was right; only the exit lost.

---

## 🗓️ Intraday Decision Journal (true-0DTE only: QQQ / SPX)

**Read before each intraday run. Preserve history. Log the trigger that fired + the outcome each session.**

### 2026-07-20 (Mon) — afternoon read (~4.3h in / ~2h to close)
**Data freshness: VERIFIED** — 5-min ΣvolumeSPX 1,334M ≈ daily 1,333M; last bars current. Afternoon → gamma/theta accelerating.
**Setup shape (both):** opened at highs → faded below session VWAP → sitting near session lows just above CPR. Sellers control intraday; CPR is the floor. Both in CPR↔VWAP no-man's-land.

| | Price | VWAP | vs | CPR | SessH/L | OR | ATR used |
|---|-------|------|----|----|---------|-----|----------|
| **SPX** | 7467.4 | ~7483.5 | ▼ | **7460.1–7464.9 (on it)** | 7513/7461 | 7489–7513 ↓broke | ~65% |
| **QQQ** | 699.6 | ~701.7 | ▼ | 694.5–695.1 (above) | 705.8/698.1 | 701.8–705.5 ↓broke | ~52% |

**BEST — SPX (v.narrow CPR = trend day; most fuel + big target):**
- PUT (primary): trigger **5-min close <7460** (take 7461.4 low) + vol → **S1 7426.5** (stretch 7395); invalid = 5-min close >7465.
- CALL (alt, rule 6): reclaim + hold **>VWAP 7483.5** → R1 7493.7 → 7513; invalid = lose 7483.
**BACKUP — QQQ:** PUT <698.1 → CPR/PDC 695 (thin ~4.5pt); CALL reclaim >701.7 → 702.8/705.8.

**Decision: NO TRADE at read time** — mid-range chop; require the break + volume. Contracts = defined-risk debit spreads ATM-to-trigger/short-at-target; no far-OTM lottos in the PM. TP half at first target, time-stop 3 bars, max loss = level invalidation or −40% premium. No-trade if: chop inside CPR↔VWAP, break on no volume, last 30–45 min, or data unverifiable (→WAIT FOR REFRESH).
**Rules applied:** #1 VWAP=boss (both below→short-lean), #2 narrow-CPR trend day (trade the break), #3 ATR-used (SPX>QQQ fuel), #6 reclaim=call not fade.
**Entries taken:** SPX PUT on the **7460 break** (primary setup — fired as planned).
**Outcome:** ✅ thesis correct → SPX dropped to **7440** (~20 of the ~34 pts to S1 7426, ~60% of the move). ❌ **but held the full runner waiting for the exact S1 7426 print; it stalled ~7440, popped back up, and round-tripped the gain into a LOSS.** Target undershot S1 (never touched 7426) — as PDL 7431 warned.
**Mistake:** all-or-nothing exit on the final pivot; no scale-out, no breakeven stop, no trail. Let a real winner become a loser.
**Lesson → new rule 7 (below):** targets are magnets not guarantees; **half-off at halfway/PDL, stop to breakeven once +½ to target, trail the runner, and aim the final exit IN FRONT of the pivot (PDL 7431, not S1 7426).** With that: half booked ~7443, runner trailed out ~7440–7448 = fully green, zero give-back. Same read, same entry — exit discipline was the whole difference.
**Also:** don't force the mid-range; the edge is the CPR break or the VWAP reclaim, nothing in between (this held — the break was the right trigger).

### 2026-07-22 (Wed) — midday read 13:25 ET (~2.5h to close)
**Data freshness: VERIFIED** — 5-min bars stamped 13:20–13:25 ET (current). **SPX Σ5-min vol 1.377B ≈ daily 1.375B ✓** (fully verified). ⚠️ **QQQ Σ5-min 1.54M vs 14.1M daily** = single-venue BATS feed → QQQ absolute-volume DEGRADED, used relative-only + deferred to SPX tape. File was stale on entry (master table 7/15, last journal 7/20) → recomputed everything from prior-day (7/21) HLC + today's 5-min bars.
**Setup shape (both):** opened at/below CPR, **shook out to the lows then reclaimed VWAP + CPR** and trended up to session highs — bid tape, **rule-6 below-CPR-VWAP-reclaim = CALL** (not the puts the stale file implied). Both now coiling mid-range just under first resistance.

| | Price | VWAP | vs | CPR (BC–TC) | vs | SessH/L | OR15m | ATR used |
|---|-------|------|----|-------------|----|---------|-------|----------|
| **SPX** | 7515.8 | 7510.1 | ▲ +5.8 | 7491.6–7503.3 | above | 7525.9/7485.8 | 7485.8–7502.5 ↑reclaim | ~52% |
| **QQQ** | 708.8 | 707.0 | ▲ +1.8 | 706.4–708.1 | above | 709.65/703.57 | 703.6–705.9 ↑reclaim | ~43% |

**BEST — SPX CALL (narrow-CPR trend day, above VWAP+CPR, most fuel, fully-verified data):**
- Primary (dip-buy): **VWAP 7510 retest that holds** (5-min close >7510) → R1 7527 → **R2 7544.9**; invalid = 5-min close <7510 (<7503 CPR confirms).
- Momentum (alt): **5-min close >7527 (R1/sessH) on rising volume** → R2 7544.9, stretch R3 7574; invalid = fail back <7510.
**BACKUP — QQQ CALL:** >710.05 PDH (SPX-confirmed) → R1 711.75 / R2 714.5; or 707 VWAP hold. Invalid <707/706.4. Degraded volume feed = confirmation via SPX only.

**Decision: NO TRADE at read time (7516 / 708.8 = mid-range between VWAP and R1).** Bias is CALL, but price sits in the no-man's-land the edge lives outside of — require the **VWAP-hold dip** or the **R1/PDH break on volume**. Late-session cooldown (SPX lower-highs under R1) argues for the dip-buy over chasing the breakout.
**Contract-selection method (no chain data invented):** true 0DTE = **SPXW same-day** / QQQ same-day. Use **defined-risk debit CALL spread** — long ~ATM at the trigger, short at the target pivot (SPX long ~7515–7520 / short ~7545; QQQ long ~709 / short ~714) — caps 0DTE theta/gamma. ATM-to-1-strike-ITM for delta; **no far-OTM lottos in the PM.** Size so max loss (full debit) ≤ 1R.
**Profit-taking (rule 7):** bank half at the **first interim level** (SPX ~7527 break-retest or the +50%-to-target ~7536), **stop to breakeven once +½ to target**, **trail** under each 5-min lower-high, set final exit **in front of** R2 (7540, not 7545); tighten into the close.
**Max-loss rules:** hard exit on 5-min close back **below VWAP** (7510 SPX / 707 QQQ); **−40% premium** stop; **3-bar time stop** if no follow-through — whichever first.
**No-trade conditions:** mid-range chop (current); break on no volume (esp. QQQ — needs SPX confirm); after ~15:15 ET (theta cliff, no new entries); reclaim/break fails the retest; range stays compressed on light volume (no edge); data unverifiable on next check → **WAIT FOR REFRESH**.
**Rules applied:** #1 VWAP=boss (both above → long side), #2 narrow-CPR trend day (trade the break, don't fade inside), #3 ATR-used (SPX 52% > QQQ 43% fuel; both have room), #6 below-CPR-VWAP-reclaim = CALL (the whole flip vs the stale put file), #7 scale-don't-wait on the exit.
**Entries taken:** NONE — NO TRADE taken all session (correctly).
**Outcome (resolved ~15:05 ET, live-watched):** After the 13:25 read, SPX **rolled from 7526 back to VWAP** and then **chopped 7503–7512 for ~90 min** (13:30–15:05) — **never reclaimed 7512** (CALL trigger never fired) and **never held a VWAP dip** (price sat *below* VWAP the whole time = failing, not holding). The 7503 fail line (CPR-top) was tested repeatedly (lows 7503.51 / 7503.56 / 7503.25) and held by a hair, then **broke ~15:05** (15:00 closed 7503.58, 15:05 traded 7501.37). **CALL setup = DEAD.** The downside break was **NOT taken as a put** — too late (15:05, past the ~15:15 theta cutoff) and too weak (limp break out of dead low-vol chop, no volume thrust). QQQ never triggered either (>710 not reclaimed). **Net: watched from 13:25→15:05, zero trades, no loss.**
**Successful signal:** the *discipline* was the win — the read flagged "coiling mid-range = NO TRADE until the trigger," and the trigger never came. Waiting avoided a chop-day loser (a forced long into the VWAP failure would have bled out).
**Mistake avoided:** did **not** force the mid-range and did **not** chase the marginal late-day 7503 break into the close (rule: edge is the reclaim/break with momentum, not the ooze).
**Recurring lesson reinforced:** *"below VWAP but glued to it = failing, not holding."* A dip only counts as a hold when a 5-min bar **closes back above** VWAP — SPX never did, so there was never a long. When a name chops directly on VWAP for 45+ min without reclaiming, it's a NO-TRADE tell, not a pending setup.
**Next-session rule added:** if the primary trigger hasn't fired by ~90 min of the read AND price is in low-vol chop, **stand down early** — don't babysit a dead range into the theta cliff; re-engage only on a fresh session catalyst.
**Mistake to avoid (carried from 7/20):** don't chase the mid-range and don't hold a runner for the exact pivot; front-run R2 at 7540 and scale.
**Next-session rule reinforced:** always recompute levels from *current* 5-min bars before acting — this file was 5 sessions stale and had the **wrong directional bias (puts)**; the refresh flipped it to calls. Stale 0DTE levels are worse than none.

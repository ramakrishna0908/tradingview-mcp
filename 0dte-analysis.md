# 0DTE Game Plan — QQQ · SPX · META · TSLA

**Session: 2026-07-15 — REFRESHED (later intraday).** Separate from the swing tracker
(`analysisstocks.md`) — this file is intraday, level-based, and goes stale within the session.

> 🔄 **Refresh update:** Puts are working. **SPX broke its CPR floor (7535)**, **TSLA broke S1 (393.2)**
> heading to S2, **QQQ ground into S2 (710.8)** at new lows. **META tapped R3 (686.06) and rejected again** —
> still the lone holdout but capped and now 115% of ATR spent. Tape stayed heavy; VWAPs barely moved.

> ⚠️ **Expiry reality check:** Only **QQQ and SPX have true same-day (0DTE) expirations today (Wed 7/15).**
> **META and TSLA do NOT list daily expiries** — nearest is the **Fri 7/17 weekly (~2 DTE)**. So for those
> two, "0DTE" means a Friday-expiry contract held over ~2 days: less gamma/theta knife-edge than a true
> 0DTE, but still fast decay. Treat QQQ/SPX as pure intraday scalps; META/TSLA as 2-day directional.

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
| **QQQ** | ✅ today | 711.9 | ~717 | **below** ▼ | 718.3–719.2 | below ▼ | ~86% | 🔴 **PUTS→target** | at S2 710.8; break→S3 707.3, else cover |
| **SPX** | ✅ today | 7535 | ~7560 | **below** ▼ | 7535–7541 | **broke floor** ▼ | ~62% | 🔴 **PUTS active** | lost 7535 CPR; tgt S1 7519→S2 7494 |
| **META** | ❌ Fri 7/17 | 684.2 | ~676 | **above** ▲ | 657.8–660.0 | far above ▲ | ~115% | 🟡 **don't chase** | rej R3 686 again; fade→676, or buy 676 dip |
| **TSLA** | ❌ Fri 7/17 | 392.1 | ~398 | **below** ▼ | 397.0–398.5 | below ▼ | ~85% | 🔴 **PUTS active** | broke S1 393.2; tgt S2 390.3→S3 385.8 |

**One-liner:** Puts paid — SPX, TSLA and QQQ all pushed to their downside triggers/targets. **QQQ is now
*at* S2 710.8** (take-profit / needs a fresh break for more). **SPX just lost its CPR** — freshest continuation
(most ATR left, S1 7519 open). **TSLA broke S1**, running to S2 390. **META** still won't break — capped at
R3 686 but exhausted (115% ATR); fade-to-676 is the play, not chasing calls.

---

## 📋 All-Indicators Master Table

| Indicator | **QQQ** ✅ | **SPX** ✅ | **META** (2DTE) | **TSLA** (2DTE) |
|-----------|-----------|-----------|-----------------|-----------------|
| **Price** | 711.92 | 7535.42 | 684.17 | 392.07 |
| **Session VWAP** | ~717 | ~7560 | ~676 | ~398 |
| **vs VWAP** | ▼ below | ▼ below | ▲ above | ▼ below |
| **CPR — TC** | 719.23 | 7540.84 | 659.95 | 398.49 |
| **CPR — Pivot** | 718.77 | 7538.09 | 658.86 | 397.72 |
| **CPR — BC** | 718.32 | 7535.34 | 657.78 | 396.95 |
| **CPR width** | 0.9 (narrow) | 5.5 (v.narrow) | 2.2 (mod) | 1.5 (mod) |
| **CPR signal** | trend day | strong trend | trend (up) | trend (rev) |
| **vs CPR** | ▼ below | ▼ broke floor | ▲ far above | ▼ below |
| **R3** | 731.16 | 7607.15 | 686.13 | 408.14 |
| **R2** | 726.72 | 7582.30 | 676.31 | 405.18 |
| **R1** | 723.21 | 7562.94 | 668.68 | 400.68 |
| **S1** | 715.26 | 7518.73 | 651.23 | 393.22 |
| **S2** | 710.82 | 7493.88 | 641.41 | 390.26 |
| **S3** | 707.31 | 7474.52 | 633.78 | 385.76 |
| **PDH** | 722.29 | 7557.44 | 666.50 | 402.22 |
| **PDL** | 714.34 | 7513.23 | 649.05 | 394.76 |
| **PDC** | 719.69 | 7543.59 | 661.04 | 396.18 |
| **Today Open** | 723.85 | 7571.72 | 663.60 | 399.40 |
| **Today High** | 724.36 | 7581.50 | 686.06 | 406.59 |
| **Today Low** | 711.64 | 7532.06 | 656.66 | 391.81 |
| **OR (15m)** | 719.5–724.1 | 7559.7–7580.8 | 656.7–662.4 | 399.4–406.6 |
| **OR break** | ▼ down | ▼ down | ▲ up | ▼ down (trap) |
| **ATR (daily)** | 14.74 | 79.38 | 25.61 | 17.48 |
| **ATR used** | ~86% | ~62% | ~115% | ~85% |
| **Daily RSI** | 48.8 | 57.0 | 66.2 | 47.6 |
| **Daily CMF** | −0.08 | −0.02 | −0.02 | −0.02 |
| **0DTE today?** | ✅ yes | ✅ yes | ❌ Fri 7/17 | ❌ Fri 7/17 |
| **BIAS** | 🔴 PUTS→tgt | 🔴 PUTS active | 🟡 don't chase | 🔴 PUTS active |
| **Trigger** | at S2 710.8→707.3 | lost 7535→7519 | rej R3 686→676 | broke S1→390.3 |
| **Status** | at target | fresh breakdown | capped/exhausted | working →S2 |

*VWAP + ATR-used computed from today's 5-min bars, mid-session — approximate. Pivots/CPR exact from prior-day HLC.*

---

## QQQ — 🔴 PUTS (true 0DTE)
**Px 713.07** · Open 723.85 / H 724.36 / L 712.06 · Range 12.3 (~83% of 14.7 ATR — mostly spent)

- **CPR:** BC 718.32 / P 718.77 / TC 719.23 — **width 0.9 pt (0.13%) = narrow → trend day.** ✓ (down-trend)
- **Pivots:** R1 723.21 · R2 726.72 · R3 731.16 | **S1 715.26 · S2 710.82 · S3 707.31**
- **PDH/PDL/PDC:** 722.29 / 714.34 / 719.69
- **VWAP ~717** · **OR 15m** 719.5–724.1 (broke below = downside)
- **Structure:** opened at R1, rejected, broke CPR *and* S1 → clean bearish trend day. Below VWAP.

**Play:** Puts, but **don't chase 713** — ~83% of ATR is used. Best entry = **rally into the 715.3–718 supply
stack (S1 / VWAP 717 / CPR)** that rejects → puts targeting **S2 710.82 → S3 707.31.** **Invalidation:** 15-min
reclaim & hold **>717 VWAP / back into CPR 718.3** flips it neutral-long toward R1 723.

## SPX — 🔴 PUTS-lean (true 0DTE)
**Px 7543.96** · Open 7571.72 / H 7581.50 / L 7536.99 · Range 44.5 (~56% of 79 ATR — **fuel left**)

- **CPR:** BC 7535.34 / P 7538.09 / TC 7540.84 — **width 5.5 pt (0.07%) = very narrow → strong trend day.**
- **Pivots:** R1 7562.94 · R2 7582.30 · R3 7607.15 | **S1 7518.73 · S2 7493.88 · S3 7474.52**
- **PDH/PDL/PDC:** 7557.44 / 7513.23 / 7543.59
- **VWAP ~7563 (≈ R1)** · **OR 15m** 7559.7–7580.75 (broke below) · tagged **R2 7582 at open & rejected**
- **Structure:** below VWAP, grinding down, holding just above CPR (7540). Weaker than it looks.

**Play:** The **CPR 7535 is the hinge.** Short/puts on **loss of 7535** → **S1 7518.73 → S2 7493.88** (more ATR
room than QQQ). Or fade a pop into **VWAP 7563 / R1** that rejects. **Flip long only** on a reclaim **>7563 VWAP**
→ R2 7582 retest. Very narrow CPR says pick a side on the break and let it run — don't fade inside 7535–7541.

## META — 🟡 DON'T CHASE (no 0DTE — Fri 7/17, ~2 DTE)
**Px 684.59** · Open 663.6 / H 685.21 / L 656.66 · Range 28.6 (**~111% of 25.6 ATR — exhausted**)

- **CPR:** BC 657.78 / P 658.86 / TC 659.95 — width 2.2 pt (0.33%)
- **Pivots:** R1 668.68 · R2 676.31 · **R3 686.13** | S1 651.23 · S2 641.41 · S3 633.78
- **PDH/PDL/PDC:** 666.50 / 649.05 / 661.04
- **VWAP ~675** · **OR 15m** 656.7–662.4 (broke above, trended up all day) · **double-rejection at 685**
- **Structure:** ran the *entire* pivot ladder to **R3 686**, ~10 pts above VWAP, >1 ATR up. Strong but stretched.

**Play:** **Calls into R3 686 = buying the top** — over 1 ATR spent, double top at 685, flat daily CMF.
Two honest setups: **(a)** break *and hold* **>686** on volume → momentum calls to blue sky (low-prob late-day
extension); **(b)** rejection at **685–686 → put/fade to R2 676 → VWAP 675.** Cleanest non-chase = **wait for a
pullback to VWAP ~675 to hold**, then a Friday call with room. Don't market-buy 684.

## TSLA — 🔴 PUTS (no 0DTE — Fri 7/17, ~2 DTE)
**Px 393.42** · Open 399.40 / H 406.59 / L 393.15 · Range 13.4 (~77% of 17.5 ATR)

- **CPR:** TC 396.95 / P 397.72 / BC 398.49 — width 1.5 pt (0.39%); *(TC<BC ordering — CPR band 396.95–398.49)*
- **Pivots:** R1 400.68 · R2 405.18 · R3 408.14 | **S1 393.22 · S2 390.26 · S3 385.76**
- **PDH/PDL/PDC:** 402.22 / 394.76 / 396.18
- **VWAP ~399** · **OR 15m** 399.4–406.6 (spiked above **then reversed below** = bull-trap)
- **Structure:** rejected R2/R3 (405–408, = daily cloud/+1σ wall), reversed the whole range, now pinned at **S1 393.2**.

**Play:** Bearish reversal. **S1 393.2 (= today's low 393.15) is the line.** **Break & hold <393** → puts to
**S2 390.26 → S3 385.76.** **Invalidation:** reclaim **CPR 397–398.5 / VWAP 399** → squeeze back to R1 400.68.
Matches the swing read (capped below cloud) — today confirmed it by rejecting 405–408.

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

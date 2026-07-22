# Analysis Stocks — History & Next-Move Tracker

Rolling `full analysis`. **Latest refresh: 2026-07-22.** Prior: 07-21, 07-17. (Master table = 07-22; narrative below is 07-17 context.)

**Scoring:** RSI >60 +1 / >50 +0.5 / <50 -0.5 / <40 -1 · above BB basis +1 / below -1 ·
CMF >0.1 +0.5 / <-0.1 -0.5. **CMF is the leading tell** — green candle + neg/flat CMF =
distribution into strength = fade/wait; positive CMF = the dip-buys. Score is a snapshot;
the *trend of CMF + cloud/VWAP position* is the prediction.

**Volume / RVOL (added 07-22) — the confirmation layer.** RVOL = last completed daily bar volume ÷
~21-day avg (via `data_get_ohlcv summary count=21`; stable intraday since it uses closed bars). CMF tells you
*flow direction*; RVOL tells you *conviction* — **a level break or breakout is only tradable if it happens on
RVOL ≥ ~1×.** Break on <1× volume = drift/trap, likely to reclaim. Rally into resistance on *declining* volume =
exhaustion (fade). ⚠️ `quote_get`/Volume-study numbers are intraday *partial* totals — do NOT use for RVOL;
only `data_get_ohlcv` per-bar volume is valid. **Standing refresh: RVOL becomes a master-table column, backfilled
for all names at each EOD run when full-day volume is final.**

**07-17 close — reversal day, not a red day.** Broad risk-off tape (14 of 22 red on score), but
two tells flip the read: (1) the beaten-down semis/mega-caps held **strongly positive CMF while
price fell below cloud** — AMD +0.20, GOOGL +0.20, NVDA +0.17 = *accumulation into weakness*, a
bullish divergence, not distribution. (2) Multiple names printed **violent intraday V-reversals off
the lows**: META 626→646 (reclaimed VWAP on huge vol), MU 804→895 (11% hammer off VWAP/BB-low).
AAPL remains the lone clean uptrend (RSI 71, above cloud). The both-price-and-flow-negative cohort
(MSTR, MRVL, NFLX, CRWV, ORCL, LUNR) is the real distribution — but most are now RSI-oversold.
New watchlist adds: **LUNR** and **MU**.

---

## 🎯 Next-Week Game Plan (week of Jul 20) — prices as of 07-17 late session

**The one pivot that governs everything: QQQ 695, below cloud (708) + below basis, RSI 42 — index
in a pullback, but leaders' CMF is positive (accumulation into weakness).**
- QQQ **reclaims 708** → risk-on, the accumulation longs rip.
- QQQ **loses 686–690** (today's low / VWAP) → risk-off, the puts pay.
- Trade the leaders in the direction QQQ resolves.

### 🟢 Best LONG setups (ranked)
1. **AMD 494 — cleanest divergence long.** CMF **+0.20** (heaviest accum), tagged 505 intraday, closed
   at the 493–497 reclaim line. Trigger **hold/reclaim 497 → 517 → 533 basis.** No earn till Aug 5 =
   full runway. ATR 37 pays. Best R/R.
2. **NVDA 203 — accumulation, tight risk.** CMF +0.17, holding 201.9–202.5 cluster. Buy **202 dip-hold**
   or **206 VWAP reclaim → 213–215.** Stop <201.9. No earn till late Aug.
3. **AAPL 333 — leader, buy the dip.** RSI 71, CMF +0.16, only name above cloud. Extended at BB-up 338 —
   **don't chase; buy pullback to 308–312.** Earn Jul 31.
4. **MSFT 395 — constructive but clock ticking.** CMF +0.18; **>400 VWAP → 408 → 424.** Earn **Jul 29** =
   ~1-week swing before de-risk.
5. **MU 895 — speculative reversal.** Hammer off 804, reclaim **906–920** confirms. ATR **85** = tiny size.

### 🔴 Best SHORT setups
1. **HOOD 101 — freshest short.** -11% breakdown, RSI rolled 61→47, <basis, CMF flat-neg. Fade <100 or
   bounce 105 → **96 → 88.** Earn Jul 30.
2. **MRVL 189 — fade bounces.** CMF -0.22, below cloud, 185 target hit; RSI 36 nearing os → fade rips
   200–214 → **162**, don't chase the low. No earn till Aug 28.
3. **MSTR 94 — worst flow (-0.21)**, below cloud/basis; fade rips 103–109. ⚠️ BTC gap, small size.
- **Avoid shorting** ORCL/NFLX/CRWV/LUNR — RSI 27–36, too oversold.

### ⚡ Earnings landmines next week — trade the reaction, not the anticipation
- **Jul 22 double: GOOGL + TSLA.** GOOGL 344 = CMF +0.18 accum *into* the print but below cloud (reclaim
  356 post-earn = long). TSLA 384 = weak/flat CMF into a binary; IV jacked, wait for the reaction.
- **Jul 29 wall opens: META + MSFT** — those longs are ~1-week trades max before de-risking.

---

## 📋 Master Technical Table (07-22)

**07-22 theme: dispersion — AI hardware rips, software/crypto-proxies fade.** AMD +4% (550, tagged 553,
>533 break confirmed), DELL **+11%** (445, cleared cloud), NVDA clean **>206 reclaim HELD** (207.7, CMF
surged +0.21), MU +5% (967, reclaimed cloud). Meanwhile MSFT rejected 400 VWAP (-2.7% to 388.7), META
lost cloud (-3% to 629) into earn, AMZN lost cloud, PLTR rejected 135 (-5.5%), COIN faded the 179 wall
(-5%), MSTR fade played (103.8→98.6). AAPL leader intact, CMF surged **+0.25**. GOOGL+TSLA report **TODAY
after close** — both flat-to-weak into the print. QQQ gate **still <cloud 711** (706.8). ORCL CMF -0.36
(improved from -0.42 but **NO flip** — watch untriggered).

Cols: BB = Bollinger (Low/Basis/Up) · VWAP = Q2-anchored · Cloud = Ichimoku SpanA/B ·
Pos = price vs cloud (▲above / ◆in / ▼below) · Put = put-setup grade (see ranking below).

| Sym | Px | RSI/MA | CMF | ATR | BB L/Basis/Up | VWAP | Cloud A/B | Pos | Score | Put | Bias · Next |
|-----|----|--------|-----|-----|---------------|------|-----------|-----|-------|-----|-------------|
| **AAPL** | 324.98 | 61.6/64.3 | **+0.25** | 8.0 | 275.2/310.0/344.8 | 292.2 | 313.9/304.4 | ▲ | +2.5 | — | 🟢Long · leader, **CMF surged to +0.25** (top of board); coiling 325, earn ~Jul 31 |
| **AMD** | 550.00 | 55.7/52.6 | **+0.16** | 36.7 | 491.1/532.5/573.9 | 419.3 | 519.8/489.1 | ▲ | +2.0 | — | 🟢**>533 break confirmed** 528→550 (tagged 553); >BB-basis, next 570 BB-up, earn ~Aug 5 |
| **NVDA** | 207.67 | 52.6/50.1 | **+0.21** | 6.9 | 190.1/202.1/214.0 | 206.0 | 203.9/213.2 | ◆ | +2.0 | — | 🟢**Clean >206 reclaim HELD** (207.7>VWAP), CMF surged +0.12→+0.21; 214 = triple-res, earn late-Aug |
| **DELL** | 445.00 | 58.1/55.2 | **+0.15** | 32.4 | 378.3/418.6/458.8 | 334.8 | 415.8/348.4 | ▲ | +2.0 | — | 🟢**+11% breakout** 401→445, cleared cloud/basis, CMF +0.15; watch 458 BB-up. ATR 32 |
| **BMNR** | 17.71 | 61.1/48.8 | +0.09 | 1.1 | 12.6/15.0/17.5 | 18.6 | 15.9/18.1 | ◆ | +2.0 | — | ⚪Crypto pop >BB-up 17.5, RSI 61; thin |
| **COIN** | 169.55 | 54.0/49.7 | +0.05 | 10.1 | 143.0/159.2/175.3 | 179.2 | 163.7/180.8 | ◆ | +1.5 | — | 🟡**Faded 179 wall** as flagged (178.8→169.6); flat flow, in cloud, earn ~Jul 30 |
| **META** | 629.41 | 52.1/58.4 | +0.03 | 24.5 | 530.8/616.0/701.3 | 614.9 | 634.6/613.1 | ◆ | +1.5 | — | 🟡**Lost cloud** -3% (648→629) into earn ~Jul 29; flat flow, VWAP 615 = floor |
| **BABA** | 116.10 | 56.3/51.1 | -0.10 | 4.0 | 88.0/106.7/125.3 | 121.4 | 111.7/119.4 | ◆ | +1.5 | — | 🟡RSI ok but CMF -0.10 neg; capped 119-121, in cloud |
| **MSFT** | 388.71 | 48.3/50.4 | **+0.21** | 11.8 | 360.1/384.6/409.0 | 400.3 | 385.0/407.8 | ◆ | +1.0 | — | 🟡**Rejected 400 VWAP** (-2.7% to 388.7) but CMF still +0.21; needs 400 reclaim, earn ~Jul 29 |
| **AMZN** | 243.90 | 47.5/52.0 | +0.06 | 7.0 | 230.8/243.6/256.3 | 248.7 | 246.3/251.1 | ▼ | +0.5 | — | 🟡Lost cloud+VWAP (247.6→243.9) to basis; flat flow, need >248 reclaim, earn ~Jul 31 |
| **MSTR** | 98.57 | 44.5/40.5 | **-0.15** | 7.4 | 84.6/94.5/104.4 | 130.9 | 103.2/139.4 | ▼ | 0.0 | ⚠️ | 🔴**Fade played** (103.8→98.6), CMF -0.15 confirmed short-cover; <cloud, fade rips 103-104 (BTC gap) |
| **HOOD** | 105.14 | 51.6/59.0 | -0.05 | 6.5 | 93.0/107.0/120.9 | 88.7 | 107.2/96.6 | ◆ | -0.5 | ❌ | ⚠️Neutral, in cloud <basis 107; short still invalid, earn ~Jul 30 |
| **MU** | 967.19 | 50.8/46.9 | -0.02 | **82.6** | 795.6/993.7/1191.8 | 808.6 | 965.3/945.2 | ▲ | -0.5 | — | 🟡**Reclaimed cloud** +5% (919→967), CMF flat -0.02 (from -0.11); <basis 994, need flow flip. ⚠️ATR 83 |
| **GOOGL** | 348.02 | 43.7/48.1 | **+0.11** | 10.8 | 338.3/355.1/371.9 | 359.3 | 355.7/369.4 | ▼ | -1.0 | — | 🟡+CMF but weak <cloud into **earn TODAY a/c**; 356 reclaim = long, trade the reaction |
| **QQQ** | 706.81 | 47.2/48.1 | +0.05 | 14.2 | 694.4/714.3/734.3 | 690.6 | 711.3/717.5 | ▼ | -1.5 | 🛡️ | 🌐Backdrop · **gate: still <cloud 711** (706.8 knocking), RSI<50, CMF flat |
| **TSLA** | 377.55 | 42.8/46.9 | -0.03 | 15.9 | 362.3/394.8/427.3 | 395.5 | 396.0/411.0 | ▼ | -1.5 | ⚠️ | 🔴Weak <cloud, flat CMF into **earn TODAY a/c**; binary, IV rich, <368→air |
| **PLTR** | 126.67 | 45.8/52.7 | +0.08 | 6.5 | 110.0/126.7/143.5 | 135.2 | 126.2/135.0 | ◆ | -1.5 | — | 🟡**Rejected 135 wall** -5.5% (134→126.7) to basis/cloud-base; hold 126 or fail→110, earn ~Aug 4 |
| **ARM** | 286.95 | 44.1/42.7 | -0.07 | 27.4 | 250.1/309.9/369.8 | 285.3 | 316.8/326.8 | ▼ | -1.5 | — | 🔴Downtrend −22% (390→243→bounce), below cloud; **reclaimed 285 VWAP pivot but bounce on light vol (RVOL 0.78×↓; capitulation was 1.3-1.5×)**, CMF -0.07. Capped 310-327 wall → scalp 285→310 *only on vol expansion*, else fade the wall. ATR 27. Confirm earn ~early Aug |
| **NFLX** | 70.09 | 37.4/39.2 | +0.06 | 2.7 | 67.7/73.0/78.4 | 84.0 | 72.0/78.3 | ▼ | -2.0 | ⚫os | ⚫Oversold bounce (67.8→70.1), CMF flipped +0.06; still <cloud, stabilizing not turning |
| **MRVL** | 211.41 | 43.7/42.3 | **-0.11** | 20.6 | 172.7/237.3/301.9 | 230.7 | 231.7/243.9 | ▼ | -2.0 | 🎯**armed** | 🔴**At fade-zone top** (bounced to 211, into 200-214), CMF -0.11; fade rejection→162, invalid >234 |
| **CRWV** | 83.24 | 44.4/37.5 | **-0.12** | 7.1 | 68.6/86.0/103.3 | 104.2 | 87.6/101.1 | ▼ | -2.0 | ⚫os | ⚫Oversold bounce +8% (77→83), CMF -0.12 still neg; <cloud/basis, earn ~Aug 12 |
| **ORCL** | 126.38 | 32.7/29.3 | **-0.36** | 7.8 | 118.1/138.2/158.3 | 168.8 | 145.3/185.1 | ▼ | -2.5 | ⚫os | ⚫Knife · **CMF -0.36, watch NOT triggered** (improved from -0.42); buy only on flip or 135 reclaim |
| **SPCX** | 122.93 | 36.7/— | **-0.22** | 11.9 | 115.3/145.2/175.0 | ~166 | (IPO/incompl) | ▼ | -2.5 | ⚫ | ⚫IPO, CMF deepened -0.18→-0.22; near 119.4 floor / BB-low 115, weak. Price-action only |
| **LUNR** | 14.19 | 30.9/30.5 | **-0.31** | 1.8 | 11.9/17.1/22.2 | 27.2 | 17.6/29.7 | ▼ | -2.5 | ⚫os | ⚫Knife (flat 14.2), CMF -0.31; <cloud, no signal |

---

## 🔊 Volume Conviction — RVOL (07-22, trigger names)

RVOL = last completed daily bar volume ÷ ~21-day avg. Confirms/invalidates the level triggers above.
Full 23-name backfill lands at next EOD refresh (needs final full-day volume).

| Sym | RVOL | 5-day vol trend | Read on the trigger |
|-----|------|-----------------|---------------------|
| **AMD** | **1.05×** | rising into breakout (23→29M) | ✅ New-highs breakout on **>avg** volume — confirmed, no caveat |
| **MRVL** | 0.75× | **declining** thru bounce (35→30→25→22M) | ✅ Rally into 200-214 fade zone on **fading** volume = exhaustion → **strengthens the short**; fade 214 rejection |
| **NVDA** | 0.79× | reclaim bar was 1.04×, 215-test pacing ~0.75× | ⚠️ Accumulation had volume; **215 poke NOT yet volume-confirmed** — needs ≥1× to trust breakout |
| **META** | **0.49×** | declining (22→10→9M) | ⚠️ 5-day bleed on **very light** volume — a **<613 break on <1× = trap risk**, likely reclaim |

**Rule:** trade the break only on RVOL ≥ ~1×. AMD confirmed; MRVL fade strengthening; NVDA/META triggers
need a volume expansion to be trusted (both currently sub-1× = suspect).

---

## 🎯 Best for Puts — Ranked (07-17)

Filter = clean downtrend + active distribution (neg, not-yet-climaxed CMF) + RSI not-yet-extreme
(room to fall) + enough ATR to pay + no imminent earnings. Note: the -2.5 knives (ORCL/NFLX/CRWV/
LUNR) are **too oversold to chase fresh** — right direction, wrong timing.

| Rank | Sym | Entry idea | Target | Why / Watch |
|------|-----|-----------|--------|-------------|
| 🥇 | **HOOD** 101 | Fade <100, or bounces to 105 | 96→88 | **Freshest** short: -11% breakdown, RSI just rolled 61→48 (room), CMF flat-neg, below basis. Not yet oversold. |
| 🥈 | **MRVL** 186 | Fade bounces 200-214 (target 185 already hit) | 162 | Below cloud, CMF -0.23, ATR 22. RSI 35 nearing oversold — fade rips only now, don't chase the low. |
| 🥉 | **MSTR** 93 | Fade rips into 103-109 | 82 | Worst-flow (-0.21), below everything, VWAP way up at 132. ⚠️ BTC-correlated overnight gap; small size. |
| ⚠️ | **TSLA** 379 | Only <368 w/ volume | air | Below cloud but **CMF flat** (no active selling) + **earn ~Jul 22** inflating IV. Low conviction. |
| ⛔ | **ORCL** 126 | — (CMF -0.42, RSI 28) | — | Right direction, too oversold. Buy-side watch, not a fresh short. |
| ⛔ | **NFLX/CRWV/LUNR** | Wait for bounce | — | RSI 27-33 oversold, post-selloff. Don't front-run the knife. |

**Puts bottom line:** HOOD is the one *fresh* setup (fresh breakdown, room to fall). MRVL/MSTR are
fade-the-bounce only (targets hit / oversold-ish). The -2.5 knives are exhausted — watch for bounces
to fade, or (ORCL) for the buy-side flip. TSLA earnings-contaminated.

**Calls bottom line:** AAPL (leader, buy 308-312 retest). The **accumulation-reclaim trio AMD (>497)
/ GOOGL (>356) / NVDA (>206)** — price beaten down but CMF +0.17-0.20 = smart money in; buy the
reclaim, not the level. MU (>817, defended hammer) and META (613-614 hold) are the reversal-day
dip-buys. MSFT clean second-tier.

---

## 📅 Earnings Calendar (CONFIRM before trading — IV inflates, catalyst overrides tech)

| Date | Sym | Note | Date | Sym | Note |
|------|-----|------|------|-----|------|
| ~Jul 22 | **TSLA** | 379/408 hinge | ~Jul 31 | AMZN | 249-252 either way |
| ~Jul 22 | **GOOGL** | 356 reclaim + earn | ~Jul 31–Aug5 | MSTR | worst flow |
| ~Jul 29 | META | V-reversal into it | ~Aug 4–5 | PLTR | 135 wall |
| ~Jul 29 | MSFT | prove-it 408 | ~Aug 5 | AMD | flow leader |
| ~Jul 30 | HOOD | fresh breakdown | ~Aug 12–14 | CRWV | falling knife |
| ~Jul 30–Aug7 | COIN | distribution | ~mid-Aug | LUNR | binary, confirm |
| ~Jul 31 | AAPL | breakout leader | ~late Aug | MU | confirm — ATR 85 |
| — | NFLX | **reported ~Jul 16** (gapped -9%) | ~Aug 27–28 | NVDA / MRVL | last / broke down |
| — | — | — | **Sep 14** | ORCL | AI-capex de-rate |

Mega-cap cluster Jul 29–Aug 1 (META/MSFT/AAPL/AMZN) = four pivots one window. TSLA+GOOGL Jul 22 pair.

---

## Playbook

1. **CMF is the leading tell** — 07-17 live-proof of *bullish* divergence: AMD/GOOGL/NVDA fell below
   cloud/basis on price but held **+0.17-0.20 CMF** = accumulation into weakness. Buy the reclaim.
   Contrast the -2.5 cohort where price AND flow are negative = real distribution.
2. **Intraday V-reversals off support = high-signal on selloff days** — META (626→646, reclaimed VWAP
   on 189K-vol bar) and MU (804→895 hammer off VWAP805/BB-low817) both defended major levels. On a
   red tape, watch the VWAP/BB-low reclaim for the turn.
3. **"Below CPR/cloud ≠ puts only"** (SPX lesson) — watch S-levels/PDL/BB-low for bounce-longs; the
   sharpest 0DTE and swing bounces come off defended support, not from chasing the breakdown.
4. **Track one pivot line per name day-over-day** — QQQ 696/708, META 613-614, MU 804/906, AMD 497,
   NVDA 206, GOOGL 356, HOOD 100, ORCL 135 (+ CMF flip), MRVL 185.
5. **Oversold ≠ buy** — ORCL (RSI 28, CMF -0.42), NFLX/CRWV/LUNR (RSI 27-33): knives get more
   oversold. Buy the *turn* (CMF flip / level reclaim), not the RSI.
6. **ORCL standing watch** — alert the moment CMF crosses positive (currently -0.42, no flip). Buy trigger.
7. **Volume confirms the break (RVOL ≥ ~1×)** — CMF = flow direction, RVOL = conviction. A level break or
   breakout on <1× volume is drift/trap (likely reclaim); a rally into resistance on *declining* volume is
   exhaustion (fade). 07-22 proof: AMD broke to new highs on 1.05× (real), MRVL bounced into its fade zone on
   fading 0.75× (weak), while NVDA's 215 test and META's 613 threat are both sub-1× = not yet trustworthy.
   ⚠️ Use `data_get_ohlcv` per-bar volume for RVOL — `quote_get`/Volume-study values are intraday partials.

---

## 🗓️ Options Decision Journal (positional, 75–120 DTE)

**Read this before each new options review. Preserve prior entries. Roll status forward
(WAIT→ENTER/AVOID, then ENTER→outcome) as triggers hit or fail.**

### 2026-07-17 — Positional review (target: October monthly ≈91 DTE; Nov if more runway)
**Market gate:** QQQ 695, below cloud. Longs live only on **QQQ >708 reclaim**; **<686–690 = risk-off**.
**Structure rule:** all defined-risk **debit spreads** (earnings fall inside the hold — cap IV crush + premium).

**ACTIVE SETUPS — all WAIT (each needs its trigger; none entered):**

| # | Sym | Bias | Trigger | Spread (level-based) | Target | Invalidation | Earn (in-window) | Status |
|---|-----|------|---------|----------------------|--------|--------------|------------------|--------|
| 🥇1 **BEST** | AMD | CALL | daily close **>497** (tagged 505 intraday, closed 494.6) | long ~497 / short ~533 (or 517) Oct | 517→533→573 | close <461.7 (cloud-base) | ~Aug 5 | WAIT |
| 🥈2 | AAPL | CALL | dip **308–312 hold**, or close **>339** | long ~310 dip (or ATM) / short above 338, Oct | 312→338→ext | close <304 (cloud) | ~Jul 31 | WAIT |
| 🥉3 | MRVL | PUT | fade bounce **200–214**, or close **<178–180** | long ~185–190 / short ~162, Oct | 162→lower | close >214 | ~Aug 28 | WAIT |

**REJECTED / NO-TRADE this cycle:**
- **NVDA** CALL — clean alt long (202 dip / 206 reclaim, CMF +0.17); held as backup to AAPL. WAIT.
- **GOOGL** — CMF +0.18 but **Jul 22 earnings imminent**; no pre-earnings entry. AVOID (revisit on reaction).
- **TSLA** — weak + Jul 22 binary. NO TRADE.
- **ORCL** PUT — right direction, RSI 28 oversold = bad put entry; it's a *long*-watch on the CMF flip. WAIT.
- **MU** — ATR 85 too wide for a sane defined-risk spread. WAIT.
- **HOOD/MSTR** — good swing shorts but better as shorter-dated; not top-3 for the 75–120 DTE horizon.

**Lessons carried in:** (1) below-cloud + strong CMF = accumulation → favor longs on the *reclaim*, not fades
(rule 6). (2) Don't chase oversold knives (ORCL/NFLX/CRWV/LUNR). (3) Debit spreads over naked longs when
earnings sit in the hold.
**Outcomes:** none yet (all WAIT).
**Next actions (Mon 07-20 refresh):** check **AMD 497** close, **AAPL** dip to 310, **MRVL** bounce to 200–214,
**ORCL CMF** flip; re-gate all longs on **QQQ 708 / 686**. Update this journal with any trigger hit → move to
ENTER and log fill level; if invalidation hits first → log AVOIDED and why.

### 2026-07-20 — Roll-forward review (two triggers fired; best rotated AMD→NVDA)
**Market gate:** QQQ **702.25**, still below cloud (711) + conversion (706.6) → **gate NOT met**. AMD/NVDA
triggering on *relative strength ahead of the index* → **half-size longs until QQQ >708; stand down <686**.

**Roll-forward of 07-17 setups:**
- **AMD CALL** — trigger close >497 **✅ HIT** (now 513.3, +3.8%, RS leader, CMF +0.16). Extended into 517–519
  cloud-top/conversion wall. → **ENTER on 519 break or 505 pullback** (don't chase 513). Tgt 533→572,
  invalid <500. Ranked #2 (thesis strongest, entry now extended).
- **NVDA CALL** (was backup) — **✅ 206 VWAP reclaim HIT** (206.33 > VWAP 205.98, CMF +0.11). Support cluster
  201.9–204.4, resistance 213–214 (triple). → **ENTER (½ size)**, long ~204–206 / short ≥213–214 Oct, invalid
  <201.9. **Promoted to #1 / BEST** — cleanest R/R, cheapest (ATR 7.3), earnings late-Aug (not early in hold).
- **AAPL CALL** — no trigger. Pulled only to 328.7 (not 308–312 dip), no >341 break. Thesis intact (above cloud,
  CMF +0.18 rising, RSI 71→66 healthy). → **WAIT** (dip 308–312 / 320–321 conv, or >341). Ranked #3.
- **MRVL PUT** — **DEMOTED from top-3.** Bouncing 189→195 into fade zone BUT **CMF improved −0.22→−0.14**
  (distribution easing = thesis weakening). Monitor: re-fade only if rejects 200–214 *and* CMF rolls back <−0.20.
- **ORCL** — bounce failed (128→121.9), **CMF −0.43 (deeper)**, RSI 27. Watch **still not triggered**, no trade.

**Active (this cycle):** NVDA CALL #1 ENTER-½ · AMD CALL #2 ENTER-on-trigger · AAPL CALL #3 WAIT.
**Rejected/monitored:** MRVL PUT (flow weakening) · ORCL (CMF watch) · GOOGL/TSLA (earnings **Jul 22**, 2 days out).
**Outcomes:** AMD & NVDA triggers hit as forecast; AMD entry-window (497) already passed = validated the WAIT→trigger
discipline. No fills logged yet (paper: gate unconfirmed → half-size only).
**Lesson:** a trigger that fires *and runs* (AMD 497→513) rotates the "best" to the next-cleanest entry (NVDA at
support) — chase-avoidance > thesis-strength when locating fresh entries. RS-ahead-of-index is bullish but gate still governs size.
**Next actions (07-21):** NVDA hold 206 / 213–214 break; AMD 519 break or 505 dip; AAPL 310 dip or 341 break;
**QQQ 708 gate**; MRVL CMF vs −0.20; ORCL CMF flip. Pre-**Jul 22 GOOGL+TSLA earnings** — no new pre-print entries.

### 2026-07-21 — Roll-forward (leaders extending; NVDA lost VWAP; new best = AMD)
**Gate:** QQQ **705.4**, still below cloud (711) — not reclaimed; half-size still in force. Crypto/high-beta ripped (COIN/MSTR/HOOD/BMNR) but mostly on weak flow.
- **AMD CALL** — thesis extending: 513→**528**, **cleared the cloud**, tagged 535, CMF +0.12. Now at **basis 530** resistance. → **new #1**; add on **>533 break** (targets 570), or buy **505–517 pullback-hold**; invalid <489 (cloud-base). Earn ~Aug 5.
- **NVDA CALL** — ⚠️ **206 VWAP reclaim FAILED to hold** (206.3→**204.5**, back in cloud). Still >invalidation 201.9 and CMF +0.12, but demoted to #2/WAIT — needs a *clean* >206 hold to re-trigger; else 202–204 dip-buy with stop <201.9.
- **AAPL CALL** — still **WAIT**; 324.6, no dip to 308–312, no >342 break. CMF strengthened **+0.20** (leader intact). #3.
- **HOOD PUT** (backup) — **CLOSED/AVOIDED**: +6% bounce reclaimed cloud/basis → thesis invalidated, no entry (WAIT-discipline paid — never triggered).
- **MRVL PUT** — **RE-ARMED**: bounced into 200–214 fade zone (204.8) *and* CMF re-worsened −0.14→**−0.18**. → back as an active short-watch; fade a 205–214 rejection → 162, invalid >cloud 234. No earn till Aug 28.
- **MSFT** — CMF surged to **+0.23** (strongest on board), testing 400 VWAP → promote to on-deck long (>400 confirm), earn ~Jul 29 caps runway.
- **ORCL** watch — CMF **−0.42**, still no flip; no trade.
**Ranking now:** 🥇AMD (>533 add / 505 dip) · 🥈NVDA (WAIT clean >206 or 202 dip) · 🥉AAPL (WAIT). MRVL = active short re-arm.
**Outcomes:** AMD & prior NVDA triggers were correct; NVDA reclaim didn't hold (partial). HOOD backup avoided cleanly. No new fills (gate unmet → half-size; earnings tomorrow → no pre-print adds).
**Lesson:** a reclaim needs to *hold the retest* (rule 6) — NVDA tagged 206 then failed, so it reverts to WAIT, not a chase. Extending winner (AMD) rotates "best" to whoever has the cleanest *next* trigger.
**Next (07-22):** AMD 533 break/505 dip; NVDA clean 206 hold vs 202 dip; AAPL 310/342; MRVL 205–214 fade; **QQQ 711 gate**; trade **GOOGL/TSLA earnings reaction** (not the anticipation); ORCL CMF.

### 2026-07-22 — Roll-forward (both triggers ran; AI-hardware breakout day; GOOGL/TSLA earn tonight)
**Gate:** QQQ **706.8**, still <cloud 711 (knocking) — half-size still in force. Tape = **dispersion**: AI hardware (AMD/NVDA/DELL/MU) ripped while software (MSFT/META/AMZN/PLTR) and crypto-proxies (COIN/MSTR) faded.
- **AMD CALL** (#1) — **✅ >533 break confirmed and RAN**: 528→**550** (tagged 553), CMF held +0.16, clear of cloud/basis. Entry window (505–517 pullback / 533 break) has now extended to 550 = **don't chase**; next structural add only on a 528–533 retest-hold, target 570 BB-up. Thesis fully validated.
- **NVDA CALL** (#2→promote) — **✅ clean >206 reclaim HELD** (207.7 > VWAP 206), the hold the 07-21 note demanded; CMF **surged +0.12→+0.21**. Re-triggered → **ENTER (½)**, long ~204–207 / short ≥213–214 (triple-res) Oct, invalid <201.9. Cleanest fresh R/R on the board → **new co-#1 with AMD** (AMD extended, NVDA at entry).
- **AAPL CALL** (#3) — still **WAIT**; 325, no 308–312 dip, no >342 break. CMF **surged to +0.25** (top of board), leader intact. Best "buy the dip" hold.
- **DELL** — **new bullish flag**: +11% to 445, cleared cloud/basis, CMF +0.15. Not a spread candidate (ATR 32 wide) but a momentum long-watch; >458 BB-up extends.
- **MSFT** — rejected 400 VWAP (399.7→388.7) but CMF still +0.21; **on-deck long only >400 reclaim**, earn ~Jul 29 caps runway.
- **MRVL PUT** — **at fade-zone top** (bounced to 211.4, into 200–214), CMF -0.11 (not yet <-0.20). → fade a **205–214 rejection** → 162, invalid >234. Active short-watch, no earn till Aug 28.
- **MSTR** — fade played (103.8→98.6), CMF -0.15 confirms; short-dated fade of 103–104 rips only.
- **ORCL** watch — CMF **-0.36** (improved from -0.42 but **still negative — NO flip**); no trade, buy only on flip or 135 reclaim.
**Ranking now:** 🥇AMD (extended — retest-add only) / NVDA (fresh ENTER-½ at support) · 🥉AAPL (WAIT dip). MRVL = armed short-watch; DELL/MSFT = long-watch.
**Outcomes:** AMD & NVDA both triggered as forecast and NVDA's reclaim held this time (vs 07-21 failure) — the rule-6 "hold the retest" filter worked. No new fills logged (gate <711 → half-size; **GOOGL+TSLA earn tonight** → no pre-print adds).
**Lesson:** a winner that keeps running (AMD 497→513→550) hands "best fresh entry" to whoever just triggered at support (NVDA 207) — chase-avoidance keeps rotating the book to the cleanest R/R.
**Next (07-23):** trade **GOOGL/TSLA reaction** (356 reclaim = GOOGL long; TSLA <368 = short / >411 = squeeze); NVDA hold 206 / 214 break; AMD 533 retest-add; AAPL 310/342; MRVL 205–214 fade; **QQQ 711 gate**; MSFT 400 reclaim; ORCL CMF flip.

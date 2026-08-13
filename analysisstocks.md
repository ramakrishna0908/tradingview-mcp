# Analysis Stocks — History & Next-Move Tracker

Rolling `full analysis`. **Latest refresh: 2026-08-13** (early-session ticks). Prior: 08-12, 08-11, 08-10, 08-07, 08-06, 08-05, 08-04, 08-03, 07-31 (NVDA), 07-29, 07-28, 07-27, 07-24, 07-23, 07-22, 07-21, 07-17. (Master table = 08-13; narrative below is 07-17 context.)

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

## 📋 Master Technical Table (08-13)

**08-13 theme: the market broke to NEW HIGHS (QQQ/IWM/NVDA/MSFT) — and AAPL HELD the 300 line, the 2-week divergence survives.**
🎯🟢 **AAPL passed the make-or-break test** — dipped to 302 low, bounced to 305, **CMF +0.21 intact** = the accumulation
held the 300-303 line after 2+ weeks. Still <cloud (needs 309 reclaim) but the bull divergence is alive. 🔔🟢 **ORCL —
the follow-through fired: CMF +0.14** (up from +0.08→+0.14, holding & intensifying), price cleared BB-up ~154 (159 high),
RSI crossed 60 = the buy trigger confirming, not a blip. 🟢 **QQQ/IWM/NVDA/MSFT all printed new highs** (risk-on broke out).
🟢 **NVDA's bearish flow divergence eased** — CMF back to flat 0.00 at the new high (no longer distributing). **The clean
+flow leaders:** PLTR +0.20, NFLX +0.33, ORCL +0.14, BMNR +0.19, BABA +0.18, SPCX +0.23 = call names. **The −flow rips
(don't chase):** CRWV −0.12, NBIS +0.04-flat, MU/ARM/INTC/MRVL all reclaimed into their cloud walls on flat-neg flow =
squeeze recoveries, prove-it. **The puts:** GOOGL (−0.13, lost basis), COIN (−1.5, <cloud), META (−1.5, <cloud), TSLA
(0.0 but <cloud). (Data = early-8/13.)

Cols: BB = Bollinger (Low/Basis/Up) · VWAP = Q2-anchored · Cloud = Ichimoku SpanA/B ·
Pos = price vs cloud (▲above / ◆in / ▼below) · **HH/LL = swing structure: `HH↑`=higher-highs/uptrend (call bias),
`LL↓`=lower-highs/downtrend (put bias), `Rng`=range/coiling (no edge), `⚠`=structure vs flow diverge** ·
Put = put-setup grade (see ranking below).

| Sym | Px | RSI/MA | CMF | ATR | BB L/Basis/Up | VWAP | Cloud A/B | Pos | HH/LL | Score | Put | Bias · Next |
|-----|----|--------|-----|-----|---------------|------|-----------|-----|-------|-------|-----|-------------|
| **PLTR** | 174.35 | 71.1/60.4 | **+0.20** | 8.34 | 101/143/185.4 | 138/159 | 150/143 | ▲ | **HH↑** | +2.5 | — | 🟢The cleanest call — HH uptrend, RSI 71, CMF +0.20 confirming, >cloud/VWAP+1σ. → BB-up 185; buy dips to 159 |
| **ACN**‡ | 179.73 | 69.8/65.8 | **+0.36** | 7.76 | 133/162/191 | 157/172 | 165/158 | ▲ | **HH↑** | +2.5 | — | 🟢Strongest accum (CMF +0.36), HH uptrend, RSI 70. Healthy pullback 185.8→179.7. Buy dips → BB-up 191 (‡Anness) |
| **ORCL** | 156.88 | 61.8/49.4 | **+0.14** | 7.58 | 108/134/160.4 | 162.3 | 141/182.4 | ◆ | **HH↑** | +2.5 | — | 🔔🟢**Follow-through FIRED** — CMF +0.14 (held & rising), cleared BB-up 154 (159 high), RSI >60. Buy trigger confirmed. Next VWAP 162 / cloud-top 182 |
| **QQQ** | 732.41 | 60.2/49.9 | 0.00 | 13.1 | 665/702/740 | 692 | 704/705 | ▲ | **HH↑** | +2.0 | — | 🌐**New high** — broke the 728 range-top, RSI 60, CMF flat. Risk-on. Support 713/705; BB-up 740 next |
| **IWM** | 303.74 | 61.7/54.5 | -0.02 | 3.89 | 287/296/305 | 284 | 298/291 | ▲ | **HH↑** | +2.0 | — | 🟢**Broke to new highs** at BB-up 305, RSI 62, CMF flat −0.02 (broadening intact). Hold 296; small-cap risk-on tell |
| **MSFT** | 497.65 | 72.0/70.5 | 0.00 | 14.4 | 344/445/546 | 410/472 | 469/431 | ▲ | **HH↑** | +2.0 | — | 🟢**New high** — RSI 72 (hot), CMF flat. Winner, extended; trail, don't add up here |
| **NVDA** | 225.00 | 63.0/53.8 | -0.00 | 7.20 | 189/209/229.7 | 206/217 | 210/211 | ▲ | **HH↑** | +2.0 | — | 🟢**New high** — the −flow divergence EASED (CMF back to flat 0.00, no longer distributing). Toward BB-up 229.7; trail |
| **NFLX** | 77.10 | 59.5/50.6 | **+0.33** | 2.38 | 67/72/77.6 | 82.2 | 73/76 | ▲ | **HH↑** | +2.0 | — | 🟢Broke >cloud-top 76.15 on **CMF +0.33** (strongest accum) = clean HH breakout. → VWAP 82; hold 72 |
| **BMNR** | 18.00 | 55.0/56.4 | **+0.19** | 1.06 | 15.8/17.5/19.2 | 18.45 | 17.4/16.1 | ▲ | **HH↑** | +2.0 | — | 🟢HH >cloud, CMF +0.19 accum. <VWAP 18.45/BB-up 19.2; buy holding → 19.2/20 |
| **BABA** | 122.22 | 52.8/62.2 | **+0.18** | 3.86 | 109/121.4/133.7 | 121.6 | 124/113 | ◆ | Rng | +2.0 | — | 🟢Coiling in cloud on CMF +0.18 accum, RSI cooling. **>124 SpanA reclaim = the HH call trigger** → 128/133 |
| **SPCX** | 140.68 | 55.1/43.7 | **+0.23** | 11.3 | 100/122/143.4 | 149.8 | 128/(IPO) | ▲ | **HH↑** | +2.0 | — | 🟢HH at BB-up 143.4, CMF +0.23 accum. → 150 VWAP wall. ⚠️IPO (price-action read), tiny size |
| **NBIS** | 266.73 | 63.2/48.4 | +0.04 | 26.1 | 145/201/257 | 202/227 | 218/223 | ▲ | **HH↑** | +2.0 | — | 🟢**+9% >cloud & BB-up 257** (276 high), CMF flat-positive +0.04 (flow now catching the rip). Extended; ⚠️ATR 26 tiny size |
| **AVGO**‡ | 424.15 | 61.5/56.1 | +0.08 | 15.7 | 361/399/436.6 | 399/418 | 399/425.7 | ◆ | **HH↑** | +2.0 | — | 🟡Testing the 425.7 cloud-top wall (424.9 high), CMF +0.08. **>425.7 = breakout to new highs.** Quality semi; earn early Sept |
| **DELL** | 503.81 | 63.9/54.6 | +0.08 | 34.3 | 364/432/500 | 348/443 | 444/435 | ▲ | **HH↑** | +2.0 | — | 🟢HH >BB-up 500 (514 high), CMF +0.08 constructive. Uptrend extended; ⚠️ATR 34 |
| **LUNR** | 16.43 | 52.4/40.9 | **+0.13** | 1.52 | 11/14.1/17.2 | 25.5 | 14.5/27.3 | ◆ | HH↑⚠ | +2.0 | — | 🟢+15% pop to BB-up 17.2 on **CMF +0.13** (flow confirming) — but still deep <VWAP 25.5/cloud-top 27.3 wall. Prove-it bounce |
| **CRCL**‡ | 71.75 | 57.0/47.5 | **+0.27** | 4.92 | 58/65/72.3 | 89.4 | 66/84 | ◆ | HH↑ | +2.0 | — | 🟢Pushed to BB-up 72.3 (73.4 high) on **CMF +0.27** (the turn, +flow). In cloud → SpanB 84. Buy dips (‡Anness) |
| **CRWV** | 110.43 | 66.3/49.4 | **-0.12** | 8.51 | 58/82/107 | 101 | 91/96 | ▲ | HH↑⚠ | +1.5 | — | ⚠️Ripped >BB-up 107 (117 high) but **CMF −0.12 = distribution into the spike** (structure up, flow diverging). Don't chase; wait for flow |
| **MU** | 955.60 | 54.9/46.3 | -0.04 | **74.5** | 769/884/999 | 818/907 | 876/996 | ◆ | HH↑⚠ | +1.5 | — | 🟡Ripped +5% (961 high) to the 996-999 BB-up/SpanB wall, CMF flat −0.04. **>996 = cloud clear.** ⚠️ATR 75 |
| **MRVL** | 229.11 | 56.0/45.7 | -0.05 | 17.7 | 169/201/234 | 227.5 | 206/246 | ◆ | HH↑⚠ | +1.5 | — | ⚠️+5% to BB-up 234, but in cloud <246 SpanB on flat-neg CMF −0.05 (squeeze-y). Watch the flip / >246 |
| **ARM** | 287.00 | 52.3/43.9 | -0.04 | 23.6 | 230/266/303 | 282.6 | 269/336 | ◆ | Rng⚠ | +1.5 | — | 🟡+7.5% reclaimed VWAP 282.6, but in thick cloud <336 SpanB wall, CMF flat −0.04. Prove-it; watch the flip |
| **INTC** | 105.70 | 54.4/44.2 | -0.07 | 7.32 | 84/96.5/109 | 101.5/109 | 98/112 | ◆ | Rng⚠ | +1.5 | — | 🟡Reclaimed VWAP 101.5 into cloud (106.6 high, 41M vol), CMF flat −0.07. <112 SpanB wall; watch >109 / the flip |
| **SOFI**‡ | 18.00 | 53.5/50.7 | +0.04 | 0.79 | 15.6/17.4/19.1 | 17.2/18.1 | 17.5/17.3 | ▲ | HH↑ | +1.5 | — | 🟢Reclaimed 18 >cloud, **CMF held + (+0.04)** = the flip confirming. → BB-up 19/200-EMA (‡Anness) |
| **LLY**‡ | 1221.67 | 58.3/53.3 | -0.01 | 40.0 | 1118/1183/1248 | 1071/1197 | 1175/1151 | ▲ | HH↑ | +1.5 | — | 🟢Grinding >cloud/basis toward BB-up 1248, RSI 58; CMF flat −0.01 (flip not clean yet). Trail; support 1183 (‡Anness) |
| **ISRG**‡ | 400.04 | 59.0/48.9 | -0.05 | 12.6 | 323/365/407 | 409 | 378/386 | ▲ | HH↑ | +1.5 | — | 🟢Holding >cloud at the VWAP 409/BB-up 407 wall, RSI 59; CMF −0.05 (near flat, no flip yet). A CMF flip = the confirm (‡Anness) |
| **MCD**‡ | 274.26 | 52.8/50.8 | +0.02 | 5.63 | 262/270/279 | 280 | 271/275 | ◆ | Rng | +1.5 | — | 🟡Coiling under the 275 SpanB, **CMF held + (+0.02)**. A >275 break w/ +CMF = the confirm → 278/280. <270 → 262 (‡Anness) |
| **IREN**‡ | 46.62 | 58.4/46.1 | -0.10 | 4.16 | 31/39/46.1 | 48.9 | 41/50 | ◆ | Rng⚠ | +1.5 | — | 🟡Popped to 49.2 (BB-up/SpanB 50) then faded to 46.6, CMF −0.10 (pop sold). Prove-it; confirm = flip + >50. ⚠️ATR 4 (‡Anness) |
| **APLD**‡ | 31.33 | 52.4/44.0 | -0.09 | 2.66 | 24.6/28.6/32.7 | 35.6 | 29/36.6 | ◆ | Rng⚠ | +1.5 | — | 🟡Reclaimed 200-EMA 30.9 toward BB-up 32.7, CMF −0.09 (still slightly neg). Prove-it; confirm = flip + >32.7 (‡Anness) |
| **AMZN** | 268.05 | 57.5/56.5 | **-0.13** | 8.48 | 218/256/294 | 251/270 | 267/256 | ▲ | HH↑⚠ | +1.0 | — | ⚠️>cloud at VWAP+1σ 270 but **CMF −0.13 = distribution into strength** (structure up, flow diverging). Hold 267 or → 256 |
| **HOOD** | 98.58 | 53.1/43.5 | **-0.18** | 5.35 | 85/95/105.5 | 89/97.4 | 97/99.5 | ◆ | Rng⚠ | +1.0 | — | ⚠️Bounced to the cloud underside 97-99.5, **CMF −0.18 = distribution into the pop**. >99.5 clear needed; else fade back to 95/89 |
| **SOUN**‡ | 7.34 | 58.0/51.0 | **-0.17** | 0.47 | 5.4/6.6/7.8 | 7.43 | 7.0/7.6 | ◆ | Rng⚠ | +1.0 | — | 🔴Stuck at cloud-top/BB-up 7.6-7.8, **CMF −0.17 = distribution** (fade call holds, don't chase). <7.0 cloud → down (‡Anness) |
| **MSTR** | 97.87 | 48.7/46.3 | +0.05 | 5.80 | 92/96.7/102 | 126.3 | 98/118 | ◆ | Rng | +0.5 | — | 🟡Bouncing at cloud-bottom 98, **CMF flat-positive +0.05** (basing attempt). Deep downtrend (VWAP 126). >102 = life; <91 fails. ⚠️BTC proxy |
| **AMD** | 495.00 | 49.8/45.7 | **-0.11** | 32.3 | 435/494/552 | 430/506 | 496/504 | ◆ | Rng⚠ | 0.0 | — | 🟡Reclaimed basis/cloud-bottom 494-496 (497 high), **CMF −0.11** (bounce unconfirmed). >504 SpanB = repair; <494 → gap-fill 455 |
| **TSLA** | 334.74 | 45.3/36.2 | **-0.13** | 13.3 | 282/331/380 | 385 | 339/365 | ▼ | LL↓ | 0.0 | ⚫ | 🔴Bounced to just >basis 331 but still <cloud 339, CMF −0.13. LL downtrend; reject 339 → back to 322 VWAP−1σ / BB-low 282 |
| **AAPL** | 305.01 | 42.8/50.2 | **+0.21** | 8.22 | 294/320/345.5 | 297/325 | 315/309 | ▼ | Rng+ | -1.0 | — | 🎯🟢**HELD the 300-303 make-or-break line** (302 low → 305), **CMF +0.21 intact** = accum survived the 2-wk test. Still <cloud; **reclaim 309 = the long** confirms the divergence |
| **META** | 590.68 | 47.9/44.5 | +0.03 | 22.0 | 545/597/650 | 609/579 | 596/605 | ▼ | LL↓ | -1.5 | — | 🔴<cloud/basis, RSI 48, CMF flat +0.03. LL downtrend since the 605 fail; needs to reclaim 596/605 or back to the range low |
| **COIN** | 150.12 | 45.1/45.4 | -0.01 | 8.65 | 139/156/173 | 175.4 | 154/163 | ▼ | LL↓ | -1.5 | ⚫ | 🔴<cloud/basis, RSI 45, CMF flat. LL downtrend; needs 154 cloud reclaim, else → BB-low 139 |
| **GOOGL** | 346.39 | 47.3/49.4 | **-0.13** | 11.4 | 316/346.5/377 | 356.7 | 356/350 | ▼ | LL↓ | -2.0 | ⚫ | 🔴Rejected at basis 346.5, <cloud 350-356, **CMF −0.13** (distribution). LL downtrend; next 338 VWAP−1σ → 316 BB-low |

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

### 2026-07-23 — Roll-forward (earnings-bomb gap-down; RS cohort holds; the reaction played)
**Gate:** QQQ **gapped down to ~695** (705→open 695), deep <cloud 711 — **risk-off, half-size stays / stand down on new longs.** GOOGL **−8.5%** (348→318, <BB-low) and TSLA **−14%** (377→324, <BB-low) missed earnings and gapped down hard, dragging the index. **The 07-22 "trade the reaction not the anticipation" rule paid** — no pre-print entries were on, so the gap hurt nobody.
- **AMD CALL** — thesis fully intact through the risk-off: **held 552 >cloud, CMF +0.15**, green on a red gap day = textbook RS. Still extended (no 528–533 retest yet); add only on the pullback-hold, invalid <489.
- **NVDA CALL** — **held 208 >VWAP 206, CMF +0.22** — the ½ entry is working; RS confirmed. Trail; 214 triple-res is the take-profit; invalid <201.9.
- **AAPL CALL** — still **WAIT** but **strongest tell on the board: CMF surged to +0.30**, held >cloud (322) through the gap. No 308–312 dip yet. The cleanest "buy the stabilization" name.
- **DELL / MU** — RS cohort with AMD/NVDA: DELL held its breakout (449, >cloud +0.14), MU extended +3% (997, >cloud). The AI-hardware complex is where money hid.
- **META** — **lost the 613-616 shelf** exactly as the 07-22 full-analysis flagged (*"lose 613 = short"*): 629→606, <cloud. Short thesis validated; too far from entry to chase now, earn ~Jul 29.
- **ARM** — **lost its 285 VWAP pivot** (287→281): the scalp-long was **correctly avoided** (yesterday's rule: buy only on volume expansion — it never came). Now fade the 306–327 wall.
- **MRVL PUT** — still armed, CMF worsened to **−0.14**; fade a 205–214 rejection → 162, invalid >234.
- **ORCL** watch — CMF **−0.34**, still negative — **no flip, no trade** (standing buy-trigger untouched).
- **GOOGL / TSLA** — earnings knives **<BB-lower band = too oversold to short fresh**; not buys either until they base. Don't chase.
**Ranking now:** 🥇AMD/NVDA (RS holds — trail the ½ NVDA, AMD retest-add) · 🥉AAPL (WAIT the dip/stabilization, CMF +0.30). DELL/MU = RS long-watch; MRVL = armed short; META = validated short (chase-avoid).
**Outcomes:** the *reaction* trade was the right frame — GOOGL/TSLA gapped exactly as "binary, trade the reaction" warned; the RS-cohort longs (AMD/NVDA/DELL/MU/AAPL) held green through a broad −1% gap = the accumulation names proved themselves. No fills forced into the gap (risk-off gate held size at zero-new).
**Lesson reinforced:** on an earnings-driven gap-down, **relative strength = the signal** — the names that stay green above their clouds with +CMF (AMD/NVDA/DELL/AAPL) are the buys *when the index stabilizes*, not the crashed names (don't catch GOOGL/TSLA knives <BB-low). And "trade the reaction, not the anticipation" (rule from 07-17) just paid its biggest dividend.
**Next (07-24):** watch for **QQQ to stabilize/reclaim** (risk-on tell) → press the RS cohort (AAPL dip, AMD retest, NVDA trail); GOOGL/TSLA only on a *base* not the knife; MRVL 205–214 fade; ORCL CMF flip; AMZN earn ~Jul 31 landmine.

### 2026-07-24 — Roll-forward (risk-off broadens; RS shield thins to AAPL + NVDA; INTC added)
**Gate:** QQQ **made new lows** at the open (<BB-low, RSI 40) — risk-off deepening, **stand down on new longs.** The selloff broadened: yesterday's AI-hardware shield **cracked** — **AMD −4.4% (527, back to cloud-top, score 0), MU −6.7% (930, lost the cloud), MRVL fade PLAYED (−5.7%, broke <200 → 162 target).**
- **AAPL** — the last real leader: **+1.7% green, CMF surged to +0.40 (extreme, off the charts)**, held >cloud through another red day. Still WAIT (no 308–312 dip). Earn ~Jul 31 = the risk on any long.
- **NVDA** — held 208 >VWAP, CMF +0.25 — the other RS holdout; the ½ long still works, trail it.
- **AMD / MU / MRVL** — RS cohort thinning: AMD lost basis (retest-add now only <533 reclaim), MU lost the cloud entirely (long thesis broken), MRVL short **hit** (fade played to <200).
- **Accumulation tell (watch for the bounce):** AMZN (+0.14 at BB-low), NFLX (+0.12), PLTR (+0.14), MSFT (+0.29) all show **rising CMF into price weakness** = dip-buyers absorbing — the pattern that preceded prior reversals. First index stabilization → these are the mean-reversion longs.
- **GOOGL** — basing on the 200-EMA (319) post-crash (see the 07-24 GOOG full-analysis: 200-EMA + intraday-VWAP hold + flat CMF = a defined-risk bounce, stop <318, target 330; but earnings-drift risk = scalp only). TSLA still crashing (RSI 28) — knife.
- **ORCL** watch — CMF **−0.37**, new lows, **still no flip**; standing buy-trigger untouched.
- **New add: INTC** — broken downtrend (−31%/mo, −3.7% today), <cloud/basis, CMF −0.15, score −2.5. Knife/no-signal; buy only on a base + CMF flip.
**Ranking now:** 🥇AAPL (CMF +0.40, WAIT the dip) / NVDA (trail the ½) — the only 2 longs standing. MRVL short = **hit** (target 162). Accum-tell watch (AMZN/NFLX/PLTR/MSFT) for the first bounce.
**Outcomes:** RS-relative-strength thesis kept working as a *filter* — as breadth broke, the weak RS names (AMD/MU) cracked and the strong ones (AAPL/NVDA) held; MRVL's armed short paid (<200). No new longs into a broadening selloff (gate held).
**Lesson reinforced:** relative strength is a *ranking*, not a guarantee — on a broadening selloff the RS cohort **thins from the bottom up** (AMD/MU cracked first, AAPL/NVDA last). Trade only the *top* of the RS list, and watch the accumulation-tell names (rising CMF into weakness) for where the first bounce comes from.
**Next (07-27):** AAPL/NVDA hold vs crack (if they go, no leaders left); the accum-tell bounce (AMZN/NFLX/PLTR) on any QQQ stabilization; MRVL trail toward 162; ORCL CMF flip; **mega-cap earnings wall Jul 29 (MSFT/META) + Jul 31 (AAPL/AMZN)** = the week's pivots.

### 2026-07-27 (Mon) — relief bounce in the wreckage; accum-tell paid; NVDA at the line into earnings week
**Gate:** QQQ 689, still <cloud/near BB-low — but stabilizing, oversold names bounced. **The accum-tell from 07-24 PAID:** MSFT +2.4% (>basis, →+2.0), PLTR +4.4% (into cloud), NFLX +1.8% (CMF +0.12 held); GOOGL +2.7% off the 200-EMA (the base held exactly as the 07-24 GOOG analysis flagged). Broad oversold bounce (MSTR/COIN +5.9%, BMNR +11%).
- **AAPL** — still the clean #1: **new highs +2.2%, CMF +0.35**, >cloud. Earn **Thu 7/31** = the risk on any long.
- **NVDA** — **the key tell: broke <203-204 (cloud/basis) intraday (low 201.2) BUT CMF held +0.26** = accumulation-into-weakness, NOT a confirmed crack. Per the 07-24 framework, the *daily close* + whether CMF rolls decide it. Watch: close back >206 = pullback over; close <203 with CMF<+0.10 = *then* the last leader cracks (joins AMD/MU).
- **AMD** — RS crack **deepening**: −3.6% to 508, **CMF faded +0.13→+0.03**, lost cloud-top. The RS cohort keeps thinning from the bottom.
- **MRVL** short — **rolling as forecast** (198→193.5, CMF −0.18) toward the 162 target; trail, invalid >234.
- **NBIS** — **lost the 194 support** (−5.7% to 188.7) → **175 next** exactly as the 07-24 full-analysis flagged. The breakdown played.
- **ORCL** watch — +3.1% bounce but **CMF −0.37, STILL no flip**; standing buy-trigger untouched (a bounce on unchanged deep-neg CMF = short-cover, not the turn).
- **Knives kept falling:** INTC −6.6%, MU −3.8%, CRWV −4.8%, SPCX/ARM lower — don't chase.
**Ranking now:** 🥇AAPL (leader, new highs) · NVDA (on the 203-204 line, CMF-divergence = watch the close). MRVL short & NBIS breakdown both working. Accum-tell longs (MSFT/PLTR/GOOGL) bounced — but earnings sit in the hold.
**Outcomes:** the 07-24 accum-tell call (rising CMF into weakness → bounce) paid Monday (MSFT/PLTR/GOOGL bounced); MRVL/NBIS shorts rolled to target; GOOGL's 200-EMA base held. RS filter still sorting: AMD cracked further, AAPL/NVDA the survivors.
**Lesson reinforced:** *rising CMF into price weakness = the bounce-tell* — it flagged MSFT/PLTR/NFLX/AMZN Friday, and Monday they bounced. And *a bounce on unchanged deep-negative CMF (ORCL −0.37) is short-cover, not the turn* — the flip is the signal, not the price pop.
**Next (07-28→earnings):** **NO new pre-print entries in the earnings names** — MSFT/META **Wed 7/29**, HOOD/COIN **Thu 7/30**, AAPL/AMZN **Thu 7/31**; trade the *reaction*. NVDA close vs 203-204 + CMF; MRVL trail →162; NBIS →175; ORCL CMF flip; AAPL is the leader but earn Thu caps any long's runway.

### 2026-07-28 (Tue) — AI-hardware WASHOUT; AAPL the lone survivor; shorts hit targets
**Gate:** QQQ **668, broke <BB-low, RSI 34** — index deteriorating; deep risk-off, stand down. **The AI-hardware/high-beta complex CAPITULATED:** AMD **−12%**, DELL **−16%**, MU **−11%**, MRVL **−13%**, CRWV **−10%**, NBIS **−14%**, HOOD **−8%**, ARM −7.5%, INTC −7%, LUNR −9%. A one-day washout.
- **AAPL** — **the lone survivor: +0.7% green, CMF +0.39, new highs** while everything else crashed. That's *extreme* RS — and a warning: **if AAPL finally rolls (esp. post-earn Thu), there's no leader left.**
- **NVDA** — **at its line: 193.7 = the 200-EMA/BB-low (191)**, CMF **+0.17** (divergence holding but fading +0.26→+0.17). The exact make-or-break the 07-27 analysis called: **hold 191 + reclaim = the accumulation-divergence pays; lose 191 with CMF finally rolling = dead.** Don't short into it (accumulation at major support); buy-the-*reclaim* only.
- **Shorts PAID:** **MRVL nearly hit the 162 target** (210→168, −13%) — trail/cover; **NBIS blew past 175** (188→163, −14%) toward the 164 major low. Both fully played.
- **Accum-tell update:** **NFLX turned up** (+4.8%, reclaimed cloud/basis, RSI crossed >MA — the clearest tell-success, →+1.0); PLTR (−6.4% but CMF +0.15 holds), AMZN (CMF faded neg), MSFT (held, +2.0). BABA +2.5% off cloud support (pullback-buy paid).
- **ORCL** watch — new lows, **CMF −0.34, STILL no flip** (unchanged 3 sessions); no trade.
**Ranking now:** 🥇AAPL (lone leader, but earn Thu) · NFLX/BABA/MSFT (the few holding) · NVDA (at 191, the divergence line). MRVL/NBIS shorts = **hit target**.
**Outcomes:** the RS filter fully sorted — the entire weak-RS AI-hardware cohort (AMD/DELL/MU/MRVL/CRWV) capitulated in one day, exactly the "thins from the bottom up" path; AAPL alone held. MRVL & NBIS shorts hit. NVDA's +CMF divergence now faces its literal test at the 200-EMA.
**Lesson reinforced:** **when the RS list collapses to ONE name (AAPL), that's late-stage washout, not health** — a single holdout leader into its own earnings is a fragile top, not a buy signal. And the accumulation divergence (NVDA +0.17 at the 200-EMA) is a *setup*, not a *trigger* — it needs the reclaim; catching it mid-flush is the knife.
**Next (07-29, MSFT/META earn a/c):** trade the *reactions* — MSFT (holding, +CMF) vs META (<cloud) prints tonight set the tape; NVDA hold-191-or-lose-it (buy the reclaim, not the flush); MRVL/NBIS trail the shorts; watch if AAPL finally cracks (= no leader). ORCL CMF flip. **Don't fresh-short the −12%-crash names into a washout** (AMD/MU/DELL = too extended, bounce risk).

### 2026-07-29 (Wed) — relief bounce in the wreckage (digestion, not a bottom); MSFT/META earn TONIGHT
**Gate:** QQQ **670, still <BB-low, RSI 35** — no confirmed bottom, but the crashed names bounced: **DELL +6.2%, ORCL +3.9%, COIN/MSTR +3.3%, PLTR +2.9%, HOOD +2.7%, MRVL +3.7% dead-cat.** Exactly the "don't fresh-short the −12% crash names, bounce risk" call from 07-28 (validated — the shorts that chased AMD/MU/DELL down would have been squeezed today).
- **AAPL** — still the lone leader, **new highs, CMF +0.36, RSI 70** (extended). Earn Thu = the risk (a single-leader top into its own print).
- **NVDA** — **re-testing 191** (yesterday's bounce to 197 faded back to 193.5). CMF +0.15 but **fading 0.26→0.19→0.15** — each bounce is lower, the divergence is *weakening*. Still holds 191, but the buyers are less aggressive each test. Buy-the-reclaim only; a decisive <191 with CMF finally rolling = the flush.
- **Accum-tell holding:** NFLX (+0.19, RSI>MA), PLTR (+0.17) — the rising-CMF-into-weakness names; these are where the first real bottom prints (watch for the index to confirm).
- **Shorts DONE:** MRVL **hit 162** (now +3.7% bouncing = cover), NBIS **blew through the 164 low** (188→157). Both fully played — book/cover, don't press into the bounce.
- **ORCL** watch — +3.9% bounce but **CMF −0.31, STILL no flip** (4 sessions unchanged) = short-cover, not the turn. No trade.
**Ranking now:** 🥇AAPL (lone leader) · MSFT/COIN/BABA/BMNR (the few +score) · NVDA/NFLX/PLTR (the +CMF holders at -1.0). MRVL/NBIS shorts = **cover**.
**Outcomes:** the 07-28 "don't chase the crash names short" call paid — they all bounced +3-6% today. The accum-tell names held their flow through the bounce. NVDA's divergence weakening (fading CMF) = the tension building at 191.
**Lesson reinforced:** **after a one-day capitulation, the crashed names bounce first (short-covering) — don't chase them down; the *real* bottom shows in the +CMF-into-weakness names (NFLX/PLTR), not the −2.5 knives.** And a bounce on *unchanged* deep-negative CMF (ORCL 4 sessions at −0.31/−0.34) is never the turn — the flip is the signal.
**Next (07-30, post-MSFT/META):** trade the **MSFT/META reactions** (tonight's prints set the tape) + **HOOD/COIN earn Thu**; NVDA 191 hold vs the fading-CMF flush; watch AAPL into its own Thu print (if the lone leader cracks post-earn, no leaders left); NFLX/PLTR accum-tell for the first real long. Cover MRVL/NBIS.

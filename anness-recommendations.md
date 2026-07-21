# Anness — Stock Recommendations

Watchlist: **ACN · LLY · ISRG · CRCL · SOFI**. Same methodology as `analysisstocks.md`.
**Data: 2026-07-21.** Separate from the main tracker.

**Scoring:** RSI >60 +1 / >50 +0.5 / <50 -0.5 / <40 -1 · above BB basis +1 / below -1 ·
CMF >0.1 +0.5 / <-0.1 -0.5. **CMF is the leading tell** (positive = accumulation/dip-buys;
green candle + negative CMF = distribution into strength = fade/wait). Score is a snapshot;
the *trend of CMF + cloud/VWAP position* is the prediction.

---

## 📋 Master Technical Table (07-21)

BB = Bollinger (Low/Basis/Up) · VWAP = Q2-anchored · Cloud = Ichimoku SpanA/B ·
Pos = price vs cloud (▲above / ◆in / ▼below).

| Sym | Px | RSI/MA | CMF | ATR | BB L/Basis/Up | VWAP | Cloud A/B | Pos | Score | Bias · Next |
|-----|----|--------|-----|-----|---------------|------|-----------|-----|-------|-------------|
| **ACN** | 140.86 | 46.6/42.9 | +0.04 | 7.19 | 122.2/135.2/148.1 | 155.7 | 141.9/158.1 | ▼ | +0.5 | 🟡Basing · beaten down but RSI>MA, >basis/conversion; reclaim cloud >142→145/148, lose 138→135 |
| **LLY** | 1175.41 | 53.5/58.1 | **+0.15** | 38.46 | 1109/1180.7/1252.4 | 1050.4 | 1173.3/1096.4 | ▲ | 0.0 | 🟢**Best** · above cloud on +CMF, uptrend; capped at basis/conv 1180-1182 → **>1182**→1199/1252, support 1173/1164. ATR 38 |
| **CRCL** | 71.08 | 49.4/37.6 | **-0.25** | 6.00 | 57.3/66.5/75.8 | 93.5 | 69.4/99.3 | ◆ | 0.0 | 🔴Suspect bounce · busted (EMA 103/VWAP 93 far above), +RSI but **CMF -0.25 = distribution rally**; needs >73+flow flip, else fade. ~8%/day |
| **SOFI** | 17.64 | 50.1/53.9 | -0.05 | 0.91 | 16.85/17.89/18.94 | 17.22 | 18.05/17.33 | ◆ | -0.5 | 🟡Coiled · tight in cloud, >VWAP 17.22 <basis 17.89; **>18.05 cloud-top→18.9, <17.33→16.85**. Huge vol 86M |
| **ISRG** | 350.06 | 32.9/44.0 | **-0.31** | 16.80 | 350.8/398.1/445.4 | 421.6 | 386.1/402.3 | ▼ | -2.5 | ⚫**Knife** · worst flow (-0.31), RSI 33 os, at BB-low 350.8, below everything; don't buy os — wait for CMF flip / >379 conversion reclaim |

---

## Ranked recommendations (by quality — trend + flow, not just the score snapshot)

| Rank | Sym | Read | Action |
|------|-----|------|--------|
| 🥇 | **LLY** 1175 | The only clean uptrend: above cloud, **CMF +0.15** (accumulation), RSI 53. Stalling at basis/conversion 1180-1182. | 🟢 **Long on >1182 reclaim** → 1199 (VWAP+1σ) → 1252 BB-up. Support 1173 cloud-top / 1164 base. Stop <1164. ATR 38 = big $ swings, size for it. |
| 🥈 | **ACN** 140.86 | Downtrend **stabilizing** — reclaimed basis+conversion, RSI curling above its MA, flat-positive flow. Squeezed just under the cloud. | 🟡 **Watch the cloud reclaim >142** (turn signal) → 145/148. Neutral-constructive, not yet confirmed. Lose 138/135 = back down. |
| 🥉 | **SOFI** 17.64 | Coiled inside a thin cloud on neutral flow — no edge yet, just compression on massive volume. | 🟡 **Trade the break:** >18.05 (cloud-top) / 17.89 basis = up to 18.9; <17.33 (cloud-bottom) = down to 16.85. Wait for the resolution. |
| 4 | **CRCL** 71.08 | Busted name (price 71 vs EMA 103 / VWAP 93) bouncing on **negative flow (CMF -0.25)** = distribution rally, not accumulation. | 🔴 **Don't chase the bounce.** Only interesting on **>73 with CMF turning positive**; otherwise a fade-the-rip toward 66 basis. High volatility. |
| 5 | **ISRG** 350 | Falling knife — **CMF -0.31** (heaviest), RSI 33, sitting on BB-low 350.8, below cloud/VWAP/basis. | ⚫ **Avoid longs.** Oversold = reflex-bounce risk for shorts too. Buy only the *turn* (CMF flip or >379 conversion reclaim), not the level. |

**Bottom line:** **LLY is the standout** — the only accumulation-backed uptrend; buy the 1182 reclaim.
**ACN** is a promising base (watch the 142 cloud reclaim). **SOFI** is a coin-flip coil (trade the break).
**CRCL and ISRG are distribution names** (CMF -0.25 / -0.31) — no buys until flow turns; ISRG is the
weakest and a knife. Lead longs with the positive-CMF names, avoid the negative-CMF ones on the long side.

---

## Notes
- **CRCL** (Circle) is a recent listing and **ISRG/ACN** are in deep downtrends far below their EMAs —
  respect that these are *counter-trend/bottoming* reads, not established uptrends (except LLY).
- Confirm earnings dates before any dated options — several of these report within weeks.
- Update this file on refresh; track one pivot line per name day-over-day (LLY 1182, ACN 142, SOFI 18.05,
  CRCL 73, ISRG 379).

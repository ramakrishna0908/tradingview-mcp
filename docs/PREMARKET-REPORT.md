# Daily Premarket Market Direction Report

Every weekday morning before the U.S. open, `tv premarket` turns the overnight
tape into one page: a **Bullish / Neutral / Bearish** bias with a confidence
score, the drivers behind it, sector strength and weakness, key support and
resistance, "what investors should watch today", and the market-moving events
of the session — each with its time, expected impact and the outcome that
would flip the bias. It is educational market analysis, timestamped, and never
investment advice.

```bash
node src/cli/index.js premarket                 # today's report → docs/reports/premarket/
node src/cli/index.js premarket --print         # print the Markdown
node src/cli/index.js premarket --open          # also open the HTML
node src/cli/index.js premarket --news news.json  # include overnight headlines
node src/cli/index.js premarket --date 2026-09-08
```

Outputs: `docs/reports/premarket/premarket-<date>.json` (the model), `.md`
(for chat and hand-off) and `.html` (self-contained, dark theme, mobile-safe).

## Inputs

| Input | Source | Used for |
|---|---|---|
| ES, NQ, YM, RTY futures | Yahoo Finance chart API | overnight move, breadth, futures levels |
| VIX, 2y/10y/30y yields, DXY, WTI, Brent, gold, bitcoin | Yahoo | macro drivers |
| SPY, QQQ, DIA, IWM | Yahoo (last close + 4 months of daily bars) | trend, key levels |
| 11 sector ETFs + SMH | Yahoo | sector strength/weakness, breadth |
| U.S. economic calendar | ForexFactory weekly JSON | CPI/PPI, jobs, Fed, GDP, retail sales, ISM, auctions, EIA |
| Earnings | Nasdaq earnings calendar | large caps (≥ $5B) and watchlist names, BMO/AMC |
| Overnight headlines | supplied by the morning task via `--news` | geopolitics, breaking news |

A feed failure never fails the report: the missing input is listed, the
composite is computed from what remains, and confidence is reduced.

## Scoring

Nine inputs are each scored on −1…+1 and weighted:

| Input | Weight | Score |
|---|---:|---|
| S&P futures move | 3 | ±1 at ±0.75 % |
| Futures breadth | 1 | (up − down) / 4 across ES, NQ, YM, RTY |
| VIX | 2 | level (< 14 → +0.6 … > 28 → −1) plus change (−chg / 8, capped ±0.5) |
| 10-year yield | 1.5 | −bp / 8 |
| Dollar index | 1 | −% / 0.5 |
| WTI crude | 1 | −% / 2.5 (rising oil reads as an inflation and geopolitical headwind) |
| SPY trend | 2 | above 20- and 50-day +1 · below both −1 · mixed ±0.25 |
| Sector breadth | 1 | 2 × (share of sector ETFs above their 20-day) − 1 |
| Bitcoin | 0.5 | % / 3 (24-hour risk-appetite gauge) |

The composite is the weighted mean. **Bullish** ≥ +0.15, **Bearish** ≤ −0.15,
otherwise **Neutral**.

**Confidence** (5–95) = 20 + 40 × magnitude + 40 × agreement, minus
penalties: a high-impact release before the open (−15), a Fed decision day
(−10), VIX ≥ 25 (−10), a holiday session (−10) and missing inputs (−5 each,
max −15). It measures how much the inputs agree with each other; it is not
a probability that the market goes up.

## Events

Calendar rows are USD-only. High and Medium impact rows are always shown;
Low impact rows survive only when they move rates or oil (auctions, Fed
speakers, EIA inventories, GDP, retail sales, ISM/PMI, sentiment). Each event
carries a reading — what it usually does to the tape and which outcome
would flip the bias (e.g. CPI: hotter than forecast → yields and dollar up,
equities pressured; cooler → rates relief). Earnings and headlines render in
the same list so the day reads as one timeline.

On a market holiday the report says so and reads the **next** session using
the overnight futures and the last completed cash session.

## The X post

`tv social premarket` turns the day's report into one compliance-approved
post for @ai_king0206 (kind `premarket`, symbol `MKT`, stocks queue), with a
1200×1000 card that carries the full disclaimer:

```
🟢 Premarket read for Tue Sep 8 — BULLISH (confidence 74/100)
Futures green, VIX calm, uptrend intact — the bulls have the ball into the open.
Top drivers:
▲ S&P futures +0.62% overnight
▲ SPY closed 770.19, above both its 20- and 50-day averages (uptrend intact)
▲ VIX 13.8 (-4.10%) — calm
SPY levels: 772.87 above (prior-day high) · 770.19 below (prior close). Losing 770.19 negates the bullish read.
Sectors: strongest Semis, Tech, Energy · weakest Cons. Disc., Comms, Real Estate
Flip event: 8:30 AM ET Core CPI m/m — hotter than expected → yields up, stocks pressured; cooler → relief.
Bullish or bearish today? 👇
Educational market analysis only. Not investment advice.
Data: Sep 8, 2026 7:58 AM ET
#Stocks #Premarket
```

Every line is generated from the report model (`src/social/premarket-post.js`);
nothing is typed by hand. Compliance (`validatePost`, kind `premarket`)
re-checks the finished text: the bias word and confidence must match the
report, the SPY numbers must be the report's levels, the short disclaimer
must be present, the chart must have rendered, the usual prohibited-wording,
forward-looking-claim, hashtag and freshness rules apply, and one post per
session date is allowed. The flip event is the day's earliest high-impact
release, else a Fed event, else a high-impact headline, else a medium
release, else a mega-cap (or before-the-open large-cap) earnings report; when
none qualifies the post names the week's next high-impact release instead.
Config: `premarket` in `config/social-compliance.json` (enabled, queue, hashtags).

## Schedule

Two independent triggers, either is enough:

- **Claude desktop task `premarket-market-direction`** — weekdays 8:00 AM ET.
  Runs the CLI, searches the wires for overnight headlines, writes them to
  `docs/reports/premarket/news-<date>.json`, re-runs with `--news`, opens the
  HTML, queues the X post with `tv social premarket` and publishes it from
  the connected Chrome (inline composer, text verified before posting,
  recorded with `tv social record`), then posts the summary back. Requires the desktop app to
  be open (a missed run fires on next launch).
- **launchd `com.ramakrishna.tvpremarket`** — weekdays 7:45 AM ET, data only
  (no headlines). Install:

  ```bash
  cp scripts/com.ramakrishna.tvpremarket.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.ramakrishna.tvpremarket.plist
  ```

## Tests

```bash
npm run test:premarket
node --test tests/premarket-post.test.js
```

Fixtures only — no network. They pin the candle-completeness rule, the event
readings and filters, the holiday roll, every bias threshold, the confidence
penalties, level selection and both renderers.

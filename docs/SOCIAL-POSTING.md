# Social Summary Table + X post generator

Turns a daily report (`docs/reports/daily-YYYY-MM-DD.html`) into a compact
setup table and compliance-gated X (Twitter) posts.

```
Report → Generate Draft → Compliance Validation → Preview/Edit → User Approval → Publish to X
```

The manual commands never auto-publish: `publish` refuses anything that is not
`approved`, re-validates the frozen approved text, and only then calls the
official X API. Unattended posting exists only as `tv social auto`, which is
policy-gated (see below) and audited exactly like a human approval.

## Source of truth

The daily sweep writes HTML only, so the first `tv social` command that
touches a report parses it **once** into `docs/reports/daily-YYYY-MM-DD.json`
(the structured model). Every later step reads the JSON model, never the HTML.
Indicator values and the score are lifted verbatim — nothing in this feature
recomputes a trading calculation. The data timestamp is the `report ready`
time in the sibling `run-YYYY-MM-DD.log` (falls back to the file mtime).

## Commands

```bash
npm run social -- table    --report docs/reports/daily-2026-08-31.html [--format md|text|json]
npm run social -- draft    --report docs/reports/daily-2026-08-31.html [--symbol CRWV]
npm run social -- list
npm run social -- show     <draftId> [--history]
npm run social -- validate <draftId>
npm run social -- edit     <draftId> --file new.txt | --text "..."
npm run social -- approve  <draftId> [--acknowledge-stale "reason"]
npm run social -- reject   <draftId> --reason "..."
npm run social -- publish  <draftId>                 # official X API, env credentials
npm run social -- record   <draftId> --post-id <id>  # audit a post made outside the API
npm run social -- auto     [--report <html>] [--dry-run]   # policy-gated auto-publish
```

`table` columns: `Ticker | Setup | Price | RSI | CMF | Support | Resistance | Signal | Confidence`.

`Signal` is either **CONFIRMED SETUP** (score at the ±2.0 bar *and* price on
the right side of the cloud *and* money flow agreeing *and* HH/LL structure
agreeing — the report's own two-stage rule) or **WATCH**. Breakout watches are
always WATCH because resistance has not been cleared; names pinned to a band
are exhaustion watches. Confidence is derived from the same data and is never
raised by hand — an edit that relabels a WATCH as confirmed is a blocking issue.

`draft` picks only the highest-quality setups (`posting.maxDraftsPerReport`,
`posting.minConfidence` in the config).

## Compliance checks (`config/social-compliance.json`)

Legal/compliance can change any of these without a code change:

| Check | Code | Default |
|---|---|---|
| X character limit (weighted: emoji = 2, URLs = 23) | `char_limit` | 280 (`charLimit`; raise for X Premium — the rationale line and more engagement hashtags are added automatically when they fit) |
| Required / prohibited hashtags | `missing_hashtag`, `prohibited_hashtag`, `too_many_hashtags` | `#NFA #DYOR` required; promotional tags blocked; > 6 warns |
| Prohibited / promotional wording | `prohibited_wording` | guaranteed, easy profit, you should buy, must buy, risk-free, … |
| Personalized advice | `personalized_advice` | "for your portfolio", "if you're retired", "buy it now", … |
| Missing / misplaced disclosure | `missing_disclosure` | `Educational market analysis only. Not investment advice. Trading involves risk.` — enforced when `disclosurePlacement` is `post`; with `bio` the line is omitted from posts (it must live in the account bio) and `#NFA #DYOR` remain the required in-post marker |
| Stale report data | `stale_data` | `maxReportAgeHours: 24` — approve needs `--acknowledge-stale "<reason>"`, which is audited |
| Projections presented as fact | `unsupported_claim` | "will rally", "price target", "forecast", "% upside", … |
| Duplicate post | `duplicate_post` | same text, or same ticker + report already approved/published |
| Missing indicators | `missing_indicator` | Price, RSI, CMF, and a support or resistance level |
| Wrong ticker / price / level | `ticker_mismatch`, `price_mismatch`, `value_mismatch` | every `$` value must be a level from the report row |
| Signal upgraded for engagement | `signal_upgraded` | WATCH may not be labelled confirmed |
| No downside context | `missing_risk_context` | a `Risk:` sentence is required |
| No data timestamp | `missing_timestamp` | `Data: <Mon D, YYYY h:mm AM ET>` required |

## Hashtags

`hashtags.required` (default `#NFA #DYOR`) must appear in every post — a
missing one is a blocking `missing_hashtag`. `hashtags.engagement` tags are
appended in priority order only while the post still fits `charLimit`
(`#Breakout`/`#Breakdown` are added only when the setup is literally that, so a
tag can never upgrade a signal). `hashtags.prohibited` blocks promotional tags
(`#ToTheMoon`, `#Guaranteed`, `#FinancialAdvice`, …) and `maxTotal` warns on
hashtag spam. The hashtag line sits after the disclosure; validation allows a
trailing hashtag-only line but nothing else after the disclosure.

## Auto-publish (`tv social auto`)

**When it runs.** The launchd report job starts at 9:35 AM ET on weekdays and
the report is usually written by ~9:50. `scripts/daily-report.sh` launches
`scripts/social-auto.sh` in the background the moment the file exists, and a
second launchd job (`scripts/com.ramakrishna.tvsocialauto.plist`, 10:10 AM ET)
re-runs the same script as a fallback. Both runs are idempotent — a ticker
already posted for that report is a `duplicate_post` — so a re-run only
publishes what the first run missed. Load the fallback once with:

```bash
cp scripts/com.ramakrishna.tvsocialauto.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.ramakrishna.tvsocialauto.plist
```

**How it posts — `via`.** With `posting.autoPublish.via = "browser"` (current
setting) the morning run prepares and policy-approves the posts into status
`ready_to_post` (text + chart PNG) and sends nothing itself. A scheduled
Claude task in the desktop app (weekdays 10:00 ET, "Post daily setups to X")
then reads `tv social ready --json`, posts each one through the Chrome that is
signed in as @ai_king0206 (text + chart image), and calls
`tv social record <id> --post-id <id>` so the audit ends in `published`
(method `browser`). Nothing outside the ready list is ever posted and the text
is never edited by the poster. Switch `via` to `"api"` to publish directly
through the X API from the launchd job instead (needs `.env.social`).

**Rehearsal.** `touch docs/social/REHEARSE` then "Run now" on the scheduled
task: it uses `tv social rehearse --json` (latest report, no guards, no
audit record, an id that can never be recorded), composes one post with its
chart in Chrome, stops before clicking Post, discards the draft, and removes
the flag. Use it once to pre-approve the task's tools.

**What it posts.** With `candidateSource: "report-cohort"` (the default) the
candidates are exactly the names the report lists under **Calls** and
**Puts** in its Cohort Summary, in report order, Calls first. The report's
flow-trend gate is the authority: names it demoted to Watches or removed
from Puts are never candidates. The classifier only supplies the label, and a
report Call that is pinned to the upper band still posts as a *Breakout watch*
— a signal is never upgraded. Posts are spaced `spacingSeconds` apart (2 min)
so a run of ~15 posts spreads over half an hour. `candidateSource: "table"`
switches back to the classifier ranking with `requireSignal`/`minConfidence`.

Guards, all in `config/social-compliance.json → posting.autoPublish`:

| Guard | Default |
|---|---|
| `enabled` | `true` — `SOCIAL_AUTO_PUBLISH=0` in the environment overrides to off |
| Freshness | report must be within `maxReportAgeHours`; **auto mode can never acknowledge stale data** |
| `candidateSource` | `report-cohort` — the report's own Calls/Puts lists; refuses if the report has none |
| `requireSignal` / `minConfidence` | `null` / `Low` (the cohort list is the gate; set `CONFIRMED`/`High` to tighten) |
| `maxPostsPerRun` / `spacingSeconds` | 20 / 120 |
| `symbolCooldownHours` | 20 — one post per ticker per day, even across re-runs |
| `skipFlaggedRows` | skip rows the report flagged (⚑ catalyst, ◉ macro cross-check) |
| `skipBiasKeywords` | skip when the report's note mentions earnings, trial, avoid, no position, pre-news, stale, removed, demoted, catalyst |
| `allowWarnings` | `false` — every compliance check must be clean, not just non-blocking |
| `requireDisclosureLast` | the disclosure must be the last sentence line (hashtags may follow) |
| Credentials | must come from the environment; there is no browser/manual path in auto mode |

Logs go to `docs/reports/social-YYYY-MM-DD.log`. Every decision is audited: published posts have `approval.by = "auto-publish policy"`,
skipped candidates are stored as `auto_skipped` with the reason, `--dry-run`
stores `auto_dry_run` and calls nothing. `tv social auto --dry-run` is the way
to preview what a morning run would post.

## Post format

```
🔻 $CRWV — Breakdown · Confirmed Setup
Price: $82.84 · RSI: 44 · CMF: -0.38 (−0.05 vs prior day)
Support: $76.79 · Resistance: $88.71
Downside level: $76.79 (support test)
Invalidation: reclaim and hold above $88.71
<narrative: what happened, what to watch>          ← when it fits
Watching this setup? Bookmark it and follow for daily breakdowns.   ← config.cta, when it fits
Data: daily · Aug 31, 2026 9:49 AM ET
#NFA #DYOR #Breakdown
```

- The prior-day CMF change is computed from the previous report in
  `docs/reports/` with the same parser (never re-derived) and validated
  against the text (`value_mismatch` if edited). No prior report → no note.
- "Downside/Upside level" is the nearest report level, never a target; the
  invalidation line is the risk context. Both are checked against the row.
- `charLimit` is 4000 for the Premium account, so the full version posts
  (narrative, CTA, all hashtags). At 280 the CTA, extra hashtags and narrative
  are trimmed in that order.
- `Volume: 1.4× 20-day avg (last bar)` comes from the chart's candle data
  (`charts.volumeLine`) and is integrity-checked against it.

## Charts

Every post carries an annotated daily chart (`charts.enabled`): the last
`charts.bars` real candles (Yahoo Finance, cut at the report date) with the
Bollinger band shaded, a volume pane (bars coloured by candle direction, dashed
20-bar average, last-bar ratio), the report's support / resistance / 20-day
basis / report price, one annotation naming the setup, the data timestamp,
the price source and the disclosure —
so the disclosure travels with the image even when it is not in the text.
Nothing forward-looking is drawn. PNGs land in `docs/social/charts/<date>/`
(gitignored); `draft` and `auto --dry-run` render them for preview, `publish`
uploads via `POST /2/media/upload`, sets alt text via `/2/media/metadata`, and
attaches the media id. If the chart cannot be built or uploaded the post goes
out text-only and the audit records why (`charts.requireForPublish: true`
blocks instead). Renderer: `scripts/render-chart.py` (Python 3 + Pillow).

## Audit trail

`docs/social/audit.jsonl` is append-only; each line is a full snapshot of a
draft, so the file is the complete history (`show --history`). A record holds
the original generated text, the edited text, the report date and data
timestamp, the last validation issues, the stale acknowledgement (who/why/when),
the approval (who/when/text hash), and the publication (when, X post id, URL,
method `x-api` or `manual`).

## X API credentials

Only from the environment — never committed. For the launchd job put them in `.env.social` (gitignored, `chmod 600`); interactively, export them:

```bash
# OAuth 1.0a user context (app with Read and Write permission)
export X_API_KEY=... X_API_SECRET=... X_ACCESS_TOKEN=... X_ACCESS_TOKEN_SECRET=...
# or an OAuth 2.0 user token with tweet.write
export X_OAUTH2_ACCESS_TOKEN=...
```

`publish` signs `POST https://api.x.com/2/tweets` with HMAC-SHA1 (zero
dependencies) and stores the returned post id in the audit record.

## Tests

```bash
npm run test:social   # parser, classifier, generator, every compliance check, workflow/audit, OAuth signing
                      # plus the crypto suite: 24/7 calendar, sub-dollar precision, queue isolation
```

## Publishing strategy

The account publishes **one highest-quality technical setup per run, follows
each setup through its lifecycle with event-driven updates, and scores itself
every Friday**. Everything below is computed from two append-only files —
`docs/social/audit.jsonl` (posts) and `docs/social/setups.jsonl` (lifecycle) —
so every number the account publishes about itself is reproducible.

### One setup per run, never forced

`posting.autoPublish` in both configs: `maxPostsPerRun: 1`,
`candidateOrder: "quality"`, `minConfidence: "Medium"`, `skipTracked: true`.
The report's cohort is ranked by the classifier — CONFIRMED before WATCH, then
confidence, then |score| — with ties broken by historical engagement for that
setup type (see *Metrics*) and then alphabetically. The first candidate that
clears every guard is the day's post. If nothing is Medium-or-better the run
publishes nothing and the summary says `noSetup`; a post is never forced. A
symbol whose setup is still open in the tracker is skipped — its follow-ups
cover it.

The stock job (weekdays, report 9:35 ET, poster ~10:03 ET) lands in the
9:45–10:30 window. The crypto job runs daily at 1:00 AM for the 24/7 market.

### Lifecycle labels

| Stage | When | Post label |
|---|---|---|
| `DEVELOPING` | posted as a WATCH | `DEVELOPING` (badge), setup name in the chip |
| `CONFIRMED` | posted CONFIRMED, or a later report confirms a DEVELOPING one | `RECLAIM CONFIRMED` / `TREND CONFIRMED` / `BREAKDOWN CONFIRMED` |
| `BREAKOUT` | a daily close beyond the 🎯 level | `BREAKOUT UPDATE` (`BREAKDOWN UPDATE` for bearish) |
| `INVALIDATED` | a daily close beyond the 🛑 level | `INVALIDATED` |
| `EXPIRED` | no resolution within `followUps.maxAgeSessions` bars | not posted, not scored |

An intraday touch of 🎯 without a close beyond it is a `LEVEL TEST` follow-up
(once per setup; `followUps.postLevelTests`). The word *confirmed* can only be
produced for a CONFIRMED signal or a CONFIRMED/BREAKOUT stage — compliance
re-checks every headline (`signal_upgraded`).

### Event-driven follow-ups (`tv social track`)

Both auto scripts run `social track --report <today>` right after `social
auto`. For every open setup in that queue it fetches the daily bars since the
post, graduates DEVELOPING setups the new report confirms, and detects
breakouts, invalidations and level tests **on closes only** (invalidation wins
over breakout inside one bar). Each event becomes a follow-up post through the
same approval path as the daily setup, tagged `kind: "followup"` with
`followUpOf` pointing at the setup's record, so the browser poster picks it up
in the same run. Every number in a follow-up is a stored level, the event
close/extreme, the entry price or the next listed level — compliance validates
against exactly that set (`kind: 'followup'`). The freshness guard still
applies: an event older than `maxReportAgeHours` is audited as skipped, never
back-posted.

```bash
tv social track --dry-run          # detect and draft, change nothing
tv social setups [--all]           # lifecycle state of every tracked setup
```

### Weekly Setup Scorecard (`tv social scorecard`)

Every Friday the `post-weekly-scorecard` task settles the week's closes
(`social track` for both queues), then queues the scorecard on the stocks
queue: setups posted, breakouts / levels reached, invalidations, still active,
hit rate (breakouts over resolved — expiries are neither), and the all-time
line. The counts come from `scorecardStats` over `setups.jsonl`; compliance
re-derives every number and blocks on a mismatch (`kind: 'scorecard'`). Only
the stock config has `scorecard.enabled`, so the account posts one scorecard
covering both queues. The card is rendered by the same renderer (`style:
"scorecard"`).

### Metrics and the feedback loop (`tv social metrics …`)

`docs/social/metrics.jsonl` holds per-post snapshots (impressions, likes,
replies, reposts, quotes, bookmarks, profile clicks) and account snapshots
(followers). Two collectors write the same shape:

- `tv social metrics collect` — X API v2 (`public_metrics` +
  `non_public_metrics`, OAuth 1.0a user context) plus `/users/me` followers.
- `tv social metrics record <xPostId> --impressions N --likes N …` and
  `--followers N` — numbers read from the X analytics page, which is what the
  scheduled browser tasks do after posting (no API access required).

`tv social metrics report` joins snapshots with the audit log (asset class,
setup type, post kind, posting hour/weekday) and the tracker (outcome),
prints aggregates and recommendations, and writes `docs/social/insights.json`.
`autoPublish` reads that file: when two candidates tie on quality, the one
whose queue/setup-type bucket has the higher historical engagement rate wins
(only buckets with ≥ 3 measured posts count). It is a tiebreak — it can never
promote a weaker setup over a stronger one.

## Educational explainers (`tv social educate`)

Twice a week (Tuesday and Friday 8 AM, task `post-education-explainer`) the
account posts one technical-analysis topic as a simple visual explainer: a
short definition, three labelled examples drawn from specs (not market data),
and a clear **Bullish / Bearish / Neutral** takeaway for each, on a 1080×1350
mobile-first card whose footer reads *Educational only. Not financial advice.*

- **Library:** `src/social/education.js` — support & resistance, candlestick
  basics, RSI, CMF, breakouts, fakeouts, trendlines, volume confirmation, moving
  averages, Bollinger Bands. Each example carries an illustration spec
  (`candles`, `osc` or `line`) that `scripts/render-chart-sweep.py` (style
  `explainer`) draws.
- **Rotation:** never-posted topics first in library order, then the one posted
  longest ago, so the curriculum cycles. `tv social educate --list` shows when
  each ran; `--topic <id>` forces one.
- **Compliance profile** (`kind: 'education'`): the prohibited-wording and
  forward-looking-claim checks apply as usual; a cashtag anywhere blocks
  (`ticker_in_education`) so an explainer can never read as a call on a name;
  the indicator/level/timestamp/risk-context requirements of a setup post do
  not apply. The card is required (it carries the footer). Hashtags come from
  `education.hashtags` (two by default).
- **One per day**, on the `education.queue` (stocks). Only the stock config has
  `education.enabled`.
- **Metrics:** posts carry `topic`, and `tv social metrics report` adds a
  *By educational topic* table and a recommendation naming the best-engaging
  topic. Metrics are collected through the browser by the task (the X API path
  exists but is a fallback, and only for metrics).

```bash
tv social educate --dry-run        # text + card for the next topic, queue nothing
tv social educate --topic rsi      # queue a specific topic
```

## Post format: "sweep" (the Daily Setup Sweep layout)

Both shipped configs set `"postFormat": "sweep"`. `"classic"` restores the
previous layout without a code change. The generator lives in
`src/social/generate.js` (`generateSweepPost`); the wording table shared by the
text and the chart is `src/social/sweep-labels.js`.

```
📈 $ETH has reclaimed its 20-day base — reclaim confirmed.
CMF +0.22 shows positive money flow while RSI 64 keeps momentum healthy.
In plain terms: price is back above its 20-day average and volume is backing it — buyers are in control while it holds.
🎯 Above $2,579 → potential breakout
🛑 Below $2,449 → setup invalidated
Current price: $2,498 · RVOL 0.8× · Setup score +2.5
Which level gets hit first — $2,579 or $2,449? 👇
Daily Setup Sweep · tracked to a daily close beyond a level · scored every Friday
Data: daily · Sep 7, 2026 10:11 AM ET
#ETH #Crypto
```

What each line is, and what guards it:

- **Headline.** The verb phrase comes from `sweep-labels.js`, keyed on the
  classifier's setup name and signal. The word *confirmed* — "reclaim
  confirmed", the chart's "RECLAIM CONFIRMED" badge, any phrasing — can only be
  produced for `signal === CONFIRMED`. A WATCH gets "reclaim watch" and a blue
  "RECLAIM WATCH" badge. Compliance re-checks the finished text: any
  `confirmed` in a WATCH headline is `signal_upgraded` (block); a CONFIRMED
  setup with no `confirmed` is `signal_label` (warn, which auto-publish
  treats as a skip).
- **Narrative.** Present-tense description of the current CMF and RSI readings
  (`cmfPhrase`, `rsiPhrase`). Both numbers are integrity-checked.
- **In plain terms.** One beginner-friendly sentence per setup and signal
  (`plainLine` in `sweep-labels.js`): what the reading means without the
  acronyms, present tense, no forecast, and never the word *confirmed* for a
  WATCH. `"plainLanguage": false` drops it.
- **🎯 / 🛑 levels.** The nearest report level in the setup's direction and the
  one that negates it (`sweepLevels`). Bearish setups flip the roles: "Below $X
  → breakdown continues" / "Above $Y → setup invalidated". The 🛑 line is the
  risk context the validator requires. When the report has no level on one
  side, only the 🛑 line is printed.
- **Stats line.** Current price, RVOL (the chart's last-bar volume vs its
  20-day average; omitted when there is no chart data) and the report's own
  setup score. All three are integrity-checked (`value_mismatch`).
- **CTA.** `cta.text` is a template: `{level1}` is the 🎯 level, `{level2}` the
  🛑 level. With a single level the generator asks "Does $X hold? 👇" instead.
- **Series line.** `brand.seriesLine` — names the recurring format and the
  accountability loop ("tracked to a daily close beyond a level · scored every
  Friday") so a first-time reader knows the post is one of a series and that
  the outcome will be published. `null` drops it.
- **Data line.** Unchanged — it is the freshness marker.
- **Hashtags.** `hashtags.symbolTag` adds the cashtag as a hashtag and
  `hashtags.assetTag` adds one class tag (`#Stocks` / `#Crypto`); `maxTotal` is
  2 and `required` is empty. See the marker rule below.

### Compact prices

`"priceDisplay": "compact"` prints whole dollars once a price is in the
thousands (`$2,579` for 2,578.88). Compliance did not get looser to allow this:
the value scan now accepts a quoted number only if a report level **rounds to
it at the precision shown** (`shownTolerance`). `$2,579` passes because
2,578.88 rounds to it; `$2,579.40` and `$2,600` both block. Sub-dollar coins
keep their significant digits (`$0.090922`), and the check tightens to match.

### The disclaimer marker rule

With `disclosurePlacement: "bio"` and no required hashtags, nothing in the
post text carries a compliance marker — the disclaimer is printed on the chart
card instead. So the chart cannot be optional: `config.js` refuses to load a
policy where that is the case unless `charts.enabled` and
`charts.requireForPublish` are both true. A renderer failure therefore
**blocks** the post rather than publishing it text-only and unmarked. To go
back to an in-post marker, put `#NFA #DYOR` back in `hashtags.required`.

### The chart card (`charts.style: "sweep"`)

`scripts/render-chart-sweep.py`, spec from `buildSweepChartSpec` in
`src/social/chart.js`. Near-square (1200×1000, `charts.width`/`height`) so it
renders large on a phone. Header with ticker and name; the verdict badge
(green confirmed / red bearish confirmed / blue watch); candles with a 20-day MA
computed from the same Yahoo closes and labelled as such; the two report
levels and current price as dashed lines with role labels; volume; four stat
tiles; the bull/bear/question strip; the disclaimer and data line. Same
integrity rule as the classic chart: every level and figure is the report's,
formatted with the same options as the text. The mockup's "Bigger Moves
Ahead?" tagline is deliberately not drawn — nothing forward-looking goes on the
card.

To preview the format against any report without touching the audit log, use
`tv social rehearse --report <html>` (text only) or the `sweep format` suite in
`tests/social.test.js`, which asserts the ETH layout line by line.

## The crypto sweep (second, independent queue)

A second nightly pipeline sweeps the **top 20 crypto by market cap** and posts to
the same X account. It reuses every stage above — the same classifier, the same
compliance validator, the same audit log — and differs only where a 24/7 market
genuinely differs from an exchange-listed one.

| | Stocks | Crypto |
|---|---|---|
| Report job | `scripts/daily-report.sh`, weekdays 9:35 ET | `scripts/crypto-report.sh`, **every day 1:00 AM** |
| launchd label | `com.ramakrishna.tvdailyreport` | `com.ramakrishna.tvcryptoreport` |
| Reports in | `docs/reports/` | `docs/reports/crypto/` |
| Policy file | `config/social-compliance.json` | `config/social-compliance-crypto.json` |
| Publish job | `scripts/social-auto.sh` | `scripts/crypto-social-auto.sh` |
| Queue tag | `stocks` | `crypto` |
| Posting task | `post-daily-setups-to-x` | `post-daily-crypto-to-x` (1:15 AM daily) |

### Why it is a separate job rather than more symbols in the daily one

- **The calendar.** Auto-publish refuses on weekends and NYSE holidays, because a
  stock report generated then can only be re-showing the prior session. Crypto has
  no closed days, so that refusal would silently kill 2 of every 7 crypto runs.
  The crypto policy sets `"marketCalendar": "24x7"`, which disables the weekend and
  holiday gates *for that config only*. The default is `"nyse"`, so the stock policy
  is unchanged.
- **The clock.** 1:00 AM is chosen so the sweep does not contend with the 9:35 ET
  stock job for the single TradingView chart window.
- **Separate report directory.** Day-over-day CMF, the run log and the cached JSON
  model are all resolved by filename within one directory. Sharing a directory would
  make each sweep read the other's prior session.

### Universe: resolved live, not hardcoded

`scripts/crypto-universe.js` pulls the top coins from CoinGecko's public
`/coins/markets` endpoint at run time, then filters out anything that cannot carry a
technical setup:

- **stablecoins** (USDT, USDC, DAI, USDS, …) — a peg has no trend, RSI or breakout
- **wrapped / liquid-staked derivatives** (WBTC, wstETH, …) — they duplicate the
  asset they track and would post the same setup twice
- **non-spot tickers** (e.g. `FIGR_HELOC`) — no TradingView symbol exists

The result is cached to `config/crypto-universe.json` and reused if CoinGecko is
unreachable, so the 1 AM job always has a universe. A `reserves` list supplies
replacements for any coin TradingView cannot chart.

```bash
node scripts/crypto-universe.js            # refresh + print the table
node scripts/crypto-universe.js --symbols  # bare symbol list
node scripts/crypto-universe.js --offline  # use the cache, never call the API
```

The list is deliberately **not** committed as a static universe: the top 20 by market
cap reshuffles constantly, and a frozen list sweeps the wrong coins within weeks.

### Price precision

Crypto spans several orders of magnitude in one report — BTC in the tens of
thousands, XLM and DOGE in fractions of a cent. `src/social/money.js` centralises
formatting: two decimals at or above $1 (every equity, unchanged), and roughly five
significant digits below it. Without this, a coin's price, support and resistance all
round to the same two-decimal number and the invalidation line becomes meaningless.

Two follow-on fixes came with it, both of which also harden the stock path:

- the compliance value scan matched `\$[\d,]+\.\d{1,2}` — it silently **skipped**
  every value with more than two decimals, so a fabricated sub-dollar level would not
  have been caught. It now matches any precision, with the tolerance scaled to the
  number of decimals actually shown.
- Yahoo candles were rounded with `toFixed(2)`, which flattens a sub-cent coin's
  entire price history to `0`.

`"priceGrouping": true` in the crypto config renders BTC as `$79,611.00`. It is off
for stocks, which keeps their post formatting byte-identical.

### Queue isolation

Both sweeps append to the same audit log, so every draft is tagged with the queue
that produced it and each poster asks only for its own:

```bash
node src/cli/index.js social ready --queue crypto --json
node src/cli/index.js social ready --queue stocks --json
```

Records written before queues existed read as `stocks`. Passing no `--queue` returns
everything, as before. Without this the 9:35 stock poster would pick up any crypto
post still sitting in `ready_to_post`.

### Install

```bash
cp scripts/com.ramakrishna.tvcryptoreport.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ramakrishna.tvcryptoreport.plist
launchctl list | grep tvcryptoreport
```

Run it by hand at any time (the whole chain is idempotent — a second run only posts
what the first did not):

```bash
bash scripts/crypto-report.sh              # sweep + queue tonight's posts
bash scripts/crypto-social-auto.sh         # queue only, if a report already exists
```

## Content checklist (what every post must carry)

`tests/content-checklist.test.js` pins each post kind to the bar below and
fails naming the kind and the missing element. Run it with `npm run test:unit`.

| Element | Setup (sweep) | Follow-up | Scorecard | Explainer | Premarket |
|---|---|---|---|---|---|
| Hook (iconed first line) | `📈 $ETH has reclaimed…` | `✅ $ETH — BREAKOUT UPDATE.` | `📊 Weekly Setup Scorecard · …` | `📚 Chart Basics: …` | `🟢 Premarket read for … — BULLISH (confidence 74/100)` |
| Bias / status | reclaim confirmed · watch | lifecycle stage | counts + hit rate | bullish / bearish / neutral takeaways | bias + confidence |
| Concise reasoning | CMF/RSI line | result vs the setup price | hit rate = breakouts ÷ resolved | two definition lines | top 3 drivers |
| Plain-English context | `In plain terms: …` | `The lesson: …` on an invalidation | `How to read it: …` | the whole post | hook sentence |
| Key levels | 🎯 / 🛑 | level cleared / lost / tested, next level | — | — | SPY resistance / support |
| What changes the read | 🛑 … setup invalidated | 🛑 … negates the breakout | — | — | `Flip event: 8:30 AM ET Core CPI …` |
| Reply-driving CTA | `Which level gets hit first — … ? 👇` | level question | `Which setup did you follow this week? 👇` | topic question | `Bullish or bearish today? 👇` |
| Recurring format marker | series line | stage labels | weekly, Fridays | series name | daily, weekdays |
| Accountability | tracked to resolution | the outcome post itself | expiries shown, not hidden | — | — |
| Mobile-first | ≤ 14 lines, ≤ 150 chars per line, one thought per line | same | same | same | same |
| Hashtags | ≤ 2 (`#SYM #Stocks`) | ≤ 2 | ≤ 2 | ≤ 2 | ≤ 2 |
| Compliance | `validatePost` (kind-specific integrity checks), disclaimer on the card | same | same | same, no ticker | same + in-text disclaimer |

Cadence guards (also asserted): one setup per run per queue, Medium+ confidence
only, 20-hour symbol cooldown, no re-post while a setup is open in the tracker,
catalyst-flagged rows skipped, non-terminal follow-ups capped at
`followUps.maxUpdatesPerRun` (2) per run — BREAKOUT and INVALIDATED updates
always post because they are the accountability record.

## Premarket market-direction post

Weekdays ~8 AM ET the `premarket-market-direction` task builds the Daily Premarket Market Direction Report (`tv premarket`) and queues one post from it with `tv social premarket` (kind `premarket`, symbol `MKT`, stocks queue, card style `premarket`). Format, integrity checks and the flip-event rule are documented in [PREMARKET-REPORT.md](PREMARKET-REPORT.md#the-x-post).

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
- At the free 280-character limit the CTA, extra hashtags and narrative are
  trimmed in that order; with X Premium set `charLimit` higher to post the
  full version.

## Charts

Every post carries an annotated daily chart (`charts.enabled`): the last
`charts.bars` real candles (Yahoo Finance, cut at the report date), the
report's support / resistance / 20-day basis / report price, one annotation
naming the setup, the data timestamp, the price source and the disclosure —
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
```

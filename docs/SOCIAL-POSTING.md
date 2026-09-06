# Social Summary Table + X post generator

Turns a daily report (`docs/reports/daily-YYYY-MM-DD.html`) into a compact
setup table and compliance-gated X (Twitter) posts.

```
Report → Generate Draft → Compliance Validation → Preview/Edit → User Approval → Publish to X
```

Nothing auto-publishes. `publish` refuses anything that is not `approved`,
re-validates the frozen approved text, and only then calls the official X API.

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
| X character limit (weighted: emoji = 2, URLs = 23) | `char_limit` | 280 (`charLimit`; raise for X Premium — the rationale line is added automatically when it fits) |
| Prohibited / promotional wording | `prohibited_wording` | guaranteed, easy profit, you should buy, must buy, risk-free, … |
| Personalized advice | `personalized_advice` | "for your portfolio", "if you're retired", "buy it now", … |
| Missing / misplaced disclosure | `missing_disclosure` | `Educational market analysis only. Not investment advice. Trading involves risk.` |
| Stale report data | `stale_data` | `maxReportAgeHours: 24` — approve needs `--acknowledge-stale "<reason>"`, which is audited |
| Projections presented as fact | `unsupported_claim` | "will rally", "price target", "forecast", "% upside", … |
| Duplicate post | `duplicate_post` | same text, or same ticker + report already approved/published |
| Missing indicators | `missing_indicator` | Price, RSI, CMF, and a support or resistance level |
| Wrong ticker / price / level | `ticker_mismatch`, `price_mismatch`, `value_mismatch` | every `$` value must be a level from the report row |
| Signal upgraded for engagement | `signal_upgraded` | WATCH may not be labelled confirmed |
| No downside context | `missing_risk_context` | a `Risk:` sentence is required |
| No data timestamp | `missing_timestamp` | `Data: <Mon D, YYYY h:mm AM ET>` required |

## Audit trail

`docs/social/audit.jsonl` is append-only; each line is a full snapshot of a
draft, so the file is the complete history (`show --history`). A record holds
the original generated text, the edited text, the report date and data
timestamp, the last validation issues, the stale acknowledgement (who/why/when),
the approval (who/when/text hash), and the publication (when, X post id, URL,
method `x-api` or `manual`).

## X API credentials

Only from the environment — never in files in this repo:

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

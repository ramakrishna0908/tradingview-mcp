# X Engagement Agent log (@DailySetupSweep)

Runs weekdays at 11:30 AM, 1:30 PM and 3:00 PM ET (scheduled task `x-engagement-agent`).

- `accounts.json` — core target accounts + discovered candidates, with the newest post timestamp seen per account.
- `replies.jsonl` — one line per reply we posted: `{at, handle, originalPostUrl, originalPostSummary, target, replyUrl, replyText, valueAdded, topic, metrics: [{at, impressions, likes, replies, profileVisits, follows}]}`.
  - `target` = the ORIGINAL post's state at the moment we replied: `{views, likes, replies, postedAt, ageMinAtReply, viewsPerMin}`. Added 2026-09-19; lines before that date have no `target` and are excluded from capture-rate analysis. It cannot be backfilled — the counts keep climbing after we reply — so an unreadable count is logged as `null`, never guessed. Same field names as the crypto ledger `logs/growth/gamesol404-ledger.jsonl`.
  - Capture rate = our `metrics[].impressions` ÷ `target.views`. This is the measure to judge a reply by; raw impressions mostly track how big the creator is. Read it with `node scripts/engagement-reply-stats.cjs`.
- `runs.jsonl` — one line per run: `{at, checked: [...], candidatesConsidered, repliesPosted, skippedReason}`.

Rules of the road: replies must add a technical observation, level, risk consideration, alternate read, or useful question the original did not contain; never generic praise; no buy/sell/guaranteed-return language (see `config/social-compliance.json` prohibitedPhrases); fact-check tickers/levels before posting; max 2–4 replies per run; do not pile onto one creator.

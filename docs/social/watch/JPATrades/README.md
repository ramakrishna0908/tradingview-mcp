# @JPATrades watch log

Scheduled task `watch-jpatrades-recommendations` runs 3x daily (8:30 AM, 12:15 PM, 5:30 PM ET, every day) and READS ONLY — it never posts, replies, likes or follows.

- `state.json` — `{ lastCheckedAt, seenPostIds: [...] }` — newest post timestamp seen and every post ID already processed (dedup).
- `posts.jsonl` — one line per new post seen: `{ at, postUrl, postId, postedAt, text, hasRecommendation, tickers, direction, levels }`.
- `alerts.jsonl` — one line per recommendation alert: `{ at, postUrl, postedAt, tickers, summary, analysis: { ticker, last, chg, sma20, sma50, sma200, rsi14, volVsAvg, hi52, lo52, take } }`.
- `runs.jsonl` — one line per run: `{ at, run, postsSeen, newPosts, alerts, errors }`.
- `alerts/YYYY-MM-DD.md` — human-readable alert reports per day (appended per run).

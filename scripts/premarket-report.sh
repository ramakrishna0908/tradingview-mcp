#!/bin/bash
# Daily Premarket Market Direction Report (weekdays, before the U.S. open).
#
# Data job — no TradingView: futures, VIX, yields, dollar, crude, sector ETFs,
# key levels, the U.S. economic calendar and the day's notable earnings, scored
# into a Bullish / Neutral / Bearish bias with a confidence score. Writes
# docs/reports/premarket/premarket-<date>.{json,md,html} and opens the HTML.
# Manual test:  bash scripts/premarket-report.sh
#
# Overnight headlines need a web search, so they arrive in a second pass: the
# report is built once without them, a headless Claude run writes
# news-<date>.json, and the report is re-rendered with --news before it is
# published. That pass is context only — bias.js excludes type "news" from the
# pre-open scoring — so it never changes the bias or the confidence, it only
# fills the headline section. Every failure path in it is swallowed: a missing
# or unparseable news file leaves the first-pass report standing and the job
# publishes that.
#
#   PREMARKET_NO_NEWS=1         skip the headline pass
#   PREMARKET_NO_OPEN=1         do not open the HTML at the end
#   PREMARKET_NEWS_TIMEOUT=420  seconds before the headline pass is killed

set -u
export PATH="/Users/ramakrishna0908/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp"
CLAUDE="/Users/ramakrishna0908/.local/bin/claude"
NODE="/usr/local/bin/node"
DATE="${1:-$(TZ=America/New_York date +%F)}"
OUT_DIR="$REPO/docs/reports/premarket"
LOG="$OUT_DIR/run-$DATE.log"
NEWS_FILE="$OUT_DIR/news-$DATE.json"
NEWS_TIMEOUT="${PREMARKET_NEWS_TIMEOUT:-420}"

mkdir -p "$OUT_DIR"
cd "$REPO" || exit 1

# Weekend guard (launchd already restricts to Mon–Fri). Holidays are handled
# inside the report: it says the market is closed and reads the next session.
[ "$(TZ=America/New_York date +%u)" -gt 5 ] && exit 0

# ─── headline pass ───────────────────────────────────────────────────────────
# Sets NEWS_OK=1 when $NEWS_FILE is present and usable. Never returns failure:
# the caller publishes with or without it.
collect_news() {
  local partial="$NEWS_FILE.partial" prompt pid watchdog rc count
  NEWS_OK=""
  rm -f "$partial"

  read -r -d '' prompt <<PROMPT
You are the overnight-headlines step of an AUTOMATED premarket report for the
US session of $DATE. No human is watching. Keep chat text to an absolute minimum.

Search the web for the market-moving headlines of the last 18 hours — overnight
Asia and Europe, US futures moves, and anything that broke after yesterday's
close. Judge them by what actually moves US equities at the open: monetary
policy and central bank speak, inflation and growth data, geopolitics and
tariffs, energy supply, big-cap guidance or M&A, and credit or funding stress.

The report already computes futures, VIX, Treasury yields, the dollar, crude,
sector ETFs, the US economic calendar and today's earnings list from live data.
Do NOT restate those numbers. Supply only the NARRATIVE behind them: the events
a reader needs to know to make sense of the move.

Write ONLY this file — valid JSON, UTF-8, no markdown fence, no commentary:

  $partial

Shape:

{
  "source": "web search (automated premarket pass)",
  "items": [
    {
      "headline": "one sentence, factual, no ticker spam, AT MOST 180 characters",
      "source": "the outlet that reported it, e.g. Reuters",
      "impact": "High" | "Medium" | "Low",
      "note": "one or two sentences of why it matters for today's US session",
      "flip": "the development that would reverse this story's effect",
      "time": "overnight"
    }
  ]
}

Rules:
- 4 to 8 items, ordered High impact first. Fewer is fine on a quiet night; an
  empty items array is a valid answer if genuinely nothing moved.
- Keep "headline" under 180 characters — it is a headline, not a paragraph.
  Put the detail in "note", which has room for it. The publishing schema hard
  caps a headline at 240 characters and rejects the whole report above that.
- Every headline must be something you actually found. Never invent a story, a
  number, a quotation or an outlet. If a detail is unclear, leave it out.
- Attribute each item to the outlet that reported it.
- "flip" is what would invalidate the read, not a restatement of the headline.
- Nothing older than yesterday's US close unless it broke overnight.
- Write the file, then stop. Do not edit any other file, do not run git, do not
  touch the report itself — a later step folds this in.
PROMPT

  echo "$(date): collecting overnight headlines (timeout ${NEWS_TIMEOUT}s)" >> "$LOG"

  # No timeout(1) on macOS, so run the pass in the background behind a watchdog.
  # A headline search that hangs must never hold up the publish.
  "$CLAUDE" -p "$prompt" --dangerously-skip-permissions >> "$LOG" 2>&1 &
  pid=$!
  ( sleep "$NEWS_TIMEOUT"; kill -TERM "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  watchdog=$!
  wait "$pid"; rc=$?
  kill "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null

  if [ "$rc" -ne 0 ]; then
    echo "$(date): headline pass exited $rc (timeout or error) — publishing without headlines" >> "$LOG"
    rm -f "$partial"
    return 0
  fi

  # Validate before it can reach the report: a truncated or empty write must not
  # replace a good news file from an earlier run of the same day.
  # Normalise in place: drop headline-less items and enforce the 240-character
  # title cap that AssetDecoded's schema applies, trimming at a word boundary.
  # Without this a single long headline 422s the whole publish.
  count="$("$NODE" -e '
    const fs = require("fs");
    const path = process.argv[1];
    const raw = JSON.parse(fs.readFileSync(path, "utf8"));
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);
    const CAP = 240;
    const clip = (s) => {
      const t = String(s).replace(/\s+/g, " ").trim();
      if (t.length <= CAP) return t;
      const cut = t.slice(0, CAP - 1);
      const space = cut.lastIndexOf(" ");
      return (space > CAP * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "") + "\u2026";
    };
    const good = items
      .filter((n) => n && typeof n.headline === "string" && n.headline.trim())
      .map((n) => ({ ...n, headline: clip(n.headline) }));
    fs.writeFileSync(path, JSON.stringify({ source: raw.source ?? "web search (automated premarket pass)", items: good }, null, 2));
    process.stdout.write(String(good.length));
  ' "$partial" 2>>"$LOG")" || count=""

  if [ -z "$count" ] || [ "$count" -eq 0 ] 2>/dev/null; then
    echo "$(date): headline pass produced no usable items — publishing without headlines" >> "$LOG"
    rm -f "$partial"
    return 0
  fi

  mv "$partial" "$NEWS_FILE"
  echo "$(date): $count headlines -> $NEWS_FILE" >> "$LOG"
  NEWS_OK=1
  return 0
}

echo "=== $(date) premarket report for $DATE ===" >> "$LOG"
if "$NODE" "$REPO/src/cli/index.js" premarket --date "$DATE" --out "$OUT_DIR" >> "$LOG" 2>&1; then
  REPORT="$OUT_DIR/premarket-$DATE.html"
  echo "$(date): report ready -> $REPORT" >> "$LOG"

  # Second pass: headlines, then re-render the same day with them folded in.
  NEWS_OK=""
  [ -z "${PREMARKET_NO_NEWS:-}" ] && collect_news
  if [ -n "$NEWS_OK" ]; then
    if "$NODE" "$REPO/src/cli/index.js" premarket --date "$DATE" --news "$NEWS_FILE" --out "$OUT_DIR" >> "$LOG" 2>&1; then
      echo "$(date): re-rendered $DATE with headlines" >> "$LOG"
    else
      # The first-pass files are still on disk and still correct.
      echo "$(date): re-render with headlines FAILED — publishing the headline-free report" >> "$LOG"
    fi
  fi

  # Publish the SAME model the HTML was rendered from to AssetDecoded. This is
  # deliberately a separate step after the files are written: a publish failure
  # (site down, secret rotated, network) leaves the local report untouched and
  # exits non-zero only for this step, which is logged and then swallowed.
  # Re-run by hand with:  node src/cli/index.js publish --type premarket --date <DATE>
  if "$NODE" "$REPO/src/cli/index.js" publish --type premarket --date "$DATE" >> "$LOG" 2>&1; then
    echo "$(date): published premarket $DATE to AssetDecoded" >> "$LOG"
  else
    echo "$(date): publish FAILED for premarket $DATE (report itself is fine)" >> "$LOG"
  fi

  [ -z "${PREMARKET_NO_OPEN:-}" ] && /usr/bin/open "$REPORT"
else
  echo "$(date): FAILED — see above" >> "$LOG"
  exit 1
fi

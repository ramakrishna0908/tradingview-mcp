#!/bin/bash
# Daily Premarket Market Direction Report (weekdays, before the U.S. open).
#
# Pure data job — no TradingView, no Claude: futures, VIX, yields, dollar,
# crude, sector ETFs, key levels, the U.S. economic calendar and the day's
# notable earnings, scored into a Bullish / Neutral / Bearish bias with a
# confidence score. Writes docs/reports/premarket/premarket-<date>.{json,md,html}
# and opens the HTML. Manual test:  bash scripts/premarket-report.sh
#
# Overnight headlines are NOT fetched here (they need a web search); the
# Claude desktop task "premarket-market-direction" adds them by re-running
# `tv premarket --news <file>` after this job.

set -u
export PATH="/Users/ramakrishna0908/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp"
DATE="${1:-$(TZ=America/New_York date +%F)}"
OUT_DIR="$REPO/docs/reports/premarket"
LOG="$OUT_DIR/run-$DATE.log"

mkdir -p "$OUT_DIR"
cd "$REPO" || exit 1

# Weekend guard (launchd already restricts to Mon–Fri). Holidays are handled
# inside the report: it says the market is closed and reads the next session.
[ "$(TZ=America/New_York date +%u)" -gt 5 ] && exit 0

echo "=== $(date) premarket report for $DATE ===" >> "$LOG"
if /usr/local/bin/node "$REPO/src/cli/index.js" premarket --date "$DATE" >> "$LOG" 2>&1; then
  REPORT="$OUT_DIR/premarket-$DATE.html"
  echo "$(date): report ready -> $REPORT" >> "$LOG"
  [ -z "${PREMARKET_NO_OPEN:-}" ] && /usr/bin/open "$REPORT"
else
  echo "$(date): FAILED — see above" >> "$LOG"
  exit 1
fi

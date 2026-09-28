#!/bin/bash
# Decision-support Daily Market Report (weekdays, 10:10 AM ET).
#
# One run per trading day, deliberately after the opening range has completed.
# At 9:35 there is barely one 15-minute candle, so nothing could legitimately
# be CONFIRMED; by 10:10 the 09:30-10:00 range is closed, two 15m candles have
# printed and VWAP means something.
#
# Pure data job: Yahoo for bars, Cboe for option chains. No TradingView, no
# browser, no LLM. Manual test:  bash scripts/desk-report.sh
#
#   DESK_NO_PUBLISH=1   generate without posting to AssetDecoded
#   DESK_LIMIT=8        smaller universe for a quick check

set -u
export PATH="/Users/ramakrishna0908/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp"
NODE="/usr/local/bin/node"
DATE="${1:-$(TZ=America/New_York date +%F)}"
OUT_DIR="$REPO/docs/reports/desk"
LOG="$OUT_DIR/run-$DATE.log"

mkdir -p "$OUT_DIR"
cd "$REPO" || exit 1

# Weekend guard; launchd already restricts to Mon-Fri.
[ "$(TZ=America/New_York date +%u)" -gt 5 ] && exit 0

ARGS=(desk --date "$DATE")
[ -n "${DESK_LIMIT:-}" ] && ARGS+=(--limit "$DESK_LIMIT")
[ -z "${DESK_NO_PUBLISH:-}" ] && ARGS+=(--publish)

echo "=== $(date) desk report for $DATE ===" >> "$LOG"
if "$NODE" "$REPO/src/cli/index.js" "${ARGS[@]}" >> "$LOG" 2>&1; then
  echo "$(date): desk report complete for $DATE" >> "$LOG"
else
  rc=$?
  # Exit 3 means the analysis ran and only the post failed — the model is on
  # disk and can be republished by hand without re-running the whole funnel.
  if [ "$rc" -eq 3 ]; then
    echo "$(date): desk report built but PUBLISH FAILED ($rc) — retry with: node src/cli/index.js desk --publish" >> "$LOG"
  else
    echo "$(date): desk report FAILED ($rc) — see above" >> "$LOG"
  fi
  exit "$rc"
fi

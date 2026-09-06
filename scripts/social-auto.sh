#!/bin/bash
# Policy-gated X auto-publish for today's daily report.
# Called by daily-report.sh as soon as the report is written, and again by the
# com.ramakrishna.tvsocialauto launchd job as a fallback (10:10 ET weekdays).
# Both runs are safe: every post is de-duplicated per ticker + report in the
# audit log, so a re-run only publishes what the first run did not.
#
# Credentials + kill switch live in $REPO/.env.social (gitignored, chmod 600):
#   X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET
#   SOCIAL_AUTO_PUBLISH=0   -> block all unattended posting
set -u
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp"
DATE="${1:-$(date +%F)}"
REPORT="$REPO/docs/reports/daily-$DATE.html"
LOG="$REPO/docs/reports/social-$DATE.log"
cd "$REPO" || exit 1
[ "$(date +%u)" -gt 5 ] && exit 0
if [ ! -f "$REPORT" ]; then
  echo "$(date): no report at $REPORT — nothing to post" >> "$LOG"
  exit 0
fi
if [ -f "$REPO/.env.social" ]; then
  set -a; . "$REPO/.env.social"; set +a
fi
echo "=== $(date) social auto-publish for $DATE ===" >> "$LOG"
/usr/local/bin/node "$REPO/src/cli/index.js" social auto --report "$REPORT" >> "$LOG" 2>&1
echo "$(date): social auto-publish exited $?" >> "$LOG"

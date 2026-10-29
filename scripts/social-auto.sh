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
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
# Chart renderer interpreter. The PATH above is deliberately minimal for launchd,
# which makes `python3` resolve to /usr/bin/python3 — and that interpreter has no
# Pillow, so every chart fails with "No module named 'PIL'". Under the sweep
# policy the chart carries the only disclaimer and is required, so without this
# every post would be blocked (audited as missing_chart) rather than published.
# Pick the first interpreter that can actually import PIL.
if [ -z "${SOCIAL_PYTHON:-}" ]; then
  for _py in \
    "$HOME/.pyenv/shims/python3" \
    /opt/homebrew/bin/python3 \
    /usr/local/bin/python3 \
    /usr/bin/python3
  do
    if [ -x "$_py" ] && "$_py" -c 'import PIL' >/dev/null 2>&1; then
      export SOCIAL_PYTHON="$_py"
      break
    fi
  done
fi
if [ -z "${SOCIAL_PYTHON:-}" ]; then
  echo "$(date): WARNING — no python3 with Pillow found; charts will fail and every post will be blocked (missing_chart)" >> "$LOG"
else
  echo "$(date): chart renderer python: $SOCIAL_PYTHON" >> "$LOG"
fi

echo "=== $(date) social auto-publish for $DATE ===" >> "$LOG"
/usr/local/bin/node "$REPO/src/cli/index.js" social auto --report "$REPORT" >> "$LOG" 2>&1
echo "$(date): social auto-publish exited $?" >> "$LOG"

# Lifecycle follow-ups. Walks every open setup in this queue: graduates a
# DEVELOPING one the new report now confirms, and detects breakouts /
# invalidations / level tests on the daily closes since each post. Each event
# is queued through the same approval path as the daily setup, so the poster
# picks them up in the same run. Expiries close quietly.
/usr/local/bin/node "$REPO/src/cli/index.js" social track --report "$REPORT" >> "$LOG" 2>&1
echo "$(date): lifecycle track exited $?" >> "$LOG"

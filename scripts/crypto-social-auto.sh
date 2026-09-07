#!/bin/bash
# Policy-gated X auto-publish for tonight's CRYPTO report.
#
# Called by crypto-report.sh as soon as the report is written, and safe to
# re-run: every post is de-duplicated per coin + report in the audit log, so a
# second run only publishes what the first did not.
#
# Differences from scripts/social-auto.sh (the stock one):
#   - no weekday guard: crypto trades 24/7, Saturday is a real session
#   - SOCIAL_COMPLIANCE_CONFIG points at the crypto policy, which sets
#     marketCalendar=24x7 so auto-publish does not refuse on weekends/holidays
#   - drafts are tagged queue=crypto, so the crypto poster and the stock poster
#     can never pick up each other's approved posts
#
# Credentials + kill switch live in $REPO/.env.social (gitignored, chmod 600):
#   SOCIAL_AUTO_PUBLISH=0   -> block all unattended posting
set -u
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp"
DATE="${1:-$(date +%F)}"
REPORT="$REPO/docs/reports/crypto/daily-$DATE.html"
LOG="$REPO/docs/reports/crypto/social-$DATE.log"
cd "$REPO" || exit 1

mkdir -p "$(dirname "$LOG")"

if [ ! -f "$REPORT" ]; then
  echo "$(date): no crypto report at $REPORT — nothing to post" >> "$LOG"
  exit 0
fi
if [ -f "$REPO/.env.social" ]; then
  set -a; . "$REPO/.env.social"; set +a
fi

export SOCIAL_COMPLIANCE_CONFIG="$REPO/config/social-compliance-crypto.json"

# Chart renderer interpreter. The PATH above is deliberately minimal for launchd,
# which makes `python3` resolve to /usr/bin/python3 — and that interpreter has no
# Pillow, so every chart fails with "No module named 'PIL'" and the posts silently
# go out text-only. Pick the first interpreter that can actually import PIL.
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
  echo "$(date): WARNING — no python3 with Pillow found; charts will fail and posts go out text-only" >> "$LOG"
else
  echo "$(date): chart renderer python: $SOCIAL_PYTHON" >> "$LOG"
fi

echo "=== $(date) crypto social auto-publish for $DATE ===" >> "$LOG"
/usr/local/bin/node "$REPO/src/cli/index.js" social auto --report "$REPORT" >> "$LOG" 2>&1
echo "$(date): crypto social auto-publish exited $?" >> "$LOG"

# Lifecycle follow-ups. Walks every open setup in this queue: graduates a
# DEVELOPING one the new report now confirms, and detects breakouts /
# invalidations / level tests on the daily closes since each post. Each event
# is queued through the same approval path as the daily setup, so the poster
# picks them up in the same run. Expiries close quietly.
/usr/local/bin/node "$REPO/src/cli/index.js" social track --report "$REPORT" >> "$LOG" 2>&1
echo "$(date): lifecycle track exited $?" >> "$LOG"

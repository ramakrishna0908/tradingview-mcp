#!/bin/bash
# Daily TradingView stock-summary report.
# Invoked by launchd on weekdays at 9:35 AM ET. Runs the full sweep headless
# via Claude Code, writes a self-contained HTML report, and opens it in the
# default browser. Manual test:  bash scripts/daily-report.sh
#
# HARD DEPENDENCY: TradingView Desktop must be running with CDP on port 9222
# at run time (the script attempts a launch if it's not, but a cold launch may
# not be ready in time). The Mac must be awake/logged-in for `open` to work.

set -u

# launchd runs with a minimal environment — set PATH explicitly.
export PATH="/Users/ramakrishna0908/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp"
CLAUDE="/Users/ramakrishna0908/.local/bin/claude"
DATE="$(date +%F)"
REPORT_DIR="$REPO/docs/reports"
REPORT="$REPORT_DIR/daily-$DATE.html"
LOG="$REPORT_DIR/run-$DATE.log"

mkdir -p "$REPORT_DIR"
cd "$REPO" || exit 1

# Defensive weekend guard (launchd already restricts to Mon-Fri).
[ "$(date +%u)" -gt 5 ] && exit 0

echo "=== $(date) starting daily report ===" >> "$LOG"

# Prior-session CMF, so the report can show the flow TREND (the leading tell)
# rather than a memory-less daily snapshot. Empty on first run / unparseable dir.
PRIOR_CMF="$(python3 "$REPO/scripts/prior-cmf.py" "$REPORT_DIR" "$DATE" 2 2>/dev/null)"
[ -z "$PRIOR_CMF" ] && PRIOR_CMF="(no prior report found - omit the CMF trend column this run)"

read -r -d '' PROMPT <<EOF
You are running the AUTOMATED DAILY STOCK REPORT (headless, no human watching).
Follow CLAUDE.md and the memory files. Keep any chat text to an absolute minimum.

1) Ensure TradingView is connected: call tv_health_check. If it fails, call
   tv_launch, wait, and re-check. If still unreachable after a retry, write a
   short HTML error page to $REPORT saying "TradingView not reachable" and stop.
2) Collapse to a single chart (pane_set_layout s) and set timeframe D.
3) Sweep ALL names SEQUENTIALLY (chart_set_symbol -> quote_get + data_get_study_values):
   MAIN(33): QQQ IWM SMH SNDK AMD GOOGL AAPL MSFT NVDA TSLA AMZN META HOOD MSTR
   NFLX PLTR COIN MRVL CRWV BMNR ORCL BABA DELL LUNR MU SPCX ARM INTC NBIS AVGO
   UNH HIMS SNOW
   ANNESS(9): ACN LLY ISRG CRCL SOFI MCD SOUN APLD IREN
   DEFENSE(10): LMT RTX NOC GD BA LHX TDG HII LDOS AXON
   MACRO(1): USO  <- crude ETF, NOT a defense name. Swept as the cross-check on any
   geopolitical read: oil must move WITH a conflict narrative, so if a headline says
   de-escalation while USO rips (or vice versa), the narrative is stale - say so.
   Score each: RSI(>60 +1/>50 +0.5/<50 -0.5/<40 -1) + BB-basis(above +1/below -1)
   + CMF(>0.1 +0.5/<-0.1 -0.5). Infer HH/LL structure (HH-up / LL-down / Rng / diverge).
3b) CMF TREND. Prior sessions' CMF per symbol (oldest -> newest) is below. For each
   name compute the delta from the OLDEST listed value to today's reading, and
   classify: improving (>= +0.06), flat (between), deteriorating (<= -0.06).
   The methodology treats the *trend* of CMF as the leading tell and the score as
   only a snapshot, so apply this GATE to the cohort summary:
     - A name scoring >= +2.0 whose CMF is DETERIORATING is demoted from Calls to
       Watches, labelled "flow fading", with the delta quoted.
     - A name scoring <= -2.0 whose CMF is IMPROVING or flat-at-a-floor is removed
       from Puts and listed as a Watch ("seller exhaustion - do not chase short").
     - A name whose CMF crossed from positive to negative over the window is
       called out as a FRESH flow breakdown (highest-quality short thesis).
   If a symbol has no prior value, print "n/a" and do not gate it.
PRIOR CMF DATA:
$PRIOR_CMF
4) Write ONE self-contained HTML file to EXACTLY this path: $REPORT
   Requirements: inline CSS only, dark-theme friendly, mobile-safe (table scrolls
   horizontally in its own container). Include: (a) header with the date "$DATE";
   (b) a one-paragraph market theme; (c) a table SORTED BY SCORE desc with columns
   Sym, Px, RSI/MA, CMF, CMF Trend, ATR, BB L/Basis/Up, VWAP, Cloud A/B, Pos, HH/LL,
   Score, Bias-Next. The "CMF Trend" cell shows the signed delta and an arrow
   (up improving / down deteriorating / dash flat), e.g. "-0.15 v" or "+0.07 ^";
   tint it red when deteriorating and green when improving.
   Color Score green(>0)/red(<0)/grey(0) and tint HH-up green / LL-down red;
   (d) a short cohort summary below (Calls / Puts / Watches), applying the 3b gate -
   state explicitly which names were demoted or removed by the flow trend and why;
   (e) a one-line "flow breadth" stat: how many names are deteriorating vs improving;
   (f) a SEPARATE "Defense & Aerospace" section after the main table - its own table with
   the same columns for the DEFENSE(10) names, its own Calls/Puts/Watches read, and the
   MACRO row (USO) rendered inside it but visually marked as a non-constituent
   cross-check, not a sector pick. Keep defense names OUT of the main table and out of
   the main cohort summary so the two do not blur. Tracker file: defense-stocks.md
   (read it for the standing sector read; do NOT edit it).
   Flag any known catalyst (e.g. the META trial) per the flag-catalysts memory.
3c) EARNINGS ALERT (do this for EVERY name swept - main, Anness and defense).
   Check which names report TODAY (before open or after close) or within the next
   2 sessions. Standing user rule: ALWAYS surface same-day earnings prominently.
   Render a banner as the FIRST element of the report body, above the market theme:
     - Title it "EARNINGS TODAY" and list each name with its ticker, the session
       (BMO / AMC), and the consensus if you have it. If none, print one line:
       "No watchlist names report today." - never omit the banner entirely.
     - Add a second line for "Next 2 sessions" with any upcoming names + dates.
   A name reporting today or within 2 sessions is NEVER a Call or a Put - list it
   as a Watch with the date, and say plainly that its technical read is
   pre-news and will be invalidated by the gap.
   ⚠️ A name that reported AFTER yesterday's close has a STALE daily bar: say so
   explicitly rather than scoring it as if the chart were current.
5) Do NOT git commit. Do NOT update analysisstocks.md or anness-recommendations.md
   (this is a read-only report). When the HTML file exists at $REPORT, stop.
EOF

# --dangerously-skip-permissions so the unattended run can call MCP tools and
# write the report without an interactive permission prompt (own machine/repo).
"$CLAUDE" -p "$PROMPT" --dangerously-skip-permissions >> "$LOG" 2>&1

if [ -f "$REPORT" ]; then
  echo "$(date): report ready -> $REPORT" >> "$LOG"
  /usr/bin/open "$REPORT"

  # Social auto-publish (policy-gated, see config/social-compliance.json →
  # posting.autoPublish and docs/SOCIAL-POSTING.md). X API credentials are read
  # from $REPO/.env.social (gitignored, chmod 600) because launchd has no env.
  # Set SOCIAL_AUTO_PUBLISH=0 in that file to stop posting without editing code.
  if [ -f "$REPO/.env.social" ]; then
    set -a; . "$REPO/.env.social"; set +a
  fi
  echo "$(date): social auto-publish starting" >> "$LOG"
  /usr/local/bin/node "$REPO/src/cli/index.js" social auto --report "$REPORT" >> "$LOG" 2>&1 \
    || echo "$(date): social auto-publish exited $?" >> "$LOG"
else
  echo "$(date): FAILED — no report generated. Opening log." >> "$LOG"
  /usr/bin/open "$LOG"
fi

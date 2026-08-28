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

read -r -d '' PROMPT <<EOF
You are running the AUTOMATED DAILY STOCK REPORT (headless, no human watching).
Follow CLAUDE.md and the memory files. Keep any chat text to an absolute minimum.

1) Ensure TradingView is connected: call tv_health_check. If it fails, call
   tv_launch, wait, and re-check. If still unreachable after a retry, write a
   short HTML error page to $REPORT saying "TradingView not reachable" and stop.
2) Collapse to a single chart (pane_set_layout s) and set timeframe D.
3) Sweep ALL names SEQUENTIALLY (chart_set_symbol -> quote_get + data_get_study_values):
   MAIN(32): QQQ IWM SMH SNDK AMD GOOGL AAPL MSFT NVDA TSLA AMZN META HOOD MSTR
   NFLX PLTR COIN MRVL CRWV BMNR ORCL BABA DELL LUNR MU SPCX ARM INTC NBIS AVGO
   UNH HIMS
   ANNESS(9): ACN LLY ISRG CRCL SOFI MCD SOUN APLD IREN
   Score each: RSI(>60 +1/>50 +0.5/<50 -0.5/<40 -1) + BB-basis(above +1/below -1)
   + CMF(>0.1 +0.5/<-0.1 -0.5). Infer HH/LL structure (HH-up / LL-down / Rng / diverge).
4) Write ONE self-contained HTML file to EXACTLY this path: $REPORT
   Requirements: inline CSS only, dark-theme friendly, mobile-safe (table scrolls
   horizontally in its own container). Include: (a) header with the date "$DATE";
   (b) a one-paragraph market theme; (c) a table SORTED BY SCORE desc with columns
   Sym, Px, RSI/MA, CMF, ATR, BB L/Basis/Up, VWAP, Cloud A/B, Pos, HH/LL, Score, Bias-Next;
   color Score green(>0)/red(<0)/grey(0) and tint HH-up green / LL-down red;
   (d) a short cohort summary below (Calls / Puts / Watches). Flag any known
   catalyst (e.g. the META trial) per the flag-catalysts memory.
5) Do NOT git commit. Do NOT update analysisstocks.md or anness-recommendations.md
   (this is a read-only report). When the HTML file exists at $REPORT, stop.
EOF

# --dangerously-skip-permissions so the unattended run can call MCP tools and
# write the report without an interactive permission prompt (own machine/repo).
"$CLAUDE" -p "$PROMPT" --dangerously-skip-permissions >> "$LOG" 2>&1

if [ -f "$REPORT" ]; then
  echo "$(date): report ready -> $REPORT" >> "$LOG"
  /usr/bin/open "$REPORT"
else
  echo "$(date): FAILED — no report generated. Opening log." >> "$LOG"
  /usr/bin/open "$LOG"
fi

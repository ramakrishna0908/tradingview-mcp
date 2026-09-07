#!/bin/bash
# Nightly TradingView crypto-summary report (top 20 by market cap).
#
# Invoked by launchd EVERY day at 1:00 AM local time — crypto trades 24/7, so
# there is no weekend or exchange-holiday guard here (that is the whole reason
# this is a separate job from scripts/daily-report.sh).
#
# Reports live in docs/reports/crypto/ rather than alongside the stock reports
# so that prior-session CMF, the run log and the model cache for the two sweeps
# never read each other's files. Manual test:  bash scripts/crypto-report.sh
#
# HARD DEPENDENCY: TradingView Desktop running with CDP on port 9222.

set -u

# launchd runs with a minimal environment — set PATH explicitly.
export PATH="/Users/ramakrishna0908/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp"
CLAUDE="/Users/ramakrishna0908/.local/bin/claude"
DATE="${1:-$(date +%F)}"
REPORT_DIR="$REPO/docs/reports/crypto"
REPORT="$REPORT_DIR/daily-$DATE.html"
LOG="$REPORT_DIR/run-$DATE.log"

mkdir -p "$REPORT_DIR"
cd "$REPO" || exit 1

echo "=== $(date) starting crypto report ===" >> "$LOG"

# Universe is resolved live (CoinGecko, cached fallback) because the top 20 by
# market cap reshuffles constantly — a list frozen in the repo sweeps the wrong
# coins within weeks.
UNIVERSE="$(/usr/local/bin/node "$REPO/scripts/crypto-universe.js" --json 2>>"$LOG")"
if [ -z "$UNIVERSE" ]; then
  echo "$(date): FAILED — could not resolve the crypto universe" >> "$LOG"
  exit 1
fi
SYMBOL_LINES="$(printf '%s' "$UNIVERSE" | /usr/local/bin/node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=JSON.parse(s);
for (const c of u.universe) console.log(`  ${String(c.rank).padStart(2)}. ${c.symbol.padEnd(6)} try TradingView symbols in order: ${c.tvCandidates.join(" | ")}   (${c.name})`);
console.log(`  RESERVES (use in rank order to replace any coin above that has no TradingView symbol): ${u.reserves.map(r=>r.symbol+" ["+r.tvCandidates.join(" | ")+"]").join("  ")}`);
if (u.stale) console.log(`  NOTE: this universe is CACHED from ${u.fetchedAt} (${u.staleReason}) — say so in the report footer.`);
})')"

# Prior-session CMF so the report can show the flow TREND rather than a
# memory-less snapshot. Reads only the crypto reports in this directory.
PRIOR_CMF="$(python3 "$REPO/scripts/prior-cmf.py" "$REPORT_DIR" "$DATE" 2 2>/dev/null)"
[ -z "$PRIOR_CMF" ] && PRIOR_CMF="(no prior crypto report found - omit the CMF trend column this run)"

read -r -d '' PROMPT <<EOF
You are running the AUTOMATED NIGHTLY CRYPTO REPORT (headless, no human watching).
Follow CLAUDE.md and the memory files. Keep any chat text to an absolute minimum.

1) Ensure TradingView is connected: call tv_health_check. If it fails, call
   tv_launch, wait, and re-check. If still unreachable after a retry, write a
   short HTML error page to $REPORT saying "TradingView not reachable" and stop.
2) Collapse to a single chart (pane_set_layout s) and set timeframe D.
3) Sweep these coins SEQUENTIALLY (chart_set_symbol -> quote_get + data_get_study_values).
   This is the TOP 20 BY MARKET CAP, resolved today from CoinGecko. For each coin try
   the TradingView symbols in the order given and use the first that loads a chart:
$SYMBOL_LINES
   If NONE of a coin's symbols resolve, skip it, pull the next RESERVE coin in rank
   order to keep the table at 20 names, and list every substitution in the footer.
   Score each: RSI(>60 +1/>50 +0.5/<50 -0.5/<40 -1) + BB-basis(above +1/below -1)
   + CMF(>0.1 +0.5/<-0.1 -0.5). Infer HH/LL structure (HH-up / LL-down / Rng / diverge).
   PRICE PRECISION MATTERS HERE: this universe spans about \$79,000 (BTC) down to
   fractions of a cent. Quote every price and level with enough decimals to be
   meaningful for that coin - 2 decimals above \$1, and about 5 significant digits
   below it (e.g. 0.19412, 0.091547). NEVER round a sub-dollar coin to 2 decimals;
   its support and resistance would collapse onto the same number.
3b) CMF TREND. Prior sessions' CMF per coin (oldest -> newest) is below. For each
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
   If a coin has no prior value, print "n/a" and do not gate it.
PRIOR CMF DATA:
$PRIOR_CMF
4) Write ONE self-contained HTML file to EXACTLY this path: $REPORT
   Requirements: inline CSS only, dark-theme friendly, mobile-safe (table scrolls
   horizontally in its own container). Include: (a) header with the date "$DATE"
   and the words "Crypto" and "24/7"; (b) a one-paragraph market theme covering
   BTC dominance and whether alts are following or diverging; (c) a table SORTED
   BY SCORE desc with columns
   Sym, Px, RSI/MA, CMF, CMF Trend, ATR, BB L/Basis/Up, VWAP, Cloud A/B, Pos, HH/LL,
   Score, Bias-Next. The "CMF Trend" cell shows the signed delta and an arrow
   (up improving / down deteriorating / dash flat), e.g. "-0.15 v" or "+0.07 ^";
   tint it red when deteriorating and green when improving.
   Color Score green(>0)/red(<0)/grey(0) and tint HH-up green / LL-down red;
   (d) a "Cohort Summary" section below the table with explicit Calls / Puts /
   Watches lists, applying the 3b gate - state which names were demoted or
   removed by the flow trend and why. USE THOSE EXACT WORDS "Cohort Summary",
   "Calls", "Puts", "Watches" as they are parsed downstream;
   (e) a one-line "flow breadth" stat: how many names are deteriorating vs improving.
4b) CATALYST BANNER (crypto has no earnings calendar; this replaces it). Render it
   as the FIRST element of the report body, above the market theme, titled
   "CATALYSTS". For each swept coin flag any KNOWN, DATED event in the next 3 days:
   large token unlock/vesting cliff, a scheduled network upgrade or hard fork,
   a halving, a mainnet migration, or an exchange delisting/maintenance window.
   If you do not have a reliable dated source for a coin, say nothing about it -
   do NOT speculate. If there are none, print exactly one line:
   "No dated catalysts identified for the swept names." - never omit the banner.
   A coin with a catalyst inside 3 days is NEVER a Call or a Put - list it as a
   Watch with the date and say its technical read is pre-event.
5) Do NOT git commit. Do NOT edit docs/research/analysiscrypto.md or any tracker
   (this is a read-only report). When the HTML file exists at $REPORT, stop.
EOF

# --dangerously-skip-permissions so the unattended run can call MCP tools and
# write the report without an interactive permission prompt (own machine/repo).
# This mirrors scripts/daily-report.sh, which uses the same flag for the same reason.
"$CLAUDE" -p "$PROMPT" --dangerously-skip-permissions >> "$LOG" 2>&1

if [ -f "$REPORT" ]; then
  echo "$(date): report ready -> $REPORT" >> "$LOG"
  # Deliberately NOT opening a browser window: this job runs at 1 AM.
  /bin/bash "$REPO/scripts/crypto-social-auto.sh" "$DATE" &
else
  echo "$(date): FAILED — no crypto report generated." >> "$LOG"
fi

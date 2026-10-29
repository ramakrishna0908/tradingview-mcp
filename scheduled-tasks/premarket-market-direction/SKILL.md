---
name: premarket-market-direction
description: Weekdays 8:00 AM ET — build the Daily Premarket Market Direction Report, add overnight headlines, queue the premarket X post and publish it from the connected Chrome.
---

# Premarket Market Direction (weekdays 8:00 AM ET)

Work in this repository. Run the CLI as `node src/cli/index.js` (alias `tv`).
Skip entirely on weekends and NYSE holidays: say so and stop.

1. Build the data report: `tv premarket --date <today ET>`. It writes
   `docs/reports/premarket/premarket-<date>.{json,md,html}`. The launchd job
   `com.ramakrishna.tvpremarket` usually ran it at 7:45; a second run is safe.
2. Search the wires for overnight headlines that move index futures (macro
   prints, Fed speakers, large-cap earnings, geopolitics). Write them to
   `docs/reports/premarket/news-<date>.json` in the shape the CLI expects, then
   re-run `tv premarket --date <date> --news docs/reports/premarket/news-<date>.json`.
3. Open the HTML report and sanity-check the bias, confidence and SPY levels.
4. Queue the post: `tv social premarket` (kind `premarket`, symbol `MKT`,
   stocks queue, card style `premarket`). Never edit the generated text.
5. Publish through the Chrome profile signed in as @ai_king0206 using the
   inline composer: paste the text, attach the card PNG, verify the text on
   screen matches the queued text exactly, then click Post.
6. Record the post: `tv social record <draftId> --post-id <xPostId>`.
7. Reply with a short summary: bias, confidence, the flip event, the post URL.

Rules: nothing outside the ready list is ever posted; if compliance blocks the
draft, report the issue and stop rather than rewording by hand.
See docs/PREMARKET-REPORT.md.

---
name: post-education-explainer
description: Every day 7:00 PM ET — post one technical-analysis explainer card (definition, three labelled examples, Bullish/Bearish/Neutral takeaway) from the 15-topic rotation.
---

# Post education explainer (every day 7:00 PM ET)

Work in this repository. CLI alias `tv` = `node src/cli/index.js`.

1. Queue the next topic: `tv social educate` (kind `education`, stocks queue).
   The rotation picks never-posted topics first, then the oldest. Use
   `tv social educate --list` to inspect it; `--topic <id>` forces one.
2. Read the queue: `tv social ready --queue stocks --json`, keep the
   `education` item (text + 1080×1350 card with the footer
   "Educational only. Not financial advice.").
3. In the Chrome signed in as @ai_king0206: paste the text exactly, attach the
   card, verify, Post.
4. Record: `tv social record <draftId> --post-id <xPostId>`.
5. Read the post's metrics from the browser and record them with
   `tv social metrics record <xPostId> ...`.
6. Reply with the topic and URL.

A cashtag anywhere blocks the post by design; never add one.
See docs/SOCIAL-POSTING.md, "Educational explainers".

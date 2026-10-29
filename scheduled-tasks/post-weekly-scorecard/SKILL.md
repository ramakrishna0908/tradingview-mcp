---
name: post-weekly-scorecard
description: Fridays after the close — settle the week's setups for both queues and post the Weekly Setup Scorecard card.
---

# Post weekly scorecard (Fridays 4:30 PM ET)

Work in this repository. CLI alias `tv` = `node src/cli/index.js`.
Skip if Friday was an NYSE holiday.

1. Settle outcomes: `tv social track --queue stocks` and
   `tv social track --queue crypto`.
2. Queue the scorecard: `tv social scorecard` (kind `scorecard`, stocks queue).
   Compliance re-derives every count from `docs/social/setups.jsonl` and
   blocks on a mismatch; if it blocks, report it and stop.
3. Read the queue: `tv social ready --queue stocks --json`, keep the
   `scorecard` item.
4. In the Chrome signed in as @ai_king0206: paste the text exactly, attach the
   scorecard card, verify, Post.
5. Record: `tv social record <draftId> --post-id <xPostId>`.
6. Reply with the hit rate line and the URL.

Never edit the numbers. One scorecard covers both queues.
See docs/SOCIAL-POSTING.md, "Weekly Setup Scorecard".

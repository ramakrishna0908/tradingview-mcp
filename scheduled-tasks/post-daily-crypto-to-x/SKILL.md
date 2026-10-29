---
name: post-daily-crypto-to-x
description: Every day 1:15 AM — post tonight's crypto Daily Setup Sweep (top-10 by market cap) from the 1:00 AM report through the connected Chrome.
---

# Post daily crypto setups to X (every day 1:15 AM)

Work in this repository. CLI alias `tv` = `node src/cli/index.js`.
Crypto trades 24/7: there is no weekend or holiday skip.

1. Prepare: `bash scripts/crypto-social-auto.sh` (queue only; the
   `com.ramakrishna.tvcryptoreport` launchd job wrote the report at 1:00 AM).
   If no report exists for today run `bash scripts/crypto-report.sh` first.
2. Read the queue: `tv social ready --queue crypto --json`. Post only what it
   lists: hero first, then `thread` replies under it.
3. In the Chrome signed in as @ai_king0206: paste each text exactly, attach the
   chart PNG, verify, Post (replies under the hero).
4. Record each: `tv social record <draftId> --post-id <xPostId>`; re-read the
   queue after the hero so replies resolve `replyTo.xPostId`.
5. Record metrics from the post pages with `tv social metrics record`.
6. Reply with coins posted and URLs.

Never edit text. Never touch the stocks queue.
See docs/SOCIAL-POSTING.md, "Crypto pipeline".

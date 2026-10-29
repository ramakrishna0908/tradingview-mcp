---
name: post-daily-setups-to-x
description: Weekdays ~11:00 AM ET — prepare today's Daily Setup Sweep posts from the 9:35 report and publish the hero plus thread replies through the connected Chrome.
---

# Post daily setups to X (weekdays ~11:00 AM ET)

Work in this repository. CLI alias `tv` = `node src/cli/index.js`.
Skip on weekends and NYSE holidays.

1. Rehearsal flag: if `docs/social/REHEARSE` exists, run
   `tv social rehearse --json`, compose one post with its chart in Chrome,
   stop before clicking Post, discard the draft, delete the flag, and finish.
2. Prepare: run `bash scripts/social-auto.sh`. In browser mode it policy-approves
   today's posts into `ready_to_post` and sends nothing. A re-run is safe
   (duplicates are refused per ticker + report).
3. Read the queue: `tv social ready --queue stocks --json`. Post only what it
   lists, in order: the hero first, then the `thread` replies under it.
4. For each item: open the composer in the Chrome signed in as @ai_king0206,
   paste the text exactly, attach the chart PNG, verify the on-screen text,
   click Post. For thread items reply under the hero's post.
5. Record each post immediately: `tv social record <draftId> --post-id <xPostId>`.
   After recording the hero, re-read the queue so replies resolve `replyTo.xPostId`.
6. Read impressions/likes from the posted pages and record them with
   `tv social metrics record <xPostId> --impressions N --likes N ...`.
7. Reply with a summary: tickers posted, post URLs, anything expired or blocked.

Never edit post text. Never post anything the ready list does not contain.
See docs/SOCIAL-POSTING.md.

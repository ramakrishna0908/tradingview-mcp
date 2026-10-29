---
name: post-close-check-to-x
description: Weekdays 3:50 PM ET — queue and post the close-check reply under today's hero setup post (price vs setup, session range, level status so far).
---

# Close check reply to X (weekdays 3:50 PM ET)

Work in this repository. CLI alias `tv` = `node src/cli/index.js`.
Skip on weekends and NYSE holidays, and skip if no setup was posted today.

1. Queue the reply: `tv social close-update` (kind `closeupdate`). It writes
   one reply per setup posted today: last price vs setup price, session range,
   and each level's status (`not reached` / `tagged intraday` /
   `trading through` / `intact`). It never settles a level; the text says so.
2. Read the queue: `tv social ready --queue stocks --json` and keep only
   `closeupdate` items.
3. In the Chrome signed in as @ai_king0206, open today's hero post, reply with
   the queued text exactly, verify, click Post.
4. Record: `tv social record <draftId> --post-id <xPostId>`.
5. Reply with a one-line summary and the reply URL.

Never edit the text. Once per setup per day.
See docs/SOCIAL-POSTING.md, "Close check".

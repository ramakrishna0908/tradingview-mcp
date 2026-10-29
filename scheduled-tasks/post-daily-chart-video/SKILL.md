---
name: post-daily-chart-video
description: Every day 12:30 PM — render today's Daily Technical Analysis Education Video (one non-repeating concept, 10–15 s, 9:16) and post it with its caption through the connected Chrome.
---

# Post daily chart education video (every day 12:30 PM)

Work in this repository. CLI alias `tv` = `node src/cli/index.js`.

1. Queue today's video: `tv social video` (kind `video`, symbol `EDU`, stocks
   queue). Output: `docs/social/videos/<date>/EDU-<topic>.mp4`. Use
   `tv social video --list` if you need to see the rotation.
2. Read the queue: `tv social ready --queue stocks --json`, keep the `video` item.
3. In the Chrome signed in as @ai_king0206, open the inline composer, paste the
   caption exactly (it ends "Save this • Follow for daily chart education"),
   upload the MP4, wait until X finishes processing, verify the text, Post.
4. Record: `tv social record <draftId> --post-id <xPostId>`.
5. Later in the same run read the view count from the post page and record it
   with `tv social metrics record <xPostId> --impressions N ...`.
6. Reply with the topic posted and the URL.

Never edit the caption. No ticker ever appears in an education post.
See docs/CHART-EDUCATION-VIDEO.md.

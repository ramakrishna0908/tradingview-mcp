# Daily Technical Analysis Education Video

One short, sound-off, mobile-first video a day for @DailySetupSweep ("Daily
Setup Sweep"): a non-repeating technical-analysis concept, drawn — not
recorded — from a spec, so every frame is brand-consistent and nothing in it
is market data. Renderer: `scripts/render-edu-video.py`; library, rotation,
post text and spec: `src/social/video.js`; queueing: `tv social video`.

```bash
node src/cli/index.js social video --list          # topics and when each last ran
node src/cli/index.js social video --dry-run --open # render + show text, queue nothing
node src/cli/index.js social video                 # queue today's video (ready_to_post)
node src/cli/index.js social video --topic rsi     # a specific topic
```

Output: `docs/social/videos/<date>/EDU-<topic>.mp4` — 1080×1920, 30 fps,
H.264 + silent AAC, ~13.6 s, ~0.5 MB. Rendering takes about 12 s on a laptop
(Pillow frames piped into ffmpeg — `FFMPEG` env, `ffmpeg` on PATH, or the
binary bundled with `pip install imageio-ffmpeg`).

## The format (inspired by the short chart-explainer reels on X)

| Phase | Seconds | On screen |
|---|---:|---|
| Hook | 1.6 | One bold statement ("Support is not a line. It is a zone."), brand chip, series chip |
| Chart | 7.4 | Title + series; the illustration draws itself in (candles / oscillator / line / price-vs-RSI), then levels, zones, arrows and labels appear at their `at` times; two captions under the chart |
| Takeaway | 3.0 | **WHAT IT MEANS** / **HOW TRADERS USE IT** card slides in under the finished chart |
| End | 1.6 | "Save this • Follow for daily chart education", brand chip, "Every weekday · one concept · one chart" |

"Educational only. Not financial advice." and the brand tagline are on every
frame. All text is large enough to read on a phone; nothing depends on audio.

## Topics (15, rotated, never repeating until every one has run)

support-resistance · bullish-engulfing · double-bottom · head-and-shoulders ·
trendlines · breakouts · fakeouts · rsi · cmf · volume-confirmation ·
bearish-divergence · market-structure · moving-averages · bollinger-squeeze ·
risk-reward

Each topic carries: `hook` (≤ 60 chars), 1–3 `captions` (≤ 90 chars), `means`,
`use`, a `question` (the reply CTA) and an `art` spec — the same 0–100
coordinate language the explainer cards use (`candles` with `highlight`,
`markers`, `zones`, `levels`, `labels`, `vols`; `osc` with bands/shade/zero
fill; `line` with `ma`, `band`, `trend`, `pointMarkers`; `divergence` with a
price panel and an RSI panel plus guide lines). Every animated element has an
`at` (fraction of the chart phase); data draws in over the first 55 %.

Rotation (`nextVideoTopic`): never-filmed topics first in library order, then
the one filmed longest ago. The video skips whatever concept the Tuesday /
Friday explainer card already posted that day.

## The post

```
🎬 Chart Education: Support & Resistance
Support is not a line. It is a zone.
What it means: a price area where buyers (support) or sellers (resistance) have shown up before.
How traders use it: mark the zone, then wait for the reaction at it — a bounce, or a daily close through it.
Do you mark zones or single lines? 👇
Save this • Follow for daily chart education
#TechnicalAnalysis #ChartEducation
```

Compliance runs as kind `video` (same rules as the explainer): no cashtag,
prohibited / promotional / forward-looking wording blocked, ≤ 2 hashtags,
and the video file is mandatory (`missing_chart`) because it carries the
footer. The record is `kind: "video"`, symbol `EDU`, id `<date>-VID-<topic>-…`,
and its `chart` field is the MP4 path the browser poster uploads. Config:
`video` in `config/social-compliance.json` (enabled, queue, hashtags, footer,
size, fps).

## Schedule

Claude desktop task `post-daily-chart-video`, every day 12:30 PM local:
queues with `tv social video`, uploads the MP4 through the inline composer in
the X-ChannelPilot Chrome (waits for X to finish processing before posting),
verifies the text, records with `tv social record`, then reads view counts
from the post pages. Requires the desktop app to be open.

## Tests

```bash
npm run test:video
```

Library shape and wording, rotation, post text and compliance for every
topic, the spec (10–15 s, 9:16, footer), `queueVideo` (one per day, rotation
advances after publication, explainer exclusion, crypto config refuses) and
a short real render (skipped when Pillow/ffmpeg are missing). The content
checklist (`tests/content-checklist.test.js`) covers the video kind too.

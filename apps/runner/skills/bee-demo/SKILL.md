---
name: bee-demo
description: Record a demo video of the bee session's feature by driving a REAL Chrome tab and recording it. Use when a PR or task needs "watch it work", not just code to read.
---

# bee-demo

A good demo video answers exactly one question: *the feature does what it
promised*. The video is a BYPRODUCT of a real run — never staged, never edited
together.

It records a real Chrome tab, driven by Playwright over CDP. Not Playwright's
own video track: that samples on its own clock and stops the instant the test
ends, so the last frame is whatever happened to be on screen — mid-scroll, for
instance. On 27/08 that shipped a demo whose final frame showed the section
*above* the destination page, while every assertion in the test was correct.

## Record it

`demo-record.sh` owns the fiddly parts (which Chrome can load the extension,
which URLs can be captured, the sandbox retry). Read its header before
working around anything it refuses — each refusal is a measurement.

```bash
D=~/.local/bee/bin/demo-record.sh          # installed by the runner

$D start http://127.0.0.1:3000 "$BEE_SESSION_DIR/evidence/demo-<feature>.webm"
$D cdp                                      # → the endpoint to drive
$D caption "the filter holds after reload"  # mark each milestone
$D stop
$D down                                     # always, even after a failure
```

Drive that same tab from a script, with `chromium.connectOverCDP(<cdp>)` from
`@playwright/test` (the bare `playwright` package is not installed):

```js
const { chromium } = require("@playwright/test");
const b = await chromium.connectOverCDP(cdp);
const page = b.contexts()[0].pages()[0];
```

**Settle before every beat.** After each navigation or click:
`await page.waitForLoadState("load")`, scroll to where the viewer should be
looking, then hold ~1.5s. Capture runs at roughly 2 frames a second, so a
state that exists for 300ms may leave no frame at all — and a state captured
mid-scroll leaves a frame that lies.

## Then verify the video, do not trust the log

`FRAMES: 32` and a file on disk say nothing about what is IN the video. On
27/08 a run reported 32 frames, produced a valid webm, and showed a page where
nothing ever happened, because the driving script had crashed. Extract frames
and LOOK:

```bash
FF=$(node -e "console.log(require('$HOME/.claude/skills/record-screen/scripts/node_modules/ffmpeg-static'))")
rm -rf /tmp/demo-frames && mkdir -p /tmp/demo-frames
"$FF" -y -i "$BEE_SESSION_DIR/evidence/demo-<feature>.webm" -vf fps=1 /tmp/demo-frames/f-%02d.png
```

Read the first, middle and last frame. If the flow is not visible in them, the
video is not evidence — fix and record again.

## Say that it is a time-lapse

`stop` prints something like:

```
SPEEDUP: 2.8x — 18.0s of real time shown in 6.4s
```

Put that line in the PR comment alongside the video path. The tool asks Chrome
for 5 captures a second and Chrome's quota allows about 2, while the encoder
still assumes 5 — so the video runs ~2.8× fast. It reads as *smooth*, not as
fast, which is exactly why a reviewer would take it for real time and read the
app as three times more responsive than it is.

## Never

- Stitch video from multiple runs, or record a run with red tests. Red means
  fix and record again from scratch.
- Ship a video you have not looked at.
- Commit videos into the repo — they live in `$BEE_SESSION_DIR/evidence/`.
- Record a screen with secrets (tokens, .env) in frame.
- Use a `data:` URL. The extension's host permissions do not cover that
  scheme, so it records nothing and says only that `activeTab` is missing.

## When a human must hold the mouse

Third-party logins, multi-tab flows, anything needing real hands: use the
`record-screen` skill directly on a desktop Chrome, with the extension loaded
once via `chrome://extensions` → Developer mode → Load unpacked. The agent
cannot do this on the bee machine — the `bee` user has no graphical session.

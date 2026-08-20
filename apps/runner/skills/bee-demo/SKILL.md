---
name: bee-demo
description: Record a demo video for the bee session's feature — Playwright records headless when the agent drives, or record-screen captures a real Chrome tab when the user drives on the PC. Use when a PR or task needs "watch it work", not just code to read.
---

# bee-demo

A good demo video answers exactly one question: *the feature does what it
promised*. The video is a BYPRODUCT of a real run — never staged, never
edited together.

## Two recording paths — pick by who holds the mouse

**A. Agent-driven (default, headless):** Playwright, under the discipline
of the `e2e-evidence-capture` skill:

1. Write ONE demo spec walking the feature's full user flow (not a unit
   test — a story: open page → act → see the result). Name the spec after
   the feature.
2. Run with the camera on:
   ```ts
   use: { video: { mode: "on", size: { width: 1280, height: 720 } } }
   ```
   The app must be running — if a preview is already up via `bee-preview`,
   point `baseURL` at it; otherwise start a dev server yourself.
3. **Keep only the video of a green run.** Red means fix and re-record
   from scratch.
4. Copy the video into the session's evidence dir and report the path:
   ```bash
   mkdir -p "$BEE_SESSION_DIR/evidence"
   cp test-results/**/video.webm "$BEE_SESSION_DIR/evidence/demo-<feature-name>.webm"
   ```
5. If a PR is open: comment the video's location on it (`gh pr comment`)
   so the reviewer knows where the evidence lives.

**B. User-driven (PC with a display):** use the `record-screen` skill
(records a real Chrome tab, with timestamped captions). One-time setup:
load the extension at `~/.claude/skills/record-screen/extension` into
Chrome. Fits demos that need human hands: third-party login flows,
multi-tab interactions.

## Never

- Stitch video from multiple runs, or record a run with red tests.
- Commit videos into the repo — they live in `$BEE_SESSION_DIR/evidence/`.
- Record a screen with secrets (tokens, .env) in frame.

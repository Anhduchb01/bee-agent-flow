---
description: Record a demo video of the feature — a real Chrome tab, driven and recorded, saved to the session's evidence dir
---

Invoke the bee-demo skill.

Record a real Chrome tab with `demo-record.sh`, driven over CDP, on a green
run only. Save to `$BEE_SESSION_DIR/evidence/` and report the path.

Two things the skill requires and this command exists to remind you of:

- **Look at the frames before shipping.** Frame count and a file on disk say
  nothing about what is in the video.
- **Quote the SPEEDUP line in the PR comment.** The video runs ~2.8× fast and
  reads as smooth, so a reviewer will take it for real time unless told.

$ARGUMENTS — optional: which flow to demo, or "hands" if the flow needs a
human at the keyboard (third-party login, multi-tab).

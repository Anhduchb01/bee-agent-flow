---
description: Record a demo video of the feature — Playwright headless run saved to the session's evidence dir
---

Invoke the bee-demo skill.

Default to path A (agent-driven Playwright recording of the full user flow,
green run only). Save to $BEE_SESSION_DIR/evidence/ and report the path; if
a PR is open, comment the evidence location on it.

$ARGUMENTS — optional: which flow/feature to demo, or "chrome" to use the
record-screen path (user drives a real Chrome tab on the PC).

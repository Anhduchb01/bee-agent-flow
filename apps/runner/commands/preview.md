---
description: Start a live preview server for this worktree and hand back a tailnet HTTPS link to test on any device
---

Invoke the bee-preview skill.

Resolve the start recipe in the skill's order (.bee/preview.sh from the
repo's env store first, auto-detect otherwise — including docker compose
deps), run it under a transient systemd unit so it outlives this chat, then
expose it with tailscale serve and report the URL plus the exact stop
command.

$ARGUMENTS — optional: "stop" to shut the preview down, or overrides
(port, compose services) for this run.

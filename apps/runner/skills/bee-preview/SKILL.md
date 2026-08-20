---
name: bee-preview
description: Start a LIVE preview server for the bee session's worktree and hand back an HTTPS tailnet link so the user can test directly from their phone. The server outlives the chat session (transient systemd unit) and supports repos that need Docker for auxiliary services. Use when the user wants "give me a link to test" before merging the PR.
---

# bee-preview

The user must be able to CLICK INTO the PR's code, not just read the diff.
The preview runs in the session's worktree under a transient systemd unit —
the chat session may stop, the preview keeps running until the user says
stop.

## Port contract

- App port: `PORT=$((3400 + num))` where `num` is the session number (read
  from the branch name `bee/<slug>-<num>`). If busy, +1 until free
  (`ss -ltn`).
- Outward link: `https://<magicdns-name>:$PORT` — same number, nothing to
  memorize.

## How to start — recipe lookup order (each repo has its own stack)

1. **`.bee/preview.sh` in the worktree** — the repo's OWN recipe, written
   by the user via Env files on /setup (stored at
   `env.d/<slug>/.bee/preview.sh`; the overlay copies it into every
   worktree, git-excluded so it can never be committed). Script contract:
   receives `$PORT`, handles its own dependencies (Docker included), runs
   the app in the FOREGROUND. This is the right path for repos that need
   Docker or auxiliary services.
2. **Auto-detect** when no script exists: `docker-compose.yml`/
   `compose.yaml` → `docker compose up -d` the auxiliary services first;
   then `package.json` with a `dev` script → `pnpm dev`/`npm run dev` with
   PORT; Next.js → `-p $PORT`; Vite → `--port $PORT --host 127.0.0.1`.
   SAY which recipe you picked — and suggest the user save it as
   `.bee/preview.sh` for next time.

## Docker for auxiliary services

- Check first: `docker info >/dev/null 2>&1` — on failure say plainly
  "this machine has no Docker or the user is not in the docker group";
  do not guess.
- ALWAYS namespace the compose project per session so two previews never
  trample each other: `export COMPOSE_PROJECT_NAME="bee-<slug>-<num>"`.
- Auxiliary services (db, redis…) publishing fixed ports in compose WILL
  collide when two previews of the same repo run — accepted V1 convention:
  one preview per repo at a time; override ports in `.bee/preview.sh` if
  you need more.
- The app's env comes from the env.d overlay already present in the worktree.

## Run

```bash
WT=$(git rev-parse --show-toplevel)
UNIT="bee-preview-<slug>-<num>"
systemd-run --user --unit="$UNIT" --working-directory="$WT" \
  --setenv=PORT=$PORT --collect \
  bash -lc 'exec bash .bee/preview.sh'   # or the auto-detected command
# wait for the app to listen (60s max); on failure: journalctl --user -u "$UNIT" -n 50
for i in $(seq 60); do ss -ltn "sport = :$PORT" | grep -q LISTEN && break; sleep 1; done
tailscale serve --bg --https=$PORT http://127.0.0.1:$PORT
URL="https://$(tailscale status --json | jq -r .Self.DNSName | sed 's/\.$//'):$PORT"
```

Then: (1) report the URL to the user in one sentence, (2) if a PR is open —
`gh pr comment` with the URL + how to stop it, (3) log it for the session
if one exists:

```bash
if [ -n "${BEE_SESSION_DIR:-}" ]; then
  jq -cn --arg url "$URL" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{type:"bee_preview", url:$url, unit:"'"$UNIT"'", port:'"$PORT"', ts:$ts}' \
    >> "$BEE_SESSION_DIR/run.jsonl"
fi
```

## Stop (when the user asks, or before starting a new preview of the same repo)

```bash
systemctl --user stop "$UNIT"
tailscale serve --https=$PORT off
docker compose -p "bee-<slug>-<num>" down 2>/dev/null || true
```

## Never

- Bind beyond 127.0.0.1 — tailscale serve is the only door.
- Run a preview against production data/DBs — previews use local auxiliary services.
- Orphan a preview: every time you start one, state the stop command in the same reply.

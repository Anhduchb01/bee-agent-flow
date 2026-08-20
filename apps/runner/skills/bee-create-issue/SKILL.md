---
name: bee-create-issue
description: Create a GitHub issue for the task contract agreed in a bee session. Use when the user has agreed on a task and no issue exists yet — the issue is where results land, not a work queue.
---

# bee-create-issue

Create an issue recording the task contract. Runs `gh` directly — the token
is a narrowly-scoped fine-grained PAT; the real fence is the PAT scope and
branch protection.

## Steps

1. Determine the repo: read the current worktree's remote —
   `git remote get-url origin`. **Only ever create issues on this repo.**
2. Draft the body from the contract agreed in the conversation, following
   the template below EXACTLY. If the conversation does not yet give you
   clear acceptance criteria, ASK before creating — an issue without AC
   cannot be accepted or verified.
3. Create it, passing the body via stdin so it never leaks into argv:

```bash
gh issue create --title "<one line, starts with a verb>" --body-file - <<'BODY'
## Context
<why this is needed — 2-3 sentences an outsider can follow>

## What to build
<the concrete deliverable>

## Acceptance criteria
- [ ] <AC 1 — observable, verifiable>
- [ ] <AC 2>
- [ ] All four gates green: lint / typecheck / test / build

## Constraints
<technical limits, file scope, deadline if any — otherwise "None">

## Out of scope
<things that LOOK in-scope but are not — blocks scope creep>
BODY
```

4. **Log it for the canvas** — only when running inside a bee session
   (`BEE_SESSION_DIR` exists; outside a session, skip silently):

```bash
# URL is printed by `gh issue create`; TITLE is the title you used. Write
# with jq — titles with quotes or odd characters still become valid JSON.
if [ -n "${BEE_SESSION_DIR:-}" ] && [ -n "$URL" ]; then
  NUM=$(printf '%s' "$URL" | grep -oE '[0-9]+$' || echo null)
  jq -cn --arg url "$URL" --arg title "$TITLE" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson num "${NUM:-null}" \
    '{type:"bee_artifact", kind:"issue", url:$url, number:$num, ts:$ts, title:$title}' \
    >> "$BEE_SESSION_DIR/run.jsonl"
fi
```

5. Report the issue URL back to the user in one sentence.

## Never

- Create an issue on any repo other than the worktree's remote.
- Add orchestration labels (`agent:*`, `status:*`) — the label-queue model is gone.
- Create an issue without clear acceptance criteria.

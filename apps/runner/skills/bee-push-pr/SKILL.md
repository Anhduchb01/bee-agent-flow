---
name: bee-push-pr
description: Push the bee session's branch and open a draft pull request with evidence (snapshots required for UI changes). Use when there are commits worth showing — results must land on GitHub as a PR, never pushed straight to main.
---

# bee-push-pr

Push the current branch and open a draft PR. `main` is fenced (branch
protection or the pre-push hook), so a direct push is refused — the only
road into main is a human pressing merge. **A PR without evidence is an
unfinished PR**: a visible change demands visible proof.

## Steps

1. **Check the branch first — mandatory.** Refuse unless the current branch
   starts with `bee/`:

```bash
BR=$(git branch --show-current)
case "$BR" in bee/*) ;; *) echo "REFUSED: on '$BR', only bee/* branches may be pushed"; exit 1;; esac
```

2. **Capture evidence BEFORE opening the PR** — mandatory when the change
   has a UI or any observable behavior; skip ONLY for pure refactors with
   no behavior change:
   - Run the tests with the camera on per the `e2e-evidence-capture` skill
     (video: 'on'). **Artifacts may only come from a fully GREEN run.**
   - Take 1–4 screenshots matching the acceptance criteria (Playwright
     `page.screenshot`), desktop AND a 390px viewport for web changes.
   - Commit screenshots to the branch at `.bee/evidence/<short-branch>/*.png`
     (small PNGs, a few hundred KB each at most). Videos are NOT committed —
     they live at `$BEE_SESSION_DIR/evidence/` on the machine.

3. Make sure everything you intend to ship is committed. **No** blind
   `git add -A` — check `git status` for strays (`.env*`, credentials).

4. Push and open the draft PR with the template below (if a section does
   not apply, say why — never delete it silently):

```bash
git push -u origin "$BR"
OWNER_REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh pr create --draft --title "<title>" --body-file - <<BODY
## Summary
<what changed and why — a reader must get it in 20 seconds>

## Verification
- [ ] lint / typecheck / test / build — all four gates green
- <which tests prove which AC, spec count, flake-guard repeats if any>

## Snapshots
<!-- images committed on the branch, embedded via blob?raw=true — private repos still render them for authorized viewers -->
![<what image 1 shows>](https://github.com/${OWNER_REPO}/blob/${BR}/.bee/evidence/<dir>/<file1>.png?raw=true)
![<what image 2 shows — 390px mobile shot for UI changes>](https://github.com/${OWNER_REPO}/blob/${BR}/.bee/evidence/<dir>/<file2>.png?raw=true)

## Demo / Preview
- Video: \`$BEE_SESSION_DIR/evidence/<file>.webm\` (if recorded via /demo)
- Live preview: <tailnet URL if started via /preview, otherwise "not running">

Closes #<issue number if any>
BODY
```

5. **Log it for the canvas** — only when `BEE_SESSION_DIR` exists:

```bash
# Write with jq — titles with quotes or odd characters still become valid JSON.
if [ -n "${BEE_SESSION_DIR:-}" ]; then
  gh pr view --json url,number,title \
    --jq '{type:"bee_artifact", kind:"pr", url:.url, number:.number, title:.title}' \
    | jq -c --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '. + {ts:$ts}' \
    >> "$BEE_SESSION_DIR/run.jsonl" || true
fi
```

6. Report the PR URL back in one sentence.

## Never

- Push a non-`bee/*` branch. No `--force` unless you yourself just rebased this branch.
- Merge the PR — merging belongs to humans, always.
- Embed images from a RED test run, or stitch images from different runs.
- Commit videos or oversized images into the repo.

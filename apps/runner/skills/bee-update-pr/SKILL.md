---
name: bee-update-pr
description: Push new commits to the bee session's open PR and leave a summary comment. Use after addressing review feedback or continuing work on an already-open PR.
---

# bee-update-pr

Update an open PR: push new commits + one comment saying what changed.

## Steps

1. Check the branch like `bee-push-pr` does (`bee/*` only).
2. `git push` — the PR on the same branch updates itself.
3. If the update changes anything visible, refresh the evidence the same
   way `bee-push-pr` demands: green-run screenshots committed under
   `.bee/evidence/`, referenced in the comment.
4. Comment a summary so the reviewer does not have to re-read the whole diff:

```bash
gh pr comment --body-file - <<'BODY'
Updated: <one or two sentences — what changed, why, which tests are green>
BODY
```

## Never

- `--force` over history someone already reviewed, unless you yourself just
  rebased and say so explicitly in the comment.

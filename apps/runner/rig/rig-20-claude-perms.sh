#!/usr/bin/env bash
# Rig-20 — a session must be able to open its own PR.
#
# Why this file exists: on 03/09 a session finished its branch, committed its
# evidence, and then died on `git push`. Not a bug in the branch — the repo's
# own .claude/settings.json listed `Bash(git push:*)` under `ask`, and an
# `ask` rule with nobody at the keyboard is a refusal, not a question. The
# log said so plainly: permission_denied, decision_reason_type "rule". Worth
# knowing: `--dangerously-skip-permissions` did NOT override it, so "the
# session runs in auto mode" is no defence at all.
#
# What this rig pins is the overlay that answers it, and the two things the
# overlay must NOT do: touch the repo's own settings, or become committable.
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

# shellcheck disable=SC1091
BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run" source "$DAY/../lib/common.sh"

# 1 · The overlay lands, and it is valid JSON — a malformed local settings
#     file is worse than none: claude drops the whole layer and we are back
#     to the refusal, silently.
WT="$T/wt"; mkdir -p "$WT"
write_claude_perms "$WT"
LOCAL="$WT/.claude/settings.local.json"
[[ -f "$LOCAL" ]] && kq ok "writes .claude/settings.local.json" || kq no "no overlay written"
jq -e . "$LOCAL" >/dev/null 2>&1 && kq ok "valid JSON" || kq no "malformed JSON — claude would drop the layer"

# 2 · It allows exactly the commands the bee-* skills run to finish a PR.
for rule in "Bash(git push:*)" "Bash(gh pr:*)" "Bash(gh repo view:*)"; do
  jq -e --arg r "$rule" '.permissions.allow | index($r)' "$LOCAL" >/dev/null 2>&1 \
    && kq ok "allows $rule" || kq no "missing $rule — the PR step dies here"
done

# 3 · It grants nothing else. The overlay is a key for one door, not a
#     master key: `gh release`, and anything else a repo put behind `ask`
#     for good reason, stays behind it.
COUNT=$(jq '.permissions.allow | length' "$LOCAL")
[[ "$COUNT" == 3 ]] && kq ok "grants nothing beyond those three" || kq no "allow list grew to $COUNT — scope creep"
jq -e '.permissions | has("deny") or has("ask") | not' "$LOCAL" >/dev/null 2>&1 \
  && kq ok "writes no deny/ask of its own — the repo keeps those" \
  || kq no "overlay is rewriting the repo's deny/ask"

# 4 · The repo's OWN .claude/settings.json is never touched. bee borrows the
#     local layer; the committed file belongs to the repo and its humans.
WT2="$T/wt2"; mkdir -p "$WT2/.claude"
REPO_OWNED='{"permissions":{"ask":["Bash(git push:*)"],"deny":["Bash(rm -rf:*)"]}}'
printf '%s' "$REPO_OWNED" > "$WT2/.claude/settings.json"
write_claude_perms "$WT2"
[[ "$(cat "$WT2/.claude/settings.json")" == "$REPO_OWNED" ]] \
  && kq ok "repo's settings.json left byte-identical" \
  || kq no "clobbered the repo's own settings.json"

# 5 · Rewritten on every start, like the env.d overlay — a stale file from a
#     previous run of an older bee must not survive into this session.
printf '%s' '{"permissions":{"allow":["Bash(stale:*)"]}}' > "$LOCAL"
write_claude_perms "$WT"
jq -e '.permissions.allow | index("Bash(stale:*)") | not' "$LOCAL" >/dev/null 2>&1 \
  && kq ok "overwrites a stale overlay" || kq no "stale overlay survived"
write_claude_perms "$WT"
jq -e . "$LOCAL" >/dev/null 2>&1 && kq ok "idempotent — twice is still valid" || kq no "second write corrupted it"

# 6 · End to end: with the exclude line session-run.sh adds, the overlay is
#     invisible to git. bee grants the agent a permission; it must not also
#     hand it a file to commit into somebody's repo.
WT3="$T/wt3"; mkdir -p "$WT3"
git -C "$WT3" init -q
git -C "$WT3" config user.email rig@localhost
git -C "$WT3" config user.name rig
EXCL="$(git -C "$WT3" rev-parse --git-path info/exclude)"
mkdir -p "$(dirname "$EXCL")"
echo "/.claude/settings.local.json" >> "$EXCL"
write_claude_perms "$WT3"
[[ -z "$(git -C "$WT3" status --porcelain)" ]] \
  && kq ok "git cannot see the overlay — it can never be committed" \
  || kq no "overlay shows up in git status: $(git -C "$WT3" status --porcelain)"

# 7 · The fence that actually holds is still the pre-push hook, not the
#     prompt we just removed. If this ever stops refusing main, the overlay
#     above becomes a real hole.
HOOK="$DAY/../lib/pre-push-bee"
printf 'refs/heads/main main-sha refs/heads/main remote-sha\n' \
  | bash "$HOOK" >/dev/null 2>&1 && kq no "pre-push fence let main through" || kq ok "pre-push fence still refuses main"
printf 'refs/heads/bee/x sha refs/heads/bee/x sha2\n' \
  | bash "$HOOK" >/dev/null 2>&1 && kq ok "pre-push fence still passes bee/*" || kq no "fence now refuses bee/* too"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-20: ALL GREEN"; else echo "RIG-20: RED"; exit 1; fi

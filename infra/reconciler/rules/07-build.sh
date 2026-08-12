#!/usr/bin/env bash
# Rule 07 — nhận task mới.
#
# Đứng gần cuối danh sách: việc mới luôn xếp sau việc đang dở. Rule 02 có thể
# làm rule này bị đói, và đó là chủ ý — nhưng MAX_WIP chặn số PR mở nên hàng
# đợi review có trần, không thể đói vĩnh viễn.
#
# agent:eligible là cờ OPT-IN do người gắn: mặc định agent không nhận issue nào.

RULE_ID="07-build"
RULE_POOL="build"
RULE_AGENT=1

rule_scan() {
  local slug="$1" wip

  # Trần WIP là giới hạn ở KHẢ NĂNG REVIEW CỦA NGƯỜI, không phải ở phần cứng.
  wip=$(gh_open_agent_prs "$REPO_FULL")
  (( wip >= REPO_WIP_MAX )) && return 0

  gh_issues "$REPO_FULL" "agent:build" "agent:eligible" | jq -r '
    .[]
    | select([.labels[].name] | index("needs-human") | not)
    | select([.labels[].name] | index("agent:running") | not)
    | [ (.number|tostring),
        (if [.labels[].name] | index("priority:high") then "1" else "0" end),
        .title ]
    | @tsv'
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" prompt branch

  gh_remove_label "$REPO_FULL" "$num" "agent:build"
  gh_add_label    "$REPO_FULL" "$num" "agent:running"

  branch="feat/$num-$(slugify "$(gh issue view "$num" --repo "$REPO_FULL" --json title --jq '.title')")"
  branch="${branch:0:60}"

  prompt=$(mktemp)
  {
    cat "$BEE_PREFIX/prompts/build.md" 2>/dev/null || true
    printf '\n\n## Issue #%s\n\n' "$num"
    gh issue view "$num" --repo "$REPO_FULL" --json title,body \
       --jq '"### " + .title + "\n\n" + .body'
    printf '\n\n## Thảo luận\n\n'
    gh issue view "$num" --repo "$REPO_FULL" --json comments \
       --jq '.comments[] | "**@" + .author.login + ":**\n" + .body + "\n"'
  } > "$prompt"

  worktree_ensure "$slug" "$num" "new:$branch"
  run_agent "$id" "$prompt" ""
  worktree_push_and_report "$slug" "$num" "$id" "$RULE_ID" "$branch"

  gh_remove_label "$REPO_FULL" "$num" "agent:running"
  rm -f "$prompt"
}

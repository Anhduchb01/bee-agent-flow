#!/usr/bin/env bash
# Rule 08 — Spec gatekeeper.
#
# Chấm độ rõ của issue TRƯỚC khi ai đó lao vào code. Thiếu AC, hoặc AC không
# kiểm chứng được → comment hỏi ngược PM rồi dừng, thay vì build lệch ba tiếng.
#
# Đây là vai trò DUY NHẤT chỉ đọc: nó không được sửa code, chỉ được comment.

RULE_ID="08-spec"
RULE_POOL="build"
RULE_AGENT=1

rule_scan() {
  local slug="$1"
  gh_issues "$REPO_FULL" "status:ready-for-spec" | jq -r '
    .[]
    | select([.labels[].name] | index("needs-human") | not)
    | select([.labels[].name] | index("agent:running") | not)
    | [ (.number|tostring),
        (if [.labels[].name] | index("priority:high") then "1" else "0" end),
        ("chấm spec: " + .title) ]
    | @tsv'
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" prompt

  gh_add_label "$REPO_FULL" "$num" "agent:running"

  prompt=$(mktemp)
  {
    cat "$BEE_PREFIX/prompts/spec.md" 2>/dev/null || true
    printf '\n\n## Issue #%s\n\n' "$num"
    gh issue view "$num" --repo "$REPO_FULL" --json title,body \
       --jq '"### " + .title + "\n\n" + .body'
  } > "$prompt"

  # Chỉ đọc: worktree sạch từ main, và prompt cấm sửa file. Kết quả là văn bản,
  # orchestrator mới là bên đăng comment (agent không có token).
  worktree_ensure "$slug" "$num" "readonly"
  run_agent "$id" "$prompt" ""

  local out="$BEE_SRV/state/$id/agent-output.txt"
  [[ -s "$out" ]] && gh_comment "$REPO_FULL" "$num" "<!-- agent-run -->
$(cat "$out")"

  gh_remove_label "$REPO_FULL" "$num" "status:ready-for-spec"
  gh_add_label    "$REPO_FULL" "$num" "status:spec-review"
  gh_remove_label "$REPO_FULL" "$num" "agent:running"
  rm -f "$prompt"
}

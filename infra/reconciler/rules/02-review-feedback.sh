#!/usr/bin/env bash
# Rule 02 — PR có review comment nhắc @claude chưa xử lý.
#
# Đứng gần đầu danh sách vì nó gỡ chặn một CON NGƯỜI đang chờ. Một Techlead
# ngồi đợi agent sửa comment đắt hơn một issue nằm im trong hàng đợi.

RULE_ID="02-review-feedback"
RULE_POOL="build"
RULE_AGENT=1

rule_scan() {
  local slug="$1" num updated n

  while IFS=$'\t' read -r num updated; do
    [[ -z "$num" ]] && continue

    # Gate theo updatedAt: PR không đổi gì từ tick trước thì khỏi gọi API đếm
    # comment. Đây là thứ giữ cho 2.880 tick/ngày không cạn rate limit.
    scan_changed "$slug-$num.review" "$updated" || continue

    n=$(gh_pending_claude_comments "$REPO_FULL" "$num")
    (( n > 0 )) || continue

    # Marker chống chạy lại vô hạn trên cùng một bộ comment.
    [[ -f "$(state_dir "$slug-$num")/reviewed-$n" ]] && continue

    printf '%s\t1\tsửa theo %s comment review\n' "$num" "$n"
  done < <(gh_prs "$REPO_FULL" \
             | jq -r '.[] | select(.isDraft | not) | [.number, .updatedAt] | @tsv')
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" n prompt resume
  n=$(gh_pending_claude_comments "$REPO_FULL" "$num")

  prompt=$(mktemp)
  {
    cat "$BEE_PREFIX/prompts/review-fix.md" 2>/dev/null || true
    printf '\n\n## Pull Request #%s\n\n' "$num"
    gh pr view "$num" --repo "$REPO_FULL" --json title,body \
       --jq '"### " + .title + "\n\n" + .body'
    printf '\n\n## Review comment cần xử lý\n\n'
    gh api "repos/$REPO_FULL/pulls/$num/comments" --paginate --jq \
      '.[] | select(.body | test("@claude"; "i"))
       | "- **" + .path + ":" + ((.line // .original_line // 0)|tostring) + "**\n  " + .body'
  } > "$prompt"

  # Nối lại phiên cũ nếu có — agent nhớ được VÌ SAO nó đã quyết định như vậy,
  # thay vì phải đọc lại diff từ đầu. Đây là thứ Actions làm rất vướng.
  resume=$(cat "$(state_dir "$id")/session_id" 2>/dev/null || true)

  worktree_ensure "$slug" "$num" "pr"
  run_agent "$id" "$prompt" "$resume"
  worktree_push_and_report "$slug" "$num" "$id" "$RULE_ID"

  mkdir -p "$(state_dir "$id")"
  touch "$(state_dir "$id")/reviewed-$n"
  rm -f "$prompt"
}

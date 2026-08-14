#!/usr/bin/env bash
# Rule 02 — PR có comment nhắc @claude chưa xử lý.
#
# Đứng gần đầu danh sách vì nó gỡ chặn một CON NGƯỜI đang chờ. Một Techlead
# ngồi đợi agent sửa comment đắt hơn một issue nằm im trong hàng đợi.
#
# "Comment" ở đây là cả ba chỗ GitHub cất chúng — diff, Conversation, và lời
# tổng kết review. Xem `gh_claude_comments`.

RULE_ID="02-review-feedback"
RULE_POOL="build"
RULE_AGENT=1

rule_scan() {
  local slug="$1" num updated cmts n fp

  while IFS=$'\t' read -r num updated; do
    [[ -z "$num" ]] && continue

    # Gate theo updatedAt: PR không đổi gì từ tick trước thì khỏi gọi API đếm
    # comment. Đây là thứ giữ cho 2.880 tick/ngày không cạn rate limit.
    scan_changed "$slug-$num.review" "$updated" || continue

    cmts=$(gh_claude_comments "$REPO_FULL" "$num")
    n=$(jq 'length' <<<"$cmts")
    (( n > 0 )) || continue

    # Mốc chống chạy lại vô hạn: vân tay của tập comment, so với lần đã xử lý.
    fp=$(gh_claude_fingerprint "$cmts")
    [[ "$fp" == "$(reviewed_get "$slug-$num")" ]] && continue

    printf '%s\t1\tsửa theo %s comment\n' "$num" "$n"
  done < <(gh_prs "$REPO_FULL" \
             | jq -r '.[] | select(.isDraft | not) | [.number, .updatedAt] | @tsv')
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" cmts prompt resume wt

  # Lấy lại chứ không dùng kết quả lúc scan: giữa scan và run có thể thêm
  # comment, và vân tay ghi xuống cuối hàm phải là vân tay của thứ ĐÃ XỬ LÝ chứ
  # không phải thứ đã nhìn thấy — lệch một comment là comment đó mất luôn.
  cmts=$(gh_claude_comments "$REPO_FULL" "$num")

  prompt=$(mktemp)
  {
    cat "$BEE_PREFIX/prompts/review-fix.md" 2>/dev/null || true
    printf '\n\n## Pull Request #%s\n\n' "$num"
    gh pr view "$num" --repo "$REPO_FULL" --json title,body \
       --jq '"### " + .title + "\n\n" + .body'
    printf '\n\n## Comments to handle\n\n'
    # Comment gắn vào diff kèm được file:dòng; comment thường thì không, và nói
    # thẳng ra là "toàn PR" tốt hơn là bịa một vị trí.
    jq -r '.[] | "- **@" + .who + "** · "
                 + (if .path then .path + ":" + (.line|tostring) else "toàn PR" end)
                 + "\n\n  " + (.body | gsub("\n"; "\n  ")) + "\n"' <<<"$cmts"
  } > "$prompt"

  # Nối lại phiên cũ nếu có — agent nhớ được VÌ SAO nó đã quyết định như vậy,
  # thay vì phải đọc lại diff từ đầu. Đây là thứ Actions làm rất vướng.
  resume=$(cat "$(state_dir "$id")/session_id" 2>/dev/null || true)

  wt=$(worktree_ensure "$slug" "$num" "pr")

  # Sửa theo review là sửa CODE, nên vẫn cần chạy được suite — cùng lý do và
  # cùng ranh giới như rule 07. (Rule 08 thì không: nó chỉ đọc.)
  testenv_up "$slug" "$id" "$wt" \
    || warn "$id: không dựng được hạ tầng test — agent vẫn chạy, test cần DB sẽ đỏ"

  run_agent "$id" "$prompt" "$resume" || warn "$id: agent thoát với mã lỗi — vẫn đẩy phần đã làm"

  # Trước push: testenv_down xoá .env.test khỏi worktree.
  testenv_down "$id"
  worktree_push_and_report "$slug" "$num" "$id" "$RULE_ID"

  # Ghi mốc SAU CÙNG, và ra ngoài thư mục state — thư mục đó bị `claim_clear`
  # xoá lúc worker thoát, xem `reviewed_file` trong lib/state.sh.
  reviewed_set "$id" "$(gh_claude_fingerprint "$cmts")"
  rm -f "$prompt"
}

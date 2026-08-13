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
  local slug="$1" num="$2" id="$1-$2" prompt branch wt

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
    printf '\n\n## Discussion\n\n'
    gh issue view "$num" --repo "$REPO_FULL" --json comments \
       --jq '.comments[] | "**@" + .author.login + ":**\n" + .body + "\n"'
  } > "$prompt"

  wt=$(worktree_ensure "$slug" "$num" "new:$branch")

  # Hạ tầng test do ORCH dựng trước, agent chỉ kết nối vào — agent không thuộc
  # group docker nên nó không tự dựng được. Repo không có compose file thì
  # testenv_up trả về ngay, không tốn gì.
  #
  # Dựng cho MỌI build task kể cả task không đụng DB là có chủ ý: ngân sách RAM
  # ở docs/design/reconciler.md §2.4 vốn tính "build slot kèm Postgres + Redis" ~2,5GB × 3.
  # Đổi lại agent không bao giờ phải đoán xem mình có database hay không.
  if ! testenv_up "$slug" "$id" "$wt"; then
    gh_remove_label "$REPO_FULL" "$num" "agent:running"
    gh_add_label    "$REPO_FULL" "$num" "agent:build"
    gh_comment "$REPO_FULL" "$num" "<!-- agent-run -->
🤖 **build** · không dựng được hạ tầng test, chưa gọi agent. Sẽ thử lại ở tick sau.

Chạy agent trên môi trường thiếu database thì test đỏ vì lý do sai, và agent sẽ đi sửa nhầm chỗ."
    record_run "$id" "$slug" "$num" "$RULE_ID" "fail"
    rm -f "$prompt"
    return 1
  fi

  run_agent "$id" "$prompt" "" || warn "$id: agent thoát với mã lỗi — vẫn đẩy phần đã làm"

  # Hạ xuống TRƯỚC khi push: testenv_down xoá .env.test, mà worktree_push_and_report
  # chạy `git add -A` — bỏ thứ tự này thì cổng động của lần chạy lọt vào PR.
  testenv_down "$id"
  worktree_push_and_report "$slug" "$num" "$id" "$RULE_ID" "$branch"

  gh_remove_label "$REPO_FULL" "$num" "agent:running"
  rm -f "$prompt"
}

#!/usr/bin/env bash
# Rule 01 — dọn xác sau khi máy chết giữa chừng.
#
# Điều kiện phát hiện gọn được nhờ template unit: issue mang label agent:running
# nhưng bee-task@<id> KHÔNG active. Không phải kiểm PID, không phải lo PID
# bị hệ điều hành cấp lại cho tiến trình khác.

RULE_ID="01-recover-stale"
RULE_POOL="build"
RULE_AGENT=0

rule_scan() {
  local slug="$1" num id
  while read -r num; do
    [[ -z "$num" ]] && continue
    id="$slug-$num"
    unit_active "$id" && continue          # đang chạy thật, bỏ qua
    printf '%s\t1\t%s\n' "$num" "dọn xác lần chạy bị gián đoạn"
  done < <(gh_issues "$REPO_FULL" "agent:running" | jq -r '.[].number')
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" attempts
  attempt_bump "$id"
  attempts=$(attempt_get "$id")

  rm -rf -- "$BEE_SRV/work/$id"
  git --git-dir="$REPO_GIT" worktree prune 2>/dev/null || true
  claim_clear "$id"
  gh_remove_label "$REPO_FULL" "$num" "agent:running"

  if (( attempts >= 2 )); then
    gh_add_label "$REPO_FULL" "$num" "needs-human"
    gh_comment "$REPO_FULL" "$num" \
"<!-- agent-run -->
🤖 Đã dừng sau **$attempts lần gián đoạn liên tiếp**.

Hai lần hỏng liên tiếp gần như luôn là task có vấn đề chứ không phải máy có vấn đề — nên tôi không thử tiếp. Gỡ \`needs-human\` và gắn lại \`agent:build\` nếu muốn chạy lại."
    record_run "$id" "$slug" "$num" "$RULE_ID" "gave-up"
  else
    gh_add_label "$REPO_FULL" "$num" "agent:build"
    gh_comment "$REPO_FULL" "$num" \
"<!-- agent-run -->
🤖 Lần chạy trước bị gián đoạn (mất điện, reboot, hoặc bị kill). Đã dọn worktree và đưa lại vào hàng đợi. Lần thử: $attempts/2."
    record_run "$id" "$slug" "$num" "$RULE_ID" "recovered"
  fi
}

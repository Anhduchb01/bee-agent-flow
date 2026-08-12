#!/usr/bin/env bash
# Rule 05 — tính lại commit status bee/approvals.
#
# GitHub Free không enforce required reviewers trên private repo. Đây là bản
# cưỡng chế mềm: đếm approve của hai nhóm rồi đẩy dấu tích/dấu X lên PR.
# Không chặn được nút Merge, nhưng biến "quên xin PM duyệt" từ chuyện vô hình
# thành một dấu X đỏ ai cũng thấy.
#
# RULE_INLINE=1: reconciler tự chạy ngay, không chiếm slot và không cần worker.
# Một lời gọi API cho việc này mà phải dựng cả một systemd unit thì quá phí.

RULE_ID="05-approvals"
RULE_POOL="build"
RULE_AGENT=0
RULE_INLINE=1

# Đọc approve từ latestReviews đã có sẵn trong một lời gọi gh_prs cho cả repo —
# không gọi thêm API cho từng PR.
approvals_state_from() {
  local reviews_json="$1" pm_ok=1 tl_ok=1 u approvers
  approvers=$(jq -r '[.[]? | select(.state=="APPROVED") | .author.login] | unique | join(" ")' \
                <<<"$reviews_json" 2>/dev/null || echo '')

  if [[ -n "$REPO_PM" ]]; then
    pm_ok=0; for u in $REPO_PM; do grep -qw -- "$u" <<<"$approvers" && pm_ok=1; done
  fi
  if [[ -n "$REPO_TL" ]]; then
    tl_ok=0; for u in $REPO_TL; do grep -qw -- "$u" <<<"$approvers" && tl_ok=1; done
  fi

  (( pm_ok && tl_ok )) && printf 'success' || printf 'pending'
}

rule_scan() {
  local slug="$1" num sha updated reviews want
  # Chưa cấu hình người duyệt thì rule này không có việc gì để làm.
  [[ -n "$REPO_PM$REPO_TL" ]] || return 0

  while IFS=$'\t' read -r num sha updated reviews; do
    [[ -z "$num" ]] && continue

    want=$(approvals_state_from "$reviews")
    # Chỉ đẩy status khi kết quả THỰC SỰ đổi — token gộp cả SHA lẫn kết luận,
    # nên không đẩy trùng mỗi 30 giây.
    scan_changed "$slug-$num.appr" "$sha:$want" || continue

    printf '%s\t0\tapprovals → %s\n' "$num" "$want"
  done < <(gh_prs "$REPO_FULL" | jq -r '
             .[] | select(.isDraft | not)
             | [.number, .headRefOid, .updatedAt, (.latestReviews // [] | tojson)] | @tsv')
}

rule_run() {
  local slug="$1" num="$2" sha reviews state desc

  reviews=$(gh api "repos/$REPO_FULL/pulls/$num/reviews" \
              --jq '[.[] | {state, author:{login:.user.login}}]' 2>/dev/null || echo '[]')
  sha=$(gh pr view "$num" --repo "$REPO_FULL" --json headRefOid --jq '.headRefOid')
  state=$(approvals_state_from "$reviews")

  if [[ "$state" == "success" ]]; then
    desc="đủ approve từ PM và Techlead"
  else
    desc="còn thiếu approve — cần cả PM lẫn Techlead"
  fi
  gh_set_status "$REPO_FULL" "$sha" "$state" "bee/approvals" "$desc"
}

#!/usr/bin/env bash
# Rule 03 — PR có head SHA chưa có commit status → chạy test, đẩy status.
#
# Đây là toàn bộ "CI" của hệ thống: chạy trên phần cứng của mình (Postgres/Redis
# thật, nhanh hơn hosted runner) rồi đẩy dấu tích lên PR bằng Commit Status API.
# Không phân biệt PR của agent hay của người — nên bạn được CI cho cả hai.
#
# Không gọi model. Không có gì để "suy nghĩ" ở đây.

RULE_ID="03-run-ci"
RULE_POOL="evidence"
RULE_AGENT=0

rule_scan() {
  local slug="$1" num sha
  while IFS=$'\t' read -r num sha; do
    [[ -z "$num" ]] && continue
    gh_status_contexts "$REPO_FULL" "$sha" | grep -qx "bee/test" && continue
    printf '%s\t0\tCI cho SHA %s\n' "$num" "${sha:0:7}"
  done < <(gh_prs "$REPO_FULL" | jq -r '.[] | [.number, .headRefOid] | @tsv')
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" sha wt rc=0 t0 t1
  sha=$(gh pr view "$num" --repo "$REPO_FULL" --json headRefOid --jq '.headRefOid')

  gh_set_status "$REPO_FULL" "$sha" pending "bee/test" "đang chạy trên $(hostname -s)"

  wt=$(worktree_ensure "$slug" "$num" "pr")
  t0=$(now_epoch)

  # Hạ tầng do orch dựng TRƯỚC, agent/test chỉ kết nối vào. Xem AGENT_RECONCILER §7.1.
  testenv_up "$slug" "$id" "$wt" || rc=$?
  if (( rc == 0 )); then
    ( cd "$wt" && timeout 20m ./scripts/ci.sh ) || rc=$?
  fi
  testenv_down "$id"

  t1=$(now_epoch)
  if (( rc == 0 )); then
    gh_set_status "$REPO_FULL" "$sha" success "bee/test" "xanh · $(human_dur $((t1-t0)))"
    record_run "$id" "$slug" "$num" "$RULE_ID" "ok" 0 $((t1-t0))
  else
    gh_set_status "$REPO_FULL" "$sha" failure "bee/test" "đỏ (exit $rc)"
    record_run "$id" "$slug" "$num" "$RULE_ID" "fail" 0 $((t1-t0))
  fi
}

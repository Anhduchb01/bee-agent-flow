#!/usr/bin/env bash
# Rule 04 — PR đã xanh nhưng khối bằng chứng thiếu, hoặc gắn với SHA cũ.
#
# Chạy E2E trên stack LOCALHOST — không cần preview env, không cần Caddy,
# không cần domain. Đó là lý do bằng chứng làm được ở M3 còn preview để tận M6.
#
# Bể evidence cố định 1 slot: ba Playwright cùng lúc sẽ làm nhau timeout, và
# bằng chứng flaky tệ hơn bằng chứng chậm.

RULE_ID="04-evidence"
RULE_POOL="evidence"
RULE_AGENT=1

rule_scan() {
  local slug="$1" num sha body
  while IFS=$'\t' read -r num sha; do
    [[ -z "$num" ]] && continue
    # Chỉ làm bằng chứng cho PR đã xanh — không quay video của code chưa chạy được.
    gh_status_contexts "$REPO_FULL" "$sha" | grep -qx "bee/test" || continue

    body=$(gh_pr_body "$REPO_FULL" "$num")
    # Bằng chứng của commit không còn là HEAD là bằng chứng hết hạn.
    grep -q "evidence:start" <<<"$body" && grep -q "${sha:0:7}" <<<"$body" && continue

    printf '%s\t0\tbằng chứng cho SHA %s\n' "$num" "${sha:0:7}"
  done < <(gh_prs "$REPO_FULL" | jq -r '.[] | select(.isDraft | not) | [.number, .headRefOid] | @tsv')
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" wt prompt

  wt=$(worktree_ensure "$slug" "$num" "pr")
  testenv_up "$slug" "$id" "$wt" || { record_run "$id" "$slug" "$num" "$RULE_ID" "fail"; return 1; }

  prompt=$(mktemp)
  {
    cat "$BEE_PREFIX/prompts/evidence.md" 2>/dev/null || true
    printf '\n\n## Pull Request #%s\n\n' "$num"
    gh pr view "$num" --repo "$REPO_FULL" --json title,body --jq '"### " + .title + "\n\n" + .body'
  } > "$prompt"

  # Agent chạy suite có bật quay video, sửa tới khi xanh. publish-evidence.sh
  # từ chối publish nếu run không xanh — và cố ý không có cờ --force.
  run_agent "$id" "$prompt" ""

  testenv_down "$id"
  rm -f "$prompt"
}

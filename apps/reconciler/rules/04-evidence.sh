#!/usr/bin/env bash
# Rule 04 — PR đã xanh nhưng chưa có bằng chứng cho SHA hiện tại.
#
# Chạy E2E trên stack LOCALHOST — không cần preview env, không cần Caddy,
# không cần domain. Đó là lý do bằng chứng làm được ở M3 còn preview để tận M6.
#
# Bể evidence cố định 1 slot: ba Playwright cùng lúc sẽ làm nhau timeout, và
# bằng chứng flaky tệ hơn bằng chứng chậm.
#
# Phân công trong rule này: AGENT làm suite xanh, ORCH lưu và gắn. Agent không
# ghi được vào `/srv/bee/evidence/` (chỉ orch ghi) nên nó không thể tự đưa bằng
# chứng ra ngoài — và đó chính là thứ làm bằng chứng đáng tin.

RULE_ID="04-evidence"
RULE_POOL="evidence"
RULE_AGENT=1

# Sentinel: repo có mang bộ e2e-evidence-capture không. Chỉ còn dùng để BIẾT
# repo này có E2E hay không — bee không còn chạy script nào của repo nữa.
EV_SKILL=".claude/skills/e2e-evidence-capture/SKILL.md"

rule_scan() {
  local slug="$1" num sha labels

  # Repo chưa mang bộ e2e-evidence-capture thì rule này TỰ TẮT. Không cảnh báo,
  # không comment — nhiều repo sẽ không bao giờ có E2E, và một rule cằn nhằn mỗi
  # 30 giây là cách nhanh nhất để người ta thôi đọc log.
  git --git-dir="$REPO_GIT" cat-file -e "origin/HEAD:$EV_SKILL" 2>/dev/null || return 0

  while IFS=$'\t' read -r num sha labels; do
    [[ -z "$num" ]] && continue
    # Đã giơ tay xin người thì đừng đốt thêm quota vào nó. So khớp trọn vẹn giữa
    # hai dấu phẩy, không phải grep chuỗi con — "needs-human-review" là label khác.
    [[ ",$labels," == *",needs-human,"* ]] && continue

    # Mốc "đã có bằng chứng" là THƯ MỤC TRÊN ĐĨA, không còn là chuỗi SHA trong
    # PR body. Body là thứ người sửa được: xoá nhầm khối đi là bee quay video
    # lại từ đầu, sửa tay khối vào là bee im lặng bỏ qua một SHA chưa có gì
    # chứng minh. Thư mục thì do đúng một tiến trình tạo ra.
    evidence_have "$slug" "$num" "$sha" && continue

    # Chỉ làm bằng chứng cho PR đã xanh — không quay video của code chưa chạy được.
    gh_status_contexts "$REPO_FULL" "$sha" | grep -qx "bee/test" || continue

    printf '%s\t0\tbằng chứng cho SHA %s\n' "$num" "${sha:0:7}"
  done < <(gh_prs "$REPO_FULL" | jq -r '
             .[] | select(.isDraft | not)
             | [.number, .headRefOid, ([.labels[].name] | join(","))] | @tsv')
}

# Gắn khối bằng chứng vào PR body, thay thế khối cũ nếu có.
#
# Tách khỏi bước ghi đĩa có chủ ý: ghi hỏng thì KHÔNG được sửa nửa vời PR body.
evidence_attach() {
  local num="$1" block="$2" body new

  body=$(mktemp); new=$(mktemp)
  gh pr view "$num" --repo "$REPO_FULL" --json body --jq '.body' > "$body"

  python3 - "$body" "$block" "$new" <<'PY'
import re, sys

body_path, block_path, out_path = sys.argv[1:4]
body  = open(body_path,  encoding='utf-8').read()
block = open(block_path, encoding='utf-8').read().strip()

pattern = re.compile(r'<!-- evidence:start -->.*?<!-- evidence:end -->', re.DOTALL)

if pattern.search(body):
    body = pattern.sub(lambda _: block, body, count=1)
    body = pattern.sub('', body).rstrip()      # gom về đúng một khối
else:
    body = body.rstrip() + '\n\n' + block

open(out_path, 'w', encoding='utf-8').write(body + '\n')
PY

  local rc=0
  gh pr edit "$num" --repo "$REPO_FULL" --body-file "$new" >/dev/null || rc=$?
  rm -f "$body" "$new"
  return $rc
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" wt prompt results run_id sha md block why

  wt=$(worktree_ensure "$slug" "$num" "pr")
  testenv_up "$slug" "$id" "$wt" || {
    record_run "$id" "$slug" "$num" "$RULE_ID" "fail"; return 1; }

  prompt=$(mktemp)
  {
    cat "$BEE_PREFIX/prompts/evidence.md" 2>/dev/null || true
    printf '\n\n## Pull Request #%s\n\n' "$num"
    gh pr view "$num" --repo "$REPO_FULL" --json title,body --jq '"### " + .title + "\n\n" + .body'
  } > "$prompt"

  # Agent chạy suite có bật quay video, sửa tới khi xanh.
  #
  # Agent thoát lỗi (hết turn, hết giờ) thì VẪN đi tiếp: nó có thể đã kịp có một
  # lần chạy xanh trước khi chạm trần. Cổng thật nằm ở results.json, không nằm ở
  # mã thoát của tiến trình.
  run_agent "$id" "$prompt" "" || warn "$id: agent thoát với mã lỗi — vẫn xét test-results"
  rm -f "$prompt"
  testenv_down "$id"

  # test-results/ ra khỏi worktree TRƯỚC khi push. worktree_push_and_report chạy
  # `git add -A`, mà thư mục này chứa video hàng chục MB — bằng chứng thuộc về
  # /srv/bee/evidence, không thuộc về lịch sử git.
  results="$D/test-results"
  rm -rf -- "$results"
  if [[ -d "$wt/test-results" ]]; then
    mv "$wt/test-results" "$results"
  fi

  # Push TRƯỚC, ghi bằng chứng SAU. Bằng chứng gắn với SHA lấy từ HEAD của
  # worktree; ghi trước khi push thì SHA đó không phải head của PR, thư mục nằm
  # dưới một tên không ai hỏi tới, và rule_scan sẽ khớp lại ở mọi tick sau —
  # vòng lặp vô hạn tốn cả quota lẫn máy.
  worktree_push_and_report "$slug" "$num" "$id" "$RULE_ID"
  sha=$(git -C "$wt" rev-parse HEAD)

  if ! why=$(evidence_green "$results/results.json"); then
    evidence_fail "$slug" "$num" "$id" "$why"
    return 1
  fi

  run_id="$id-$(date -u +%Y%m%dT%H%M%SZ)"
  md=$(evidence_write "$slug" "$num" "$sha" "$results" "$run_id") || {
    evidence_fail "$slug" "$num" "$id" "không ghi được vào \`$(evidence_dir "$slug" "$num" "$sha")\` — kiểm quyền của \`$ORCH_USER\` trên \`$BEE_SRV/evidence\`"
    return 1
  }

  block=$(mktemp)
  evidence_block_for_pr "$slug" "$num" "$sha" "$md" > "$block"
  if ! evidence_attach "$num" "$block"; then
    rm -f "$block"
    # File đã nằm trên đĩa và rule_scan sẽ không quay lại SHA này nữa — nói
    # thẳng ra chỗ xem, đừng để người ta tưởng mất trắng.
    evidence_fail "$slug" "$num" "$id" \
      "đã ghi bằng chứng nhưng KHÔNG gắn được vào PR body (\`gh pr edit\` đổ). Bằng chứng vẫn xem được trên dashboard"
    return 1
  fi
  rm -f "$block"

  # Không ghi record_run ở đây: worktree_push_and_report vừa ghi "ok" xong.
  attempt_reset "$id.evidence"
  return 0
}

# Mọi đường hỏng của rule này đi qua đây, để chỉ có MỘT chỗ quyết định khi nào
# thì thôi thử lại.
#
# Bộ đếm phải RIÊNG, không dùng chung với rule 01: worktree_push_and_report gọi
# attempt_reset "$id" ngay trước đó, nên bộ đếm chung sẽ bị xoá trước khi kịp
# tăng, không bao giờ chạm ngưỡng, và rule này chạy lại vô hạn — mỗi vòng là một
# lần gọi model cộng một lần chạy E2E.
evidence_fail() {
  local slug="$1" num="$2" id="$3" why="$4" attempts

  attempt_bump "$id.evidence"
  attempts=$(attempt_get "$id.evidence")
  record_run "$id" "$slug" "$num" "$RULE_ID" "fail"

  if (( attempts >= 2 )); then
    gh_add_label "$REPO_FULL" "$num" "needs-human"
    gh_comment "$REPO_FULL" "$num" "<!-- agent-run -->
🤖 **evidence** · đã dừng sau **$attempts lần** không ra được bằng chứng.

Lần cuối: $why.

PR không có bằng chứng vẫn tốt hơn PR có bằng chứng giả. Log đầy đủ: \`be logs $id\`. Gỡ \`needs-human\` để thử lại."
  else
    gh_comment "$REPO_FULL" "$num" "<!-- agent-run -->
🤖 **evidence** · chưa ra được bằng chứng (lần $attempts/2): $why. Sẽ thử lại ở tick sau."
  fi
}

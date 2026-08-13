#!/usr/bin/env bash
# Rule 04 — PR đã xanh nhưng khối bằng chứng thiếu, hoặc gắn với SHA cũ.
#
# Chạy E2E trên stack LOCALHOST — không cần preview env, không cần Caddy,
# không cần domain. Đó là lý do bằng chứng làm được ở M3 còn preview để tận M6.
#
# Bể evidence cố định 1 slot: ba Playwright cùng lúc sẽ làm nhau timeout, và
# bằng chứng flaky tệ hơn bằng chứng chậm.
#
# Phân công trong rule này: AGENT làm suite xanh, ORCH publish. Agent không có
# credential MinIO lẫn GitHub nên nó không thể tự đưa bằng chứng ra ngoài — và
# đó chính là thứ làm bằng chứng đáng tin.

RULE_ID="04-evidence"
RULE_POOL="evidence"
RULE_AGENT=1

# Bộ script của skill e2e-evidence-capture, nằm trong repo đích.
EV_PUBLISH=".claude/skills/e2e-evidence-capture/scripts/publish-evidence.sh"
EV_ATTACH=".claude/skills/e2e-evidence-capture/scripts/attach-evidence.sh"

rule_scan() {
  local slug="$1" num sha body labels

  # Repo chưa mang bộ e2e-evidence-capture thì rule này TỰ TẮT. Không cảnh báo,
  # không comment — nhiều repo sẽ không bao giờ có E2E, và một rule cằn nhằn mỗi
  # 30 giây là cách nhanh nhất để người ta thôi đọc log.
  git --git-dir="$REPO_GIT" cat-file -e "origin/HEAD:$EV_PUBLISH" 2>/dev/null || return 0

  while IFS=$'\t' read -r num sha labels; do
    [[ -z "$num" ]] && continue
    # Đã giơ tay xin người thì đừng đốt thêm quota vào nó. So khớp trọn vẹn giữa
    # hai dấu phẩy, không phải grep chuỗi con — "needs-human-review" là label khác.
    [[ ",$labels," == *",needs-human,"* ]] && continue

    # Chỉ làm bằng chứng cho PR đã xanh — không quay video của code chưa chạy được.
    gh_status_contexts "$REPO_FULL" "$sha" | grep -qx "bee/test" || continue

    body=$(gh_pr_body "$REPO_FULL" "$num")
    # Bằng chứng của commit không còn là HEAD là bằng chứng hết hạn.
    grep -q "evidence:start" <<<"$body" && grep -q "${sha:0:7}" <<<"$body" && continue

    printf '%s\t0\tbằng chứng cho SHA %s\n' "$num" "${sha:0:7}"
  done < <(gh_prs "$REPO_FULL" | jq -r '
             .[] | select(.isDraft | not)
             | [.number, .headRefOid, ([.labels[].name] | join(","))] | @tsv')
}

# Publish + attach. Chạy dưới orch vì cần MinIO và GH_TOKEN.
#
# Hai bước tách rời có chủ ý: upload hỏng thì KHÔNG được sửa nửa vời PR body.
evidence_publish() {
  local num="$1" wt="$2" results="$3" run_id="$4"
  local pub att rc=0

  pub=$(from_main "$EV_PUBLISH" 755) || return 1
  att=$(from_main "$EV_ATTACH"  755) || { rm -f "$pub"; return 1; }

  # cwd là worktree để `git rev-parse --short HEAD` trong script ra đúng commit
  # đang được chứng minh. results-dir nằm NGOÀI worktree — xem rule_run.
  ( cd "$wt" && GH_REPO="$REPO_FULL" \
      "$pub" --pr "$num" --run "$run_id" --results-dir "$results" ) >/dev/null || rc=$?

  if (( rc == 0 )); then
    ( cd "$wt" && GH_REPO="$REPO_FULL" \
        "$att" --pr "$num" --file "$results/evidence.md" ) >/dev/null || rc=$?
  fi

  rm -f "$pub" "$att"
  return $rc
}

rule_run() {
  local slug="$1" num="$2" id="$1-$2" wt prompt results run_id

  wt=$(worktree_ensure "$slug" "$num" "pr")
  testenv_up "$slug" "$id" "$wt" || {
    record_run "$id" "$slug" "$num" "$RULE_ID" "fail"; return 1; }

  prompt=$(mktemp)
  {
    cat "$BEE_PREFIX/prompts/evidence.md" 2>/dev/null || true
    printf '\n\n## Pull Request #%s\n\n' "$num"
    gh pr view "$num" --repo "$REPO_FULL" --json title,body --jq '"### " + .title + "\n\n" + .body'
  } > "$prompt"

  # Agent chạy suite có bật quay video, sửa tới khi xanh. publish-evidence.sh
  # từ chối publish nếu run không xanh — và cố ý không có cờ --force.
  #
  # Agent thoát lỗi (hết turn, hết giờ) thì VẪN đi tiếp: nó có thể đã kịp có một
  # lần chạy xanh trước khi chạm trần. Cổng thật nằm ở results.json và ở chính
  # script publish, không nằm ở mã thoát của tiến trình.
  run_agent "$id" "$prompt" "" || warn "$id: agent thoát với mã lỗi — vẫn xét test-results"
  rm -f "$prompt"
  testenv_down "$id"

  # test-results/ ra khỏi worktree TRƯỚC khi push. worktree_push_and_report chạy
  # `git add -A`, mà thư mục này chứa video hàng chục MB — bằng chứng thuộc về
  # MinIO, không thuộc về lịch sử git. Thư mục state bị xoá lúc worker thoát nên
  # nó cũng tự dọn.
  results="$D/test-results"
  rm -rf -- "$results"
  if [[ -d "$wt/test-results" ]]; then
    mv "$wt/test-results" "$results"
  fi

  # Push TRƯỚC, publish SAU. Khối bằng chứng ghi commit lấy từ HEAD của worktree;
  # nếu publish trước khi push thì SHA trong khối không phải head của PR, và
  # rule_scan sẽ khớp lại ở mọi tick sau — vòng lặp vô hạn tốn cả quota lẫn máy.
  worktree_push_and_report "$slug" "$num" "$id" "$RULE_ID"

  if [[ ! -f "$results/results.json" ]]; then
    evidence_fail "$slug" "$num" "$id" \
      "không tìm thấy \`test-results/results.json\` — suite chưa chạy được, hoặc chạy mà không bật json reporter"
    return 1
  fi

  run_id="$id-$(date -u +%Y%m%dT%H%M%SZ)"
  if evidence_publish "$num" "$wt" "$results" "$run_id"; then
    # Không ghi record_run ở đây: worktree_push_and_report vừa ghi "ok" xong.
    attempt_reset "$id.evidence"
    return 0
  fi

  evidence_fail "$slug" "$num" "$id" \
    "không publish được — suite còn đỏ hoặc còn flake (script từ chối, và nó cố ý không có \`--force\`), thiếu \`mc\`/\`ffmpeg\`, hoặc \`MINIO_*\` chưa điền trong \`/etc/bee/orch.env\`"
  return 1
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

Chưa publish gì cả — PR không có bằng chứng vẫn tốt hơn PR có bằng chứng giả. Log đầy đủ: \`be logs $id\`. Gỡ \`needs-human\` để thử lại."
  else
    gh_comment "$REPO_FULL" "$num" "<!-- agent-run -->
🤖 **evidence** · chưa ra được bằng chứng (lần $attempts/2): $why. Sẽ thử lại ở tick sau."
  fi
}

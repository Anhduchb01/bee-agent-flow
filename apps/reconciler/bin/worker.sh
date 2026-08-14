#!/usr/bin/env bash
#
# worker.sh — chạy bên trong bee-task@<slug>-<số>.service.
# Đây là nơi việc dài diễn ra. Nó chạy dưới bee-orch (có GH_TOKEN, có
# docker) và gọi agent qua sudo sang bee-agent (không có gì cả).
#
#   worker.sh <slug>-<số>

set -euo pipefail

LIB="${BEE_PREFIX:-/opt/bee}/lib"
source "$LIB/common.sh"; source "$LIB/config.sh"
source "$LIB/github.sh"; source "$LIB/state.sh"; source "$LIB/evidence.sh"

ID="${1:?cần <slug>-<số>}"
SLUG="${ID%-*}"
NUM="${ID##*-}"

load_global_config
load_repo_config "$SLUG"

D=$(state_dir "$ID")
RULE=$(cat "$D/rule" 2>/dev/null) || die "$ID: không có claim — worker được gọi sai cách"
RULE_FILE="$BEE_PREFIX/rules/$RULE.sh"
[[ -f "$RULE_FILE" ]] || die "không tìm thấy rule: $RULE"

# =============================================================================
# Hạ tầng test — do ORCH dựng, agent chỉ kết nối vào.
#
# Agent không thuộc group docker (thuộc = tương đương root), nên nó không tự
# dựng được Postgres/Redis. Ranh giới: Docker chạy hạ tầng phụ trợ do orch quản;
# ứng dụng và test là tiến trình thường chạy dưới agent.
# =============================================================================

# Trích một file từ origin/HEAD ra temp rồi in đường dẫn. Trả về 1 nếu không có.
#
# ĐÂY LÀ RANH GIỚI, KHÔNG PHẢI TIỆN ÍCH. Mọi file mà orch *chạy* hoặc *diễn
# giải* đều phải đi qua đây. Agent sửa được mọi file trong worktree, mà orch thì
# có GH_TOKEN và group docker — chạy một file do agent viết là agent thoát ra
# quyền root, đúng bằng con đường mà việc cấm agent vào group docker vừa bịt.
# Một compose file khai báo được `privileged: true` hoặc `volumes: ["/:/host"]`;
# một shell script thì khỏi cần khai báo gì.
from_main() {
  local path="$1" mode="${2:-644}" tmp
  tmp=$(mktemp)
  if ! git --git-dir="$REPO_GIT" show "origin/HEAD:$path" > "$tmp" 2>/dev/null; then
    rm -f "$tmp"; return 1
  fi
  chmod "$mode" "$tmp"
  printf '%s' "$tmp"
}

testenv_up() {
  local slug="$1" id="$2" wt="$3" compose f env_file

  # repo không có hạ tầng test — không sao, nhiều task không cần.
  compose=$(from_main "infra/docker-compose.test.yml") || return 0

  docker compose -p "$id" -f "$compose" up -d --wait 2>&1 | tail -5 >&2 || {
    rm -f "$compose"; return 1
  }
  printf '%s' "$compose" > "$D/compose-file"

  # Cổng động: compose khai báo ports:["5432"] (không phải "5432:5432") nên
  # Docker tự cấp cổng rỗi. Ba worker song song không đụng nhau, và cũng không
  # đụng con Postgres bạn đang chạy cho việc riêng.
  env_file="$wt/.env.test"
  : > "$env_file"
  while read -r svc port; do
    [[ -z "$svc" ]] && continue
    printf '%s_PORT=%s\n' "$(tr '[:lower:]-' '[:upper:]_' <<<"$svc")" "$port" >> "$env_file"
  done < <(docker compose -p "$id" -f "$compose" ps --format json 2>/dev/null \
             | jq -r '.[]? // . | select(.Publishers) | .Service as $s
                      | .Publishers[] | select(.PublishedPort > 0)
                      | "\($s) \(.PublishedPort)"' 2>/dev/null || true)

  # Mọi thứ agent nhìn thấy đều phải là thứ không đáng ăn cắp. Tài khoản của một
  # container sống 20 phút rồi bị `down -v` xoá sạch thì lộ cũng chẳng mất gì.
  cat >> "$env_file" <<'EOF'
NODE_ENV=test
JWT_SECRET=test-only-not-a-real-secret
EOF
  chgrp "$BEE_GROUP" "$env_file" 2>/dev/null || true
  chmod 640 "$env_file"
}

testenv_down() {
  local id="$1" compose

  # Đối xứng với testenv_up: file nào orch sinh ra thì orch dọn. Bỏ dòng này thì
  # `git add -A` ở worktree_push_and_report quét luôn .env.test vào PR — cổng
  # động của lần chạy đó, vô nghĩa với người review và lặp lại ở mọi PR.
  rm -f -- "$BEE_SRV/work/$id/.env.test"

  compose=$(cat "$D/compose-file" 2>/dev/null) || return 0
  docker compose -p "$id" -f "$compose" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$compose" "$D/compose-file"
}

# =============================================================================
# Worktree
# =============================================================================

# Giữ sản phẩm phụ CỦA BEE ra khỏi commit.
#
# worktree_push_and_report chạy `git add -A`, nên thứ gì bee sinh ra mà repo đích
# không biết để ignore sẽ lọt thẳng vào PR: `.env.test` do orch ghi, `test-results/`
# do chính prompt của bee yêu cầu agent tạo. Bắt mọi repo đích phải tự ignore hộ
# là đẩy trách nhiệm sai chỗ.
#
# info/exclude nằm ở common dir nên viết một lần là mọi worktree đều có, và nó chỉ
# ảnh hưởng file CHƯA được track — repo nào thật sự track test-results vẫn nguyên.
bee_exclude() {
  local ex="$REPO_GIT/info/exclude" line
  mkdir -p "$(dirname "$ex")"
  for line in '.env.test' 'test-results/' 'playwright-report/'; do
    grep -qxF -- "$line" "$ex" 2>/dev/null || printf '%s\n' "$line" >> "$ex"
  done
}

worktree_ensure() {
  local slug="$1" num="$2" mode="$3" wt="$BEE_SRV/work/$slug-$num" ref

  git --git-dir="$REPO_GIT" fetch --prune --quiet origin || true
  bee_exclude

  if [[ -d "$wt" ]]; then
    # Worktree còn sót từ lần chạy trước. Với hai chế độ CHỈ ĐỌC, phải kéo nó về
    # đúng ref của lần này.
    #
    # Dùng lại nguyên trạng nghĩa là chạy test trên một cây code KHÁC với SHA mà
    # kết quả sẽ được gắn vào. `bee/test` xanh cho một commit chưa từng được
    # kiểm là lỗ hổng nằm ngay giữa cổng chất lượng — và nó không để lại dấu
    # hiệu nào, vì status vẫn hiện ra đúng chỗ với đúng màu.
    #
    # `new:*` cố ý KHÔNG đụng tới: đó là nhánh agent đang dựng dở, và rule 01
    # mới là chỗ chịu trách nhiệm dọn nó.
    case "$mode" in
      pr)        ref=$(gh pr view "$num" --repo "$REPO_FULL" --json headRefName --jq '.headRefName')
                 git --git-dir="$REPO_GIT" fetch --quiet origin "$ref"
                 git -C "$wt" reset -q --hard "origin/$ref"
                 git -C "$wt" clean -qfd ;;
      readonly)  git -C "$wt" reset -q --hard origin/HEAD
                 git -C "$wt" clean -qfd ;;
    esac
  else
    case "$mode" in
      new:*)     git --git-dir="$REPO_GIT" worktree add -q -B "${mode#new:}" "$wt" origin/HEAD ;;
      pr)        ref=$(gh pr view "$num" --repo "$REPO_FULL" --json headRefName --jq '.headRefName')
                 git --git-dir="$REPO_GIT" fetch --quiet origin "$ref"
                 git --git-dir="$REPO_GIT" worktree add -q -B "$ref" "$wt" "origin/$ref" ;;
      readonly)  git --git-dir="$REPO_GIT" worktree add -q --detach "$wt" origin/HEAD ;;
    esac
    # setgid trên thư mục cha đã lo group; chỉ cần mở quyền ghi cho group.
    chgrp -R "$BEE_GROUP" "$wt" 2>/dev/null || true
    chmod -R g+rwX "$wt" 2>/dev/null || true
  fi
  printf '%s' "$wt"
}

# Gỡ worktree một cách CHỊU ĐƯỢC worktree hỏng.
#
# `worktree prune` bỏ qua worktree đang bị KHOÁ, và `git worktree add` bị SIGKILL
# đúng lúc để lại đúng thứ đó: một đăng ký bị khoá với HEAD là 0000000. Từ lúc
# ấy MỌI `git fetch` trên bare repo đều đổ với `fatal: bad object
# worktrees/<id>/HEAD`, nghĩa là cả repo chết với bee — và rule 01, vốn sinh ra
# để dọn sau khi máy chết giữa chừng, cũng không dọn nổi vì nó chỉ gọi `prune`.
#
# Xoá thẳng thư mục đăng ký là cách duy nhất chắc chắn gỡ được một entry khoá
# hoặc hỏng. Gặp thật khi nghiệm thu P2.1.
worktree_remove() {
  local id="$1" wt="$BEE_SRV/work/$1"
  git --git-dir="$REPO_GIT" worktree remove --force "$wt" 2>/dev/null || true
  rm -rf -- "$wt" "$REPO_GIT/worktrees/$id"
  git --git-dir="$REPO_GIT" worktree prune 2>/dev/null || true
}

# =============================================================================
# Gọi agent — đây là ranh giới token.
#
# sudo mặc định bật env_reset nên môi trường bị dọn sạch trước khi chạy. Bảo đảm
# "agent không thấy GH_TOKEN" là do sudo lo, không phải do ta nhớ lọc.
# =============================================================================

run_agent() {
  local id="$1" prompt="$2" resume="${3:-}" wt="$BEE_SRV/work/$id" rc=0
  local log="$D/run.jsonl" out="$D/agent-output.txt" result

  chmod 644 "$prompt"
  sudo -u "$AGENT_USER" -H "$BEE_PREFIX/bin/agent-exec.sh" \
       "$wt" "$prompt" "$log" "$resume" || rc=$?

  # Dòng cuối kiểu "result" mang session_id, num_turns, duration — bóc ra để
  # báo cáo, và để --resume nối lại phiên ở vòng review sau.
  result=$(grep '"type":"result"' "$log" 2>/dev/null | tail -1 || true)
  if [[ -n "$result" ]]; then
    jq -r '.session_id // empty' <<<"$result" > "$D/session_id"
    jq -r '.result // empty'     <<<"$result" > "$out"
    jq -r '.num_turns // 0'      <<<"$result" > "$D/turns"
    jq -r '((.duration_ms // 0) / 1000 | floor)' <<<"$result" > "$D/duration"

    # Mức dùng và lý do dừng. `record_run` gộp file này vào bản ghi lịch sử.
    #
    # Phẳng chứ không lồng: bản ghi trong `recent.jsonl` là một object phẳng, và
    # một nhánh `usage` lồng bên trong sẽ bắt mọi chỗ đọc phải biết hai hình dạng.
    #
    # `stop_reason` và `api_error_status` là hai trường quan trọng nhất ở đây —
    # chúng là thứ duy nhất phân biệt được agent dừng vì hết hạn mức với agent
    # dừng vì đã làm xong hoặc vì test đỏ.
    jq -c '{
      tokens_in:          (.usage.input_tokens                // 0),
      tokens_out:         (.usage.output_tokens               // 0),
      tokens_cache_read:  (.usage.cache_read_input_tokens     // 0),
      tokens_cache_write: (.usage.cache_creation_input_tokens // 0),
      cost_usd:           (.total_cost_usd                    // 0),
      stop_reason:        (.stop_reason                       // null),
      api_error_status:   (.api_error_status                  // null)
    }' <<<"$result" > "$D/usage.json" 2>/dev/null || true
  fi

  # Hạn mức là chuyện của CẢ TÀI KHOẢN, không phải của một lần chạy — nên nó ghi
  # ra chỗ dùng chung chứ không vào thư mục state, vốn bị xoá sau mỗi lần chạy.
  #
  # `rate_limit_event` không phải lần chạy nào cũng có; không có thì giữ nguyên
  # bản cũ, vì "lần cuối biết được" vẫn đúng hơn là không biết gì.
  local rl
  rl=$(grep '"type":"rate_limit_event"' "$log" 2>/dev/null | tail -1 || true)
  if [[ -n "$rl" ]]; then
    mkdir -p "$BEE_SRV/state"
    jq -c '.rate_limit_info + {seen_at: now | todate}' <<<"$rl" \
      > "$BEE_SRV/state/claude-rate-limit.json" 2>/dev/null || true
  fi

  return $rc
}

# =============================================================================
# Đẩy code + báo cáo ngược. CHỈ orch làm được — agent không có token.
# =============================================================================

worktree_push_and_report() {
  local slug="$1" num="$2" id="$3" rule="$4" branch="${5:-}"
  local wt="$BEE_SRV/work/$id" turns dur pr=""

  turns=$(cat "$D/turns" 2>/dev/null || echo 0)
  dur=$(cat "$D/duration" 2>/dev/null || echo 0)

  if [[ -n "$(git -C "$wt" status --porcelain)" ]] \
     || ! git -C "$wt" diff --quiet "origin/HEAD"..HEAD 2>/dev/null; then

    git -C "$wt" -c user.name="bee-agent" -c user.email="agent@localhost" \
        add -A 2>/dev/null || true
    git -C "$wt" -c user.name="bee-agent" -c user.email="agent@localhost" \
        commit -q -m "wip: thay đổi chưa commit từ agent" >/dev/null 2>&1 || true

    branch="${branch:-$(git -C "$wt" rev-parse --abbrev-ref HEAD)}"
    git -C "$wt" push -q --set-upstream origin "HEAD:refs/heads/$branch"

    if ! gh pr view "$branch" --repo "$REPO_FULL" >/dev/null 2>&1; then
      pr=$(gh pr create --repo "$REPO_FULL" --draft --base main --head "$branch" \
             --title "$(gh issue view "$num" --repo "$REPO_FULL" --json title --jq '.title')" \
             --body "Closes #$num

<!-- evidence:start -->
_Bằng chứng sẽ được gắn tự động khi CI xanh._
<!-- evidence:end -->" 2>/dev/null) || true
      [[ -n "$pr" ]] && gh pr edit "$pr" --repo "$REPO_FULL" --add-label "agent:built" >/dev/null 2>&1 || true
    fi
  fi

  gh_comment "$REPO_FULL" "$num" "<!-- agent-run -->
🤖 **$rule** · $turns turn · $(human_dur "$dur") · \`$(cat "$D/session_id" 2>/dev/null || echo '-')\`
${pr:+Đã tạo $pr}

$(head -c 1500 "$D/agent-output.txt" 2>/dev/null || true)"

  record_run "$id" "$slug" "$num" "$rule" "ok" "$turns" "$dur"
  attempt_reset "$id"
}

# =============================================================================
trap 'testenv_down "$ID"; claim_clear "$ID"' EXIT

# shellcheck source=/dev/null
source "$RULE_FILE"
rule_run "$SLUG" "$NUM"

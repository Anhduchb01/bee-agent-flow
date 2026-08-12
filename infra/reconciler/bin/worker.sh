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
source "$LIB/github.sh"; source "$LIB/state.sh"

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

testenv_up() {
  local slug="$1" id="$2" wt="$3" compose f env_file
  compose=$(mktemp)

  # Compose file lấy từ origin/main, KHÔNG lấy từ worktree: agent sửa được mọi
  # file trong worktree, mà compose file khai báo được privileged:true hoặc
  # volumes:["/:/host"]. Chạy compose do agent viết = agent thoát ra quyền root,
  # đúng bằng con đường mà việc cấm docker group vừa bịt.
  if ! git --git-dir="$REPO_GIT" show "origin/HEAD:infra/docker-compose.test.yml" > "$compose" 2>/dev/null; then
    rm -f "$compose"; return 0        # repo không có hạ tầng test — không sao
  fi

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
  compose=$(cat "$D/compose-file" 2>/dev/null) || return 0
  docker compose -p "$id" -f "$compose" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$compose" "$D/compose-file"
}

# =============================================================================
# Worktree
# =============================================================================

worktree_ensure() {
  local slug="$1" num="$2" mode="$3" wt="$BEE_SRV/work/$slug-$num" ref

  git --git-dir="$REPO_GIT" fetch --prune --quiet origin || true

  if [[ ! -d "$wt" ]]; then
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

worktree_remove() {
  git --git-dir="$REPO_GIT" worktree remove --force "$BEE_SRV/work/$1" 2>/dev/null || true
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
        commit -q -m "wip: thay đổi chưa commit từ agent" 2>/dev/null || true

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

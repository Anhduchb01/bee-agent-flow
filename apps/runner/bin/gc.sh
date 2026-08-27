#!/usr/bin/env bash
# gc.sh — thu hồi worktree của phiên đã kết thúc. Chạy bởi bee-gc.timer.
#
# Vì sao cần: một worktree repo thật nặng ~1GB (node_modules), và không có gì
# dọn chúng. Đo 24/08: work/ 3.0GB / 6 worktree, và CẢ SÁU đều thuộc phiên đã
# kết thúc — tức 100% là rác.
#
# Nguyên tắc: THÀ GIỮ NHẦM CÒN HƠN XOÁ NHẦM. Chỉ thu hồi khi chắc chắn không
# mất gì — code đã rời máy (đã push hoặc đã vào nhánh mặc định). Mọi trường hợp
# còn lại giữ nguyên và ghi lý do vào gc.json để người đọc biết vì sao đĩa chưa
# giảm, thay vì phải đoán.
#
# gc KHÔNG BAO GIỜ đụng sessions/<id>/ — run.jsonl và evidence sống ở đó, và
# "dọn rồi vẫn xem lại được" là hợp đồng với người dùng (spec §4.7, D3).
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

# gc chạy trong timer, không có ai ngồi trước màn hình: git PHẢI không được
# hỏi mật khẩu (treo vĩnh viễn = gc chết im lặng), và ls-remote phải có trần
# thời gian (mạng lag = tick sau dồn lên).
export GIT_TERMINAL_PROMPT=0
LS_TIMEOUT="${GC_LS_TIMEOUT:-20}"

GC_AGE_H="${GC_AGE_H:-24}"
NGUONG=$(( GC_AGE_H * 3600 ))
NOW=$(date -u +%s)

removed=0
freed=0
ITEMS='[]'

record() {  # ghi <id> <action> <reason> <bytes>
  ITEMS=$(jq -c --arg i "$1" --arg a "$2" --arg r "$3" --argjson b "${4:-0}" \
    '. + [{id:$i, action:$a, reason:$r, bytes:$b}]' <<<"$ITEMS")
}

epoch_of() {  # ISO → epoch; rỗng/hỏng → 0 (coi như rất cũ, để luật khác quyết)
  [[ -n "$1" ]] && date -u -d "$1" +%s 2>/dev/null || echo 0
}

has_compose() {  # does the worktree declare a compose file?
  local wt="$1" f
  for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    [[ -f "$wt/$f" ]] && return 0
  done
  return 1
}

# teardown_compose <id> <slug> <num> <worktree> — hạ compose project của phiên.
# In ĐÚNG một dòng:
#   none            nothing to clean up
#   removed:<a,b>   these projects were brought down
#   keep:<reason>   could not clean up → the worktree must be KEPT
#
# Why "keep" exists: removing a worktree before its containers are down turns
# them into orphans nobody can trace back to a session. That is exactly how
# 6.9GB of volumes across 17 of them piled up on this machine. Same principle
# as the rest of this file — better to keep by mistake than delete by mistake.
# But only keep when the worktree ACTUALLY declares compose: docker being down
# must not block a session that never touched docker. That is a different bug,
# and rig-07 watches both directions.
#
# Two project names because there are two eras: `bee-<uuid8>` (spec
# service-slices §4) and `bee-<slug>-<num>` (what bee-preview still uses). We
# ask by label before bringing anything down, so trying both costs nothing.
teardown_compose() {
  local id="$1" slug="$2" num="$3" wt="$4" uuid8 p
  uuid8="${id//-/}"; uuid8="${uuid8:0:8}"

  if ! command -v docker >/dev/null 2>&1; then
    has_compose "$wt" \
      && { echo "keep:no docker on this machine but the worktree declares compose — cannot bring the session's containers down"; return; }
    echo none; return
  fi
  if ! docker info >/dev/null 2>&1; then
    has_compose "$wt" \
      && { echo "keep:docker is not running — the session's containers are still up, keeping the worktree so they stay traceable"; return; }
    echo none; return
  fi

  local da=()
  for p in "bee-$uuid8" "bee-$slug-$num"; do
    [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$p" 2>/dev/null)" ]] || continue
    # -v because volumes are the part that fills the disk; --remove-orphans
    # because a service deleted from compose mid-run still leaves a container
    # carrying this project label.
    if docker compose -p "$p" down -v --remove-orphans >/dev/null 2>&1; then
      da+=("$p")
    else
      echo "keep:could not bring compose project $p down — keeping the worktree so the next tick can retry"
      return
    fi
  done
  if (( ${#da[@]} )); then
    local IFS=,
    echo "removed:${da[*]}"
    return
  fi
  echo none
}

for wt in "$BEE_ROOT"/work/*/; do
  [[ -d "$wt" ]] || continue
  wt="${wt%/}"
  id=$(basename "$wt")
  sdir="$BEE_ROOT/sessions/$id"
  meta="$sdir/meta.json"

  # Không có sổ = phiên đang được dựng, hoặc rác không rõ nguồn gốc. Cả hai
  # đều KHÔNG phải việc của gc: xoá một worktree mà không biết nó của ai là
  # đúng loại rủi ro tài liệu này tồn tại để tránh.
  if [[ ! -f "$meta" ]]; then
    record "$id" kept "không có meta.json — không biết của phiên nào"
    continue
  fi

  status=$(jq -r '.status // "?"' "$meta")
  case "$status" in
    running|starting) record "$id" kept "phiên đang $status"; continue;;
  esac

  if [[ "$(jq -r '.needs_human // false' "$meta")" == "true" ]]; then
    record "$id" kept "needs_human — người còn phải xem cái xác này"
    continue
  fi

  ended=$(epoch_of "$(jq -r '.ended_at // empty' "$meta")")
  # Thiếu ended_at thì lấy mtime của meta — vẫn là một mốc thật.
  (( ended == 0 )) && ended=$(stat -c %Y "$meta" 2>/dev/null || echo 0)
  age=$(( NOW - ended ))
  if (( age < NGUONG )); then
    record "$id" kept "mới kết thúc $(( age / 60 )) phút trước (< ${GC_AGE_H}h)"
    continue
  fi

  slug=$(jq -r '.slug // empty' "$sdir/session.json" 2>/dev/null || echo "")
  num=$(jq -r '.num // empty' "$sdir/session.json" 2>/dev/null || echo "")
  bare="$BEE_ROOT/repos/$slug.git"
  branch="bee/$slug-$num"

  # ── Code đã rời máy chưa? Ba câu trả lời, và chỉ hai câu cho phép xoá ──
  safe=""
  reason=""
  if [[ -z "$slug" || ! -d "$bare" ]]; then
    safe=1; reason="không còn bare repo — không có nhánh nào để mất"
  elif ! git --git-dir="$bare" show-ref -q --verify "refs/heads/$branch"; then
    safe=1; reason="nhánh $branch không tồn tại"
  else
    local_sha=$(git --git-dir="$bare" rev-parse "$branch")
    def=$(git --git-dir="$bare" symbolic-ref --short HEAD 2>/dev/null || echo main)

    # ls-remote cần mạng. Hỏng thì GIỮ: không biết đã push chưa mà vẫn xoá là
    # đúng cái cách làm mất việc mà rig-07 canh.
    ls_err=$(mktemp)
    if remote_sha=$(timeout "$LS_TIMEOUT" git --git-dir="$bare" ls-remote origin "refs/heads/$branch" 2>"$ls_err" | cut -f1); then
      if [[ "$remote_sha" == "$local_sha" ]]; then
        safe=1; reason="đã push hết lên origin/$branch"
      elif git --git-dir="$bare" merge-base --is-ancestor "$branch" "$def" 2>/dev/null; then
        safe=1; reason="đã merge vào $def"
      else
        reason="còn commit chưa push trên $branch"
      fi
    else
      # Chép lại lỗi git THẬT thay vì đoán: "mất mạng" và "PAT không đọc được
      # repo" dẫn tới hai hành động sửa khác hẳn nhau, mà người đọc gc.json
      # chỉ có đúng dòng này để phân biệt. (Máy thật 24/08: "Repository not
      # found" — sai tài khoản gh, không phải mạng.)
      reason="không hỏi được origin: $(grep -m1 -E 'fatal|remote:|error' "$ls_err" 2>/dev/null | cut -c1-120)"
    fi
    rm -f "$ls_err"
  fi

  # "Đã push" nói về NHÁNH. Thư mục làm việc là chuyện khác: phiên bị kill giữa
  # chừng có thể để lại sửa đổi chưa commit, và xoá lúc đó là mất việc thật —
  # đúng thứ luật này tồn tại để tránh. `status --porcelain` bỏ qua file đã
  # gitignore, nên node_modules không chặn gc (đó mới là phần nặng cần dọn).
  if [[ -n "$safe" ]] && [[ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]]; then
    safe=""
    reason="còn thay đổi chưa commit trong worktree"
  fi

  if [[ -z "$safe" ]]; then
    record "$id" kept "$reason"
    continue
  fi

  # ── The session's containers: down BEFORE the worktree disappears ─────
  # compose needs the file in the worktree to read, and a container still
  # running with the directory pulled out from under it spews log noise until
  # somebody notices. rig-07 part 2 watches this order, not just the call.
  docker_result=$(teardown_compose "$id" "$slug" "$num" "$wt")
  if [[ "$docker_result" == keep:* ]]; then
    record "$id" kept "${docker_result#keep:}"
    continue
  fi
  if [[ "$docker_result" == removed:* ]]; then
    reason="$reason; docker: brought down ${docker_result#removed:}"
  fi

  # ── Service slice (T15) ───────────────────────────────────────────────
  # Same rule as the containers above: if we cannot give the slice back, KEEP
  # the worktree. A database nobody can trace to a session is worse than a
  # directory that survived one more day. service-slice exits 0 when the
  # session never had a slice, so this stays quiet for most sessions.
  slice_sh="$(dirname "$(readlink -f "$0")")/service-slice.sh"
  if [[ -x "$slice_sh" && -f "$sdir/services.json" ]]; then
    if "$slice_sh" reclaim "$id" >/dev/null 2>&1; then
      reason="$reason; service slice: given back"
    else
      record "$id" kept "could not give the service slice back — keeping the worktree so the next tick can retry"
      continue
    fi
  fi

  # ── Thu hồi ────────────────────────────────────────────────────────────
  bytes=$(du -sb "$wt" 2>/dev/null | cut -f1 || echo 0)
  if [[ -d "$bare" ]]; then
    git --git-dir="$bare" worktree remove --force "$wt" 2>/dev/null || true
    git --git-dir="$bare" worktree prune 2>/dev/null || true
  fi
  rm -rf "$wt"

  # Nhánh: chỉ xoá khi nội dung đã nằm trong nhánh mặc định. Đã push mà chưa
  # merge thì GIỮ — nhánh đó là cái PR đang chờ người duyệt.
  if [[ -d "$bare" ]] && git --git-dir="$bare" show-ref -q --verify "refs/heads/$branch" \
     && git --git-dir="$bare" merge-base --is-ancestor "$branch" \
          "$(git --git-dir="$bare" symbolic-ref --short HEAD 2>/dev/null || echo main)" 2>/dev/null; then
    git --git-dir="$bare" branch -q -D "$branch" 2>/dev/null || true
    reason="$reason; nhánh đã xoá"
  fi

  removed=$(( removed + 1 ))
  freed=$(( freed + bytes ))
  record "$id" removed "$reason" "$bytes"
done

# LUÔN ghi gc.json, kể cả khi không thu hồi gì — cùng kỷ luật với heartbeat:
# tuổi của file này là cách duy nhất để biết gc còn sống hay đã chết im lặng.
mkdir -p "$BEE_ROOT"
tmp="$BEE_ROOT/.gc.json.tmp"
jq -n --arg t "$(now_iso)" --argjson r "$removed" --argjson f "$freed" \
      --argjson age "$GC_AGE_H" --argjson items "$ITEMS" \
  '{ts:$t, removed:$r, freed_bytes:$f, age_hours:$age, items:$items}' > "$tmp"
mv "$tmp" "$BEE_ROOT/gc.json"

printf 'gc: thu hồi %d worktree, %s\n' "$removed" \
  "$(numfmt --to=iec "$freed" 2>/dev/null || echo "${freed}B")"

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

ghi() {  # ghi <id> <action> <reason> <bytes>
  ITEMS=$(jq -c --arg i "$1" --arg a "$2" --arg r "$3" --argjson b "${4:-0}" \
    '. + [{id:$i, action:$a, reason:$r, bytes:$b}]' <<<"$ITEMS")
}

epoch_cua() {  # ISO → epoch; rỗng/hỏng → 0 (coi như rất cũ, để luật khác quyết)
  [[ -n "$1" ]] && date -u -d "$1" +%s 2>/dev/null || echo 0
}

co_compose() {  # worktree có khai compose không
  local wt="$1" f
  for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    [[ -f "$wt/$f" ]] && return 0
  done
  return 1
}

# don_docker <id> <slug> <num> <worktree> — hạ compose project của phiên.
# In ĐÚNG một dòng:
#   none            không có gì để dọn
#   removed:<a,b>   đã hạ những project này
#   giu:<lý do>     KHÔNG dọn nổi → worktree phải được GIỮ
#
# Vì sao "giu" tồn tại: xoá worktree khi chưa hạ được container là biến chúng
# thành mồ côi không ai lần ra được của phiên nào. Đó chính là cách 6.9GB
# volume / 17 cái tích lại trên máy này. Cùng nguyên tắc với cả file: THÀ GIỮ
# NHẦM CÒN HƠN XOÁ NHẦM — nhưng chỉ giữ khi worktree THẬT SỰ có khai compose,
# chứ docker chết mà chặn oan cả phiên chưa từng đụng docker thì là lỗi khác.
#
# Hai tên project vì hai thời kỳ: `bee-<uuid8>` (spec lat-dich-vu §4) và
# `bee-<slug>-<num>` (skill bee-preview đang dùng). Hỏi nhãn trước rồi mới hạ,
# nên thử cả hai không tốn gì.
don_docker() {
  local id="$1" slug="$2" num="$3" wt="$4" uuid8 p
  uuid8="${id//-/}"; uuid8="${uuid8:0:8}"

  if ! command -v docker >/dev/null 2>&1; then
    co_compose "$wt" \
      && { echo "giu:máy không có docker mà worktree khai compose — không hạ nổi container của phiên"; return; }
    echo none; return
  fi
  if ! docker info >/dev/null 2>&1; then
    co_compose "$wt" \
      && { echo "giu:docker không chạy — chưa hạ được container của phiên, giữ worktree để còn lần ra"; return; }
    echo none; return
  fi

  local da=()
  for p in "bee-$uuid8" "bee-$slug-$num"; do
    [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$p" 2>/dev/null)" ]] || continue
    # -v vì volume mới là phần chiếm đĩa; --remove-orphans vì service bị xoá
    # khỏi compose giữa chừng vẫn để lại container mang nhãn project này.
    if docker compose -p "$p" down -v --remove-orphans >/dev/null 2>&1; then
      da+=("$p")
    else
      echo "giu:hạ compose project $p thất bại — giữ worktree để tick sau thử lại"
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
    ghi "$id" kept "không có meta.json — không biết của phiên nào"
    continue
  fi

  status=$(jq -r '.status // "?"' "$meta")
  case "$status" in
    running|starting) ghi "$id" kept "phiên đang $status"; continue;;
  esac

  if [[ "$(jq -r '.needs_human // false' "$meta")" == "true" ]]; then
    ghi "$id" kept "needs_human — người còn phải xem cái xác này"
    continue
  fi

  ended=$(epoch_cua "$(jq -r '.ended_at // empty' "$meta")")
  # Thiếu ended_at thì lấy mtime của meta — vẫn là một mốc thật.
  (( ended == 0 )) && ended=$(stat -c %Y "$meta" 2>/dev/null || echo 0)
  tuoi=$(( NOW - ended ))
  if (( tuoi < NGUONG )); then
    ghi "$id" kept "mới kết thúc $(( tuoi / 60 )) phút trước (< ${GC_AGE_H}h)"
    continue
  fi

  slug=$(jq -r '.slug // empty' "$sdir/session.json" 2>/dev/null || echo "")
  num=$(jq -r '.num // empty' "$sdir/session.json" 2>/dev/null || echo "")
  bare="$BEE_ROOT/repos/$slug.git"
  branch="bee/$slug-$num"

  # ── Code đã rời máy chưa? Ba câu trả lời, và chỉ hai câu cho phép xoá ──
  an_toan=""
  ly_do=""
  if [[ -z "$slug" || ! -d "$bare" ]]; then
    an_toan=1; ly_do="không còn bare repo — không có nhánh nào để mất"
  elif ! git --git-dir="$bare" show-ref -q --verify "refs/heads/$branch"; then
    an_toan=1; ly_do="nhánh $branch không tồn tại"
  else
    local_sha=$(git --git-dir="$bare" rev-parse "$branch")
    def=$(git --git-dir="$bare" symbolic-ref --short HEAD 2>/dev/null || echo main)

    # ls-remote cần mạng. Hỏng thì GIỮ: không biết đã push chưa mà vẫn xoá là
    # đúng cái cách làm mất việc mà rig-07 canh.
    loi_ls=$(mktemp)
    if remote_sha=$(timeout "$LS_TIMEOUT" git --git-dir="$bare" ls-remote origin "refs/heads/$branch" 2>"$loi_ls" | cut -f1); then
      if [[ "$remote_sha" == "$local_sha" ]]; then
        an_toan=1; ly_do="đã push hết lên origin/$branch"
      elif git --git-dir="$bare" merge-base --is-ancestor "$branch" "$def" 2>/dev/null; then
        an_toan=1; ly_do="đã merge vào $def"
      else
        ly_do="còn commit chưa push trên $branch"
      fi
    else
      # Chép lại lỗi git THẬT thay vì đoán: "mất mạng" và "PAT không đọc được
      # repo" dẫn tới hai hành động sửa khác hẳn nhau, mà người đọc gc.json
      # chỉ có đúng dòng này để phân biệt. (Máy thật 24/08: "Repository not
      # found" — sai tài khoản gh, không phải mạng.)
      ly_do="không hỏi được origin: $(grep -m1 -E 'fatal|remote:|error' "$loi_ls" 2>/dev/null | cut -c1-120)"
    fi
    rm -f "$loi_ls"
  fi

  # "Đã push" nói về NHÁNH. Thư mục làm việc là chuyện khác: phiên bị kill giữa
  # chừng có thể để lại sửa đổi chưa commit, và xoá lúc đó là mất việc thật —
  # đúng thứ luật này tồn tại để tránh. `status --porcelain` bỏ qua file đã
  # gitignore, nên node_modules không chặn gc (đó mới là phần nặng cần dọn).
  if [[ -n "$an_toan" ]] && [[ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]]; then
    an_toan=""
    ly_do="còn thay đổi chưa commit trong worktree"
  fi

  if [[ -z "$an_toan" ]]; then
    ghi "$id" kept "$ly_do"
    continue
  fi

  # ── Docker của phiên: hạ TRƯỚC khi worktree biến mất ──────────────────
  # compose cần file trong worktree để đọc, và một container còn sống mà thư
  # mục dưới chân nó vừa bị xoá sẽ đổ log rác cho tới khi ai đó để ý. Thứ tự
  # này là thứ rig-07 phần 2 canh.
  kq_docker=$(don_docker "$id" "$slug" "$num" "$wt")
  if [[ "$kq_docker" == giu:* ]]; then
    ghi "$id" kept "${kq_docker#giu:}"
    continue
  fi
  if [[ "$kq_docker" == removed:* ]]; then
    ly_do="$ly_do; docker: đã hạ ${kq_docker#removed:}"
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
    ly_do="$ly_do; nhánh đã xoá"
  fi

  removed=$(( removed + 1 ))
  freed=$(( freed + bytes ))
  ghi "$id" removed "$ly_do" "$bytes"
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

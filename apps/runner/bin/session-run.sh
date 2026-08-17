#!/usr/bin/env bash
# session-run.sh <id> — ExecStart của bee-session@<id>.service
#
# Toàn bộ vòng đời một phiên: PAUSE → repo → worktree → FIFO → claude theo
# chế độ (phỏng vấn / làm) → đóng sổ. Spec: docs/specs/session-first.md §2–3.
#
# Hai quyết định không nhìn thấy từ code mà phải nói ra:
# - FIFO mở read-write (exec 3<>): FIFO chỉ-đọc nhận EOF ngay khi người ghi
#   cuối cùng đóng, và claude coi đó là "hết đầu vào" rồi thoát giữa chừng.
#   Đóng fd 3 CHỦ ĐỘNG chính là cách kết thúc một pha sạch sẽ.
# - Chuyển chế độ = vòng lặp pha: web đổi `phase` trong session.json, watcher
#   ở đây thấy, đóng fd 3 cho claude thoát, rồi chạy lại claude --resume với
#   tool. Đã chứng minh nhớ ngữ cảnh bằng rig S0.2.
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

# ── 1 · Kiểm đầu vào — trước khi chạm bất cứ gì trên đĩa ────────────────────
ID="${1:-}"
UUID_RE='^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
[[ "$ID" =~ $UUID_RE ]] || die "id không hợp lệ: $ID"

SDIR="$BEE_ROOT/sessions/$ID"
[[ -f "$SDIR/session.json" ]] || die "thiếu $SDIR/session.json — web phải ghi trước khi start"

# ── 2 · PAUSE — kiểm ở cửa, vì đường mở phiên không đi qua tick nào ────────
if [[ -e "$BEE_ROOT/PAUSE" ]]; then
  lifecycle "$SDIR" "PAUSE đang bật — phiên bị từ chối. Xoá $BEE_ROOT/PAUSE để mở lại."
  meta_merge "$SDIR" "$(jq -cn --arg t "$(now_iso)" \
    '{status:"failed", reason:"paused", ended_at:$t}')"
  exit 0
fi

SLUG=$(jq -r '.slug // empty' "$SDIR/session.json")
NUM=$(jq -r '.num // empty' "$SDIR/session.json")
REPO=$(jq -r '.repo // empty' "$SDIR/session.json")
SYS_PROMPT=$(jq -r '.system_prompt // empty' "$SDIR/session.json")
MAX_TURNS=$(jq -r '.max_turns // 120' "$SDIR/session.json")

[[ "$SLUG" =~ ^[a-z0-9-]+$ ]]                          || die "slug không hợp lệ"
[[ "$NUM"  =~ ^[0-9]+$ ]]                              || die "num không hợp lệ"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]     || die "repo không hợp lệ"

meta_merge "$SDIR" "$(jq -cn --arg t "$(now_iso)" \
  '{status:"running", started_at:$t}')"

# ── 3 · Dọn dẹp — một trap cho mọi lối ra ───────────────────────────────────
CPID=""
DA_DUNG=""      # set khi nhận SIGTERM (systemctl stop / nút Dừng)
FIFO="$BEE_RUNTIME/$ID.in"

don_dep() {
  local rc=$?
  exec 3>&- 2>/dev/null || true
  if [[ -n "$CPID" ]] && kill -0 "$CPID" 2>/dev/null; then
    kill "$CPID" 2>/dev/null || true
    wait "$CPID" 2>/dev/null || true
  fi
  rm -f "$FIFO"

  # usage.json từ dòng result cuối — nguồn số liệu của Epic 3
  if [[ -f "$SDIR/run.jsonl" ]]; then
    jq -c 'select(.type=="result")' "$SDIR/run.jsonl" 2>/dev/null | tail -1 \
      > "$SDIR/usage.json" 2>/dev/null || true
  fi

  # Chỉ đóng sổ nếu meta còn đang running — reaper hoặc PAUSE có thể đã ghi trước
  local hien_tai
  hien_tai=$(jq -r '.status // empty' "$SDIR/meta.json" 2>/dev/null || true)
  if [[ "$hien_tai" == "running" ]]; then
    local ket="failed"
    [[ -n "$DA_DUNG" ]] && ket="stopped"
    [[ -z "$DA_DUNG" && $rc -eq 0 ]] && ket="done"
    meta_merge "$SDIR" "$(jq -cn --arg s "$ket" --arg t "$(now_iso)" \
      '{status:$s, ended_at:$t}')"
    lifecycle "$SDIR" "Phiên kết thúc: $ket."
  fi
}
trap don_dep EXIT
trap 'DA_DUNG=1; exit 0' TERM INT

# ── 4 · Repo: bare clone + worktree + branch của phiên ─────────────────────
BARE="$BEE_ROOT/repos/$SLUG.git"
WT="$BEE_ROOT/work/$ID"
BRANCH="bee/$SLUG-$NUM"

if [[ ! -d "$BARE" ]]; then
  lifecycle "$SDIR" "Chưa có bản sao repo — đang clone $REPO…"
  mkdir -p "$(dirname "$BARE")"
  git clone --bare --quiet "https://github.com/$REPO.git" "$BARE" \
    || { lifecycle "$SDIR" "Clone $REPO thất bại — xem stderr.log."; die "clone fail"; }
fi

# Nhánh mặc định lấy từ HEAD của bare clone — bài học origin/HEAD của mô hình cũ.
DEF=$(git --git-dir="$BARE" symbolic-ref --short HEAD 2>/dev/null || echo main)

# Chỉ fetch nhánh mặc định: fetch +refs/heads/* sẽ đòi cập nhật cả các nhánh
# bee/* đang được worktree khác checkout, và git từ chối. Fetch fail không
# chặn phiên — mở lại một phiên cũ lúc mất mạng vẫn phải được.
lifecycle "$SDIR" "Đang fetch $REPO ($DEF)…"
git --git-dir="$BARE" fetch --quiet origin "+refs/heads/$DEF:refs/heads/$DEF" 2>>"$SDIR/stderr.log" \
  || lifecycle "$SDIR" "Fetch thất bại — dùng bản sao đang có."

if [[ ! -d "$WT" ]]; then
  lifecycle "$SDIR" "Đang dựng worktree trên nhánh $BRANCH…"
  git --git-dir="$BARE" worktree add --quiet -B "$BRANCH" "$WT" "$DEF" 2>>"$SDIR/stderr.log" \
    || { lifecycle "$SDIR" "Dựng worktree thất bại — xem stderr.log."; die "worktree fail"; }
  git -C "$WT" config user.name  "bee-agent"
  git -C "$WT" config user.email "bee-agent@localhost"
fi

mkdir -p "$BEE_RUNTIME"
[[ -p "$FIFO" ]] || mkfifo -m 600 "$FIFO"

# ── 5 · Vòng lặp pha: phỏng vấn ⇄ làm, cùng một session-id ─────────────────
doc_phase() { jq -r '.phase // "interview"' "$SDIR/session.json"; }

while :; do
  PHASE=$(doc_phase)
  ARGS=(-p --input-format stream-json --output-format stream-json --verbose
        --include-partial-messages)

  # Cùng một phiên xuyên các pha: lần chạy đầu đặt tên bằng --session-id,
  # các lần sau nối lại bằng --resume. "Đã có lượt nào chưa" đọc từ chính
  # run.jsonl — không cần file cờ riêng.
  if grep -q '"type":"result"' "$SDIR/run.jsonl" 2>/dev/null; then
    ARGS+=(--resume "$ID")
  else
    ARGS+=(--session-id "$ID")
  fi

  if [[ "$PHASE" == "interview" ]]; then
    # Ranh giới, không phải tinh chỉnh: pha phỏng vấn không có tool nào.
    ARGS+=(--allowedTools "" --max-turns 40)
  else
    ARGS+=(--dangerously-skip-permissions --max-turns "$MAX_TURNS")
  fi
  [[ -n "$SYS_PROMPT" ]] && ARGS+=(--append-system-prompt "$SYS_PROMPT")

  exec 3<>"$FIFO"
  lifecycle "$SDIR" "Phiên đã khởi động — chế độ: $PHASE."
  ( cd "$WT" && exec claude "${ARGS[@]}" ) <&3 >>"$SDIR/run.jsonl" 2>>"$SDIR/stderr.log" &
  CPID=$!

  DOI_PHA=""
  while kill -0 "$CPID" 2>/dev/null; do
    sleep 1
    if [[ "$(doc_phase)" != "$PHASE" ]]; then
      DOI_PHA=1
      lifecycle "$SDIR" "Ok làm đi — chuyển sang chế độ làm, cùng phiên."
      # Đóng người-ghi-thường-trực cuối cùng của FIFO → claude nhận EOF →
      # thoát sạch sau khi xong lượt hiện tại. Không kill, không mất state.
      exec 3>&-
      wait "$CPID" 2>/dev/null || true
      CPID=""
      break
    fi
  done

  if [[ -n "$DOI_PHA" ]]; then continue; fi

  # claude tự thoát (hết lượt, lỗi, hoặc người dùng kết thúc hội thoại)
  RC=0; wait "$CPID" 2>/dev/null || RC=$?
  CPID=""
  exec 3>&- 2>/dev/null || true
  exit "$RC"
done

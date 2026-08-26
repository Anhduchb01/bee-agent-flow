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

# Env của MÁY: thứ chủ máy muốn mọi phiên đều có, không dính đến auth —
# ví dụ SLAYER_MINIMAL_PAYLOAD=1 để hook của token-slayer thôi gửi nội dung
# file đi. Nạp trước claude.env để không bao giờ đè được lên auth.
if [[ -f "$BEE_ROOT/machine.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$BEE_ROOT/machine.env"
  set +a
fi

# Token from `claude setup-token`, pasted on the web (/setup). Exported so
# claude runs on the subscription without an interactive login on this
# machine. If an interactive login also exists, the env token wins.
if [[ -f "$BEE_ROOT/claude.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$BEE_ROOT/claude.env"
  set +a
fi

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
CO_WORKTREE=$(jq -r 'if .worktree == false then "no" else "yes" end' "$SDIR/session.json")

[[ "$SLUG" =~ ^[a-z0-9-]+$ ]]                          || die "slug không hợp lệ"
[[ "$NUM"  =~ ^[0-9]+$ ]]                              || die "num không hợp lệ"

if [[ "$CO_WORKTREE" == "yes" ]]; then
  [[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]   || die "repo không hợp lệ"
  # CHỈ repo đã đăng ký. Đây là chốt giết hẳn đường "clone bất cứ gì được gõ
  # vào": PAT hẹp phải phủ, doctor phải kiểm được branch protection — cả hai
  # chỉ đúng với repo nằm trong repos.d/ (web action đã kiểm, đây là lớp hai).
  if [[ ! -f "$BEE_ROOT/repos.d/$SLUG.env" ]]; then
    lifecycle "$SDIR" "Repo '$REPO' chưa đăng ký ($BEE_ROOT/repos.d/$SLUG.env không tồn tại) — thêm repo trước rồi mở phiên."
    meta_merge "$SDIR" "$(jq -cn --arg t "$(now_iso)" \
      '{status:"failed", reason:"unregistered-repo", ended_at:$t}')"
    exit 0
  fi
fi

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
# `worktree:false` = PHIÊN CHAT KHÔNG REPO: không clone, không branch, không
# tool — hỏi đáp nhanh. Không có đường nâng cấp (chẳng có repo để nâng lên);
# phiên có repo thì LUÔN có worktree ngay từ đầu.
BARE="$BEE_ROOT/repos/$SLUG.git"
WT="$BEE_ROOT/work/$ID"
BRANCH="bee/$SLUG-$NUM"

if [[ "$CO_WORKTREE" == "no" ]]; then
  WT="$SDIR/chat"
  mkdir -p "$WT"
elif [[ ! -d "$BARE" ]]; then
  lifecycle "$SDIR" "Chưa có bản sao repo — đang clone $REPO…"
  mkdir -p "$(dirname "$BARE")"
  git clone --bare --quiet "https://github.com/$REPO.git" "$BARE" \
    || { lifecycle "$SDIR" "Clone $REPO thất bại — xem stderr.log."; die "clone fail"; }
fi

if [[ "$CO_WORKTREE" == "yes" ]]; then
  # Local push fence, refreshed EVERY session start (idempotent): pushes
  # from worktrees run the shared bare repo's hooks, and this one refuses
  # any ref that is not bee/*. On GitHub Free (no branch protection for
  # private repos) this is the only fence in front of main.
  cp "$(dirname "$(readlink -f "$0")")/../lib/pre-push-bee" "$BARE/hooks/pre-push"
  chmod +x "$BARE/hooks/pre-push"

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
    dung_worktree "$BARE" "$WT" "$BRANCH" "$DEF" 2>>"$SDIR/stderr.log" \
      || { lifecycle "$SDIR" "Dựng worktree thất bại — xem stderr.log."; die "worktree fail"; }
    git -C "$WT" config user.name  "bee-agent"
    git -C "$WT" config user.email "bee-agent@localhost"
  fi

  # Env overlay: keys the code needs but git must never carry. Drop files
  # under $BEE_ROOT/env.d/<slug>/ mirroring the repo layout (.env,
  # apps/web/.env.local, …) — copied over the worktree on EVERY start, so
  # updating a key once reaches every new session. Each copied path is
  # also added to the worktree's private git exclude: the agent can READ
  # the keys but can never commit them, even when .gitignore misses them.
  # Dải cổng riêng của phiên (V3.T14) — web cấp lúc mở, ghi trong session.json.
  PORT_BASE=$(jq -r '.port_base // empty' "$SDIR/session.json")
  ghi_cong "$WT" "$PORT_BASE"

  # Service slice (T15) — BEFORE the env.d overlay, because the templates
  # there substitute ${BEE_DB_URL} and friends, and AFTER the worktree exists,
  # because the repo's compose is what tells us which services it wants.
  # A refusal here ends the session at the door: better than letting the agent
  # hit connection-refused twenty minutes into a run nobody is watching.
  if ! ensure_service_slice "$SDIR" "$ID"; then
    meta_merge "$SDIR" "$(jq -cn --arg t "$(now_iso)" \
      '{status:"failed", reason:"service-slice", ended_at:$t}')"
    exit 1
  fi

  ENVD="$BEE_ROOT/env.d/$SLUG"
  if [[ -d "$ENVD" ]]; then
    EXCL="$(git -C "$WT" rev-parse --git-path info/exclude)"
    mkdir -p "$(dirname "$EXCL")"
    # chep_env_d thay ${BEE_PORT_n} bằng cổng thật của phiên này.
    chep_env_d "$ENVD" "$WT" "$PORT_BASE"
    SO_ENV=0
    while IFS= read -r f; do
      rel="${f#./}"
      grep -qxF "/$rel" "$EXCL" 2>/dev/null || echo "/$rel" >> "$EXCL"
      SO_ENV=$((SO_ENV + 1))
    done < <(cd "$ENVD" && find . -type f)
    (( SO_ENV > 0 )) && lifecycle "$SDIR" "Đã chép $SO_ENV file env từ env.d/$SLUG (git exclude, không thể commit)."
  fi
  # .bee/ luôn bị loại khỏi git: ports.env là của phiên, không phải của repo.
  if [[ -n "$PORT_BASE" ]]; then
    EXCL="$(git -C "$WT" rev-parse --git-path info/exclude)"
    grep -qxF "/.bee/ports.env" "$EXCL" 2>/dev/null || echo "/.bee/ports.env" >> "$EXCL"
    lifecycle "$SDIR" "Dải cổng của phiên: $PORT_BASE–$(( PORT_BASE + 9 )) (xem .bee/ports.env)."
  fi
fi

mkdir -p "$BEE_RUNTIME"
[[ -p "$FIFO" ]] || mkfifo -m 600 "$FIFO"

# ── 5 · Chạy claude — MỘT chế độ (chốt 19/08) ──────────────────────────────
# Phiên repo là chat thường có đủ tool từ câu đầu; phiên chat không repo
# không bao giờ có tool. Hết cửa phỏng vấn, hết "OK, do it" — cái còn lại
# của cơ chế cũ là đường resume: chạy lại (restart, reboot) nối đúng phiên.
ARGS=(-p --input-format stream-json --output-format stream-json --verbose
      --include-partial-messages)

if grep -q '"type":"result"' "$SDIR/run.jsonl" 2>/dev/null; then
  ARGS+=(--resume "$ID")
else
  ARGS+=(--session-id "$ID")
fi

if [[ "$CO_WORKTREE" == "no" ]]; then
  ARGS+=(--allowedTools "" --max-turns 40)
else
  # Session mode (V2.5) — như menu mode của Claude Code trong VSCode.
  # Đổi giữa chừng = web ghi mode mới + restart unit → nhánh --resume ở
  # trên nối đúng hội thoại với cờ mới. Giá trị lạ/thiếu = auto (hành vi V1).
  # --permission-prompt-tool stdio (cờ ẨN, rig-05 chứng minh): prompt quyền
  # thành control_request trên stream, web trả lời qua FIFO — mode manual
  # hỏi mọi tool, mode edits chỉ hỏi tool ngoài sửa file.
  MODE=$(jq -r '.mode // "auto"' "$SDIR/session.json")
  case "$MODE" in
    plan)   ARGS+=(--permission-mode plan --max-turns "$MAX_TURNS");;
    edits)  ARGS+=(--permission-mode acceptEdits --permission-prompt-tool stdio --max-turns "$MAX_TURNS");;
    manual) ARGS+=(--permission-mode default --permission-prompt-tool stdio --max-turns "$MAX_TURNS");;
    *)      ARGS+=(--dangerously-skip-permissions --max-turns "$MAX_TURNS");;
  esac
fi
# Model per session (V2.7) — đổi giữa chừng = web ghi session.json rồi restart
# unit, nhánh --resume ở trên nối đúng hội thoại dưới model mới. ALLOWLIST bắt
# buộc (spec §9); chú ý pattern PHẢI có nháy: không nháy thì `opus[1m]` là một
# lớp ký tự của glob và sẽ khớp nhầm "opus1"/"opusm". "default" = KHÔNG truyền
# cờ nào — để máy tự quyết, đúng như "Default" trong menu VSCode.
MODEL=$(jq -r '.model // "default"' "$SDIR/session.json")
case "$MODEL" in
  opus|sonnet|haiku|"opus[1m]"|"sonnet[1m]") ARGS+=(--model "$MODEL");;
  *) ;;
esac

[[ -n "$SYS_PROMPT" ]] && ARGS+=(--append-system-prompt "$SYS_PROMPT")

exec 3<>"$FIFO"
lifecycle "$SDIR" "Phiên đã khởi động."
# BEE_SESSION_DIR cho skill bee-* ghi bee_artifact vào run.jsonl (spec canvas §1)
( cd "$WT" && BEE_SESSION_DIR="$SDIR" exec claude "${ARGS[@]}" ) \
  <&3 >>"$SDIR/run.jsonl" 2>>"$SDIR/stderr.log" &
CPID=$!

# claude tự thoát (hết lượt, lỗi, hoặc người dùng kết thúc hội thoại)
RC=0; wait "$CPID" 2>/dev/null || RC=$?
CPID=""
exec 3>&- 2>/dev/null || true
exit "$RC"

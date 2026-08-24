#!/usr/bin/env bash
# doctor.sh — kiểm checklist vệ sinh A+ (PRD §4.2) + hạ tầng phiên.
#
# Kiểm chứ đừng đoán: mỗi mục in ✓/✗ kèm chi tiết, và ghi doctor.json để
# web hiện đỏ khi lệch. Exit 1 nếu có mục ✗ — cắm được vào CI của máy.
set -uo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

CHECKS="[]"
LOI=0

ghi() { # ghi <id> <ok:true|false> <chi tiết>
  local dau="✗"; [[ "$2" == "true" ]] && dau="✓"
  printf '%s %s — %s\n' "$dau" "$1" "$3"
  [[ "$2" == "true" ]] || LOI=1
  CHECKS=$(jq -c --arg i "$1" --argjson o "$2" --arg d "$3" \
    '. + [{id:$i, ok:$o, detail:$d}]' <<<"$CHECKS")
}

# ── 1 · PAT là fine-grained, không phải token full-account ─────────────────
TOKEN=$(gh auth token 2>/dev/null || true)
if [[ -z "$TOKEN" ]]; then
  ghi "pat" false "gh chưa đăng nhập — chạy: gh auth login"
elif [[ "$TOKEN" == github_pat_* ]]; then
  ghi "pat" true "fine-grained PAT"
else
  ghi "pat" false "token KHÔNG phải fine-grained (tiền tố $(cut -c1-4 <<<"$TOKEN")…) — tạo PAT hẹp, thu hồi token này"
fi

# ── 1b · Claude auth — sessions cannot run without it. Two accepted paths:
#         a setup-token token pasted on /setup (claude.env), or an
#         interactive login done on the machine.
if grep -q '^CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-' "$BEE_ROOT/claude.env" 2>/dev/null; then
  ghi "claude" true "token từ claude setup-token (claude.env)"
elif [[ -f "$HOME/.claude/.credentials.json" ]]; then
  ghi "claude" true "đã login tương tác trên máy"
else
  ghi "claude" false "chưa có auth — chạy \`claude setup-token\` ở BẤT KỲ máy nào rồi dán token vào /setup"
fi

# ── 2 · Branch protection main trên từng repo trong repos.d ────────────────
if compgen -G "$BEE_ROOT/repos.d/*.env" >/dev/null; then
  for f in "$BEE_ROOT"/repos.d/*.env; do
    # shellcheck disable=SC1090
    REPO=$(. "$f" 2>/dev/null; printf '%s' "${REPO:-}")
    slug=$(basename "$f" .env)
    if [[ -z "$REPO" ]]; then ghi "repo:$slug" false "thiếu biến REPO trong $f"; continue; fi
    DEF=$(gh api "repos/$REPO" --jq .default_branch 2>/dev/null || true)
    if [[ -z "$DEF" ]]; then ghi "repo:$slug" false "không đọc được $REPO — PAT có quyền không?"; continue; fi
    if gh api "repos/$REPO/branches/$DEF/protection" >/dev/null 2>&1; then
      ghi "repo:$slug" true "branch protection bật trên $DEF"
    elif [[ -x "$BEE_ROOT/repos/$slug.git/hooks/pre-push" ]]; then
      # GitHub Free không cho protection trên repo private, và PAT hẹp cũng
      # không đọc được endpoint đó — fence hạ cấp là pre-push hook local
      # (session-run cài mỗi lần mở phiên). Nói rõ đây là fence yếu hơn.
      ghi "repo:$slug" true "protection GitHub không kiểm được (plan Free / PAT hẹp) — fence local: pre-push chặn push ngoài bee/*"
    elif [[ ! -d "$BEE_ROOT/repos/$slug.git" ]]; then
      ghi "repo:$slug" true "chưa clone — fence pre-push sẽ được cài ở phiên đầu tiên"
    else
      ghi "repo:$slug" false "KHÔNG có protection GitHub và thiếu pre-push hook trong bare clone"
    fi
  done
else
  ghi "repos" false "chưa có repo nào trong $BEE_ROOT/repos.d/ — thêm <slug>.env với REPO=owner/name"
fi

# ── 3 · Máy sạch: không secret lạ ngoài PAT + login Claude ────────────────
LA=""
for p in ~/.ssh/id_* ~/.aws ~/.kube ~/.gnupg/private-keys-v1.d; do
  compgen -G "$p" >/dev/null && LA="$LA $p"
done
if [[ -z "$LA" ]]; then
  ghi "may-sach" true "không thấy SSH key / AWS / kube / GPG"
else
  ghi "may-sach" false "thấy secret lạ:$LA — máy này phải không chứa gì đáng lấy"
fi

# ── 4 · linger + timer — phiên phải sống không cần ai đăng nhập ───────────
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" == "yes" ]]; then
  ghi "linger" true "bật"
else
  ghi "linger" false "chưa bật — chạy: loginctl enable-linger $USER"
fi
if systemctl --user is-active --quiet bee-reaper.timer 2>/dev/null; then
  ghi "reaper" true "bee-reaper.timer đang chạy"
else
  ghi "reaper" false "bee-reaper.timer không active — xác phiên sẽ không ai dọn"
fi

# ── 4b · Đĩa của phiên + gc còn sống không ─────────────────────────────────
# gc chạy trong timer nền: nó chết thì KHÔNG có job đỏ nào để nhìn, chỉ có đĩa
# lặng lẽ đầy lên. Tuổi của gc.json là cơ chế bắt duy nhất — cùng bài với
# heartbeat.json của reaper (bất biến #3: mỗi kiểu hỏng đúng một cơ chế bắt).
GC_WARN_GB="${GC_WARN_GB:-20}"
work_b=$(du -sb "$BEE_ROOT/work" 2>/dev/null | cut -f1 || echo 0)
sess_b=$(du -sb "$BEE_ROOT/sessions" 2>/dev/null | cut -f1 || echo 0)
tong=$(( ${work_b:-0} + ${sess_b:-0} ))
mo_coi=0
for wt in "$BEE_ROOT"/work/*/; do
  [[ -d "$wt" ]] || continue
  [[ -f "$BEE_ROOT/sessions/$(basename "${wt%/}")/meta.json" ]] || mo_coi=$(( mo_coi + 1 ))
done
doc_duoc=$(numfmt --to=iec "$tong" 2>/dev/null || echo "${tong}B")

if [[ ! -f "$BEE_ROOT/gc.json" ]]; then
  ghi "dia-phien" false "$doc_duoc trên đĩa · gc chưa chạy lần nào — bật: systemctl --user enable --now bee-gc.timer"
else
  tuoi_h=$(( ( $(date +%s) - $(stat -c %Y "$BEE_ROOT/gc.json") ) / 3600 ))
  if (( tuoi_h > 48 )); then
    ghi "dia-phien" false "gc im lặng ${tuoi_h}h (>48h) — timer chết? $doc_duoc đang chiếm"
  elif (( tong > GC_WARN_GB * 1073741824 )); then
    ghi "dia-phien" false "$doc_duoc vượt ngưỡng ${GC_WARN_GB}GB — lý do giữ nằm trong gc.json"
  else
    ghi "dia-phien" true "$doc_duoc (work+sessions) · $mo_coi worktree mồ côi · gc chạy ${tuoi_h}h trước"
  fi
fi

# ── 5 · Đĩa + PAUSE (thông tin, không phải lỗi) ────────────────────────────
if [[ -d "$BEE_ROOT" && -w "$BEE_ROOT" ]]; then
  ghi "dia" true "$BEE_ROOT ghi được"
else
  ghi "dia" false "$BEE_ROOT thiếu hoặc không ghi được — chạy install.sh"
fi
if [[ -e "$BEE_ROOT/PAUSE" ]]; then
  printf 'ℹ PAUSE — ĐANG BẬT: không phiên mới nào mở được\n'
else
  printf 'ℹ PAUSE — tắt\n'
fi

OK=true; [[ $LOI == 0 ]] || OK=false
mkdir -p "$BEE_ROOT"
jq -n --arg t "$(now_iso)" --argjson ok "$OK" --argjson c "$CHECKS" \
  --argjson p "$([[ -e "$BEE_ROOT/PAUSE" ]] && echo true || echo false)" \
  '{checked_at:$t, ok:$ok, paused:$p, checks:$c}' > "$BEE_ROOT/doctor.json"

exit "$LOI"

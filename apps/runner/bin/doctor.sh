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
    else
      ghi "repo:$slug" false "CHƯA có branch protection trên $DEF — push thẳng main đang mở"
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

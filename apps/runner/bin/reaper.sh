#!/usr/bin/env bash
# reaper.sh — hậu duệ trực tiếp của rule 01: dọn xác phiên.
#
# Điều kiện phát hiện là đĩa + systemd, không phải nhãn GitHub:
#   meta.json nói "running"  ∧  unit không active  →  cái xác.
# Đóng sổ failed, tăng attempt, needs_human từ lần 2, dọn FIFO mồ côi.
# LUÔN ghi heartbeat.json ở cuối — reaper chính là tiến trình nền mà cái
# chết im lặng của nó phải bị web nhìn thấy qua tuổi của file này.
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

don=0
song=0

for meta in "$BEE_ROOT"/sessions/*/meta.json; do
  [[ -f "$meta" ]] || continue
  trang_thai=$(jq -r '.status // empty' "$meta")
  [[ "$trang_thai" == "running" ]] || continue

  sdir=$(dirname "$meta")
  id=$(basename "$sdir")

  # ── Trần chi cho MỘT phiên (FR-3.4) ────────────────────────────────────
  # Phanh hạn mức (T5) chỉ chặn MỞ phiên; nó không cứu được phiên đang chạy
  # đốt tiền cả tiếng lúc 2 giờ sáng. `total_cost_usd` trong dòng `result`
  # CỘNG DỒN theo phiên (đo trên máy: 1.02 → 3.50 → … → 5.60), nên dòng cuối
  # là tổng đang đốt. Không cấu hình trần = không phanh ai: mặc định an toàn.
  tran="${SESSION_MAX_USD:-0}"
  if [[ "$tran" != "0" ]] && [[ -f "$sdir/run.jsonl" ]]; then
    da_dot=$(jq -r 'select(.type=="result") | .total_cost_usd // empty' "$sdir/run.jsonl" 2>/dev/null | tail -1)
    if [[ -n "$da_dot" ]] && awk -v a="$da_dot" -v b="$tran" 'BEGIN{exit !(a>b)}'; then
      # Ghi sổ TRƯỚC khi dừng: trap của phiên sẽ ghi status=stopped ngay sau,
      # và meta_merge trộn nên hai bên không xoá nhau. Ngược thứ tự thì người
      # dùng thấy "đã dừng" mà không bao giờ biết vì sao.
      lifecycle "$sdir" "Phiên đã đốt \$$da_dot, vượt trần \$$tran USD — dừng và cần người xem."
      meta_merge "$sdir" "$(jq -cn --arg r "vượt trần chi \$$tran USD"         '{needs_human:true, reason:$r}')"
      systemctl --user stop "bee-session@$id" 2>/dev/null || true
      don=$((don + 1))
      continue
    fi
  fi

  # Transitional states are ALIVE: during `systemctl stop` the unit reads
  # "deactivating" while the trap is still closing the books — reaping at
  # that moment steals a clean stop and mislabels it failed/attempt+1.
  # Only a settled inactive/failed unit is a corpse.
  state=$(systemctl --user is-active "bee-session@$id" 2>/dev/null || true)
  case "$state" in
    active|activating|deactivating|reloading)
      song=$((song + 1))
      continue
      ;;
  esac

  # Xác. Đóng sổ trong đúng một tick — không cần ai nhớ hộ chuyện gì đã xảy ra.
  lan=$(( $(jq -r '.attempt // 0' "$meta") + 1 ))
  can_nguoi=false
  (( lan >= 2 )) && can_nguoi=true

  meta_merge "$sdir" "$(jq -cn \
    --argjson a "$lan" --argjson n "$can_nguoi" --arg t "$(now_iso)" \
    '{status:"failed", reason:"reaped", attempt:$a, needs_human:$n, ended_at:$t}')"
  lifecycle "$sdir" "Phiên chết ngoài ý muốn — reaper đóng sổ (lần $lan)."
  rm -f "$BEE_RUNTIME/$id.in"
  don=$((don + 1))
done

mkdir -p "$BEE_ROOT"
jq -cn --arg t "$(now_iso)" --argjson s "$song" --argjson d "$don" \
  '{ts:$t, sessions_running:$s, reaped:$d}' > "$BEE_ROOT/heartbeat.json"

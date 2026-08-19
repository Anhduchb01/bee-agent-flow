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

#!/usr/bin/env bash
# heartbeat.sh — ai canh người canh gác?
#
# Reaper ghi heartbeat.json mỗi tick. Script này (chạy bởi timer RIÊNG)
# chỉ kiểm tuổi của nó: quá 10 phút nghĩa là reaper chết im lặng — chế độ
# hỏng nguy hiểm nhất, vì không có job đỏ nào để nhìn. Exit 1 để systemd
# đánh dấu unit failed, hiện được trong `systemctl --user --failed`;
# web độc lập tự tính tuổi heartbeat.json nên không phụ thuộc script này.
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

HB="$BEE_ROOT/heartbeat.json"
GIOI_HAN=600

if [[ ! -f "$HB" ]]; then
  log "heartbeat.json chưa tồn tại — reaper chưa chạy lần nào?"
  exit 1
fi

age=$(( $(date +%s) - $(stat -c %Y "$HB") ))
if (( age > GIOI_HAN )); then
  log "heartbeat cũ ${age}s (> ${GIOI_HAN}s) — reaper có thể đã chết im lặng"
  exit 1
fi

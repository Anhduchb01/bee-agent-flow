#!/usr/bin/env bash
# S0.2 — Ẩn số: phỏng vấn `--allowedTools ""` → thoát → `--resume` với đủ tool:
# phiên có nhớ hợp đồng đã chốt trong lúc phỏng vấn không?
#
# Đo bằng một hợp đồng có mã hiệu: pha 1 chốt "tạo file hopdong-rig.txt chứa
# DUA-HAU-77" (không tool, không làm được). Pha 2 resume với tool, chỉ nói
# "ok làm đi" — KHÔNG nhắc lại hợp đồng. File đúng tên đúng mã hiệu xuất hiện
# → resume nhớ ngữ cảnh → thiết kế "một phiên hai chế độ" khả thi.
set -euo pipefail

RIG_DIR="${RIG_DIR:-$(mktemp -d)}"
WORK="$RIG_DIR/work"; mkdir -p "$WORK"
SID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

echo "[rig] pha 1 — phong van, khong tool · session $SID"
(
  cd "$WORK" && exec claude -p \
    --output-format stream-json --verbose \
    --allowedTools "" \
    --session-id "$SID" \
    --max-turns 2 \
    "Day la pha phong van, ban KHONG co tool. Hop line chot nhu sau: khi toi noi lam, hay tao file ten hopdong-rig.txt co noi dung chua dung ma hieu DUA-HAU-77. Xac nhan hop line trong mot cau, dung lam gi ca."
) >"$RIG_DIR/phase1.jsonl" 2>"$RIG_DIR/phase1.err"

echo "[rig] pha 2 — resume voi tool, chi noi 'ok lam di'"
(
  cd "$WORK" && exec claude -p \
    --output-format stream-json --verbose \
    --allowedTools "Write Bash" \
    --resume "$SID" \
    --max-turns 6 \
    "Ok lam di — thuc hien dung hop line da chot, trong thu muc hien tai."
) >"$RIG_DIR/phase2.jsonl" 2>"$RIG_DIR/phase2.err"

echo "== KET QUA S0.2 =="
if [[ -f "$WORK/hopdong-rig.txt" ]] && grep -q 'DUA-HAU-77' "$WORK/hopdong-rig.txt"; then
  echo "RESUME NHO NGU CANH: file dung ten, dung ma hieu — 'ok lam di' mot-phien kha thi"
else
  echo "RESUME KHONG NHO DU — xem phase2.jsonl; noi dung thu muc:"
  ls -la "$WORK" || true
fi
echo "phase1: $RIG_DIR/phase1.jsonl · phase2: $RIG_DIR/phase2.jsonl"

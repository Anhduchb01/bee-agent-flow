#!/usr/bin/env bash
# S0.1 — Ẩn số: gõ chen lúc agent đang GIỮA một tool call, CLI xếp hàng hay bỏ?
#
# Cách đo: bảo agent chạy `sleep 8`; khi thấy tool_use xuất hiện trong run.jsonl
# thì ghi thêm một message chứa mã hiệu XOAI-XANH vào stdin (FIFO). Đọc kết quả:
#   - mã hiệu xuất hiện trong trả lời assistant  → CLI XẾP HÀNG (tiếp thu)
#   - không xuất hiện sau cả result thứ hai      → CLI BỎ
# Sản phẩm phụ: run.jsonl thật làm fixture cho S2.
set -euo pipefail

RIG_DIR="${RIG_DIR:-$(mktemp -d)}"
WORK="$RIG_DIR/work"; mkdir -p "$WORK"
OUT="$RIG_DIR/run.jsonl"
FIFO="$RIG_DIR/in.fifo"
: > "$OUT"
rm -f "$FIFO"; mkfifo "$FIFO"

# Read-write để không bao giờ EOF — đúng thiết kế spec session-first §2.2.
exec 3<>"$FIFO"

(
  cd "$WORK" && exec claude -p \
    --input-format stream-json --output-format stream-json --verbose \
    --include-partial-messages \
    --allowedTools "Bash" \
    --max-turns 6 \
    <&3 >>"$OUT" 2>"$RIG_DIR/stderr.log"
) &
PID=$!

msg() {
  printf '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"%s"}]}}\n' "$1" >&3
}

msg "Hay chay dung mot lenh bash: sleep 8 && echo xong. Sau khi lenh chay xong, tra loi dung mot dong ngan."

# Chờ tool_use — bằng chứng agent đang ở giữa tool call
for _ in $(seq 1 240); do
  grep -q '"type":"tool_use"' "$OUT" 2>/dev/null && break
  kill -0 "$PID" 2>/dev/null || { echo "RIG FAIL: claude chết sớm, xem stderr.log"; exit 1; }
  sleep 0.5
done
grep -q '"type":"tool_use"' "$OUT" || { echo "RIG FAIL: khong thay tool_use sau 120s"; kill "$PID" 2>/dev/null; exit 1; }

sleep 2   # chắc chắn đang ở giữa sleep 8
msg "GO CHEN GIUA CHUNG: khi tra loi, bat buoc nhac lai dung ma hieu XOAI-XANH."
echo "[rig] da go chen luc $(date +%T)"

# Chờ: hoặc mã hiệu xuất hiện trong assistant, hoặc đủ 2 result, hoặc hết giờ
ket_qua="TIMEOUT"
for _ in $(seq 1 360); do
  if grep '"type":"assistant"' "$OUT" 2>/dev/null | grep -q 'XOAI-XANH'; then
    ket_qua="XEP-HANG"; break
  fi
  n_result=$(grep -c '"type":"result"' "$OUT" 2>/dev/null || true)
  if [[ "${n_result:-0}" -ge 2 ]]; then ket_qua="BO"; break; fi
  kill -0 "$PID" 2>/dev/null || { ket_qua="CLAUDE-THOAT"; break; }
  sleep 0.5
done

kill "$PID" 2>/dev/null || true
exec 3>&-

echo "== KET QUA S0.1 =="
case "$ket_qua" in
  XEP-HANG)     echo "CLI XEP HANG: message go chen duoc tiep thu — o go duoc phep hua 'agent se doc'";;
  BO)           echo "CLI BO (hoac xu ly thanh luot rieng ma khong nhac ma hieu) — xem tay run.jsonl truoc khi ket luan";;
  CLAUDE-THOAT) echo "claude thoat truoc khi co ket luan — xem stderr.log va run.jsonl";;
  TIMEOUT)      echo "het gio — xem tay run.jsonl";;
esac
echo "n_result=$(grep -c '"type":"result"' "$OUT" || true) · run.jsonl: $OUT ($(wc -l <"$OUT") dong)"

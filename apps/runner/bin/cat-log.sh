#!/usr/bin/env bash
# cat-log.sh <id> — cắt run.jsonl về dưới trần byte. Gọi bởi reaper mỗi tick.
#
# Nợ spec §11: "phiên 3 tiếng không được ăn hết đĩa". Nhưng cắt mà IM LẶNG còn
# tệ hơn phình: người mở lại phiên phải biết mình đang xem bản đã cắt, không
# thì họ kết luận sai về việc agent đã làm gì.
#
# Giữ phần MỚI NHẤT: khúc đầu của một phiên dài là phần ít giá trị nhất khi
# đang truy vấn "nó vừa làm gì". Cắt theo DÒNG, không theo byte — nửa dòng
# JSON làm hỏng cả parser phía web.
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

ID="${1:-}"
[[ "$ID" =~ ^[a-f0-9-]{36}$ ]] || die "id không hợp lệ: $ID"

TRAN_KB="${RUN_MAX_KB:-0}"
[[ "$TRAN_KB" == "0" ]] && exit 0     # 0 = tắt trần

FILE="$BEE_ROOT/sessions/$ID/run.jsonl"
[[ -f "$FILE" ]] || exit 0

KICH=$(stat -c %s "$FILE")
TRAN=$(( TRAN_KB * 1024 ))
(( KICH <= TRAN )) && exit 0

# Ước lượng số dòng cần giữ theo tỉ lệ byte, chừa 10% cho dòng đánh dấu.
TOTAL_LINES=$(wc -l < "$FILE")
KEEP=$(( TOTAL_LINES * TRAN / KICH * 9 / 10 ))
(( KEEP < 1 )) && KEEP=1
BO=$(( TOTAL_LINES - KEEP ))

TMP="$FILE.tmp"
jq -cn --argjson n "$BO" --arg t "$(now_iso)" \
  '{type:"bee_truncated", skipped:$n, ts:$t}' > "$TMP"
tail -n "$KEEP" "$FILE" >> "$TMP"
mv "$TMP" "$FILE"

log "cắt run.jsonl của $ID: bỏ $BO dòng đầu, giữ $KEEP dòng cuối"

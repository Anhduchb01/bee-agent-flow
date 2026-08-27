#!/usr/bin/env bash
# Rig-10 — trần byte cho run.jsonl (nợ spec §11).
#
# Phiên ba tiếng không được ăn hết đĩa. Nhưng CẮT MÀ IM LẶNG còn tệ hơn: người
# đọc lại phiên phải biết mình đang xem một bản đã bị cắt.
set -euo pipefail
DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run"
ID=dddddddd-0000-4000-8000-000000000001
SD="$BEE_ROOT/sessions/$ID"; mkdir -p "$SD"

# ~300KB log: 3000 dòng × ~100 byte
for i in $(seq 1 3000); do
  printf '{"type":"assistant","n":%d,"pad":"%s"}\n' "$i" "$(head -c 80 /dev/zero | tr '\0' 'x')"
done > "$SD/run.jsonl"
BEFORE_B=$(stat -c %s "$SD/run.jsonl")

RUN_MAX_KB=100 bash "$DAY/../bin/cat-log.sh" "$ID"
AFTER_B=$(stat -c %s "$SD/run.jsonl")

(( AFTER_B < BEFORE_B )) && kq ok "vượt trần: đã cắt ($((BEFORE_B/1024))KB → $((AFTER_B/1024))KB)" || kq no "không cắt gì"
(( AFTER_B <= 120*1024 )) && kq ok "cắt về dưới trần (+lề)" || kq no "cắt hụt: còn $((AFTER_B/1024))KB"

grep -q "bee_truncated" "$SD/run.jsonl" \
  && kq ok "có dòng bee_truncated — UI nói được là bản này đã bị cắt" \
  || kq no "cắt IM LẶNG: không có dấu vết nào"
head -1 "$SD/run.jsonl" | grep -q "bee_truncated" \
  && kq ok "dấu cắt nằm ở ĐẦU file — người đọc thấy trước khi đọc nội dung" \
  || kq no "dấu cắt không ở đầu"
tail -1 "$SD/run.jsonl" | jq -e '.n == 3000' >/dev/null 2>&1 \
  && kq ok "giữ phần MỚI NHẤT (dòng cuối vẫn là 3000)" || kq no "cắt nhầm đầu đuôi"
while read -r d; do jq -e . >/dev/null 2>&1 <<<"$d" || { kq no "có dòng JSON hỏng sau khi cắt"; break; }; done < "$SD/run.jsonl"
jq -e . "$SD/run.jsonl" >/dev/null 2>&1 || jq -s . "$SD/run.jsonl" >/dev/null 2>&1 && kq ok "mọi dòng còn lại vẫn là JSON hợp lệ" || kq no "cắt giữa dòng"

# Dưới trần: không đụng
cp "$SD/run.jsonl" "$T/sau1"
RUN_MAX_KB=100000 bash "$DAY/../bin/cat-log.sh" "$ID"
cmp -s "$T/sau1" "$SD/run.jsonl" && kq ok "dưới trần: không đụng file" || kq no "dưới trần mà vẫn ghi lại file"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-10: TẤT CẢ XANH"; else echo "RIG-10: CÓ ĐỎ"; exit 1; fi

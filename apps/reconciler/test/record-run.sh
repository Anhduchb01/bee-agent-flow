#!/usr/bin/env bash
#
# Chạy: apps/reconciler/test/record-run.sh
#
# Reconciler phần lớn không test được nếu không có máy thật — nó cần systemd,
# docker, sudo và một token GitHub. `record_run()` thì không: nó chỉ cần
# `$BEE_SRV` và `jq`. Nên nó được test, và nó là chỗ đáng test nhất, vì hình
# dạng nó ghi ra chính là hợp đồng mà `apps/web/src/lib/bee/types.ts` đọc.
#
# Không dùng framework. Thêm một framework vào đây là thêm một thứ phải cài
# trên máy agent, cho một file test.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

export BEE_SRV; BEE_SRV=$(mktemp -d)
trap 'rm -rf "$BEE_SRV"' EXIT

# Đóng băng đồng hồ: `at` đổi mỗi lần chạy thì không so sánh được gì.
now_iso() { printf '2026-08-13T10:00:00Z'; }

# shellcheck source=../lib/state.sh
source "$REPO/apps/reconciler/lib/state.sh"

loi=0
kiem() { # <nhãn> <jq filter> <mong đợi>
  local got; got=$(jq -r "$2" <<<"$(tail -1 "$BEE_SRV/state/recent.jsonl")")
  if [[ "$got" == "$3" ]]; then
    printf '  ok   %s\n' "$1"
  else
    printf '  ĐỎ   %s: được %q, mong %q\n' "$1" "$got" "$3"; loi=1
  fi
}

echo "1· không có usage.json thì bản ghi giữ nguyên hình dạng cũ"
record_run "myapp-40" myapp 40 07-build ok 7 412
kiem "trường cũ còn đủ" \
     '[.id,.repo,.number,.rule,.result,.turns,.duration_s]|join("|")' \
     'myapp-40|myapp|40|07-build|ok|7|412'
kiem "không mọc thêm trường nào" '[keys[]]|length' '8'

echo "2· có usage.json thì gộp phẳng vào cùng bản ghi"
mkdir -p "$(state_dir myapp-41)"
cat > "$(state_dir myapp-41)/usage.json" <<'JSON'
{"tokens_in":1200,"tokens_out":8400,"tokens_cache_read":990000,
 "tokens_cache_write":31000,"cost_usd":0.42,
 "stop_reason":"end_turn","api_error_status":null}
JSON
record_run "myapp-41" myapp 41 07-build ok 9 800
kiem "token vào"        '.tokens_in'   '1200'
kiem "chi phí"          '.cost_usd'    '0.42'
kiem "lý do dừng"       '.stop_reason' 'end_turn'
kiem "trường cũ vẫn còn" '.turns'      '9'

# Đây là toàn bộ lý do giữ lại `usage`. Không có nó thì "hết hạn mức" và "test
# đỏ" cùng là một `result` khác `ok`, mà hai chuyện đó cần hai cách xử lý khác
# hẳn nhau.
echo "3· đường THẤT BẠI cũng phải mang theo usage"
mkdir -p "$(state_dir shop-30)"
cat > "$(state_dir shop-30)/usage.json" <<'JSON'
{"tokens_in":50,"tokens_out":10,"tokens_cache_read":0,"tokens_cache_write":0,
 "cost_usd":0.01,"stop_reason":null,"api_error_status":429}
JSON
record_run "shop-30" shop 30 07-build fail
kiem "phân biệt được hết hạn mức" '.api_error_status' '429'
kiem "result vẫn là fail"         '.result'           'fail'

echo "4· usage.json đứt giữa chừng không được làm đổ lần chạy"
mkdir -p "$(state_dir blog-9)"
printf '{"tokens_in":12' > "$(state_dir blog-9)/usage.json"
record_run "blog-9" blog 9 04-evidence gave-up 2 30
kiem "vẫn ghi được bản ghi" '.result'    'gave-up'
kiem "bỏ qua phần hỏng"     '.tokens_in' 'null'

echo "5· file vẫn là JSONL hợp lệ, mỗi lần chạy đúng một dòng"
n=$(wc -l < "$BEE_SRV/state/recent.jsonl")
if [[ "$n" == 4 ]]; then printf '  ok   đúng 4 dòng\n'
else printf '  ĐỎ   %s dòng, mong 4\n' "$n"; loi=1; fi
if jq -e . "$BEE_SRV/state/recent.jsonl" >/dev/null; then
  printf '  ok   mọi dòng parse được\n'
else printf '  ĐỎ   có dòng không parse được\n'; loi=1; fi

[[ $loi == 0 ]] && echo "→ xanh" || echo "→ ĐỎ"
exit $loi

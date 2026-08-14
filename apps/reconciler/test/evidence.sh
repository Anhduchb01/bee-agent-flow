#!/usr/bin/env bash
#
# Chạy: apps/reconciler/test/evidence.sh
#
# `lib/evidence.sh` là cổng chất lượng: nó quyết định lần chạy nào được thành
# bằng chứng. Nó cũng là một trong số ít phần của reconciler chạy được mà không
# cần systemd/docker/token — chỉ cần `jq` và một thư mục tạm.
#
# Bài 2 và bài 3 là hai lỗi ĐÃ CÓ THẬT trong bản MinIO cũ, không phải giả định.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

export BEE_SRV; BEE_SRV=$(mktemp -d)
WT=$(mktemp -d)
trap 'rm -rf "$BEE_SRV" "$WT"' EXIT

# shellcheck source=../lib/common.sh
source "$REPO/apps/reconciler/lib/common.sh"
# shellcheck source=../lib/evidence.sh
source "$REPO/apps/reconciler/lib/evidence.sh"

loi=0
ok()  { printf '  ok   %s\n' "$1"; }
kiem() { # <nhãn> <được> <mong>
  if [[ "$2" == "$3" ]]; then ok "$1"
  else printf '  ĐỎ   %s: được %q, mong %q\n' "$1" "$2" "$3"; loi=1; fi
}
kiem_co() { # <nhãn> <chuỗi> <chứa>
  if [[ "$2" == *"$3"* ]]; then ok "$1"
  else printf '  ĐỎ   %s: %q không chứa %q\n' "$1" "$2" "$3"; loi=1; fi
}

# Kết quả Playwright tối thiểu nhưng ĐÚNG HÌNH DẠNG THẬT: suites lồng nhau,
# attachment mang đường dẫn TUYỆT ĐỐI.
lam_report() { # <thư mục> <unexpected> <flaky> <expected> [đường-video]
  mkdir -p "$1"
  jq -n --argjson u "$2" --argjson f "$3" --argjson e "$4" --arg v "${5:-}" '{
    stats: {unexpected:$u, flaky:$f, skipped:0, expected:$e},
    suites: [{ suites: [{ specs: [
      { file: "e2e/ac-1-dang-nhap.spec.ts", title: "AC-1 — user đăng nhập được",
        tests: [{results: [{attachments: (if $v == "" then [] else [{name:"video", path:$v}] end)}]}] }
    ]}]}]
  }' > "$1/results.json"
}

echo "1· cổng xanh — chỉ một lần chạy sạch mới qua"
lam_report "$WT/r1" 0 0 8
kiem "xanh thì im lặng" "$(evidence_green "$WT/r1/results.json" && echo QUA)" "QUA"

lam_report "$WT/r2" 1 0 8
kiem_co "test đỏ bị chặn" "$(evidence_green "$WT/r2/results.json" || true)" "1 đỏ"

lam_report "$WT/r3" 0 2 8
kiem_co "flake bị chặn" "$(evidence_green "$WT/r3/results.json" || true)" "2 flake"

# 0 test xanh là 0 bằng chứng. Không có vế này thì một suite bị lọc sạch bằng
# `--grep` sẽ publish một bảng rỗng kèm dấu tích.
lam_report "$WT/r4" 0 0 0
kiem_co "không test nào chạy" "$(evidence_green "$WT/r4/results.json" || true)" "0 test xanh"

kiem_co "thiếu file" "$(evidence_green "$WT/khong-co/results.json" || true)" "không tìm thấy"

mkdir -p "$WT/r5"; printf '{"stats":{"expec' > "$WT/r5/results.json"
kiem_co "JSON đứt giữa chừng" "$(evidence_green "$WT/r5/results.json" || true)" "không phải JSON"

echo
echo "2· đường dẫn video sau khi test-results/ bị chuyển ra khỏi worktree"
# Đây là lỗi thật của bản cũ: rule 04 `mv` test-results ra thư mục state TRƯỚC
# khi publish, nên đường tuyệt đối trong results.json trỏ vào chỗ vừa biến mất.
# Bản cũ chỉ có `[[ -f "$video" ]]`, không khớp thì ô video ghi "không có" và cả
# khối vẫn được publish. Bằng chứng không video, công bố như một lần thành công.
mkdir -p "$WT/moved/ac-1-chromium"
printf 'giả-vờ-là-video' > "$WT/moved/ac-1-chromium/video.webm"
kiem "tìm lại được sau khi chuyển" \
     "$(evidence_resolve "/da/bien/mat/test-results/ac-1-chromium/video.webm" "$WT/moved")" \
     "$WT/moved/ac-1-chromium/video.webm"
kiem "đường không cứu được thì báo không có" \
     "$(evidence_resolve "/khong/lien/quan/video.webm" "$WT/moved" || echo TRONG)" "TRONG"

echo
echo "3· ghi bằng chứng — thư mục chỉ xuất hiện khi đã ghi xong"
lam_report "$WT/full" 0 0 1 "/cu/test-results/ac-1-chromium/video.webm"
mkdir -p "$WT/full/ac-1-chromium" "$WT/full/shots"
printf 'video' > "$WT/full/ac-1-chromium/video.webm"
printf 'png'   > "$WT/full/shots/ac-1-truoc.png"

kiem "trước khi ghi thì chưa có" "$(evidence_have myapp 42 abc1234 && echo CO || echo CHUA)" "CHUA"
md=$(evidence_write myapp 42 abc1234 "$WT/full" "run-x")
kiem "sau khi ghi thì có" "$(evidence_have myapp 42 abc1234 && echo CO || echo CHUA)" "CO"
kiem "không sót thư mục tạm" \
     "$(find "$BEE_SRV/evidence" -maxdepth 3 -name '.tmp-*' | wc -l)" "0"

d=$(evidence_dir myapp 42 abc1234)
kiem "video được sao chép" "$(ls "$d" | grep -c '^ac-1\.\(mp4\|webm\)$')" "1"
kiem "ảnh được sao chép"   "$([[ -f "$d/ac-1-truoc.png" ]] && echo CO || echo CHUA)" "CO"
kiem "giữ lại results.json" "$([[ -f "$d/results.json" ]] && echo CO || echo CHUA)" "CO"
# Title đã mở đầu bằng "AC-1 —" nên KHÔNG được ghép nhãn thêm lần nữa.
kiem_co "bảng không lặp nhãn AC" "$(cat "$md")" "| AC-1 — user đăng nhập được | ✅ pass |"
kiem_co "ghi đúng SHA rút gọn" "$(cat "$md")" 'commit `abc1234`'

echo
echo "4· khối gắn vào PR body"
kiem_co "có URL thì link thành tuyệt đối" \
    "$(BEE_WEB_URL="https://bee.example.com/" evidence_block_for_pr myapp 42 abc1234 "$md")" \
    "https://bee.example.com/api/evidence/myapp/42/abc1234/ac-1"
# Link tương đối trong PR body sẽ trỏ vào github.com — thà bỏ hẳn link còn hơn
# dẫn người review đi lạc rồi tưởng bằng chứng hỏng.
out=$(BEE_WEB_URL="" evidence_block_for_pr myapp 42 abc1234 "$md")
kiem "chưa cấu hình thì không có link nào" "$(grep -c '](' <<<"$out")" "0"
kiem_co "và nói ra vì sao" "$out" "BEE_WEB_URL"

echo
[[ $loi == 0 ]] && echo "→ xanh" || echo "→ ĐỎ"
exit $loi

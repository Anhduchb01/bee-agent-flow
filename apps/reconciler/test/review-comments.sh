#!/usr/bin/env bash
#
# Chạy: apps/reconciler/test/review-comments.sh
#
# Phần lọc comment của rule 02. Ba nguồn của GitHub được gộp ở `gh_claude_merge`,
# và nó tách khỏi lời gọi API đúng để test được chỗ này mà không cần token.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

export BEE_SRV; BEE_SRV=$(mktemp -d)
trap 'rm -rf "$BEE_SRV"' EXIT

# shellcheck source=../lib/common.sh
source "$REPO/apps/reconciler/lib/common.sh"
# shellcheck source=../lib/github.sh
source "$REPO/apps/reconciler/lib/github.sh"
# shellcheck source=../lib/state.sh
source "$REPO/apps/reconciler/lib/state.sh"

loi=0
kiem() { # <nhãn> <được> <mong>
  if [[ "$2" == "$3" ]]; then printf '  ok   %s\n' "$1"
  else printf '  ĐỎ   %s: được %q, mong %q\n' "$1" "$2" "$3"; loi=1; fi
}

# Ba nguồn, đúng hình dạng mà `gh api --jq` phát ra: mỗi dòng một object.
nguon() {
  cat <<'JSON'
{"url":"https://gh/pr/7#discussion_r1","at":"2026-08-14T09:00:00Z","who":"tl","path":"src/a.ts","line":12,"body":"@claude đổi tên biến này"}
{"url":"https://gh/pr/7#issuecomment-1","at":"2026-08-14T09:05:00Z","who":"pm","path":null,"line":0,"body":"@claude thêm test cho luồng lỗi"}
{"url":"https://gh/pr/7#pullrequestreview-1","at":"2026-08-14T09:10:00Z","who":"tl","path":null,"line":0,"body":"Nhìn chung ổn, @claude sửa nốt hai chỗ trên"}
{"url":"https://gh/pr/7#issuecomment-2","at":"2026-08-14T09:20:00Z","who":"pm","path":null,"line":0,"body":"Cảm ơn nhé"}
JSON
}

echo "1· gộp đủ ba nguồn — comment thường không còn bị bỏ sót"
got=$(nguon | gh_claude_merge)
kiem "lấy đúng 3 comment có @claude" "$(jq 'length' <<<"$got")" "3"
kiem "bỏ comment không nhắc @claude" "$(jq '[.[].url] | any(test("issuecomment-2"))' <<<"$got")" "false"
kiem "giữ comment ở tab Conversation" "$(jq '[.[].url] | any(test("issuecomment-1"))' <<<"$got")" "true"
kiem "giữ lời tổng kết review"        "$(jq '[.[].url] | any(test("pullrequestreview"))' <<<"$got")" "true"
kiem "sắp theo thời gian"             "$(jq -r '.[0].who' <<<"$got")" "tl"
kiem "comment trên diff giữ file:dòng" "$(jq -r '.[0].path + ":" + (.[0].line|tostring)' <<<"$got")" "src/a.ts:12"

echo
echo "2· không đếm trùng khi --paginate trả lặp"
got=$( { nguon; nguon; } | gh_claude_merge)
kiem "vẫn đúng 3" "$(jq 'length' <<<"$got")" "3"

echo
echo "3· comment của chính bee bị loại — đây là chốt chống lặp vô hạn"
# bee trích lại nguyên văn yêu cầu của người dùng khi báo cáo, nghĩa là trích
# lại cả chữ "@claude". Không lọc thì nó tự trả lời chính nó tới khi hết hạn mức.
got=$( { nguon
  echo '{"url":"https://gh/pr/7#issuecomment-9","at":"2026-08-14T09:30:00Z","who":"bee","path":null,"line":0,"body":"<!-- agent-run -->\n🤖 đã xử lý: \"@claude đổi tên biến này\""}'
} | gh_claude_merge)
kiem "không nhặt lại comment của mình" "$(jq 'length' <<<"$got")" "3"

echo
echo "4· vân tay phân biệt được TẬP comment, không phải số lượng"
a=$(nguon | gh_claude_merge)
b=$( { nguon | head -2
  echo '{"url":"https://gh/pr/7#issuecomment-3","at":"2026-08-14T10:00:00Z","who":"pm","path":null,"line":0,"body":"@claude bỏ yêu cầu cũ, làm cái này"}'
} | gh_claude_merge)
kiem "cùng tập thì cùng vân tay" \
     "$([[ "$(gh_claude_fingerprint "$a")" == "$(gh_claude_fingerprint "$(nguon | gh_claude_merge)")" ]] && echo GIONG)" "GIONG"
# Mốc cũ đếm số comment. Ở đây cả hai đều là 3 comment, nhưng nội dung khác hẳn:
# đếm thì bỏ qua vĩnh viễn, vân tay thì bắt được.
kiem "cùng SỐ LƯỢNG nhưng khác tập" "$(jq 'length' <<<"$a")·$(jq 'length' <<<"$b")" "3·3"
kiem "vân tay phải khác" \
     "$([[ "$(gh_claude_fingerprint "$a")" != "$(gh_claude_fingerprint "$b")" ]] && echo KHAC)" "KHAC"

echo
echo "5· mốc đã-xử-lý sống lâu hơn thư mục state"
# worker.sh có `trap … claim_clear "$ID"` khi thoát. Mốc cũ nằm trong thư mục
# đó, nên nó bị xoá ngay sau khi được đặt, và rule 02 chạy lại vô hạn.
mkdir -p "$(state_dir myapp-7)"
reviewed_set myapp-7 "$(gh_claude_fingerprint "$a")"
claim_clear myapp-7
kiem "claim_clear không xoá mốc" "$(reviewed_get myapp-7)" "$(gh_claude_fingerprint "$a")"

echo
[[ $loi == 0 ]] && echo "→ xanh" || echo "→ ĐỎ"
exit $loi

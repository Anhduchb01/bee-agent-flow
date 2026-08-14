#!/usr/bin/env bash
#
# Chạy: apps/reconciler/test/approvals.sh
#
# `bee/approvals` là cổng đứng giữa "PM đã đồng ý" và "PM chưa xem". Nó chỉ cần
# `jq` để chạy, nên nó được test.
set -euo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

RULE_ID=05-approvals
# shellcheck source=../rules/05-approvals.sh
source "$REPO/apps/reconciler/rules/05-approvals.sh"

loi=0
kiem() { if [[ "$2" == "$3" ]]; then printf '  ok   %s\n' "$1"
         else printf '  ĐỎ   %s: được %q, mong %q\n' "$1" "$2" "$3"; loi=1; fi; }

duyet() { # <login...> → JSON latestReviews
  local out='[]' u
  for u in "$@"; do out=$(jq -c --arg u "$u" '. + [{state:"APPROVED",author:{login:$u}}]' <<<"$out"); done
  printf '%s' "$out"
}

echo "1· cần đủ cả PM lẫn TL"
REPO_PM="pdtoan2811-bit" REPO_TL="Anhduchb01"
kiem "chưa ai duyệt"   "$(approvals_state_from "$(duyet)")" pending
kiem "mới có PM"       "$(approvals_state_from "$(duyet pdtoan2811-bit)")" pending
kiem "đủ hai người"    "$(approvals_state_from "$(duyet pdtoan2811-bit Anhduchb01)")" success

echo
echo "2· tên chứa tên người duyệt KHÔNG được tính"
# `grep -qw pdtoan2811` khớp bên trong `pdtoan2811-bit`, vì grep coi dấu gạch
# ngang là ranh giới từ. Một tài khoản khác ký duyệt thay được cho PM.
REPO_PM="pdtoan2811" REPO_TL="Anhduchb01"
kiem "hậu tố khác là người khác" "$(approvals_state_from "$(duyet pdtoan2811-bit Anhduchb01)")" pending
kiem "đúng tên thì tính"         "$(approvals_state_from "$(duyet pdtoan2811 Anhduchb01)")" success
REPO_PM="duc" REPO_TL="duc"
kiem "tiền tố cũng không tính"   "$(approvals_state_from "$(duyet duc-anh)")" pending

echo
echo "3· GitHub không phân biệt hoa thường"
REPO_PM="anhduchb01" REPO_TL=""
kiem "khác hoa thường vẫn là một người" "$(approvals_state_from "$(duyet Anhduchb01)")" success

echo
echo "4· review không phải APPROVED thì không tính"
REPO_PM="linh" REPO_TL=""
kiem "CHANGES_REQUESTED" \
  "$(approvals_state_from '[{"state":"CHANGES_REQUESTED","author":{"login":"linh"}}]')" pending
kiem "COMMENTED" \
  "$(approvals_state_from '[{"state":"COMMENTED","author":{"login":"linh"}}]')" pending

echo
[[ $loi == 0 ]] && echo "→ xanh" || echo "→ ĐỎ"
exit $loi

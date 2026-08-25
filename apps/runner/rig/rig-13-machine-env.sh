#!/usr/bin/env bash
# Rig-13 — machine.env: env của máy tới được phiên, và KHÔNG đè lên auth.
#
# Không chạy claude thật: chỉ nạp đúng hai khối `set -a; . file` của
# session-run.sh theo đúng thứ tự, rồi đo cái gì thắng. Thứ tự là toàn bộ
# giá trị của bài này — đảo lại là một dòng trong machine.env có thể lặng
# lẽ thay token của cả máy.
set -euo pipefail
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

DAY=$(dirname "$(readlink -f "$0")")
SR="$DAY/../bin/session-run.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T"

# Trích đúng đoạn nạp env từ session-run.sh (từ machine.env tới hết
# claude.env) — rig chạy CHÍNH mã đang chạy thật, không phải bản chép tay.
# Cắt NGUYÊN KHỐI theo đúng thứ tự trong file — lần đầu viết rig này tôi
# trích hai khối rồi tự ghép lại, nên dù đảo thứ tự trong session-run.sh
# rig vẫn xanh: nó đang đo bản dựng lại của chính nó, không đo mã thật.
DOAN=$(awk '/BEE_ROOT\/(machine|claude)\.env" \]\]; then$/ { on=1 }
            /^# ── 1 · / { exit }
            on { print }' "$SR")
[[ -n "$DOAN" ]] && kq ok "trích được đoạn nạp env từ session-run.sh" \
                 || { kq no "không tìm thấy đoạn nạp env — session-run.sh đã đổi hình"; exit 1; }

nap() { # nap → in ra giá trị hai biến sau khi nạp
  env -i BEE_ROOT="$BEE_ROOT" PATH="$PATH" bash -c "
    $DOAN
    echo \"MIN=\${SLAYER_MINIMAL_PAYLOAD:-}\"
    echo \"TOK=\${CLAUDE_CODE_OAUTH_TOKEN:-}\"
  "
}

# 1 · Không có file nào: im lặng đi tiếp, không lỗi
RA=$(nap)
grep -q '^MIN=$' <<<"$RA" && kq ok "không có machine.env: không lỗi, không biến" || kq no "hỏng khi thiếu machine.env"

# 2 · machine.env tới được phiên
printf 'SLAYER_MINIMAL_PAYLOAD=1\n' > "$T/machine.env"
RA=$(nap)
grep -q '^MIN=1$' <<<"$RA" && kq ok "machine.env tới được phiên" || kq no "machine.env không được nạp: $RA"

# 3 · claude.env vẫn thắng — đây là lý do tồn tại của thứ tự
printf 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-THAT\n' > "$T/claude.env"
printf 'SLAYER_MINIMAL_PAYLOAD=1\nCLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-GIA\n' > "$T/machine.env"
RA=$(nap)
grep -q '^TOK=sk-ant-oat01-THAT$' <<<"$RA" \
  && kq ok "machine.env KHÔNG đè được lên auth trong claude.env" \
  || kq no "machine.env đè lên token — thứ tự nạp đã sai: $RA"
grep -q '^MIN=1$' <<<"$RA" && kq ok "biến không đụng auth vẫn qua" || kq no "mất biến khi có claude.env"

# 4 · claude.env một mình vẫn như cũ (không hồi quy)
rm "$T/machine.env"
RA=$(nap)
grep -q '^TOK=sk-ant-oat01-THAT$' <<<"$RA" && kq ok "chỉ có claude.env: y như trước" || kq no "hồi quy đường cũ"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-13: TẤT CẢ XANH"; else echo "RIG-13: CÓ ĐỎ"; exit 1; fi

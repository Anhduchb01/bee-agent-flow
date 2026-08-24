#!/usr/bin/env bash
# Rig-11 — dải cổng của phiên phải tới được compose của repo (V3.T14).
set -euo pipefail
DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
WT="$T/wt"; mkdir -p "$WT"

# shellcheck disable=SC1091
BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run" source "$DAY/../lib/common.sh"

# 1 · Sinh .bee/ports.env từ dải base
ghi_cong "$WT" 54120
[[ -f "$WT/.bee/ports.env" ]] && kq ok "sinh .bee/ports.env trong worktree" || kq no "không sinh ports.env"
grep -q "^BEE_PORT_BASE=54120$" "$WT/.bee/ports.env" && kq ok "có BEE_PORT_BASE" || kq no "thiếu BEE_PORT_BASE"
grep -q "^BEE_PORT_3=54123$" "$WT/.bee/ports.env" && kq ok "cổng lẻ đánh số đúng (BEE_PORT_3=54123)" || kq no "đánh số cổng sai"

# 2 · env.d dùng ${BEE_PORT_n} phải được thay THẬT, không copy nguyên chữ
ENVD="$T/envd"; mkdir -p "$ENVD"
printf 'POSTGRES_PORT=${BEE_PORT_1}\nREDIS_PORT=${BEE_PORT_2}\nAPI_KEY=giu-nguyen-$KHONG_PHAI_CONG\n' > "$ENVD/.env"
chep_env_d "$ENVD" "$WT" 54120

grep -q "^POSTGRES_PORT=54121$" "$WT/.env" && kq ok "env.d: \${BEE_PORT_1} → 54121" || kq no "không thay biến cổng: $(grep POSTGRES_PORT "$WT/.env")"
grep -q "^REDIS_PORT=54122$" "$WT/.env" && kq ok "env.d: \${BEE_PORT_2} → 54122" || kq no "thay sai REDIS_PORT"
grep -q 'KHONG_PHAI_CONG' "$WT/.env" \
  && kq ok "biến KHÁC giữ nguyên — không nuốt \$VAR của repo" \
  || kq no "đã nuốt mất biến không phải cổng (secret hỏng theo)"

# 3 · Không có dải cổng (phiên chat) → không sinh gì, không lỗi
WT2="$T/wt2"; mkdir -p "$WT2"
ghi_cong "$WT2" ""
[[ ! -f "$WT2/.bee/ports.env" ]] && kq ok "phiên không có dải cổng: không sinh file thừa" || kq no "sinh ports.env cho phiên không cần"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-11: TẤT CẢ XANH"; else echo "RIG-11: CÓ ĐỎ"; exit 1; fi

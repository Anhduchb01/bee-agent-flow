#!/usr/bin/env bash
# Rig-12 — bootstrap.sh phải CHẶN trước khi làm hỏng, và chặn có chỉ dẫn.
#
# Không cài gì thật: dựng một PATH tối giản chỉ chứa đúng những lệnh
# bootstrap cần ở bước 0-1, rồi rút đi từng thứ để xem nó chết thế nào.
set -euo pipefail
DAY=$(dirname "$(readlink -f "$0")")
BS="$DAY/../bin/bootstrap.sh"
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
STUB="$T/bin"; mkdir -p "$STUB"

# Lệnh THẬT bootstrap cần để chạy tới bước 1 — link đúng từng cái, không
# mượn cả /usr/bin, để "thiếu gói" là thiếu thật.
for l in bash sed grep tr cat cut readlink dirname; do ln -sf "$(command -v "$l")" "$STUB/$l"; done
# Bảy gói bước 1 kiểm — dựng vỏ rỗng, chỉ cần command -v thấy là được.
for l in git curl jq envsubst gh newuidmap dbus-daemon; do
  printf '#!/bin/sh\nexit 0\n' > "$STUB/$l"; chmod +x "$STUB/$l"
done
# id thật sẽ trả về group của người chạy rig (có thể có docker) → rig sẽ đo
# nhầm. Cho phép rig tự đặt group.
cat > "$STUB/id" <<'EOF'
#!/bin/sh
[ "$1" = "-nG" ] && { echo "${FAKE_GROUPS:-bee users}"; exit 0; }
exec /usr/bin/id "$@"
EOF
cat > "$STUB/systemctl" <<'EOF'
#!/bin/sh
[ "${FAKE_BUS:-1}" = "1" ] && exit 0
exit 1
EOF
chmod +x "$STUB/id" "$STUB/systemctl"

chay() { # chay <HOME> [biến...] → in stdout+stderr, đặt MA=mã thoát
  local nha="$1"; shift
  MA=0
  RA=$(env -i HOME="$nha" PATH="$STUB" "$@" bash "$BS" 2>&1) || MA=$?
}

# 1 · --help chỉ in phần hướng dẫn, không rơi vào code
RA=$(bash "$BS" --help 2>&1); MA=$?
[[ $MA == 0 ]] && kq ok "--help thoát 0" || kq no "--help thoát $MA"
grep -q 'deploy.sh' <<<"$RA" && kq ok "--help nói rõ khác deploy.sh chỗ nào" || kq no "--help thiếu phần phân biệt ba script"
grep -q 'set -euo' <<<"$RA" && kq no "--help in lẹm vào code" || kq ok "--help dừng đúng ở hết chú thích"

# 2 · Ở group docker = mất sạch ranh giới → phải chết, và chỉ cách gỡ
mkdir -p "$T/h1"
chay "$T/h1" FAKE_GROUPS="bee docker"
[[ $MA == 1 ]] && kq ok "group docker → thoát 1" || kq no "group docker vẫn chạy tiếp (mã $MA)"
grep -q 'gpasswd -d' <<<"$RA" && kq ok "in đúng lệnh gỡ khỏi group" || kq no "chỉ chửi mà không chỉ cách gỡ"

# 3 · Không nối được systemd --user → nhắc enable-linger, không chạy mù
mkdir -p "$T/h2"
chay "$T/h2" FAKE_BUS=0
[[ $MA == 1 ]] && kq ok "mất session bus → thoát 1" || kq no "mất bus vẫn chạy tiếp (mã $MA)"
grep -q 'enable-linger' <<<"$RA" && kq ok "nhắc enable-linger" || kq no "không nhắc enable-linger"

# 4 · Thiếu gói → gọi tên gói APT, không phải tên lệnh
rm "$STUB/jq"
mkdir -p "$T/h3"
chay "$T/h3"
[[ $MA == 1 ]] && kq ok "thiếu jq → thoát 1" || kq no "thiếu jq vẫn đi tiếp (mã $MA)"
grep -q 'apt-get install -y .*jq' <<<"$RA" && kq ok "in nguyên lệnh apt dán được" || kq no "không in lệnh apt: $RA"
printf '#!/bin/sh\nexit 0\n' > "$STUB/jq"; chmod +x "$STUB/jq"

# 5 · ~/.bashrc: ghi một lần, chạy lại không nhân đôi
mkdir -p "$T/h4"
rm "$STUB/gh"                     # chết ở bước 1, SAU khi đã ghi .bashrc
chay "$T/h4"; chay "$T/h4"
SO=$(grep -c 'bee-bootstrap' "$T/h4/.bashrc" 2>/dev/null || echo 0)
[[ "$SO" == 1 ]] && kq ok "chạy hai lần, .bashrc vẫn một khối" || kq no ".bashrc có $SO khối bee-bootstrap"
grep -q 'DBUS_SESSION_BUS_ADDRESS' "$T/h4/.bashrc" && kq ok ".bashrc mang theo bus cho lần sudo -iu sau" || kq no ".bashrc thiếu DBUS_SESSION_BUS_ADDRESS"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-12: TẤT CẢ XANH"; else echo "RIG-12: CÓ ĐỎ"; exit 1; fi

#!/usr/bin/env bash
# install.sh — cài runner lên máy. Idempotent: chạy lại vô hại.
#
# Chạy bằng CHÍNH user sẽ chạy phiên (khuyến nghị: user `bee`), KHÔNG sudo —
# trừ đúng một bước copy vào /opt/bee sẽ tự xin sudo nếu cần.
# Cài xong hệ thống NẰM IM: PAUSE được tạo sẵn, và checklist việc-cần-người
# in ra ở cuối. Gỡ PAUSE là hành động bật máy có chủ đích.
set -euo pipefail

NGUON=$(dirname "$(readlink -f "$0")")
PREFIX="${BEE_PREFIX:-/opt/bee}"
BEE_ROOT="${BEE_ROOT:-/srv/bee}"

echo "== 1 · Copy code vào $PREFIX =="
if [[ -w "$(dirname "$PREFIX")" || -w "$PREFIX" ]]; then SUDO=""; else SUDO="sudo"; fi
$SUDO mkdir -p "$PREFIX"
$SUDO cp -r "$NGUON/bin" "$NGUON/lib" "$PREFIX/"
$SUDO chmod +x "$PREFIX"/bin/*.sh

echo "== 2 · Thư mục dữ liệu $BEE_ROOT =="
if [[ ! -d "$BEE_ROOT" ]]; then
  sudo mkdir -p "$BEE_ROOT"
  sudo chown "$USER:$USER" "$BEE_ROOT"
fi
mkdir -p "$BEE_ROOT"/{repos,repos.d,work,sessions}
# Nằm im cho tới khi có người chủ động gỡ — giống installer của mô hình cũ.
[[ -e "$BEE_ROOT/PAUSE" ]] || touch "$BEE_ROOT/PAUSE"

echo "== 3 · User units =="
UDIR="$HOME/.config/systemd/user"
mkdir -p "$UDIR"
cp "$NGUON"/units/*.service "$NGUON"/units/*.timer "$UDIR/"
systemctl --user daemon-reload
systemctl --user enable --now bee-reaper.timer bee-heartbeat.timer

echo "== 4 · Skill cho agent =="
SKILL_DIR="$HOME/.claude/skills"
mkdir -p "$SKILL_DIR"
cp -r "$NGUON"/skills/* "$SKILL_DIR/"

echo
echo "== Xong. Hệ thống ĐANG NẰM IM ($BEE_ROOT/PAUSE tồn tại). Việc cần người: =="
echo "  1. loginctl enable-linger $USER      # phiên sống không cần ai đăng nhập"
echo "  2. claude                            # /login dưới user này"
echo "  3. gh auth login                     # dán fine-grained PAT (contents+PR+issues, đúng danh sách repo)"
echo "  4. gh auth setup-git                 # để git clone/push dùng PAT"
echo "  5. echo 'REPO=owner/ten-repo' > $BEE_ROOT/repos.d/<slug>.env   # từng repo"
echo "  6. Bật branch protection main trên từng repo (bắt buộc — doctor sẽ kiểm)"
echo "  7. $PREFIX/bin/doctor.sh             # phải XANH TOÀN BỘ trước khi gỡ PAUSE"
echo "  8. rm $BEE_ROOT/PAUSE                # bật máy"

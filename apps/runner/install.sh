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
  # sudo only when a plain mkdir cannot (e.g. /srv) — a user-owned
  # BEE_ROOT must install without ever prompting.
  if ! mkdir -p "$BEE_ROOT" 2>/dev/null; then
    sudo mkdir -p "$BEE_ROOT"
    sudo chown "$USER:$USER" "$BEE_ROOT"
  fi
fi
# FIRST install pauses the machine; a RE-install must not silently re-pause
# a machine the owner already flipped live (found the hard way 20/08).
MOI_CAI=1
[[ -d "$BEE_ROOT/sessions" ]] && MOI_CAI=0
mkdir -p "$BEE_ROOT"/{repos,repos.d,env.d,work,sessions}
[[ $MOI_CAI -eq 1 ]] && touch "$BEE_ROOT/PAUSE"

echo "== 3 · User units =="
# Units are templates: @PREFIX@/@BEE_ROOT@ are rendered here so BEE_PREFIX
# and BEE_ROOT overrides actually reach systemd — a hardcoded /opt/bee in
# ExecStart silently ignored both.
UDIR="$HOME/.config/systemd/user"
mkdir -p "$UDIR"
for f in "$NGUON"/units/*.service "$NGUON"/units/*.timer; do
  # bee-web needs the web build resolved first — handled in step 3b.
  [[ "$(basename "$f")" == "bee-web.service" ]] && continue
  sed "s|@PREFIX@|$PREFIX|g; s|@BEE_ROOT@|$BEE_ROOT|g" "$f" > "$UDIR/$(basename "$f")"
done
systemctl --user daemon-reload
systemctl --user enable --now bee-reaper.timer bee-heartbeat.timer

echo "== 3b · Web service =="
# BEE_WEB overrides where the web app lives (default: sibling of runner).
WEB_DIR="${BEE_WEB:-$(readlink -f "$NGUON/../web")}"
WEB_SERVER="$WEB_DIR/.next/standalone/apps/web/server.js"
NODE_BIN="$(command -v node || true)"
if [[ -f "$WEB_SERVER" && -n "$NODE_BIN" ]]; then
  # web.env is the ONE config file: defaults run disk mode on localhost —
  # a unit-run web must never serve fixture demo data by accident. The
  # live-auth block for S5 ships commented, ready to fill.
  if [[ ! -f "$BEE_ROOT/web.env" ]]; then
    cat > "$BEE_ROOT/web.env" <<EOF
# bee web — runtime env (systemd EnvironmentFile). Edit, then:
#   systemctl --user restart bee-web
PORT=3210
HOSTNAME=127.0.0.1
BEE_SOURCE=disk
BEE_SRV=$BEE_ROOT
# Claude panel: live = real service status + real (possibly empty) usage.
# Leaving this unset would show staged fixture numbers on a real machine.
CLAUDE_SOURCE=live
# --- going to the internet (S5): create a GitHub OAuth app, then fill ---
#GITHUB_SOURCE=live
#AUTH_GITHUB_ID=
#AUTH_GITHUB_SECRET=
#AUTH_SECRET=
#ALLOWED_LOGINS=your-github-login
#AUTH_URL=https://your-domain.example/api/auth
EOF
  fi
  sed "s|@BEE_ROOT@|$BEE_ROOT|g; s|@NODE@|$NODE_BIN|g; s|@WEBSERVER@|$WEB_SERVER|g" \
    "$NGUON/units/bee-web.service" > "$UDIR/bee-web.service"
  systemctl --user daemon-reload
  systemctl --user enable --now bee-web.service
else
  echo "  (bỏ qua: chưa có bản build web — chạy: cd apps/web && pnpm build &&"
  echo "   cp -r .next/static .next/standalone/apps/web/.next/ — rồi cài lại)"
fi

echo "== 4 · Skill cho agent =="
SKILL_DIR="$HOME/.claude/skills"
mkdir -p "$SKILL_DIR"
cp -r "$NGUON"/skills/* "$SKILL_DIR/"

# Global commands back the chat's action chips (/issue /pr /demo /preview) —
# a chip only renders when its command exists here.
CMD_DIR="$HOME/.claude/commands"
mkdir -p "$CMD_DIR"
cp "$NGUON"/commands/*.md "$CMD_DIR/"

# record-screen (vendored, MIT — see its ATTRIBUTION.md) needs its node
# deps once. Best-effort: recording is optional, install must not die here.
if command -v npm >/dev/null && [[ ! -d "$SKILL_DIR/record-screen/scripts/node_modules" ]]; then
  (cd "$SKILL_DIR/record-screen/scripts" && npm install --no-fund --no-audit --silent) \
    || echo "  (record-screen: npm install lỗi — quay demo tab Chrome sẽ chưa dùng được)"
fi

echo
if [[ -e "$BEE_ROOT/PAUSE" ]]; then
  echo "== Xong. Hệ thống ĐANG NẰM IM ($BEE_ROOT/PAUSE tồn tại). =="
else
  echo "== Xong. Cài lại trên máy ĐANG LIVE — giữ nguyên trạng thái, không tạo PAUSE. =="
fi
echo "Mọi bước còn lại làm TRÊN WEB: mở app, đăng nhập — trang /setup sẽ dẫn:"
echo "  linger (nút) · token Claude (chạy 'claude setup-token' ở máy bất kỳ rồi dán)"
echo "  · PAT GitHub (dán) · đăng ký repo (form) · doctor · gỡ PAUSE (nút)."
echo "Chỉ branch protection main là bật tay trên GitHub — trang /setup có link thẳng."
echo
echo "Không dùng web thì đường cũ vẫn chạy: loginctl enable-linger $USER · gh auth login"
echo "· repos.d/<slug>.env · $PREFIX/bin/doctor.sh · rm $BEE_ROOT/PAUSE"
echo
echo "Tuỳ chọn (quay demo tab Chrome thật): mở chrome://extensions ở profile riêng"
echo "cho agent → Developer mode → Load unpacked → $HOME/.claude/skills/record-screen/extension"

#!/usr/bin/env bash
# install.sh — cài runner lên máy. Idempotent: chạy lại vô hại.
#
# Chạy bằng CHÍNH user sẽ chạy phiên (khuyến nghị: user `bee`), KHÔNG sudo —
# trừ đúng một bước copy vào /opt/bee sẽ tự xin sudo nếu cần.
# Cài xong hệ thống NẰM IM: PAUSE được tạo sẵn, và checklist việc-cần-người
# in ra ở cuối. Gỡ PAUSE là hành động bật máy có chủ đích.
set -euo pipefail

SRC_DIR=$(dirname "$(readlink -f "$0")")
PREFIX="${BEE_PREFIX:-/opt/bee}"
BEE_ROOT="${BEE_ROOT:-/srv/bee}"
# port_owner: cài web lên một cổng người khác đang giữ thì unit crash-loop
# trong im lặng (25/08, 1005 lần). Hỏi trước khi bật.
source "$SRC_DIR/lib/common.sh"

echo "== 1 · Copy code vào $PREFIX =="
if [[ -w "$(dirname "$PREFIX")" || -w "$PREFIX" ]]; then SUDO=""; else SUDO="sudo"; fi
$SUDO mkdir -p "$PREFIX"
$SUDO cp -r "$SRC_DIR/bin" "$SRC_DIR/lib" "$PREFIX/"
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
FRESH=1
[[ -d "$BEE_ROOT/sessions" ]] && FRESH=0
mkdir -p "$BEE_ROOT"/{repos,repos.d,env.d,work,sessions}
# Env của máy: mọi phiên đều nạp, không bao giờ đè lên auth. Tạo sẵn có chú
# thích để lần sau cần thì biết chỗ, thay vì đi rải biến vào unit.
if [[ ! -f "$BEE_ROOT/machine.env" ]]; then
  cat > "$BEE_ROOT/machine.env" <<'EOF'
# Biến môi trường cho MỌI phiên trên máy này (session-run.sh nạp trước
# claude.env, nên không đè được lên auth). Một dòng KEY=value mỗi biến.
#
# SLAYER_MINIMAL_PAYLOAD=1   # hook token-slayer chỉ gửi usage, bỏ prompt + tool_input
EOF
fi
# Service pool skeleton (T15). Created, never filled: an empty compose file
# means "no pool", which is the correct state for a machine whose repos do not
# need shared services. The owner adds services from /setup.
mkdir -p "$BEE_ROOT/services"
if [[ ! -f "$BEE_ROOT/services/compose.yml" ]]; then
  cat > "$BEE_ROOT/services/compose.yml" <<'EOF'
# Shared service pool. Every session gets its own slice of what is here:
# a database + role, a vhost + user, a bucket + key — named from its uuid.
#
# bee guesses what each service IS from its image, so use ordinary images
# (postgres, rabbitmq, minio/minio, mysql). An image bee cannot place still
# works — sessions just run their own copy instead of sharing this one.
#
# Bind to 127.0.0.1 only: this pool is bee's, not the machine's. The published
# port is what sessions are told to dial (BEE_DB_PORT, BEE_DB_URL, ...), so any
# port works — these are offset to leave the machine's own 5432/5672 alone.
#
# To share postgres and rabbitmq, REPLACE the `services: {}` line below with
# the block under it (uncommented) — a file with two `services:` keys is not
# valid YAML. Admin passwords come from services/admin.env.
services: {}

#services:
#  postgres:
#    image: postgres:16
#    restart: unless-stopped
#    environment:
#      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-bee}
#    ports: ["127.0.0.1:55432:5432"]
#    volumes: ["pgdata:/var/lib/postgresql/data"]
#    healthcheck:
#      test: ["CMD-SHELL", "pg_isready -U postgres"]
#      interval: 10s
#
#  rabbitmq:
#    image: rabbitmq:3-management
#    restart: unless-stopped
#    environment:
#      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER:-bee}
#      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS:-bee}
#    ports:
#      - "127.0.0.1:55672:5672"      # AMQP - the only port sessions need
#      # Management console, for a HUMAN. Offset like the rest: 15672 is
#      # commonly already taken, and ONE port in use fails the whole
#      # `compose up` - postgres included.
#      - "127.0.0.1:55673:15672"
#    volumes: ["rabbitdata:/var/lib/rabbitmq"]
#    healthcheck:
#      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
#      interval: 15s
#
#volumes:
#  pgdata:
#  rabbitdata:
EOF
fi
# Overrides for the pool compose above. Admin credentials themselves stay
# inside the containers — this file only carries what compose interpolates.
if [[ ! -f "$BEE_ROOT/services/admin.env" ]]; then
  printf '# Values the pool compose interpolates, e.g. POSTGRES_PASSWORD=…\n' \
    > "$BEE_ROOT/services/admin.env"
  chmod 600 "$BEE_ROOT/services/admin.env"
fi

[[ $FRESH -eq 1 ]] && touch "$BEE_ROOT/PAUSE"

# PATH cho unit: systemd --user KHÔNG đọc ~/.profile, nên `claude` và `node`
# của nvm vô hình với mọi unit. Hậu quả gặp thật 25/08: web bắt được bản
# claude cũ root cài ở /usr/local/bin (v2.1.161) rồi treo ở màn hình chào —
# nút "Đăng nhập Claude" báo "không lấy được link" mà máy vẫn có claude.
# Dựng PATH từ chính chỗ node/claude ĐANG chạy lúc cài, đặt lên đầu.
BINPATH="$(dirname "$(command -v node || echo /usr/bin/node)")"
CLAUDE_BIN="$(command -v claude || true)"
if [[ -n "$CLAUDE_BIN" && "$(dirname "$CLAUDE_BIN")" != "$BINPATH" ]]; then
  BINPATH="$BINPATH:$(dirname "$CLAUDE_BIN")"
fi
BINPATH="$BINPATH:$HOME/.local/bin:$HOME/bin:/usr/local/bin:/usr/bin:/bin"

# RAM ceiling for ONE session (T17). Sized from the machine's RAM rather than
# hardcoded: 60% leaves room for bee-web, docker and the OS. What must not
# happen is a runaway session taking the machine down — not keeping sessions
# in a small box. Override with a drop-in, do not edit this file:
#   systemctl --user edit bee-session@.service
MEM_KB=$(sed -n 's/^MemTotal:[[:space:]]*\([0-9]*\) kB/\1/p' /proc/meminfo)
SESSION_MEM_MAX="$(( ${MEM_KB:-4194304} * 60 / 100 / 1024 ))M"
echo "  · RAM cap per session: $SESSION_MEM_MAX (60% of $(( ${MEM_KB:-0} / 1024 ))M)"
echo "  · PATH cho unit: $BINPATH"

echo "== 3 · User units =="
# Units are templates: @PREFIX@/@BEE_ROOT@ are rendered here so BEE_PREFIX
# and BEE_ROOT overrides actually reach systemd — a hardcoded /opt/bee in
# ExecStart silently ignored both.
UDIR="$HOME/.config/systemd/user"
mkdir -p "$UDIR"
for f in "$SRC_DIR"/units/*.service "$SRC_DIR"/units/*.timer; do
  # bee-web needs the web build resolved first — handled in step 3b.
  [[ "$(basename "$f")" == "bee-web.service" ]] && continue
  sed "s|@PREFIX@|$PREFIX|g; s|@BEE_ROOT@|$BEE_ROOT|g; s|@BINPATH@|$BINPATH|g; s|@SESSION_MEM_MAX@|$SESSION_MEM_MAX|g" "$f" > "$UDIR/$(basename "$f")"
done
systemctl --user daemon-reload
# bee-services is rendered above but deliberately NOT enabled: starting a
# service pool is a decision, like removing PAUSE. /setup turns it on.
systemctl --user enable --now bee-reaper.timer bee-heartbeat.timer bee-gc.timer bee-tick.timer

echo "== 3b · Web service =="
# BEE_WEB overrides where the web app lives (default: sibling of runner).
WEB_DIR="${BEE_WEB:-$(readlink -f "$SRC_DIR/../web")}"
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
# Phanh hạn mức (FR-3.3): trên ngưỡng % thì không mở phiên MỚI. 0 = tắt.
QUOTA_BRAKE_PCT=85
# Trần chi cho MỘT phiên (FR-3.4): reaper dừng phiên vượt trần và gắn
# needs_human. 0 = tắt. Đơn vị USD, đọc từ total_cost_usd cộng dồn.
SESSION_MAX_USD=0
# IDLE ceiling for ONE session: the reaper stops a session with no activity
# from either side for this many hours. Counted from the LAST thing that
# happened, so a session waiting on a person dies only once it is genuinely
# forgotten. 0 = off. Continue picks the same conversation back up.
SESSION_IDLE_H=24
# Trần byte cho run.jsonl (spec §11): reaper cắt phần CŨ, giữ phần mới, và ghi
# một dòng bee_truncated để UI nói thật là bản này đã bị cắt. 0 = tắt.
RUN_MAX_KB=20480
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
  # Token cho bee-tick: sinh MỘT LẦN, không bao giờ ghi đè — đổi nó là làm
  # chết timer đang chạy. Không có nó thì /api/tick tự đóng (503).
  if ! grep -q '^BEE_TICK_TOKEN=' "$BEE_ROOT/web.env" 2>/dev/null; then
    echo "BEE_TICK_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)" >> "$BEE_ROOT/web.env"
    echo "  · đã sinh BEE_TICK_TOKEN trong web.env"
  fi

  sed "s|@BEE_ROOT@|$BEE_ROOT|g; s|@NODE@|$NODE_BIN|g; s|@WEBSERVER@|$WEB_SERVER|g; s|@BINPATH@|$BINPATH|g" \
    "$SRC_DIR/units/bee-web.service" > "$UDIR/bee-web.service"
  systemctl --user daemon-reload

  # Cổng đã có chủ khác thì DỪNG ở đây, và nói chủ là ai. Bật đại lên chỉ
  # đổi một lỗi đọc được ("cổng bận") lấy một lỗi không đọc được (unit
  # restart mãi, còn cổng vẫn trả 200 vì người kia đang phục vụ).
  WEB_PORT=$(sed -n 's/^PORT=//p' "$BEE_ROOT/web.env" 2>/dev/null | head -1)
  WEB_PORT="${WEB_PORT:-3210}"
  PORT_OWNER=$(port_owner "$WEB_PORT")
  if [[ "$PORT_OWNER" == other* ]]; then
    read -r _ P_PID P_USER <<<"$PORT_OWNER"
    echo >&2
    echo "✗ Cổng $WEB_PORT đã có chủ: pid ${P_PID:-?}${P_USER:+ (user $P_USER)} — KHÔNG phải bee-web." >&2
    echo "  Bật bee-web bây giờ thì nó chỉ crash-loop EADDRINUSE trong im lặng." >&2
    echo "  Chọn một: dừng tiến trình kia, hoặc đổi PORT trong $BEE_ROOT/web.env." >&2
    echo "  Xem ai đang giữ:  ss -ltnp \"sport = :$WEB_PORT\"" >&2
    exit 1
  fi
  systemctl --user enable --now bee-web.service
else
  echo "  (bỏ qua: chưa có bản build web — chạy: cd apps/web && pnpm build &&"
  echo "   cp -r .next/static .next/standalone/apps/web/.next/ — rồi cài lại)"
fi

echo "== 4 · Skill cho agent =="
SKILL_DIR="$HOME/.claude/skills"
mkdir -p "$SKILL_DIR"
cp -r "$SRC_DIR"/skills/* "$SKILL_DIR/"

# Global commands back the chat's action chips (/issue /pr /demo /preview) —
# a chip only renders when its command exists here.
CMD_DIR="$HOME/.claude/commands"
mkdir -p "$CMD_DIR"
cp "$SRC_DIR"/commands/*.md "$CMD_DIR/"

# record-screen (vendored, MIT — see its ATTRIBUTION.md) needs its node
# deps once. Best-effort: recording is optional, install must not die here.
if command -v npm >/dev/null && [[ ! -d "$SKILL_DIR/record-screen/scripts/node_modules" ]]; then
  (cd "$SKILL_DIR/record-screen/scripts" && npm install --no-fund --no-audit --silent) \
    || echo "  (record-screen: npm install failed — recording a Chrome tab will not work yet)"
fi

# The demo recorder needs a Chrome that can load an UNPACKED extension.
# Measured 27/08: Google Chrome 148 stable ignores --load-extension, so
# recording starts and captures nothing; Chrome for Testing (what Playwright
# downloads) works. Report it rather than pulling ~150MB inside install — but
# report it LOUDLY, because the failure it prevents is a demo video that is
# valid, plays, and shows nothing.
if compgen -G "$HOME/.cache/ms-playwright/chromium-*/chrome-linux64/chrome" >/dev/null 2>&1 \
  || compgen -G "$HOME/.cache/ms-playwright/chromium-*/chrome-linux/chrome" >/dev/null 2>&1; then
  echo "  · demo recording: Chrome for Testing present"
else
  echo "  · demo recording: NOT usable yet — no Chrome for Testing."
  echo "    Stable Chrome cannot load the recorder extension, so a demo would"
  echo "    produce an empty video. Fix with:"
  echo "      (cd $(cd "$SRC_DIR/../web" 2>/dev/null && pwd || echo apps/web) && npx playwright install chromium)"
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

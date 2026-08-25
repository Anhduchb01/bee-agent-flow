#!/usr/bin/env bash
# bootstrap.sh — máy TRẮNG → bee chạy được. Một lệnh, chạy lại vô hại.
#
#   sudo -iu bee
#   ~/bee-agent-flow/apps/runner/bin/bootstrap.sh
#
# Ba script, ba việc khác nhau — đừng lẫn:
#   bootstrap.sh  máy trắng → chạy được (node · claude cli · docker rootless · deploy đầu)
#   deploy.sh     code mới  → lên máy đang chạy (cổng → build → restart → doctor)
#   install.sh    chép runner + unit vào $PREFIX (deploy.sh tự gọi)
#
# CỐ Ý KHÔNG LÀM:
#  · tạo user / hidepid / tailscale serve — cần root, xem docs/tach-user.md
#    bước 1-2 và 7. Bootstrap chạy bằng user thường và giữ đúng như vậy.
#  · nhận token. Token Claude và PAT GitHub dán ở trang /setup trên web —
#    ở đó chúng không nằm trong argv (mọi user đọc được /proc) và không rơi
#    vào ~/.bash_history.
set -euo pipefail

KHONG_DOCKER=0; THAM_SO_DEPLOY=()
for a in "$@"; do
  case "$a" in
    --no-docker) KHONG_DOCKER=1;;
    --fast|--e2e|--web-only) THAM_SO_DEPLOY+=("$a");;
    --khong-deploy) THAM_SO_DEPLOY=(--BO-QUA);;
    -h|--help) sed -n '2,17p' "$0"; exit 0;;
    *) echo "Tham số lạ: $a (xem --help)" >&2; exit 2;;
  esac
done

REPO="$(cd "$(dirname "$(readlink -f "$0")")/../../.." && pwd)"
buoc() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
loi()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; }

# ── 0 · Chỗ đứng ──────────────────────────────────────────────────────────
buoc "0 · Kiểm tra chỗ đứng"

[[ $EUID -eq 0 ]] && { loi "đừng chạy bằng root. Đăng nhập user bee rồi chạy lại."; exit 1; }

# $USER không phải lúc nào cũng có (systemd, `env -i`, cron) và khi thiếu thì
# `set -u` giết script GIỮA lúc đang in lý do — người đọc chỉ thấy nó chết.
TOI="$(id -un)"

# Vào group docker là mất sạch ranh giới vừa dựng: docker.sock = quyền root
# trên host (docs/docker-cho-bee.md §1). Đây là lỗi, không phải cảnh báo.
for nhom in docker sudo adm; do
  if id -nG | tr ' ' '\n' | grep -qx "$nhom"; then
    loi "user $TOI đang ở group '$nhom' — ranh giới A+ vô nghĩa."
    echo "     sudo gpasswd -d $TOI $nhom   # rồi đăng nhập lại và chạy lại" >&2
    exit 1
  fi
done
ok "không ở group docker/sudo/adm"

# `sudo -iu bee` cho shell nhưng KHÔNG cho session bus → mọi `systemctl --user`
# phía sau chết với "Failed to connect to bus". Linger đã bật thì bus vẫn có
# thật ở /run/user/<uid>, chỉ thiếu biến môi trường trỏ tới.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
if ! systemctl --user show-environment >/dev/null 2>&1; then
  loi "không nối được systemd --user (XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR)"
  echo "     sudo loginctl enable-linger $TOI   # rồi chạy lại" >&2
  exit 1
fi
ok "systemd --user nối được"

# Giữ hai biến đó cho các lần `sudo -iu bee` sau, không phải nhớ gõ tay.
if ! grep -q 'bee-bootstrap' "$HOME/.bashrc" 2>/dev/null; then
  cat >> "$HOME/.bashrc" <<'EOF'

# --- bee-bootstrap ---
case ":$PATH:" in *":$HOME/bin:"*) ;; *) PATH="$HOME/bin:$PATH";; esac
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
export DOCKER_HOST="unix://$XDG_RUNTIME_DIR/docker.sock"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
EOF
  ok "ghi 4 dòng môi trường vào ~/.bashrc"
fi

# ── 1 · Gói hệ thống (phần duy nhất cần root) ─────────────────────────────
buoc "1 · Gói hệ thống"
# envsubst=gettext-base (chep_env_d), jq (doctor/gc), uidmap+dbus-user-session
# (docker rootless). Thiếu cái nào thì hỏng ở tận đâu đó phía sau, nên chặn
# ngay ở đây.
declare -A GOI=( [git]=git [curl]=curl [jq]=jq [envsubst]=gettext-base
                 [gh]=gh [newuidmap]=uidmap [dbus-daemon]=dbus-user-session )
THIEU=()
for lenh in "${!GOI[@]}"; do
  command -v "$lenh" >/dev/null || THIEU+=("${GOI[$lenh]}")
done
if [[ ${#THIEU[@]} -gt 0 ]]; then
  loi "thiếu gói: ${THIEU[*]}"
  echo "     Nhờ người có sudo chạy MỘT lệnh này rồi chạy lại bootstrap:" >&2
  echo "     sudo apt-get update && sudo apt-get install -y ${THIEU[*]}" >&2
  exit 1
fi
ok "git · curl · jq · envsubst · gh · uidmap · dbus-user-session"

# ── 2 · node + pnpm (per-user, không đụng hệ thống) ───────────────────────
buoc "2 · node + pnpm"
NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null
  ok "cài nvm"
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  nvm install --lts >/dev/null
  nvm alias default 'lts/*' >/dev/null
fi
nvm use default >/dev/null 2>&1 || true
corepack enable >/dev/null 2>&1 || true
ok "node $(node -v) · pnpm $(pnpm -v 2>/dev/null || echo 'sẽ do corepack nạp khi cần')"

# ── 3 · Claude CLI ────────────────────────────────────────────────────────
buoc "3 · Claude CLI"
if command -v claude >/dev/null; then
  ok "claude $(claude --version 2>/dev/null | head -1)"
else
  npm i -g @anthropic-ai/claude-code >/dev/null
  ok "claude $(claude --version 2>/dev/null | head -1)"
fi
echo "  · token: KHÔNG dán ở đây. Chạy 'claude setup-token' ở máy bất kỳ rồi"
echo "    dán vào trang /setup — argv và bash_history là chỗ token đi lạc."

# ── 4 · Docker rootless ───────────────────────────────────────────────────
if [[ $KHONG_DOCKER -eq 1 ]]; then
  buoc "4 · Docker — BỎ QUA (--no-docker)"
else
  buoc "4 · Docker rootless"
  if ! command -v dockerd-rootless-setuptool.sh >/dev/null; then
    # Bản rootless của get.docker.com cài vào ~/bin, KHÔNG cần root — khác
    # get.docker.com thường (dựng daemon root + group docker = root).
    curl -fsSL https://get.docker.com/rootless | sh >/dev/null
    export PATH="$HOME/bin:$PATH"
    ok "cài docker rootless vào ~/bin"
  fi
  if ! systemctl --user is-enabled docker.service >/dev/null 2>&1; then
    # setuptool tự in đoạn AppArmor cần root nếu kernel này đòi — đọc kỹ
    # phần nó in ra, đó là bước duy nhất còn cần người.
    dockerd-rootless-setuptool.sh install || {
      loi "setuptool dừng — làm đúng cái nó vừa in rồi chạy lại bootstrap"
      exit 1
    }
  fi
  export DOCKER_HOST="unix://$XDG_RUNTIME_DIR/docker.sock"
  systemctl --user enable --now docker >/dev/null 2>&1 || true
  if docker info >/dev/null 2>&1; then
    ok "docker $(docker version -f '{{.Server.Version}}' 2>/dev/null) · rootless · $DOCKER_HOST"
  else
    loi "docker chưa lên: journalctl --user -u docker -n 30 --no-pager"
  fi
fi

# ── 5 · Bee ───────────────────────────────────────────────────────────────
if [[ "${THAM_SO_DEPLOY[0]:-}" == "--BO-QUA" ]]; then
  buoc "5 · Deploy — BỎ QUA (--khong-deploy)"
else
  buoc "5 · Cài bee"
  ( cd "$REPO/apps/web" && pnpm install --frozen-lockfile >/dev/null )
  ok "pnpm install"
  # Lần đầu chưa có unit nào để deploy.sh dò ra đường dẫn, mà mặc định của nó
  # là /opt/bee + /srv/bee — hai chỗ user thường không ghi được. Đặt tường minh.
  export BEE_PREFIX="${BEE_PREFIX:-$HOME/.local/bee}"
  export BEE_ROOT="${BEE_ROOT:-$HOME/.local/srv/bee}"
  "$REPO/apps/runner/bin/deploy.sh" ${THAM_SO_DEPLOY[@]+"${THAM_SO_DEPLOY[@]}"}
fi

# ── 6 · Còn lại là việc của người ─────────────────────────────────────────
buoc "Còn lại — việc của người"
PORT="$(sed -n 's/^PORT=//p' "${BEE_ROOT:-$HOME/.local/srv/bee}/web.env" 2>/dev/null | head -1)"
cat <<EOF
  1. Mở web (127.0.0.1:${PORT:-3210}) → /setup: dán token Claude · dán PAT
     GitHub · đăng ký repo · chạy doctor · gỡ PAUSE.
  2. Cho ra tailnet (cần root, làm MỘT lần):
       sudo tailscale serve --bg ${PORT:-3210}
  3. Nghiệm thu ranh giới — dòng này PHẢI ra Permission denied:
       docker run --rm -v /home/<user-người>:/h alpine ls /h
EOF

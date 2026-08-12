#!/usr/bin/env bash
#
# install.sh — cài bee reconciler lên Ubuntu 22.04 / 24.04.
# Idempotent: chạy lại bao nhiêu lần cũng vô hại.
#
#   sudo ./infra/reconciler/install.sh [--no-deps]
#
# Nguyên tắc: script làm HẾT phần không tương tác, rồi in ra checklist phần bắt
# buộc phải có người. Không cố tự động hoá `claude /login`, `gh auth login`,
# `cloudflared tunnel login` — chúng cần trình duyệt, và script cố làm sẽ treo
# hoặc fail khó hiểu.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX=/opt/bee
ETC=/etc/bee
SRV=/srv/bee
ORCH=bee-orch
AGENT=bee-agent
GRP=bee
NODE_MAJOR=20
NO_DEPS=0
[[ "${1:-}" == "--no-deps" ]] && NO_DEPS=1

if [[ -t 1 ]]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[1m'; N=$'\033[0m'
else G=''; Y=''; R=''; B=''; N=''; fi
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
ok()   { printf '    %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '    %s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '%s%s%s\n' "$R" "$*" "$N" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "chạy với sudo"
. /etc/os-release 2>/dev/null || die "không đọc được /etc/os-release"
[[ "${ID:-}" == "ubuntu" ]] || warn "chỉ thử nghiệm trên Ubuntu — đang là ${ID:-?}"

MEM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1024 / 1024 ))
(( MEM_GB >= 15 )) || warn "chỉ có ${MEM_GB}GB RAM — nên hạ MAX_BUILD_SLOTS về 1 trong bee.env"

# ---------------------------------------------------------------------------
if (( ! NO_DEPS )); then
  step "Gói hệ thống"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    git jq curl ca-certificates gnupg ffmpeg python3 build-essential uidmap >/dev/null
  ok "git jq curl ffmpeg python3"

  step "Node ${NODE_MAJOR}"
  if ! command -v node >/dev/null || (( $(node -v | cut -c2- | cut -d. -f1) < NODE_MAJOR )); then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
  ok "node $(node -v)"

  step "Docker"
  if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  fi
  ok "docker $(docker --version | awk '{print $3}' | tr -d ,)"

  step "gh CLI"
  if ! command -v gh >/dev/null; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list
    apt-get update -qq && apt-get install -y -qq gh >/dev/null
  fi
  ok "gh"

  step "MinIO client"
  if ! command -v mc >/dev/null; then
    curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
    chmod +x /usr/local/bin/mc
  fi
  ok "mc"
fi

# ---------------------------------------------------------------------------
step "User và group"
getent group "$GRP" >/dev/null || groupadd "$GRP"

for u in "$ORCH" "$AGENT"; do
  id -u "$u" >/dev/null 2>&1 || useradd -m -s /bin/bash -G "$GRP" "$u"
  usermod -aG "$GRP" "$u"
done
ok "$ORCH, $AGENT (group $GRP)"

# Orch cần docker để dựng service test và preview env.
usermod -aG docker "$ORCH" 2>/dev/null || warn "chưa có group docker"
ok "$ORCH → group docker"

# ⚠ Agent TUYỆT ĐỐI không được vào group docker. Thuộc group đó tương đương
# quyền root: `docker run -v /:/host` đọc được cả GH_TOKEN lẫn /home của bạn,
# và toàn bộ thiết kế hai user sụp trong một dòng lệnh — không để lại dấu hiệu
# nào. Dòng dưới là bảo hiểm, phòng khi ai đó lỡ tay thêm vào sau này.
if id -nG "$AGENT" | grep -qw docker; then
  gpasswd -d "$AGENT" docker >/dev/null
  warn "đã GỠ $AGENT khỏi group docker (thuộc group này = quyền root)"
fi
ok "$AGENT KHÔNG thuộc group docker"

# Khoá home của agent — nó chạy --dangerously-skip-permissions.
chmod 700 "/home/$AGENT" "/home/$ORCH" 2>/dev/null || true

# ---------------------------------------------------------------------------
step "Thư mục"
install -d -m 755 "$PREFIX" "$PREFIX/bin" "$PREFIX/lib" "$PREFIX/rules" "$PREFIX/prompts"
install -d -m 755 "$ETC" "$ETC/repos.d"
install -d -o "$ORCH" -g "$GRP" -m 775 "$SRV" "$SRV/repos" "$SRV/state" "$SRV/attempts" "$SRV/public"
# setgid trên work/: mọi worktree tạo ra tự thuộc group bee, nên agent
# (cùng group) đọc ghi được mà không cần chown mỗi lần.
install -d -o "$ORCH" -g "$GRP" -m 2775 "$SRV/work"
ok "$PREFIX, $ETC, $SRV"

step "Mã nguồn"
install -m 755 "$SRC/bin/reconcile.sh" "$SRC/bin/worker.sh" \
               "$SRC/bin/agent-exec.sh" "$SRC/bin/heartbeat-check.sh" "$PREFIX/bin/"
install -m 644 "$SRC"/lib/*.sh    "$PREFIX/lib/"
install -m 644 "$SRC"/rules/*.sh  "$PREFIX/rules/"
# Lệnh chính là `be` (2 ký tự, thứ bạn gõ hằng ngày); `bee` là symlink để tài
# liệu và script đọc dễ hơn. Cùng một file, không có bản nào lệch bản nào.
install -m 755 "$SRC/bin/bee" /usr/local/bin/be
ln -sfn /usr/local/bin/be /usr/local/bin/bee
install -d -m 755 /etc/bash_completion.d
install -m 644 "$SRC/completion/bee.bash" /etc/bash_completion.d/be
[[ -d "$SRC/prompts" ]] && install -m 644 "$SRC"/prompts/*.md "$PREFIX/prompts/" 2>/dev/null || true
ok "$PREFIX/bin, /usr/local/bin/be (+ symlink bee)"

step "Cấu hình"
for f in bee orch; do
  if [[ ! -f "$ETC/$f.env" ]]; then
    install -m "$([[ $f == orch ]] && echo 600 || echo 644)" \
            -o root -g root "$SRC/config/$f.env.example" "$ETC/$f.env"
    ok "tạo $ETC/$f.env"
  else
    ok "$ETC/$f.env đã có, giữ nguyên"
  fi
done
chmod 600 "$ETC/orch.env"

step "sudoers"
install -m 440 -o root -g root "$SRC/sudoers/bee" /etc/sudoers.d/bee
visudo -cf /etc/sudoers.d/bee >/dev/null || {
  rm -f /etc/sudoers.d/bee; die "sudoers sai cú pháp — đã gỡ để không khoá máy"
}
ok "orch → agent, đúng một lệnh"

step "systemd"
install -m 644 "$SRC"/systemd/bee*.service "$SRC"/systemd/bee*.timer \
               "$SRC/systemd/bee.slice" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bee-heartbeat.timer >/dev/null 2>&1 || true
systemctl enable bee-reconcile.timer >/dev/null
ok "unit đã cài, timer đã enable"

# Cài xong nhưng CHƯA chạy: tạo PAUSE để hệ thống nằm im cho tới khi bạn xong
# phần cấu hình tay. Không ai muốn agent bắt đầu làm việc lúc token còn rỗng.
touch "$ETC/PAUSE"
warn "đã tạo $ETC/PAUSE — hệ thống nằm im cho tới khi bạn chạy: be resume"

step "Chống ngủ"
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
ok "sleep/hibernate đã mask"

step "Playwright (dưới $AGENT)"
sudo -u "$AGENT" -H bash -lc 'npx --yes playwright@latest install chromium' >/dev/null 2>&1 \
  && ok "chromium" || warn "chưa cài được chromium — chạy lại sau khi repo có package.json"
npx --yes playwright@latest install-deps chromium >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
cat <<EOF

${B}Cài xong.${N} Còn ${B}5 việc bắt buộc phải có người${N} — chúng cần trình duyệt
hoặc quyết định của bạn, nên script cố ý không tự làm:

  ${B}1.${N} Đăng nhập Claude Code ${B}dưới đúng user agent${N}
        sudo -u $AGENT -H claude          # rồi gõ /login
     Credential nằm ở /home/$AGENT/.claude. Nếu bạn lỡ đăng nhập dưới user
     của mình, job sẽ báo chưa auth và lỗi đó rất khó đoán.

  ${B}2.${N} Đăng nhập gh dưới orch
        sudo -u $ORCH -H gh auth login

  ${B}3.${N} Điền token vào $ETC/orch.env   (quyền 600)
     Dùng fine-grained PAT: Contents + Pull requests + Issues = write.
     ${Y}Cố ý KHÔNG cấp quyền Workflows${N} — để agent không tự nới guardrail được.

  ${B}4.${N} Thêm repo
        be repo add org/ten-repo
        \$EDITOR $ETC/repos.d/ten-repo.env   # điền REVIEWERS_PM / REVIEWERS_TL

  ${B}5.${N} Kiểm tra rồi mới bật
        be doctor
        be dry-run      # xem nó ĐỊNH làm gì, chưa làm gì cả
        be resume       # gỡ PAUSE, bắt đầu chạy thật

Đừng bỏ qua bước ${B}dry-run${N}. Mốc M0 tồn tại để bạn tin cái vòng lặp trước khi
cho agent chạy thật — nếu không, lúc kết quả sai bạn sẽ không phân biệt được
lỗi ở prompt hay ở hạ tầng của chính mình.

EOF

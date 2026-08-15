#!/usr/bin/env bash
#
# install.sh — cài bee reconciler lên Ubuntu 22.04 / 24.04.
# Idempotent: chạy lại bao nhiêu lần cũng vô hại.
#
#   sudo ./apps/reconciler/install.sh [--no-deps] [--claude-from[=USER]]
#
# Nguyên tắc: script làm HẾT phần không tương tác, rồi in ra checklist phần bắt
# buộc phải có người. Không cố tự động hoá `claude /login`, `gh auth login`,
# `cloudflared tunnel login` — chúng cần trình duyệt, và script cố làm sẽ treo
# hoặc fail khó hiểu.
#
# `--claude-from` là ngoại lệ có chủ ý: nếu user của bạn đã đăng nhập Claude rồi
# thì không có lý do gì bắt đăng nhập lần nữa. Nó chép sang bee-agent ĐÚNG HAI
# THỨ — file binary và đúng một file credential. Xem `claude_from_user()`.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX=/opt/bee
ETC=/etc/bee
SRV=/srv/bee
ORCH=bee-orch
AGENT=bee-agent
GRP=bee
# Node của HỆ THỐNG, không phải node trong shell của bạn. bee-orch và bee-agent
# chạy qua sudo/systemd nên chúng lấy /usr/bin/node — nvm hay conda trong shell
# của người cài không liên quan gì tới chúng.
#
# 22 chứ không phải 20: Next.js 15+ đòi >=20.9, và nhiều gói phổ biến đã yêu cầu
# `^20.19 || >=22.12`. Ubuntu 24.04 đóng gói sẵn node 18, đủ cũ để mọi thứ đổ.
NODE_MAJOR=22
NO_DEPS=0
CLAUDE_FROM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-deps)        NO_DEPS=1 ;;
    --claude-from=*)  CLAUDE_FROM="${1#*=}" ;;
    # Không có giá trị đi kèm thì lấy chính người đang gõ sudo — trường hợp
    # thường gặp nhất, và cũng là người chắc chắn đã đăng nhập Claude.
    --claude-from)    if [[ -n "${2:-}" && "${2:0:1}" != "-" ]]; then
                        CLAUDE_FROM="$2"; shift
                      else
                        CLAUDE_FROM="${SUDO_USER:-}"
                      fi ;;
    -h|--help)        sed -n '3,15p' "$0"; exit 0 ;;
    *)                printf 'tham số lạ: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

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
# `apt-get update` trả mã lỗi khi BẤT KỲ nguồn nào hỏng — kể cả nguồn không liên
# quan gì tới bee. Một PPA hết hạn hay thiếu khoá GPG là chuyện thường trên máy
# lập trình viên, và với `set -e` thì nó giết installer ngay ở bước đầu tiên,
# kèm một thông báo nói về k8slens chứ không nói gì về bee.
#
# Nên: cảnh báo rồi đi tiếp. Nếu gói bee thực sự cần mà không lấy được thì
# `apt-get install` ngay sau đó sẽ đỏ — và lúc ấy lỗi mới nói đúng chuyện.
apt_refresh() {
  apt-get update -qq && return 0
  warn "apt-get update có nguồn hỏng (xem lỗi phía trên) — vẫn đi tiếp"
  warn "nếu đó là repo bên thứ ba không liên quan thì bỏ qua được"
  return 0
}

# Dùng lại bản Claude Code mà một user thường đã cài và đã đăng nhập.
#
# Chép ĐÚNG HAI THỨ, và cố ý không chép gì thêm:
#
#   1. binary — bản cài của Claude Code là một file ELF độc lập, nên copy được.
#      Đặt ở /usr/local/bin chứ không phải ~/.local/bin của agent: agent-exec.sh
#      chạy qua `sudo`, mà `secure_path` của sudo KHÔNG có ~/.local/bin. Cài vào
#      home của agent thì `command -v claude` vẫn trượt, và lỗi báo ra là
#      "chưa cài claude, hoặc chưa đăng nhập" — nói sai hoàn toàn nguyên nhân.
#
#   2. `.credentials.json` — đúng một file.
#
# CÁCH NÀY CHỈ ĐỂ CHẠY THỬ. Bản copy sẽ bị thu hồi, xem cảnh báo cuối hàm.
# Đường dùng lâu dài là token dài hạn: `be token` (hoặc `claude setup-token`).
#
# TUYỆT ĐỐI không chép cả thư mục `~/.claude/`, và không chép `~/.claude.json`.
# File đó giữ cấu hình MCP server (có thể chứa API key của dịch vụ khác), lịch
# sử mọi dự án, và session cũ. Đưa nguyên chỗ đó cho một user chạy
# `--dangerously-skip-permissions` là mở một cửa hậu không ai nhớ mình đã mở.
claude_from_user() {
  local u="$1" home bin cred
  [[ -n "$u" ]] || die "--claude-from cần tên user (hoặc chạy qua sudo để tự lấy)"
  home=$(getent passwd "$u" | cut -d: -f6)
  [[ -n "$home" ]] || die "không có user $u"

  bin="$home/.local/bin/claude"
  cred="$home/.claude/.credentials.json"

  step "Claude Code — dùng lại của $u"

  if [[ -e "$bin" ]]; then
    install -m 755 -o root -g root "$(readlink -f "$bin")" /usr/local/bin/claude
    ok "binary → /usr/local/bin/claude ($(/usr/local/bin/claude --version 2>/dev/null || echo '?'))"
  else
    warn "không thấy $bin — bỏ qua binary, agent sẽ cần bản cài riêng"
  fi

  if [[ -f "$cred" ]]; then
    install -d -o "$AGENT" -g "$AGENT" -m 700 "/home/$AGENT/.claude"
    install -m 600 -o "$AGENT" -g "$AGENT" "$cred" "/home/$AGENT/.claude/.credentials.json"
    ok "credential → /home/$AGENT/.claude/.credentials.json (chỉ mình file này)"
    warn "agent sẽ chạy bằng TÀI KHOẢN CLAUDE CỦA $u — hạn mức tính vào đó"
    warn ""
    warn "BẢN COPY NÀY SẼ HỎNG, và câu hỏi chỉ là bao giờ."
    warn "OAuth token xoay vòng. Lần tới $u dùng Claude, token mới được cấp và"
    warn "token cũ — bản $AGENT đang giữ — BỊ THU HỒI. Từ lúc đó mọi lần chạy"
    warn "agent trả về \"401 OAuth access token has been revoked\"."
    warn ""
    warn "Đo được trên máy này: copy lúc 14-08 09:56, hỏng trước 15-08 14:19."
    warn ""
    warn "Dùng --claude-from để CHẠY THỬ cho nhanh. Trước khi giao việc thật thì"
    warn "đăng nhập riêng, cùng tài khoản cũng được — mỗi lần đăng nhập là một"
    warn "token riêng, và chúng không thu hồi lẫn nhau:"
    warn "      claude setup-token            (dưới user của bạn) rồi:"
    warn "      sudo be token <token vừa sinh>"
    warn ""
    warn "Hoặc đăng nhập riêng dưới $AGENT — cũng được, chỉ là phải làm lại"
    warn "mỗi khi phiên hết hạn:"
    warn "      sudo -u $AGENT -H claude      rồi gõ /login"
  else
    warn "không thấy $cred — $u đã chạy \`claude\` rồi \`/login\` chưa?"
  fi
}

if (( ! NO_DEPS )); then
  step "Gói hệ thống"
  export DEBIAN_FRONTEND=noninteractive
  apt_refresh
  apt-get install -y -qq --no-install-recommends \
    git jq curl ca-certificates gnupg ffmpeg python3 build-essential uidmap >/dev/null
  ok "git jq curl ffmpeg python3"

  step "Node ${NODE_MAJOR}"
  if ! command -v node >/dev/null || (( $(node -v | cut -c2- | cut -d. -f1) < NODE_MAJOR )); then
    # KHÔNG dùng script `setup_XX.x` của NodeSource: nó tự chạy `apt-get update`
    # và tự chết khi máy có một repo bên thứ ba hỏng — im lặng. Sau đó
    # `apt-get install nodejs` lấy đúng bản cũ của Ubuntu, và bước này in ra
    # như đã cài xong. Thêm khoá và nguồn theo đúng cách đã dùng cho Docker/gh.
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    chmod a+r /etc/apt/keyrings/nodesource.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt_refresh
    apt-get install -y -qq nodejs >/dev/null
  fi
  # Kiểm LẠI sau khi cài. Bản cũ in `ok "node $(node -v)"` bất kể kết quả, nên
  # một lần cài trượt đọc lên y hệt một lần cài thành công.
  if (( $(node -v | cut -c2- | cut -d. -f1) >= NODE_MAJOR )); then
    ok "node $(node -v)"
  else
    die "vẫn là node $(node -v). bee-orch và bee-agent dùng /usr/bin/node — nvm trong shell của bạn không liên quan tới chúng."
  fi

  step "Docker"
  if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt_refresh
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
    apt_refresh
    apt-get install -y -qq gh >/dev/null
  fi
  ok "gh"

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
if thuoc_group "$AGENT" docker; then
  gpasswd -d "$AGENT" docker >/dev/null
  warn "đã GỠ $AGENT khỏi group docker (thuộc group này = quyền root)"
fi
ok "$AGENT KHÔNG thuộc group docker"

# Khoá home của agent — nó chạy --dangerously-skip-permissions.
chmod 700 "/home/$AGENT" "/home/$ORCH" 2>/dev/null || true

# `if` chứ không phải `[[ … ]] && f`: với `set -e`, câu sau trả về 1 khi điều
# kiện sai và giết cả script — đúng ở nhánh có dùng cờ, chết ở nhánh không dùng.
if [[ -n "$CLAUDE_FROM" ]]; then
  claude_from_user "$CLAUDE_FROM"
fi

# ---------------------------------------------------------------------------
step "Thư mục"
install -d -m 755 "$PREFIX" "$PREFIX/bin" "$PREFIX/lib" "$PREFIX/rules" "$PREFIX/prompts"
install -d -m 755 "$ETC" "$ETC/repos.d"
# agent.env: file DUY NHẤT mà bee-orch không đọc được. Nó cầm quyền gọi model,
# orch cầm GH_TOKEN, và hai thứ ở hai UID là toàn bộ lý do có hai user.
if [[ ! -f "$ETC/agent.env" ]]; then
  install -o root -g "$AGENT" -m 640 "$SRC/config/agent.env.example" "$ETC/agent.env"
else
  chown root:"$AGENT" "$ETC/agent.env"; chmod 640 "$ETC/agent.env"
fi
install -d -o "$ORCH" -g "$GRP" -m 775 "$SRV" "$SRV/repos" "$SRV/state" "$SRV/attempts" \
                                        "$SRV/reviewed" "$SRV/public"
# setgid trên work/: mọi worktree tạo ra tự thuộc group bee, nên agent
# (cùng group) đọc ghi được mà không cần chown mỗi lần.
install -d -o "$ORCH" -g "$GRP" -m 2775 "$SRV/work"
# evidence/: orch ghi, bee-web ĐỌC. 2750 chứ không phải 2775 — web app không
# bao giờ ghi vào /srv/bee, và "other" thì không được thấy gì cả (một PR private
# có thể lộ toàn bộ màn hình sản phẩm qua video).
install -d -o "$ORCH" -g "$GRP" -m 2750 "$SRV/evidence"
ok "$PREFIX, $ETC, $SRV"

step "Mã nguồn"
install -m 755 "$SRC/bin/reconcile.sh" "$SRC/bin/worker.sh" \
               "$SRC/bin/agent-exec.sh" "$SRC/bin/heartbeat-check.sh" "$PREFIX/bin/"
install -m 755 "$SRC/bin/spec-chat.mjs" "$PREFIX/bin/"
install -m 644 "$SRC"/lib/*.sh    "$PREFIX/lib/"
install -m 644 "$SRC"/rules/*.sh  "$PREFIX/rules/"
# Lệnh chính là `be` (2 ký tự, thứ bạn gõ hằng ngày); `bee` là symlink để tài
# liệu và script đọc dễ hơn. Cùng một file, không có bản nào lệch bản nào.
install -m 755 "$SRC/bin/bee" /usr/local/bin/be
ln -sfn /usr/local/bin/be /usr/local/bin/bee
install -d -m 755 /etc/bash_completion.d
install -m 644 "$SRC/completion/bee.bash" /etc/bash_completion.d/be
[[ -d "$SRC/prompts" ]] && install -m 644 "$SRC"/prompts/*.md "$PREFIX/prompts/" 2>/dev/null || true

# Dashboard là file tĩnh, cố ý KHÔNG do reconciler phục vụ: nếu trang do chính
# reconciler phục vụ thì lúc nó chết bạn mở trang ra chỉ thấy lỗi kết nối — đúng
# lúc cần biết chuyện gì đang xảy ra thì không biết được gì.
[[ -f "$SRC/public/index.html" ]] && \
  install -m 644 -o "$ORCH" -g "$GRP" "$SRC/public/index.html" "$SRV/public/index.html" || true
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

step "polkit"
# Dispatcher chạy dưới bee-orch và gọi `systemctl start bee-task@…`. Không có
# luật này thì polkit trả "Interactive authentication required" và tick chết
# giữa chừng — xem đầu file 49-bee.rules.
if [[ -d /etc/polkit-1/rules.d ]]; then
  install -m 644 -o root -g root "$SRC/polkit/49-bee.rules" /etc/polkit-1/rules.d/49-bee.rules
  ok "bee-orch được khởi động bee-task@*"
else
  # polkit đời cũ (≤ 0.105, Ubuntu 22.04) không đọc luật JavaScript. Nó dùng
  # .pkla, mà .pkla KHÔNG lọc được theo tên unit — nên ở đó phải cấp rộng hơn.
  # Không tự làm chuyện đó thay bạn; nói ra để bạn quyết.
  warn "không thấy /etc/polkit-1/rules.d — polkit đời cũ?"
  warn "bee-orch sẽ không start được bee-task@*; xem apps/reconciler/polkit/49-bee.rules"
fi

step "systemd"
install -m 644 "$SRC"/systemd/bee*.service "$SRC"/systemd/bee*.timer \
               "$SRC/systemd/bee.slice" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bee-heartbeat.timer >/dev/null 2>&1 || true
systemctl enable bee-reconcile.timer >/dev/null
ok "unit đã cài, timer đã enable"

# Cài xong nhưng CHƯA chạy: tạo PAUSE để hệ thống nằm im cho tới khi bạn xong
# phần cấu hình tay. Không ai muốn agent bắt đầu làm việc lúc token còn rỗng.
#
# Nhưng CHỈ khi hệ thống chưa chạy. Cài lại trên một máy đang chạy mà âm thầm
# dừng nó thì dòng "Idempotent: chạy lại bao nhiêu lần cũng vô hại" ở đầu file
# này thành lời nói dối — và bạn sẽ phát hiện ra bằng cách thấy agent im lặng
# suốt buổi chiều mà không hiểu vì sao.
if systemctl is-active --quiet bee-reconcile.timer && [[ ! -f "$ETC/PAUSE" ]]; then
  ok "hệ thống đang chạy — giữ nguyên, không tạo PAUSE"
else
  touch "$ETC/PAUSE"
  warn "đã tạo $ETC/PAUSE — hệ thống nằm im cho tới khi bạn chạy: be resume"
fi

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
     ${Y}Đã đăng nhập sẵn dưới user của bạn?${N} Chạy lại installer với
        sudo ./apps/reconciler/install.sh --claude-from
     rồi bỏ qua bước này.

  ${B}2.${N} Đăng nhập gh dưới orch
        sudo -u $ORCH -H gh auth login

  ${B}3.${N} Điền token vào $ETC/orch.env   (quyền 600)
     Dùng fine-grained PAT, ${B}bốn${N} quyền đều là write:
        Contents · Issues · Pull requests · ${B}Commit statuses${N}
     Quên Commit statuses thì rule 03 đổ với HTTP 403 và thử lại mãi.
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

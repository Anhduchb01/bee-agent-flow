#!/usr/bin/env bash
#
# install.sh — cài dashboard lên máy đã có reconciler.
#
#   sudo bash apps/web/install.sh
#   sudo bash apps/web/install.sh --no-build   # dùng lại .next/standalone có sẵn
#
# Vì sao tách khỏi installer của reconciler: reconciler chạy được một mình, và
# nhiều máy sẽ chỉ cần nó. Dashboard là thứ thêm vào, với một UID riêng và một
# bộ quyền hẹp hơn hẳn.

set -euo pipefail

SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PREFIX=/opt/bee-web
ETC=/etc/bee
STATE=/var/lib/bee-web
SRV=/srv/bee
WEB=bee-web
GRP=bee
BUILD=1

[[ "${1:-}" == "--no-build" ]] && BUILD=0

C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_B=$'\033[1m'; C_0=$'\033[0m'
step() { printf '\n%s▸ %s%s\n' "$C_B" "$*" "$C_0"; }
ok()   { printf '  %s✓%s %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_Y" "$C_0" "$*"; }
die()  { printf '  %s✗%s %s\n' "$C_R" "$C_0" "$*"; exit 1; }

[[ $EUID -eq 0 ]] || die "phải chạy bằng root: sudo bash $0"

# `grep -qw "$g"` KHÔNG dùng được ở đây. Với grep, dấu gạch ngang là ranh giới
# từ, nên `bee-web` khớp `\bbee\b` — và câu hỏi "bee-web có thuộc group bee
# không" luôn trả lời CÓ, kể cả khi không. Hậu quả cụ thể: installer gọi
# `gpasswd -d bee-web bee` cho một thành viên không tồn tại, gpasswd trả lỗi, và
# `set -e` giết cả script ở dòng thứ ba.
#
# So khớp trọn dòng sau khi tách danh sách ra từng dòng.
thuoc_group() {
  id -nG "$1" 2>/dev/null | tr ' ' '\n' | grep -qx "$2"
}

# Dashboard đọc /srv/bee. Không có reconciler thì nó chỉ có một trang trống, và
# đổ ở chỗ khó đoán hơn nhiều so với một câu từ chối ở đây.
[[ -d "$SRV" ]] || die "chưa có $SRV — cài reconciler trước (apps/reconciler/install.sh)"

# ---------------------------------------------------------------------------
step "User $WEB"
getent group "$GRP" >/dev/null || die "chưa có group $GRP — cài reconciler trước"

# `--system`, không home đăng nhập được, shell nologin: user này không dành cho
# ai đăng nhập, nó chỉ để chạy một tiến trình.
#
# Primary group PHẢI là `bee-web` của riêng nó, `bee` chỉ là group phụ. Cho
# primary group là `bee` thì `/etc/bee/web.env` (0640 root:<primary>) trở thành
# đọc được với CẢ GROUP BEE — mà bee-agent nằm trong group đó. Nghĩa là process
# chạy `--dangerously-skip-permissions` đọc được AUTH_GITHUB_SECRET, và không có
# triệu chứng nào cho tới lúc đã muộn.
getent group "$WEB" >/dev/null || groupadd --system "$WEB"
if ! id -u "$WEB" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin -g "$WEB" "$WEB"
fi

# KHÔNG cho $WEB vào group $GRP, và đây là chỗ dễ làm sai nhất trong cả file.
#
# Đường nghĩ tự nhiên: app cần đọc /srv/bee/evidence (2750), vậy cho nó vào
# group `bee`. Nhưng group `bee` có quyền GHI trên gần hết /srv/bee — bee-agent
# cần thế để viết worktree. Nên một dòng `usermod -aG bee bee-web` biến app,
# thứ duy nhất trong hệ thống này đưa ra internet, thành thứ ghi được vào đĩa mà
# reconciler tin rằng chỉ mình nó viết.
#
# Cách đúng: đổi GROUP của thư mục evidence sang `bee-web` (ngay dưới đây).
# orch vẫn ghi được vì nó là CHỦ SỞ HỮU; app đọc được vì nó ở trong group; và
# bee-agent mất luôn quyền đọc bằng chứng, cũng là điều đáng.
if thuoc_group "$WEB" "$GRP"; then
  gpasswd -d "$WEB" "$GRP" >/dev/null
  warn "đã GỠ $WEB khỏi group $GRP (group đó ghi được vào $SRV)"
fi
usermod -g "$WEB" "$WEB"
ok "$WEB (group riêng, KHÔNG thuộc $GRP)"

# App đưa lên internet được, nên nó phải là user YẾU NHẤT trong ba user. Hai
# dòng dưới là bảo hiểm cho ngày ai đó lỡ tay — cùng lý do và cùng hình dạng với
# lớp chặn agent vào group docker ở installer kia.
if thuoc_group "$WEB" docker; then
  gpasswd -d "$WEB" docker >/dev/null
  warn "đã GỠ $WEB khỏi group docker (thuộc group này = quyền root)"
fi
for g in sudo admin wheel; do
  thuoc_group "$WEB" "$g" && die "$WEB thuộc group $g — gỡ ra rồi chạy lại"
done
ok "$WEB không docker, không sudo"

# ---------------------------------------------------------------------------
step "Quyền trên $SRV — CHỈ ĐỌC"
# Bằng chứng: chủ vẫn là bee-orch (nó ghi), group đổi sang $WEB (app đọc).
# setgid giữ cho mọi thư mục con sinh ra sau này cũng thuộc group ấy — và
# `lib/evidence.sh` đọc group từ chính thư mục này nên hai bên không lệch nhau
# được.
for d in evidence runs; do
  if [[ -d "$SRV/$d" ]]; then
    chgrp "$WEB" "$SRV/$d"
    chmod 2750 "$SRV/$d"
    # Thư mục cũ ghi trước khi đổi group thì app không đọc nổi, và triệu chứng
    # là "trống rỗng" chứ không phải một lỗi quyền.
    chgrp -R "$WEB" "$SRV/$d" 2>/dev/null || true
    ok "$SRV/$d → group $WEB (bee-orch vẫn ghi, $WEB đọc)"
  else
    warn "chưa có $SRV/$d — chạy lại installer của reconciler"
  fi
done

# Mọi thứ khác dưới $SRV: app đọc qua quyền "other" (status.json và recent.jsonl
# là 644). Không chown, không chmod: việc app không ghi được vào đó là tính năng.
install -d -o "$WEB" -g "$WEB" -m 750 "$STATE" "$STATE/notify"
ok "$STATE (ghi được) · $SRV (chỉ đọc, cưỡng chế trong unit)"

# ---------------------------------------------------------------------------
step "Cấu hình"
if [[ ! -f "$ETC/web.env" ]]; then
  install -o root -g "$WEB" -m 640 "$SRC/config/web.env.example" "$ETC/web.env"
  # Sinh sẵn AUTH_SECRET: thiếu nó thì NextAuth đổ lúc khởi động, và đó là một
  # bước tay không có lý do gì tồn tại.
  sed -i "s|^AUTH_SECRET=$|AUTH_SECRET=$(openssl rand -base64 32)|" "$ETC/web.env"
  warn "vừa tạo $ETC/web.env — điền AUTH_GITHUB_* và ALLOWED_LOGINS trước khi mở ra ngoài"
else
  chown root:"$WEB" "$ETC/web.env"; chmod 640 "$ETC/web.env"
  ok "$ETC/web.env đã có, giữ nguyên"
fi

# ALLOWED_LOGINS rỗng + GITHUB_SOURCE=live nghĩa là KHÔNG AI vào được. Đó là mặc
# định đúng, nhưng nó cũng là thứ làm người ta tưởng app hỏng — nên nói ra.
if grep -q '^GITHUB_SOURCE=live' "$ETC/web.env" && grep -q '^ALLOWED_LOGINS=$' "$ETC/web.env"; then
  warn "GITHUB_SOURCE=live mà ALLOWED_LOGINS rỗng — sẽ KHÔNG AI vào được (cố ý)"
fi

# ---------------------------------------------------------------------------
if (( BUILD )); then
  step "Build"
  command -v pnpm >/dev/null || die "thiếu pnpm — npm i -g pnpm"
  # Build dưới quyền NGƯỜI GỌI, không phải root: pnpm store và node_modules
  # thuộc về họ, và chạy build bằng root là cách chắc chắn nhất để lần sau họ
  # không cài được gì nữa vì file đã đổi chủ.
  runuser -u "${SUDO_USER:-root}" -- bash -lc "cd '$SRC' && pnpm install --frozen-lockfile && pnpm build" \
    || die "build đổ — xem log phía trên"
  ok "đã build"
fi

[[ -f "$SRC/.next/standalone/apps/web/server.js" ]] \
  || die "không có .next/standalone — next.config.ts phải có output: \"standalone\""

# ---------------------------------------------------------------------------
step "Cài vào $PREFIX"
rm -rf "$PREFIX"
install -d -m 755 "$PREFIX"
cp -a "$SRC/.next/standalone/apps/web/." "$PREFIX/"
# Bản standalone KHÔNG kèm hai thứ này, và thiếu chúng thì trang lên nhưng
# không có CSS lẫn JS — một lỗi trông giống "app hỏng" hơn là "cài thiếu file".
install -d -m 755 "$PREFIX/.next"
cp -a "$SRC/.next/static" "$PREFIX/.next/static"
[[ -d "$SRC/public" ]] && cp -a "$SRC/public" "$PREFIX/public"
# node_modules của monorepo nằm ở gốc bản standalone, ngoài apps/web.
[[ -d "$SRC/.next/standalone/node_modules" ]] \
  && cp -a "$SRC/.next/standalone/node_modules" "$PREFIX/node_modules_root" \
  && rm -rf "$PREFIX/node_modules_root"
chown -R root:root "$PREFIX"
ok "$PREFIX ($(du -sh "$PREFIX" | cut -f1), thuộc root — $WEB chỉ đọc)"

# ---------------------------------------------------------------------------
step "systemd"
install -m 644 "$SRC/systemd/bee-web.service" /etc/systemd/system/
systemctl daemon-reload

# bee-spec-chat: cửa sổ phỏng vấn tạo task.
#
# Unit do installer của reconciler cài (nó nằm cùng chỗ với các unit khác), còn
# BẬT thì ở đây — vì socket thuộc group `bee-web`, mà group đó chỉ tồn tại sau
# khi file này chạy.
#
# ĐỌC KỸ TRƯỚC KHI BẬT. Dịch vụ này chạy dưới `bee-agent`, user duy nhất cầm
# login Claude, và nó mở một socket cho `bee-web` — user đưa ra internet. Đó là
# một cây cầu bắc qua đúng ranh giới hai UID mà cả thiết kế này dựng lên.
#
# Cây cầu được bó hẹp: không tool nào được bật, không TCP, `InaccessiblePaths`
# chặn /srv/bee và cả hai file env, trần 2 phiên đồng thời. Nhưng nó vẫn có
# nghĩa là: ai chiếm được app web sẽ tiêu được hạn mức Claude của bạn và điều
# khiển được một LLM. Họ KHÔNG đọc được credential, KHÔNG đụng /srv/bee, KHÔNG
# chạy được lệnh nào.
#
# Không muốn cây cầu đó thì: `sudo systemctl disable --now bee-spec-chat` — app
# vẫn chạy, chỉ là ô chat báo "chưa bật dịch vụ phỏng vấn".
if [[ -f /etc/systemd/system/bee-spec-chat.service ]]; then
  systemctl enable bee-spec-chat.service >/dev/null 2>&1 || true
  systemctl restart bee-spec-chat.service >/dev/null 2>&1 || true
  if systemctl is-active --quiet bee-spec-chat.service; then
    ok "bee-spec-chat.service đang chạy (cửa sổ phỏng vấn tạo task)"
  else
    warn "bee-spec-chat chưa lên — journalctl -u bee-spec-chat -n 30"
  fi
else
  warn "chưa có bee-spec-chat.service — chạy lại apps/reconciler/install.sh"
fi
systemctl enable bee-web.service >/dev/null 2>&1 || true
# `restart`, KHÔNG phải `enable --now`. `--now` chỉ khởi động unit đang DỪNG;
# unit đang chạy thì nó không làm gì cả — nên cài đè lên một bản đang chạy sẽ
# chép code mới vào đĩa rồi tiếp tục phục vụ code cũ. Installer in ✓ ở mọi bước,
# app vẫn lên, và thứ duy nhất sai là nó không mang thay đổi bạn vừa cài.
systemctl restart bee-web.service >/dev/null 2>&1 || true
sleep 2
if systemctl is-active --quiet bee-web.service; then
  ok "bee-web.service đang chạy"
else
  warn "bee-web.service chưa lên — journalctl -u bee-web -n 40"
fi

# ---------------------------------------------------------------------------
step "Kiểm tra thật"
# Không hỏi systemd "unit có active không" rồi báo xanh: `Type=simple` là active
# ngay khi tiến trình được exec, kể cả khi nó đổ ở dòng đầu tiên. Hỏi HTTP mới
# là hỏi đúng câu.
#
# Và hỏi HTTP CHỈ KHI unit đang chạy. Cổng 3187 có thể đang là `pnpm dev` của
# một người nào đó: lúc ấy curl trả 307 rất đẹp trong khi unit vừa đổ, và ta
# vừa in một dấu ✓ cho một dịch vụ không tồn tại.
if ! systemctl is-active --quiet bee-web.service; then
  warn "bee-web.service KHÔNG chạy — journalctl -u bee-web -n 40"
  if curl -sS -o /dev/null -m 3 http://127.0.0.1:3187/ 2>/dev/null; then
    warn "…và cổng 3187 đang có tiến trình khác nghe (pnpm dev?) — dừng nó rồi cài lại"
  fi
else
  code=$(curl -sS -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3187/ 2>/dev/null || echo 000)
  case "$code" in
    200|307|302) ok "HTTP $code — app trả lời" ;;
    000)         warn "unit chạy nhưng không trả lời ở 127.0.0.1:3187 — journalctl -u bee-web -n 40" ;;
    *)           warn "HTTP $code — journalctl -u bee-web -n 40" ;;
  esac
fi

# App PHẢI đọc được đĩa của reconciler, và PHẢI KHÔNG ghi được. Kiểm cả hai
# chiều, vì chiều thứ hai là thứ không có triệu chứng cho tới lúc đã muộn.
if runuser -u "$WEB" -- test -r "$SRV/public/status.json"; then
  ok "$WEB đọc được status.json"
else
  warn "$WEB KHÔNG đọc được $SRV/public/status.json — dashboard sẽ báo thiếu file"
fi
if runuser -u "$WEB" -- test -x "$SRV/evidence"; then
  ok "$WEB đọc được thư mục bằng chứng"
else
  warn "$WEB KHÔNG vào được $SRV/evidence — trang bằng chứng sẽ trống, không báo lỗi"
fi
if runuser -u "$WEB" -- test -w "$SRV"; then
  die "$WEB GHI ĐƯỢC vào $SRV — sai ranh giới, kiểm quyền thư mục"
else
  ok "$WEB không ghi được vào $SRV"
fi
if runuser -u "$WEB" -- cat "$ETC/orch.env" >/dev/null 2>&1; then
  die "$WEB ĐỌC ĐƯỢC $ETC/orch.env — đó là GH_TOKEN của orchestrator"
else
  ok "$WEB không đọc được orch.env"
fi

# Chiều ngược lại, và nó quan trọng ngang: web.env chứa AUTH_GITHUB_SECRET, mà
# bee-agent chạy `--dangerously-skip-permissions`. Nếu một ngày nào đó ai đó đổi
# primary group của bee-web thành `bee`, dòng này là thứ duy nhất kêu lên.
if runuser -u bee-agent -- cat "$ETC/web.env" >/dev/null 2>&1; then
  die "bee-agent ĐỌC ĐƯỢC $ETC/web.env — kiểm primary group của $WEB"
else
  ok "bee-agent không đọc được web.env"
fi

# Socket phỏng vấn: $WEB phải MỞ ĐƯỢC, và không ai khác được mở.
SOCK=/run/bee/spec-chat.sock
if [[ -S "$SOCK" ]]; then
  runuser -u "$WEB" -- test -w "$SOCK" \
    && ok "$WEB mở được socket phỏng vấn" \
    || warn "$WEB KHÔNG mở được $SOCK — ô chat sẽ báo lỗi kết nối"
  # `nobody` đại diện cho "một user bất kỳ khác trên máy". Mở được nghĩa là ai
  # trên máy cũng nói chuyện được với login Claude qua đường này.
  if runuser -u nobody -- test -w "$SOCK" 2>/dev/null; then
    die "socket $SOCK mở cho cả user ngoài — kiểm chmod trong spec-chat.mjs"
  fi
  ok "user khác không mở được socket"
fi

# In ĐÚNG địa chỉ phải mở, lấy từ AUTH_URL. `localhost` và `127.0.0.1` là hai
# host khác nhau với cả trình duyệt lẫn GitHub: gõ nhầm cái kia là vòng lặp
# chuyển hướng vô hạn, hoặc `error=Configuration` sau khi đăng nhập.
URL=$(grep -E '^AUTH_URL=' "$ETC/web.env" | cut -d= -f2- | tr -d '"')
URL=${URL:-http://127.0.0.1:3187}

cat <<EOF

${C_B}Mở đúng địa chỉ này${C_0}   ${C_G}${URL}${C_0}

  KHÔNG phải một biến thể khác của nó. Trình duyệt và GitHub đều coi
  \`localhost\` và \`127.0.0.1\` là hai host khác nhau, và cookie không đi
  qua lại giữa hai bên.

${C_B}Còn lại là việc tay${C_0}

  1. Điền $ETC/web.env
        AUTH_GITHUB_ID / AUTH_GITHUB_SECRET   ← GitHub OAuth app
        callback phải là ĐÚNG ${URL}/api/auth/callback/github
        AUTH_URL / APP_URL                    ← URL công khai của app
        ALLOWED_LOGINS                        ← rỗng = KHÔNG AI vào được
        BEE_TL_LOGINS                         ← ai là Techlead

  2. Bật dữ liệu GitHub thật
        GITHUB_SOURCE=live
        systemctl restart bee-web

  3. Cho khối bằng chứng trong PR có liên kết
        BEE_WEB_URL=<APP_URL>   trong $ETC/bee.env

  4. Đưa ra ngoài
        App chỉ nghe ở 127.0.0.1. Đặt Cloudflare Tunnel hoặc reverse proxy
        trước nó, và bật Cloudflare Access — allowlist trong app là lớp thứ
        hai, không phải lớp duy nhất.
EOF

#!/usr/bin/env bash
# deploy.sh — đưa bản đang có trong repo lên chính cái máy này.
#
# MỘT lệnh, chạy lại bao nhiêu lần cũng được (idempotent):
#
#   apps/runner/bin/deploy.sh            # bốn cổng → cài runner → build → restart web → doctor
#   apps/runner/bin/deploy.sh --fast     # bỏ qua cổng (lint/typecheck/test), vẫn build
#   apps/runner/bin/deploy.sh --e2e      # chạy thêm Playwright trước khi deploy
#   apps/runner/bin/deploy.sh --web-only # không đụng runner/unit, chỉ build lại web + restart
#
# Vì sao phải có runner trong này: `session-run.sh` chạy từ bản ĐÃ CÀI
# ($PREFIX/bin), không phải từ repo. Sửa runner mà chỉ restart web thì thay
# đổi không bao giờ tới phiên — đúng loại hỏng-im-lặng mà hệ này ghét nhất.
set -euo pipefail

REPO="$(cd "$(dirname "$(readlink -f "$0")")/../../.." && pwd)"
WEB="$REPO/apps/web"
RUNNER="$REPO/apps/runner"

CONG=1; E2E=0; CHI_WEB=0
for a in "$@"; do
  case "$a" in
    --fast) CONG=0;;
    --e2e) E2E=1;;
    --web-only) CHI_WEB=1;;
    -h|--help) sed -n '2,20p' "$0"; exit 0;;
    *) echo "Tham số lạ: $a (xem --help)" >&2; exit 2;;
  esac
done

buoc() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
loi()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; }

# ── 0 · Máy này đang cài ở đâu ────────────────────────────────────────────
# Đọc từ CHÍNH unit đang chạy thay vì đoán /opt/bee + /srv/bee: máy này cài
# vào ~/.local, và một script deploy đoán sai đường dẫn thì tệ hơn không có.
tu_unit() { systemctl --user cat "$1" 2>/dev/null | sed -n "s|^$2||p" | head -1; }

PREFIX="${BEE_PREFIX:-$(dirname "$(dirname "$(tu_unit bee-session@.service 'ExecStart=')" )")}"
[[ -z "$PREFIX" || "$PREFIX" == "." ]] && PREFIX="/opt/bee"
BEE_ROOT="${BEE_ROOT:-$(tu_unit bee-web.service 'Environment=BEE_ROOT=')}"
[[ -z "$BEE_ROOT" ]] && BEE_ROOT="/srv/bee"

MOC="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?')"
BAN="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
BAN_DO="$(git -C "$REPO" status --porcelain 2>/dev/null | wc -l)"

buoc "0 · Đích"
echo "  repo     $REPO ($BAN @ $MOC$([[ $BAN_DO -gt 0 ]] && echo ", $BAN_DO file chưa commit"))"
echo "  runner   $PREFIX"
echo "  dữ liệu  $BEE_ROOT"

# ── 1 · Bốn cổng ──────────────────────────────────────────────────────────
if [[ $CONG -eq 1 ]]; then
  buoc "1 · Cổng chất lượng"
  ( cd "$WEB" && pnpm lint && pnpm typecheck && pnpm vitest run )
  ( cd "$RUNNER" && bash -n bin/*.sh lib/*.sh 2>/dev/null || bash -n bin/*.sh )
  echo "  ✓ lint · typecheck · unit test · cú pháp bash"
else
  buoc "1 · Cổng chất lượng — BỎ QUA (--fast)"
fi

if [[ $E2E -eq 1 ]]; then
  buoc "1b · E2E"
  ( cd "$WEB" && npx playwright test )
fi

# ── 2 · Build web ─────────────────────────────────────────────────────────
# `pnpm build` tự chép .next/static + public vào standalone (bài học 19/08:
# một bản build thiếu bước chép đã đẩy web lên mạng không CSS).
buoc "2 · Build web"
# pnpm ở đây là shim của corepack: lần đầu nó tải bản repo ghim, và nếu
# còn cái hỏi Y/n thì deploy đứng im giữa chừng.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
( cd "$WEB" && pnpm build >/dev/null )
SERVER="$WEB/.next/standalone/apps/web/server.js"
[[ -f "$SERVER" ]] || { loi "không thấy $SERVER — build hỏng?"; exit 1; }
echo "  ✓ $SERVER"

# ── 3 · Cài runner + unit ─────────────────────────────────────────────────
if [[ $CHI_WEB -eq 0 ]]; then
  buoc "3 · Cài runner + unit"
  BEE_PREFIX="$PREFIX" BEE_ROOT="$BEE_ROOT" BEE_WEB="$WEB" bash "$RUNNER/install.sh"
else
  buoc "3 · Runner — BỎ QUA (--web-only)"
fi

# ── 4 · Restart web + chờ nó thật sự trả lời ──────────────────────────────
buoc "4 · Restart bee-web"
systemctl --user restart bee-web.service
PORT="$(sed -n 's/^PORT=//p' "$BEE_ROOT/web.env" 2>/dev/null | head -1)"
PORT="${PORT:-3210}"

for i in $(seq 1 30); do
  MA="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  # 307 = đá về /login: web sống và auth đang gác. Đó là "khoẻ", không phải lỗi.
  if [[ "$MA" == "200" || "$MA" == "307" || "$MA" == "302" ]]; then
    echo "  ✓ trả lời $MA sau ${i}s trên 127.0.0.1:$PORT"
    break
  fi
  if [[ $i -eq 30 ]]; then
    loi "web không trả lời sau 30s (mã cuối: ${MA:-không có})"
    echo "     journalctl --user -u bee-web -n 50 --no-pager"
    exit 1
  fi
  sleep 1
done

# ── 5 · Doctor + tóm tắt ──────────────────────────────────────────────────
buoc "5 · Doctor"
systemctl --user start bee-doctor.service 2>/dev/null || true
if command -v jq >/dev/null && [[ -f "$BEE_ROOT/doctor.json" ]]; then
  jq -r '"  " + (if .ok then "✓ checklist A+ xanh" else "✗ CÓ MỤC ĐỎ" end)
         + (if .paused then " · PAUSE ĐANG BẬT" else "" end),
         (.checks[] | select(.ok | not) | "    ✗ \(.id): \(.detail)")' \
    "$BEE_ROOT/doctor.json"
else
  echo "  (bỏ qua: cần jq + doctor.json)"
fi

buoc "Xong"
printf '  %s @ %s · runner %s · web 127.0.0.1:%s\n' "$BAN" "$MOC" "$PREFIX" "$PORT"
systemctl --user is-active bee-web.service bee-reaper.timer bee-heartbeat.timer \
  | paste -sd' ' - | sed 's/^/  units: /'
command -v tailscale >/dev/null && tailscale serve status 2>/dev/null | head -3 || true

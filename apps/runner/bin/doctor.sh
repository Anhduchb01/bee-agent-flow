#!/usr/bin/env bash
# doctor.sh — kiểm checklist vệ sinh A+ (PRD §4.2) + hạ tầng phiên.
#
# Kiểm chứ đừng đoán: mỗi mục in ✓/✗ kèm chi tiết, và ghi doctor.json để
# web hiện đỏ khi lệch. Exit 1 nếu có mục ✗ — cắm được vào CI của máy.
#
#   doctor.sh              # exit 1 khi có mục đỏ (CI, dòng lệnh)
#   doctor.sh --exit-zero  # luôn exit 0; kết quả nằm trong doctor.json
#
# Vì sao tách được hai thứ đó: chạy XONG một lượt khám và KHÁM RA BỆNH là hai
# chuyện khác nhau. `bee-doctor.service` gọi bản --exit-zero, nên `systemctl`
# chỉ báo failed khi doctor thật sự không chạy được — chứ không phải mỗi lần
# nó làm đúng việc của mình. Đọc "failed" như hỏng hóc trong khi nó đang báo
# cáo là đúng cái kiểu nhiễu làm người ta thôi nhìn màn hình.
set -uo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

EXIT_ZERO=0
for a in "$@"; do
  case "$a" in
    --exit-zero) EXIT_ZERO=1;;
    -h|--help)   sed -n '2,16p' "$0"; exit 0;;
    *)           printf 'Tham số lạ: %s (xem --help)\n' "$a" >&2; exit 2;;
  esac
done

CHECKS="[]"
LOI=0

ghi() { # ghi <id> <ok:true|false> <chi tiết>
  local dau="✗"; [[ "$2" == "true" ]] && dau="✓"
  printf '%s %s — %s\n' "$dau" "$1" "$3"
  [[ "$2" == "true" ]] || LOI=1
  CHECKS=$(jq -c --arg i "$1" --argjson o "$2" --arg d "$3" \
    '. + [{id:$i, ok:$o, detail:$d}]' <<<"$CHECKS")
}

# ── 1 · PAT là fine-grained, không phải token full-account ─────────────────
TOKEN=$(gh auth token 2>/dev/null || true)
if [[ -z "$TOKEN" ]]; then
  ghi "pat" false "gh chưa đăng nhập — chạy: gh auth login"
elif [[ "$TOKEN" == github_pat_* ]]; then
  ghi "pat" true "fine-grained PAT"
else
  ghi "pat" false "token KHÔNG phải fine-grained (tiền tố $(cut -c1-4 <<<"$TOKEN")…) — tạo PAT hẹp, thu hồi token này"
fi

# ── 1b · Claude auth — sessions cannot run without it. Two accepted paths:
#         a setup-token token pasted on /setup (claude.env), or an
#         interactive login done on the machine.
#         Khi có token-slayer, thêm một câu: tài khoản NÀO đang dùng. Bảng
#         tài khoản ở /setup chọn slot bằng cách ghi ~/.claude/.credentials
#         .json — mà claude.env thì đè lên nó (biến môi trường thắng file),
#         nên hai thứ cùng tồn tại là một cái bẫy im lặng: bấm đổi tài khoản
#         thấy đổi, phiên vẫn chạy tài khoản cũ.
SLOT=""
if command -v tok >/dev/null 2>&1; then
  SLOT=$(tok list --json 2>/dev/null | jq -r '.active // ""' 2>/dev/null || true)
fi
if grep -q '^CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-' "$BEE_ROOT/claude.env" 2>/dev/null; then
  if [[ -n "$SLOT" ]]; then
    ghi "claude" true "token ghim ở claude.env — ĐÈ LÊN slot '$SLOT' đang chọn; gỡ ở /setup nếu muốn đổi tài khoản có tác dụng"
  else
    ghi "claude" true "token từ claude setup-token (claude.env)"
  fi
elif [[ -f "$HOME/.claude/.credentials.json" ]]; then
  if [[ -n "$SLOT" ]]; then
    ghi "claude" true "đã login trên máy · tài khoản đang dùng: $SLOT"
  else
    ghi "claude" true "đã login tương tác trên máy"
  fi
else
  ghi "claude" false "chưa có auth — chạy \`claude setup-token\` ở BẤT KỲ máy nào rồi dán token vào /setup"
fi

# ── 2 · Branch protection main trên từng repo trong repos.d ────────────────
if compgen -G "$BEE_ROOT/repos.d/*.env" >/dev/null; then
  for f in "$BEE_ROOT"/repos.d/*.env; do
    # shellcheck disable=SC1090
    REPO=$(. "$f" 2>/dev/null; printf '%s' "${REPO:-}")
    slug=$(basename "$f" .env)
    if [[ -z "$REPO" ]]; then ghi "repo:$slug" false "thiếu biến REPO trong $f"; continue; fi
    DEF=$(gh api "repos/$REPO" --jq .default_branch 2>/dev/null || true)
    if [[ -z "$DEF" ]]; then ghi "repo:$slug" false "không đọc được $REPO — PAT có quyền không?"; continue; fi
    if gh api "repos/$REPO/branches/$DEF/protection" >/dev/null 2>&1; then
      ghi "repo:$slug" true "branch protection bật trên $DEF"
    elif [[ -x "$BEE_ROOT/repos/$slug.git/hooks/pre-push" ]]; then
      # GitHub Free không cho protection trên repo private, và PAT hẹp cũng
      # không đọc được endpoint đó — fence hạ cấp là pre-push hook local
      # (session-run cài mỗi lần mở phiên). Nói rõ đây là fence yếu hơn.
      ghi "repo:$slug" true "protection GitHub không kiểm được (plan Free / PAT hẹp) — fence local: pre-push chặn push ngoài bee/*"
    elif [[ ! -d "$BEE_ROOT/repos/$slug.git" ]]; then
      ghi "repo:$slug" true "chưa clone — fence pre-push sẽ được cài ở phiên đầu tiên"
    else
      ghi "repo:$slug" false "KHÔNG có protection GitHub và thiếu pre-push hook trong bare clone"
    fi
  done
else
  ghi "repos" false "chưa có repo nào trong $BEE_ROOT/repos.d/ — thêm <slug>.env với REPO=owner/name"
fi

# ── 3 · Máy sạch: không secret lạ ngoài PAT + login Claude ────────────────
LA=""
for p in ~/.ssh/id_* ~/.aws ~/.kube ~/.gnupg/private-keys-v1.d; do
  compgen -G "$p" >/dev/null && LA="$LA $p"
done
if [[ -z "$LA" ]]; then
  ghi "may-sach" true "không thấy SSH key / AWS / kube / GPG"
else
  ghi "may-sach" false "thấy secret lạ:$LA — máy này phải không chứa gì đáng lấy"
fi

# ── 4 · linger + timer — phiên phải sống không cần ai đăng nhập ───────────
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" == "yes" ]]; then
  ghi "linger" true "bật"
else
  ghi "linger" false "chưa bật — chạy: loginctl enable-linger $USER"
fi
if systemctl --user is-active --quiet bee-reaper.timer 2>/dev/null; then
  ghi "reaper" true "bee-reaper.timer đang chạy"
else
  ghi "reaper" false "bee-reaper.timer không active — xác phiên sẽ không ai dọn"
fi

# ── 4b · Đĩa của phiên + gc còn sống không ─────────────────────────────────
# gc chạy trong timer nền: nó chết thì KHÔNG có job đỏ nào để nhìn, chỉ có đĩa
# lặng lẽ đầy lên. Tuổi của gc.json là cơ chế bắt duy nhất — cùng bài với
# heartbeat.json của reaper (bất biến #3: mỗi kiểu hỏng đúng một cơ chế bắt).
GC_WARN_GB="${GC_WARN_GB:-20}"
work_b=$(du -sb "$BEE_ROOT/work" 2>/dev/null | cut -f1 || echo 0)
sess_b=$(du -sb "$BEE_ROOT/sessions" 2>/dev/null | cut -f1 || echo 0)
tong=$(( ${work_b:-0} + ${sess_b:-0} ))
mo_coi=0
for wt in "$BEE_ROOT"/work/*/; do
  [[ -d "$wt" ]] || continue
  [[ -f "$BEE_ROOT/sessions/$(basename "${wt%/}")/meta.json" ]] || mo_coi=$(( mo_coi + 1 ))
done
doc_duoc=$(numfmt --to=iec "$tong" 2>/dev/null || echo "${tong}B")

if [[ ! -f "$BEE_ROOT/gc.json" ]]; then
  ghi "dia-phien" false "$doc_duoc trên đĩa · gc chưa chạy lần nào — bật: systemctl --user enable --now bee-gc.timer"
else
  tuoi_h=$(( ( $(date +%s) - $(stat -c %Y "$BEE_ROOT/gc.json") ) / 3600 ))
  if (( tuoi_h > 48 )); then
    ghi "dia-phien" false "gc im lặng ${tuoi_h}h (>48h) — timer chết? $doc_duoc đang chiếm"
  elif (( tong > GC_WARN_GB * 1073741824 )); then
    ghi "dia-phien" false "$doc_duoc vượt ngưỡng ${GC_WARN_GB}GB — lý do giữ nằm trong gc.json"
  else
    ghi "dia-phien" true "$doc_duoc (work+sessions) · $mo_coi worktree mồ côi · gc chạy ${tuoi_h}h trước"
  fi
fi

# ── 4c · Web có ĐANG PHỤC VỤ không ────────────────────────────────────────
# Lỗ hổng này bắt được 25/08: lúc chuyển máy, bee-web crash-loop EADDRINUSE
# vì web của user cũ còn giữ cổng; NRestarts leo tới 1005 trong im lặng và
# doctor vẫn xanh — vì doctor chưa bao giờ hỏi "web có sống không".
#
# Và "cổng có trả lời" KHÔNG đủ: hôm đó cổng trả lời 200 suốt, chỉ là trả lời
# bởi web của người khác. Nên hỏi ba câu, theo thứ tự đắt dần: unit của TA có
# active · cổng có đúng chủ · nó có đang bị đá ra liên tục.
PORT=$(sed -n 's/^PORT=//p' "$BEE_ROOT/web.env" 2>/dev/null | head -1)
PORT="${PORT:-3210}"
if ! systemctl --user cat bee-web.service >/dev/null 2>&1; then
  ghi "web" false "chưa có bee-web.service — cần một bản build web rồi chạy lại install.sh"
else
  STATE=$(systemctl --user is-active bee-web.service 2>/dev/null || true)
  RESTARTS=$(systemctl --user show bee-web.service -p NRestarts --value 2>/dev/null || echo 0)
  RESTARTS="${RESTARTS:-0}"
  OWNER=$(port_owner "$PORT")
  if [[ "$STATE" != "active" ]]; then
    ghi "web" false "bee-web $STATE — không ai phục vụ (restart $RESTARTS lần); xem: journalctl --user -u bee-web -n 50"
  elif [[ "$OWNER" == other* ]]; then
    # Trường hợp 25/08 nguyên bản: unit ta tưởng là active, nhưng cổng thuộc
    # về tiến trình khác — nên mọi thứ "thấy web chạy" đều đang thấy nhầm web.
    read -r _ AI_PID AI_USER <<<"$OWNER"
    ghi "web" false "cổng $PORT do tiến trình khác giữ (pid ${AI_PID:-?}${AI_USER:+, user $AI_USER}), KHÔNG phải bee-web — thứ bạn thấy trên cổng này là web của người khác"
  elif (( RESTARTS > 5 )); then
    ghi "web" false "web đã restart $RESTARTS lần — có gì đó đang đá nó ra; sửa xong thì đếm lại bằng: systemctl --user reset-failed bee-web"
  elif ! command -v curl >/dev/null 2>&1; then
    ghi "web" true "bee-web active · cổng $PORT đúng chủ · restart $RESTARTS lần (máy không có curl để gọi thử)"
  else
    # 307/302 = đá về /login: web sống và auth đang gác. Đó là khoẻ.
    MA=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || true)
    if [[ "$MA" =~ ^(200|30[127])$ ]]; then
      ghi "web" true "bee-web active · 127.0.0.1:$PORT trả $MA · restart $RESTARTS lần"
    else
      ghi "web" false "bee-web active nhưng 127.0.0.1:$PORT trả ${MA:-không gì} — unit lên nhưng chưa phục vụ được"
    fi
  fi
fi

# ── 4d · The shared service pool (T15) ────────────────────────────────────
# Why this check exists at all: the owner chose to have bee GUESS what each
# pooled service is, from its image. That choice buys convenience and costs
# one specific failure mode — an image bee cannot place quietly turns every
# session into its own copy of that service, so RAM leaves and nobody is told.
# This is where "nobody is told" gets fixed, once a day.
#
# An EMPTY pool is a legitimate state, not a fault. Plenty of repos need
# nothing shared, and a permanent red on such a machine trains people to stop
# reading the checklist — the same cost §4c and doctor --exit-zero were about.
POOL_SVC=$(doc_compose "$BEE_ROOT/services" 2>/dev/null || true)
if [[ -z "$POOL_SVC" ]]; then
  ghi "dich-vu" true "no shared pool configured — sessions run every service themselves"
else
  POOL_N=$(wc -l <<<"$POOL_SVC")
  LA_MAT=$(awk '$3 == "" { printf "%s(%s) ", $1, $2 }' <<<"$POOL_SVC")
  POOL_STATE=$(systemctl --user is-active bee-services.service 2>/dev/null || true)
  if [[ "$POOL_STATE" != "active" ]]; then
    ghi "dich-vu" false "pool has $POOL_N service(s) but bee-services is $POOL_STATE — any repo that needs one will refuse to open a session; start it from /setup"
  elif ! (command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1); then
    ghi "dich-vu" false "pool unit is active but docker is not answering — slices cannot be carved or given back"
  elif [[ -n "$LA_MAT" ]]; then
    # Deliberately red: this changes behaviour silently, which is worse than
    # loudly. Fix is either rename to a known image or accept per-session copies.
    ghi "dich-vu" false "bee cannot tell what these pooled services are: ${LA_MAT% } — every session will run its own copy instead of sharing"
  else
    LAT_KET=0
    for sd in "$BEE_ROOT"/sessions/*/; do
      [[ -f "$sd/services.json" ]] || continue
      [[ "$(jq -r '.needs_human // false' "$sd/meta.json" 2>/dev/null)" == "true" ]] \
        && LAT_KET=$(( LAT_KET + 1 ))
    done
    LAT_N=$(find "$BEE_ROOT/sessions" -maxdepth 2 -name services.json 2>/dev/null | wc -l)
    # needs_human sessions are never collected, so their slices live forever.
    # That is on purpose; the number only has to stop being invisible.
    ghi "dich-vu" true "pool: $POOL_N service(s) up · $LAT_N slice(s) in use$( (( LAT_KET > 0 )) && echo ", $LAT_KET held by needs_human sessions (never collected)")"
  fi
fi

# ── 5 · Đĩa + PAUSE (thông tin, không phải lỗi) ────────────────────────────
if [[ -d "$BEE_ROOT" && -w "$BEE_ROOT" ]]; then
  ghi "dia" true "$BEE_ROOT ghi được"
else
  ghi "dia" false "$BEE_ROOT thiếu hoặc không ghi được — chạy install.sh"
fi
if [[ -e "$BEE_ROOT/PAUSE" ]]; then
  printf 'ℹ PAUSE — ĐANG BẬT: không phiên mới nào mở được\n'
else
  printf 'ℹ PAUSE — tắt\n'
fi

OK=true; [[ $LOI == 0 ]] || OK=false
mkdir -p "$BEE_ROOT"
jq -n --arg t "$(now_iso)" --argjson ok "$OK" --argjson c "$CHECKS" \
  --argjson p "$([[ -e "$BEE_ROOT/PAUSE" ]] && echo true || echo false)" \
  '{checked_at:$t, ok:$ok, paused:$p, checks:$c}' > "$BEE_ROOT/doctor.json"

# Khám xong là exit 0; kết quả khám nằm trong doctor.json (xem chú thích đầu file).
[[ $EXIT_ZERO -eq 1 ]] && exit 0
exit "$LOI"

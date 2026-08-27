#!/usr/bin/env bash
# doctor.sh — kiểm checklist vệ sinh A+ (PRD §4.2) + hạ tầng phiên.
#
# Kiểm chứ đừng đoán: mỗi mục in ✓/✗ kèm chi tiết, và ghi doctor.json để
# web hiện đỏ khi lệch. Exit 1 nếu có mục ✗ — cắm được vào CI của máy.
#
#   doctor.sh              # exit 1 when anything is red (CI, command line)
#   doctor.sh --exit-zero  # always exit 0; the findings are in doctor.json
#
# Why those two can be separated: FINISHING a checkup and FINDING something
# wrong are different facts. `bee-doctor.service` runs the --exit-zero form,
# so `systemctl` reports failed only when doctor genuinely could not run —
# not every time it does its job. Reading "failed" as breakage while it is
# merely reporting is the exact noise that teaches people to stop looking.
set -uo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

EXIT_ZERO=0
for a in "$@"; do
  case "$a" in
    --exit-zero) EXIT_ZERO=1;;
    -h|--help)   sed -n '2,16p' "$0"; exit 0;;
    *)           printf 'Unknown argument: %s (see --help)\n' "$a" >&2; exit 2;;
  esac
done

CHECKS="[]"
FAILED=0

record() { # ghi <id> <ok:true|false> <chi tiết>
  local mark="✗"; [[ "$2" == "true" ]] && mark="✓"
  printf '%s %s — %s\n' "$mark" "$1" "$3"
  [[ "$2" == "true" ]] || FAILED=1
  CHECKS=$(jq -c --arg i "$1" --argjson o "$2" --arg d "$3" \
    '. + [{id:$i, ok:$o, detail:$d}]' <<<"$CHECKS")
}

# ── 1 · PAT là fine-grained, không phải token full-account ─────────────────
TOKEN=$(gh auth token 2>/dev/null || true)
if [[ -z "$TOKEN" ]]; then
  record "pat" false "gh is not signed in — run: gh auth login"
elif [[ "$TOKEN" == github_pat_* ]]; then
  record "pat" true "fine-grained PAT"
else
  record "pat" false "this token is NOT fine-grained (prefix $(cut -c1-4 <<<"$TOKEN")…) — create a narrow PAT and revoke this one"
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
    record "claude" true "a token is pinned in claude.env — it OVERRIDES the selected slot '$SLOT'; remove it on /setup for account switching to take effect"
  else
    record "claude" true "token from claude setup-token (claude.env)"
  fi
elif [[ -f "$HOME/.claude/.credentials.json" ]]; then
  if [[ -n "$SLOT" ]]; then
    record "claude" true "signed in on the machine · account in use: $SLOT"
  else
    record "claude" true "signed in interactively on the machine"
  fi
else
  record "claude" false "no auth yet — run \`claude setup-token\` on ANY machine and paste the token into /setup"
fi

# ── 2 · Branch protection main trên từng repo trong repos.d ────────────────
if compgen -G "$BEE_ROOT/repos.d/*.env" >/dev/null; then
  for f in "$BEE_ROOT"/repos.d/*.env; do
    # shellcheck disable=SC1090
    REPO=$(. "$f" 2>/dev/null; printf '%s' "${REPO:-}")
    slug=$(basename "$f" .env)
    if [[ -z "$REPO" ]]; then record "repo:$slug" false "no REPO variable in $f"; continue; fi
    DEF=$(gh api "repos/$REPO" --jq .default_branch 2>/dev/null || true)
    if [[ -z "$DEF" ]]; then record "repo:$slug" false "cannot read $REPO — does the PAT have access?"; continue; fi
    if gh api "repos/$REPO/branches/$DEF/protection" >/dev/null 2>&1; then
      record "repo:$slug" true "branch protection is on for $DEF"
    elif [[ -x "$BEE_ROOT/repos/$slug.git/hooks/pre-push" ]]; then
      # GitHub Free không cho protection trên repo private, và PAT hẹp cũng
      # không đọc được endpoint đó — fence hạ cấp là pre-push hook local
      # (session-run cài mỗi lần mở phiên). Nói rõ đây là fence yếu hơn.
      record "repo:$slug" true "GitHub protection not checkable (Free plan / narrow PAT) — local fence: pre-push refuses any push outside bee/*"
    elif [[ ! -d "$BEE_ROOT/repos/$slug.git" ]]; then
      record "repo:$slug" true "not cloned yet — the pre-push fence is installed on the first session"
    else
      record "repo:$slug" false "no GitHub protection AND no pre-push hook in the bare clone"
    fi
  done
else
  record "repos" false "no repos in $BEE_ROOT/repos.d/ yet — add <slug>.env with REPO=owner/name"
fi

# ── 3 · Máy sạch: không secret lạ ngoài PAT + login Claude ────────────────
LA=""
for p in ~/.ssh/id_* ~/.aws ~/.kube ~/.gnupg/private-keys-v1.d; do
  compgen -G "$p" >/dev/null && LA="$LA $p"
done
if [[ -z "$LA" ]]; then
  record "clean-host" true "no SSH keys / AWS / kube / GPG in reach"
else
  record "clean-host" false "found other secrets:$LA — nothing worth stealing may sit within reach of bee"
fi

# ── 4 · linger + timer — phiên phải sống không cần ai đăng nhập ───────────
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" == "yes" ]]; then
  record "linger" true "on"
else
  record "linger" false "off — run: loginctl enable-linger $USER"
fi
if systemctl --user is-active --quiet bee-reaper.timer 2>/dev/null; then
  record "reaper" true "bee-reaper.timer is running"
else
  record "reaper" false "bee-reaper.timer is not active — dead sessions will never be cleaned up"
fi

# ── 4b · Đĩa của phiên + gc còn sống không ─────────────────────────────────
# gc chạy trong timer nền: nó chết thì KHÔNG có job đỏ nào để nhìn, chỉ có đĩa
# lặng lẽ đầy lên. Tuổi của gc.json là cơ chế bắt duy nhất — cùng bài với
# heartbeat.json của reaper (bất biến #3: mỗi kiểu hỏng đúng một cơ chế bắt).
GC_WARN_GB="${GC_WARN_GB:-20}"
work_b=$(du -sb "$BEE_ROOT/work" 2>/dev/null | cut -f1 || echo 0)
sess_b=$(du -sb "$BEE_ROOT/sessions" 2>/dev/null | cut -f1 || echo 0)
total=$(( ${work_b:-0} + ${sess_b:-0} ))
mo_coi=0
for wt in "$BEE_ROOT"/work/*/; do
  [[ -d "$wt" ]] || continue
  [[ -f "$BEE_ROOT/sessions/$(basename "${wt%/}")/meta.json" ]] || mo_coi=$(( mo_coi + 1 ))
done
human=$(numfmt --to=iec "$total" 2>/dev/null || echo "${total}B")

if [[ ! -f "$BEE_ROOT/gc.json" ]]; then
  record "session-disk" false "$human on disk · gc has never run — enable it: systemctl --user enable --now bee-gc.timer"
else
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$BEE_ROOT/gc.json") ) / 3600 ))
  if (( age_h > 48 )); then
    record "session-disk" false "gc has been silent for ${age_h}h (>48h) — dead timer? $human is held"
  elif (( total > GC_WARN_GB * 1073741824 )); then
    record "session-disk" false "$human is over the ${GC_WARN_GB}GB threshold — gc.json says why each worktree was kept"
  else
    record "session-disk" true "$human (work+sessions) · $mo_coi orphaned worktree(s) · gc ran ${age_h}h ago"
  fi
fi

# ── 4c · Is the web actually SERVING? ─────────────────────────────────────
# Found the hard way 25/08: during the machine move, bee-web crash-looped on
# EADDRINUSE because the previous user's web still held the port. NRestarts
# climbed to 1005 in silence and doctor stayed green — because doctor had
# never asked whether the web was alive.
#
# And "the port answers" is NOT enough: it answered 200 the whole time, just
# from somebody else's web. So ask three questions, cheapest first: is OUR
# unit active · does the port belong to it · is it being kicked over and over.
PORT=$(sed -n 's/^PORT=//p' "$BEE_ROOT/web.env" 2>/dev/null | head -1)
PORT="${PORT:-3210}"
if ! systemctl --user cat bee-web.service >/dev/null 2>&1; then
  record "web" false "no bee-web.service yet — build the web, then run install.sh again"
else
  STATE=$(systemctl --user is-active bee-web.service 2>/dev/null || true)
  RESTARTS=$(systemctl --user show bee-web.service -p NRestarts --value 2>/dev/null || echo 0)
  RESTARTS="${RESTARTS:-0}"
  OWNER=$(port_owner "$PORT")
  if [[ "$STATE" != "active" ]]; then
    record "web" false "bee-web is $STATE — nothing is serving (restarted $RESTARTS times); look at: journalctl --user -u bee-web -n 50"
  elif [[ "$OWNER" == other* ]]; then
    # The original 25/08 case: our unit looks active, but the port belongs to
    # another process — so everything that "sees the web running" is looking
    # at the wrong web.
    read -r _ OWNER_PID OWNER_USER <<<"$OWNER"
    record "web" false "port $PORT is held by another process (pid ${OWNER_PID:-?}${OWNER_USER:+, user $OWNER_USER}), NOT bee-web — whatever you see on this port belongs to somebody else"
  elif (( RESTARTS > 5 )); then
    record "web" false "the web has restarted $RESTARTS times — something keeps kicking it over; after fixing it, reset the count with: systemctl --user reset-failed bee-web"
  elif ! command -v curl >/dev/null 2>&1; then
    record "web" true "bee-web active · port $PORT owned by it · $RESTARTS restarts (no curl on this machine to call it)"
  else
    # 307/302 = redirect to /login: the web is up and auth is guarding it.
    MA=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || true)
    if [[ "$MA" =~ ^(200|30[127])$ ]]; then
      record "web" true "bee-web active · 127.0.0.1:$PORT answers $MA · $RESTARTS restarts"
    else
      record "web" false "bee-web is active but 127.0.0.1:$PORT answers ${MA:-nothing} — the unit is up but not serving"
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
POOL_SVC=$(read_compose "$BEE_ROOT/services" 2>/dev/null || true)
if [[ -z "$POOL_SVC" ]]; then
  record "services" true "no shared pool configured — sessions run every service themselves"
else
  POOL_N=$(wc -l <<<"$POOL_SVC")
  LA_MAT=$(awk '$3 == "" { printf "%s(%s) ", $1, $2 }' <<<"$POOL_SVC")
  POOL_STATE=$(systemctl --user is-active bee-services.service 2>/dev/null || true)
  if [[ "$POOL_STATE" != "active" ]]; then
    record "services" false "pool has $POOL_N service(s) but bee-services is $POOL_STATE — any repo that needs one will refuse to open a session; start it from /setup"
  elif ! (command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1); then
    record "services" false "pool unit is active but docker is not answering — slices cannot be carved or given back"
  elif [[ -n "$LA_MAT" ]]; then
    # Deliberately red: this changes behaviour silently, which is worse than
    # loudly. Fix is either rename to a known image or accept per-session copies.
    record "services" false "bee cannot tell what these pooled services are: ${LA_MAT% } — every session will run its own copy instead of sharing"
  else
    SLICES_HELD=0
    for sd in "$BEE_ROOT"/sessions/*/; do
      [[ -f "$sd/services.json" ]] || continue
      [[ "$(jq -r '.needs_human // false' "$sd/meta.json" 2>/dev/null)" == "true" ]] \
        && SLICES_HELD=$(( SLICES_HELD + 1 ))
    done
    LAT_N=$(find "$BEE_ROOT/sessions" -maxdepth 2 -name services.json 2>/dev/null | wc -l)
    # needs_human sessions are never collected, so their slices live forever.
    # That is on purpose; the number only has to stop being invisible.
    record "services" true "pool: $POOL_N service(s) up · $LAT_N slice(s) in use$( (( SLICES_HELD > 0 )) && echo ", $SLICES_HELD held by needs_human sessions (never collected)")"
  fi
fi

# ── 5 · Đĩa + PAUSE (thông tin, không phải lỗi) ────────────────────────────
if [[ -d "$BEE_ROOT" && -w "$BEE_ROOT" ]]; then
  record "disk" true "$BEE_ROOT is writable"
else
  record "disk" false "$BEE_ROOT is missing or not writable — run install.sh"
fi
if [[ -e "$BEE_ROOT/PAUSE" ]]; then
  printf 'ℹ PAUSE — ON: no new session can open\n'
else
  printf 'ℹ PAUSE — off\n'
fi

OK=true; [[ $FAILED == 0 ]] || OK=false
mkdir -p "$BEE_ROOT"
jq -n --arg t "$(now_iso)" --argjson ok "$OK" --argjson c "$CHECKS" \
  --argjson p "$([[ -e "$BEE_ROOT/PAUSE" ]] && echo true || echo false)" \
  '{checked_at:$t, ok:$ok, paused:$p, checks:$c}' > "$BEE_ROOT/doctor.json"

# Finishing is exit 0; the findings live in doctor.json (see the header).
[[ $EXIT_ZERO -eq 1 ]] && exit 0
exit "$FAILED"

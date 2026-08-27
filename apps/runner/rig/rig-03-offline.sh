#!/usr/bin/env bash
# Rig offline cho S1 — chạy được KHÔNG cần claude, git remote hay systemd thật.
# Kiểm ba hành vi hỏng-im-lặng của runner:
#   1. session-run.sh từ chối id không phải UUID (không đụng gì vào đĩa)
#   2. session-run.sh thấy PAUSE → từ chối, meta=failed reason=paused,
#      run.jsonl có lifecycle đọc được — người dùng thấy chữ, không thấy im lặng
#   3. reaper.sh: meta running ∧ unit không active → failed, attempt tăng,
#      needs_human ở lần 2, FIFO mồ côi bị dọn, heartbeat.json luôn được ghi
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
RUNNER="$DAY/.."
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

# --- sân giả ---------------------------------------------------------------
T=$(mktemp -d)
export BEE_ROOT="$T/srv"
export BEE_RUNTIME="$T/run"
mkdir -p "$BEE_ROOT/sessions" "$BEE_RUNTIME"

# Fake systemctl: state controlled per-test via $RIG_STATE_FILE — default
# "inactive" (every unit is a corpse). Real is-active prints the state and
# exits 0 only for "active"; the stub mirrors that contract.
mkdir -p "$T/bin"
export RIG_STATE_FILE="$T/systemctl-state"
cat > "$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
# Only is-active carries rig state; everything else (daemon-reload,
# enable, start…) succeeds silently like a healthy systemd would.
case " $* " in *" is-active "*) ;; *) exit 0 ;; esac
state="inactive"
[[ -f "$RIG_STATE_FILE" ]] && state=$(cat "$RIG_STATE_FILE")
# --quiet: no output, just the exit code — like the real thing.
for a in "$@"; do [[ "$a" == "--quiet" ]] && exec [ "$state" == "active" ]; done
echo "$state"
[[ "$state" == "active" ]] && exit 0 || exit 3
EOF
chmod +x "$T/bin/systemctl"

# Fake ss: sân giả không có cổng nào bị chiếm. Không có nó, cửa cổng của
# install.sh (T19) đọc CỔNG THẬT của máy đang chạy rig — và rig đỏ hay xanh
# lại phụ thuộc vào việc hôm nay ai đang nghe 3210. Rig phải nói về code,
# không nói về cái máy tình cờ chạy nó. Ca "cổng có chủ" nằm ở rig-14.
printf '#!/bin/sh\nexit 0\n' > "$T/bin/ss"
chmod +x "$T/bin/ss"
export PATH="$T/bin:$PATH"

echo "== 1 · session-run.sh từ chối id bẩn =="
if "$RUNNER/bin/session-run.sh" '../../etc/passwd' 2>/dev/null; then
  kq no "id bẩn phải bị từ chối"
else
  kq ok "id chứa ../ bị từ chối"
fi
[[ -z "$(ls -A "$BEE_ROOT/sessions")" ]] && kq ok "không để lại gì trên đĩa" || kq no "đã ghi gì đó ra đĩa"

echo "== 2 · PAUSE chặn phiên mới, có chữ không có im lặng =="
ID="11111111-2222-3333-4444-555555555555"
SDIR="$BEE_ROOT/sessions/$ID"
mkdir -p "$SDIR"
printf '{"id":"%s","slug":"demo","num":1,"repo":"owner/demo","phase":"interview"}\n' "$ID" > "$SDIR/session.json"
touch "$BEE_ROOT/PAUSE"
"$RUNNER/bin/session-run.sh" "$ID" || true
grep -q '"paused"' "$SDIR/meta.json" 2>/dev/null && kq ok "meta.json ghi reason=paused" || kq no "meta.json thiếu reason=paused"
grep -q 'bee_lifecycle' "$SDIR/run.jsonl" 2>/dev/null && kq ok "run.jsonl có lifecycle giải thích" || kq no "run.jsonl im lặng"
rm -f "$BEE_ROOT/PAUSE"

echo "== 2b · repo chưa đăng ký bị từ chối — không có đường clone chui =="
ID3="22222222-3333-4444-5555-666666666666"
S3="$BEE_ROOT/sessions/$ID3"
mkdir -p "$S3"
printf '{"id":"%s","slug":"demo","num":1,"repo":"owner/demo","phase":"interview"}\n' "$ID3" > "$S3/session.json"
"$RUNNER/bin/session-run.sh" "$ID3" || true
grep -q '"unregistered-repo"' "$S3/meta.json" 2>/dev/null && kq ok "meta ghi reason=unregistered-repo" || kq no "thiếu reason=unregistered-repo"
grep -q 'chưa đăng ký' "$S3/run.jsonl" 2>/dev/null && kq ok "lifecycle giải thích bằng chữ" || kq no "run.jsonl im lặng"
[[ ! -d "$BEE_ROOT/repos/demo.git" ]] && kq ok "không clone gì cả" || kq no "đã clone chui"

echo "== 3 · reaper: đóng sổ xác, attempt, needs_human, dọn FIFO =="
ID2="99999999-8888-7777-6666-555555555555"
S2="$BEE_ROOT/sessions/$ID2"
mkdir -p "$S2"
printf '{"status":"running","attempt":0}\n' > "$S2/meta.json"
: > "$S2/run.jsonl"
mkfifo "$BEE_RUNTIME/$ID2.in"

"$RUNNER/bin/reaper.sh"
grep -q '"failed"' "$S2/meta.json" && kq ok "lần 1: running → failed" || kq no "lần 1 không đóng sổ"
grep -q '"attempt": *1' "$S2/meta.json" && kq ok "attempt = 1" || kq no "attempt sai"
[[ ! -e "$BEE_RUNTIME/$ID2.in" ]] && kq ok "FIFO mồ côi bị dọn" || kq no "FIFO còn sót"
[[ -f "$BEE_ROOT/heartbeat.json" ]] && kq ok "heartbeat.json được ghi" || kq no "thiếu heartbeat.json"

# giả lập lần chết thứ hai: ai đó mở lại phiên rồi lại chết
python3 - "$S2/meta.json" <<'EOF'
import json,sys
p=sys.argv[1]; m=json.load(open(p)); m["status"]="running"; json.dump(m,open(p,"w"))
EOF
"$RUNNER/bin/reaper.sh"
grep -q '"needs_human": *true' "$S2/meta.json" && kq ok "lần 2: needs_human=true" || kq no "lần 2 thiếu needs_human"

echo "== 3b · unit đang DỪNG (deactivating) không phải xác — stop sạch không bị cướp thành failed =="
# Race có thật trên máy: systemctl stop → unit deactivating trong lúc trap
# đang dọn; reaper tick đúng lúc đó từng cướp tay ghi failed/reaped đè lên
# một cú stop sạch. Trạng thái chuyển tiếp là "đang sống", không phải xác.
ID4="88888888-7777-6666-5555-444444444444"
S4="$BEE_ROOT/sessions/$ID4"
mkdir -p "$S4"
printf '{"status":"running","attempt":0}\n' > "$S4/meta.json"
echo "deactivating" > "$RIG_STATE_FILE"
"$RUNNER/bin/reaper.sh"
grep -q '"running"' "$S4/meta.json" && kq ok "deactivating: meta để yên cho trap đóng" || kq no "deactivating bị reap nhầm"
rm -f "$RIG_STATE_FILE"
"$RUNNER/bin/reaper.sh"
grep -q '"reaped"' "$S4/meta.json" && kq ok "inactive thật mới bị reap" || kq no "xác thật không được dọn"

echo "== 4 · pre-push fence: main bị chặn ngay trên máy, bee/* đi được =="
# GitHub Free không cho branch protection trên repo private — fence hạ cấp
# là pre-push hook trong bare clone, mọi push từ worktree phải đi qua nó.
G="$T/git"; mkdir -p "$G"
git init --bare --quiet "$G/upstream.git"
git init --quiet "$G/seed" && (cd "$G/seed" && git config user.email t@t && git config user.name t \
  && echo hi > f && git add f && git commit -qm init && git push -q "$G/upstream.git" HEAD:main)
git clone --bare --quiet "$G/upstream.git" "$G/bare.git"
cp "$RUNNER/lib/pre-push-bee" "$G/bare.git/hooks/pre-push" && chmod +x "$G/bare.git/hooks/pre-push"
git --git-dir="$G/bare.git" worktree add --quiet -B "bee/demo-1" "$G/wt" main
(cd "$G/wt" && git config user.email t@t && git config user.name t \
  && echo more >> f && git add f && git commit -qm change)
if (cd "$G/wt" && git push -q origin HEAD:refs/heads/main 2>/dev/null); then
  kq no "push main phải bị pre-push hook chặn"
else
  kq ok "push main bị chặn ngay trên máy"
fi
if (cd "$G/wt" && git push -q origin HEAD:refs/heads/bee/demo-1 2>/dev/null); then
  kq ok "push bee/* đi qua bình thường"
else
  kq no "push bee/* không được phép fail"
fi

echo "== 5 · install.sh dựng bee-web.service + web.env khi có bản build web =="
IT="$T/install"; mkdir -p "$IT/home" "$IT/web/.next/standalone/apps/web"
: > "$IT/web/.next/standalone/apps/web/server.js"
HOME="$IT/home" BEE_PREFIX="$IT/opt" BEE_ROOT="$IT/srv" BEE_WEB="$IT/web" \
  bash "$RUNNER/install.sh" >/dev/null 2>&1 || kq no "install.sh chạy lỗi"
UNIT="$IT/home/.config/systemd/user/bee-web.service"
[[ -f "$UNIT" ]] && kq ok "bee-web.service được render" || kq no "thiếu bee-web.service"
grep -q "$IT/web/.next/standalone/apps/web/server.js" "$UNIT" 2>/dev/null \
  && kq ok "ExecStart trỏ đúng server.js của bản build" || kq no "ExecStart sai đường"
grep -q "EnvironmentFile=-$IT/srv/web.env" "$UNIT" 2>/dev/null \
  && kq ok "unit đọc web.env từ BEE_ROOT" || kq no "unit không đọc web.env"
grep -q "^PORT=" "$IT/srv/web.env" 2>/dev/null \
  && kq ok "web.env mẫu được tạo (PORT có sẵn)" || kq no "thiếu web.env mẫu"
grep -q "BEE_SOURCE=disk" "$IT/srv/web.env" 2>/dev/null \
  && kq ok "web.env mặc định chạy disk — không bao giờ demo nhầm" || kq no "web.env thiếu BEE_SOURCE=disk"
grep -q "CLAUDE_SOURCE=live" "$IT/srv/web.env" 2>/dev/null \
  && kq ok "web.env bật Claude live — panel không hiện số dàn dựng" || kq no "web.env thiếu CLAUDE_SOURCE=live"
# Dừng web CÓ CHỦ ĐÍCH không được để lại unit ở trạng thái `failed` — nếu
# không, `systemctl --failed` lúc nào cũng có sẵn một dòng và người ta thôi
# đọc nó. Cùng bài với doctor.sh --exit-zero.
# T15b6: the pool unit is rendered but must NOT be enabled — starting a
# service pool is a decision, like removing PAUSE.
[[ -f "$IT/home/.config/systemd/user/bee-services.service" ]] \
  && kq ok "bee-services.service rendered" || kq no "thiếu bee-services.service"
[[ -f "$IT/srv/services/compose.yml" && -f "$IT/srv/services/admin.env" ]] \
  && kq ok "khung services/ được tạo (compose rỗng = chưa có pool)" \
  || kq no "thiếu khung services/"
[[ "$(stat -c %a "$IT/srv/services/admin.env" 2>/dev/null)" == 600 ]] \
  && kq ok "admin.env là 600" || kq no "admin.env mode $(stat -c %a "$IT/srv/services/admin.env" 2>/dev/null)"
grep -q "services: {}" "$IT/srv/services/compose.yml" \
  && kq ok "pool mặc định RỖNG — máy chưa cấu hình không tự kéo image về" \
  || kq no "pool mặc định không rỗng"

grep -q "^SuccessExitStatus=.*143" "$UNIT" 2>/dev/null \
  && kq ok "stop có chủ đích không bị đọc thành hỏng (SuccessExitStatus)" \
  || kq no "thiếu SuccessExitStatus — mỗi lần stop web sẽ để lại unit failed"

echo "== 6 · env.d overlay: worktree nhận .env từ kho theo repo, git không thấy =="
# claude giả: in một result rồi thoát sạch — đủ để session-run đi hết vòng đời.
cat > "$T/bin/claude" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"result","subtype":"success","num_turns":1}'
exit 0
EOF
chmod +x "$T/bin/claude"

# Bare "demo" local sẵn (session-run sẽ bỏ qua bước clone) + repo đăng ký.
G6="$BEE_ROOT/repos/demo.git"
git init --quiet "$T/seed6" && (cd "$T/seed6" && git config user.email t@t && git config user.name t \
  && echo hi > f && git add f && git commit -qm init)
mkdir -p "$BEE_ROOT/repos" "$BEE_ROOT/repos.d"
git clone --bare --quiet "$T/seed6" "$G6"
printf 'REPO=owner/demo\n' > "$BEE_ROOT/repos.d/demo.env"

# Kho env: file gốc + file lồng theo đúng cấu trúc repo.
mkdir -p "$BEE_ROOT/env.d/demo/apps/web"
printf 'API_KEY=bi-mat\n' > "$BEE_ROOT/env.d/demo/.env"
printf 'DB_URL=postgres://x\n' > "$BEE_ROOT/env.d/demo/apps/web/.env.local"

ID6="33333333-4444-5555-6666-777777777777"
S6="$BEE_ROOT/sessions/$ID6"
mkdir -p "$S6"
printf '{"id":"%s","slug":"demo","num":1,"repo":"owner/demo","phase":"work","worktree":true}\n' "$ID6" > "$S6/session.json"
"$RUNNER/bin/session-run.sh" "$ID6" || true

WT6="$BEE_ROOT/work/$ID6"
[[ -f "$WT6/.env" ]] && kq ok "worktree nhận .env từ env.d" || kq no "thiếu .env trong worktree"
[[ -f "$WT6/apps/web/.env.local" ]] && kq ok "file lồng theo cấu trúc repo cũng vào đúng chỗ" \
  || kq no "file lồng không được chép"
grep -q 'bee_lifecycle.*env' "$S6/run.jsonl" && kq ok "lifecycle nói rõ đã chép env" || kq no "chép env im lặng"
# Chốt chặn: file env KHÔNG được lộ ra git — agent không thể lỡ tay commit.
if [[ -z "$(git -C "$WT6" status --porcelain)" ]]; then
  kq ok "git status sạch — env bị exclude, không thể commit nhầm"
else
  kq no "env lộ ra git status: $(git -C "$WT6" status --porcelain | head -2)"
fi

echo "== 7 · session mode (V2.5a): mode trong session.json thành đúng cờ CLI =="
# claude giả ghi lại argv — kiểm cờ thật sự đến được exec, không đoán qua code.
cat > "$T/bin/claude" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "${BEE_SESSION_DIR}/claude-args.txt"
echo '{"type":"result","subtype":"success","num_turns":1}'
exit 0
EOF
chmod +x "$T/bin/claude"

run_mode() { # $1=id  $2=num (branch bee/demo-<num> phải chưa tồn tại)  $3=json-mode-field ("" = không có)
  local id="$1" sd="$BEE_ROOT/sessions/$1"
  mkdir -p "$sd"
  printf '{"id":"%s","slug":"demo","num":%s,"repo":"owner/demo","phase":"work","worktree":true%s}\n' \
    "$id" "$2" "$3" > "$sd/session.json"
  "$RUNNER/bin/session-run.sh" "$id" || true
  cat "$sd/claude-args.txt" 2>/dev/null
}

ARGS7=$(run_mode "77777777-1111-2222-3333-444444444471" 71 ',"mode":"plan"')
if grep -q -- "--permission-mode plan" <<<"$ARGS7" && ! grep -q -- "--dangerously-skip-permissions" <<<"$ARGS7"; then
  kq ok "mode plan → --permission-mode plan, KHÔNG skip-permissions"
else
  kq no "mode plan sai cờ: $ARGS7"
fi

ARGS7B=$(run_mode "77777777-1111-2222-3333-444444444472" 72 ',"mode":"edits"')
if grep -q -- "--permission-mode acceptEdits" <<<"$ARGS7B" && grep -q -- "--permission-prompt-tool stdio" <<<"$ARGS7B"; then
  kq ok "mode edits → acceptEdits + prompt-tool stdio (tool ngoài sửa file sẽ hỏi)"
else
  kq no "mode edits sai cờ: $ARGS7B"
fi

ARGS7D=$(run_mode "77777777-1111-2222-3333-444444444474" 74 ',"mode":"manual"')
if grep -q -- "--permission-mode default" <<<"$ARGS7D" && grep -q -- "--permission-prompt-tool stdio" <<<"$ARGS7D"; then
  kq ok "mode manual → default + prompt-tool stdio (mọi tool hỏi qua stream)"
else
  kq no "mode manual sai cờ: $ARGS7D"
fi

# Không có mode (session.json cũ) = auto — hành vi V1 giữ nguyên.
ARGS7C=$(run_mode "77777777-1111-2222-3333-444444444473" 73 '')
grep -q -- "--dangerously-skip-permissions" <<<"$ARGS7C" \
  && kq ok "thiếu mode → auto (skip-permissions) — session.json cũ không đổi hành vi" \
  || kq no "thiếu mode sai cờ: $ARGS7C"

echo "== 8 · phiên chết vì auth: phải nói RA lý do, và nói cả token đang ghim =="
# Gặp thật 27/08: chủ máy thêm account mới, panel hiện "in use", nhưng
# claude.env vẫn ghim token của account khác — phiên chạy trên token ghim,
# org của nó chặn Claude Code, và phiên chết sau 1 lượt với đúng một câu của
# Anthropic. Hệ thống biết CẢ HAI dữ kiện mà không nối chúng lại: người đọc
# thấy "org disabled" và không có cách nào biết token ghim là nguyên nhân.
cat > "$T/bin/claude" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access"}]}}'
echo '{"type":"result","subtype":"success","num_turns":1}'
exit 0
EOF
chmod +x "$T/bin/claude"

printf 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-pinned
' > "$BEE_ROOT/claude.env"
ID8=77777777-1111-2222-3333-444444444481
mkdir -p "$BEE_ROOT/sessions/$ID8"
printf '{"id":"%s","slug":"demo","num":81,"repo":"owner/demo","phase":"work","worktree":true}
' \
  "$ID8" > "$BEE_ROOT/sessions/$ID8/session.json"
"$RUNNER/bin/session-run.sh" "$ID8" >/dev/null 2>&1 || true
RJ8="$BEE_ROOT/sessions/$ID8/run.jsonl"

grep -q '"type":"bee_lifecycle"' "$RJ8" 2>/dev/null \
  && jq -r 'select(.type=="bee_lifecycle") | .msg' "$RJ8" | grep -qi "claude.env" \
  && kq ok "phiên chết vì auth → lifecycle line gọi tên claude.env" \
  || kq no "không có lifecycle nói về token ghim: $(jq -r 'select(.type=="bee_lifecycle") | .msg' "$RJ8" 2>/dev/null | tr '\n' ' ')"

jq -r 'select(.type=="bee_lifecycle") | .msg' "$RJ8" 2>/dev/null | grep -qi "organization\|subscription" \
  && kq ok "và nhắc lại chính lời Anthropic, không diễn giải lại" \
  || kq no "lifecycle không trích lời gốc"

# Không ghim token thì KHÔNG được đổ cho claude.env — sai hướng còn tệ hơn im.
rm -f "$BEE_ROOT/claude.env"
ID8B=77777777-1111-2222-3333-444444444482
mkdir -p "$BEE_ROOT/sessions/$ID8B"
printf '{"id":"%s","slug":"demo","num":82,"repo":"owner/demo","phase":"work","worktree":true}\n' \
  "$ID8B" > "$BEE_ROOT/sessions/$ID8B/session.json"
"$RUNNER/bin/session-run.sh" "$ID8B" >/dev/null 2>&1 || true
jq -r 'select(.type=="bee_lifecycle") | .msg' "$BEE_ROOT/sessions/$ID8B/run.jsonl" 2>/dev/null \
  | grep -qi "claude.env" \
  && kq no "đổ cho claude.env khi không có token nào ghim" \
  || kq ok "không ghim token thì không chỉ sai hướng"

# Phiên thành công KHÔNG được mọc lời cảnh báo auth nào.
cat > "$T/bin/claude" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"result","subtype":"success","num_turns":1}'
exit 0
EOF
chmod +x "$T/bin/claude"
ID8C=77777777-1111-2222-3333-444444444483
mkdir -p "$BEE_ROOT/sessions/$ID8C"
printf '{"id":"%s","slug":"demo","num":83,"repo":"owner/demo","phase":"work","worktree":true}\n' \
  "$ID8C" > "$BEE_ROOT/sessions/$ID8C/session.json"
"$RUNNER/bin/session-run.sh" "$ID8C" >/dev/null 2>&1 || true
jq -r 'select(.type=="bee_lifecycle") | .msg' "$BEE_ROOT/sessions/$ID8C/run.jsonl" 2>/dev/null \
  | grep -qi "organization\|token" \
  && kq no "phiên chạy tốt vẫn bị dán cảnh báo auth" \
  || kq ok "phiên chạy tốt: không cảnh báo gì"

rm -rf "$T"
echo
if [[ $FAIL == 0 ]]; then echo "RIG-03: TẤT CẢ XANH"; else echo "RIG-03: CÓ ĐỎ"; exit 1; fi

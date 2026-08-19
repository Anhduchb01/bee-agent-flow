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

rm -rf "$T"
echo
if [[ $FAIL == 0 ]]; then echo "RIG-03: TẤT CẢ XANH"; else echo "RIG-03: CÓ ĐỎ"; exit 1; fi

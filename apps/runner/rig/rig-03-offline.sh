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

# systemctl giả: is-active luôn trả inactive (mọi unit đều "chết")
mkdir -p "$T/bin"
cat > "$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
exit 3
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

rm -rf "$T"
echo
if [[ $FAIL == 0 ]]; then echo "RIG-03: TẤT CẢ XANH"; else echo "RIG-03: CÓ ĐỎ"; exit 1; fi

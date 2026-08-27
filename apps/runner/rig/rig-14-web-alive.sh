#!/usr/bin/env bash
# Rig-14 — "is the web serving?", and "whose port is this?".
#
# Chuyện thật 25/08: lúc chuyển máy, bee-web crash-loop EADDRINUSE vì web của
# user cũ còn giữ 3210. NRestarts leo tới 1005 trong im lặng, doctor vẫn xanh,
# deploy vẫn báo ✓ — vì cả hai chỉ hỏi "cổng có trả lời" và cổng thì trả lời
# rất ngoan: bằng web của người khác.
#
# Rig này khoá ba câu trả lời phải đúng:
#   1. port_owner phân biệt được free / mine / other
#   2. doctor có mục `web`, và mục đó ĐỎ ở đúng ba kiểu hỏng
#   3. doctor.sh --exit-zero: khám ra bệnh không phải là doctor hỏng
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run"
mkdir -p "$BEE_ROOT"/{sessions,work,repos}
echo '{"ts":"x"}' > "$BEE_ROOT/gc.json"

# Sân giả cho các lệnh ngoài. systemctl là cái duy nhất rig cần lái, nên nó
# đọc kịch bản từ file — mỗi ca test ghi lại file, không phải viết lại stub.
mkdir -p "$T/bin"
for c in gh loginctl curl; do printf '#!/bin/sh\nexit 1\n' > "$T/bin/$c"; chmod +x "$T/bin/$c"; done
cat > "$T/bin/systemctl" <<'EOF'
#!/bin/sh
# Kịch bản: dòng 1 = kết quả `is-active bee-web`, dòng 2 = NRestarts,
# dòng 3 = MainPID, dòng 4 = có bee-web.service hay không (co/khong).
S="$BEE_ROOT/../kichban"
ACTIVE=$(sed -n 1p "$S" 2>/dev/null || echo inactive)
NRES=$(sed -n 2p "$S" 2>/dev/null || echo 0)
MPID=$(sed -n 3p "$S" 2>/dev/null || echo 0)
CO=$(sed -n 4p "$S" 2>/dev/null || echo co)
case "$*" in
  *"cat bee-web.service"*) [ "$CO" = co ] && exit 0 || exit 1;;
  *"is-active"*"bee-web"*) echo "$ACTIVE"; [ "$ACTIVE" = active ] && exit 0 || exit 3;;
  *NRestarts*)             echo "$NRES";;
  *MainPID*)               echo "$MPID";;
  # daemon-reload, enable, start… — một systemd khoẻ mạnh im lặng và thành
  # công. Cho chúng đỏ ở đây thì install.sh chết vì set -e TRƯỚC khi tới cửa
  # cổng, và bài test bên dưới sẽ xanh vì lý do hoàn toàn khác.
  *) exit 0;;
esac
EOF
chmod +x "$T/bin/systemctl"
export PATH="$T/bin:$PATH"

kichban() { printf '%s\n%s\n%s\n%s\n' "$1" "$2" "$3" "${4:-co}" > "$T/kichban"; }
check_row() { jq -r '.checks[] | select(.id=="web") | "\(.ok)|\(.detail)"' "$BEE_ROOT/doctor.json" 2>/dev/null; }
kham() { bash "$DAY/../bin/doctor.sh" "$@" >/dev/null 2>&1 || true; }

# ── 1 · port_owner đọc đúng ba trạng thái ────────────────────────────────
source "$DAY/../lib/common.sh"

# Một cổng thật, do CHÍNH ta giữ — nc/python đều được, lấy cái nào có.
CONG=0
for p in $(seq 45231 45260); do
  if ! ss -Hltn "sport = :$p" 2>/dev/null | grep -q .; then CONG=$p; break; fi
done
[[ $CONG -ne 0 ]] || { echo "không tìm được cổng trống để thử"; exit 1; }

[[ "$(port_owner "$CONG")" == free ]] \
  && kq ok "free port -> free" || kq no "free port not reported as free: $(port_owner "$CONG")"

python3 -c "
import socket,time
s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
s.bind(('127.0.0.1',$CONG)); s.listen(1); time.sleep(20)
" &
NGHE=$!
for _ in $(seq 1 40); do ss -Hltn "sport = :$CONG" 2>/dev/null | grep -q . && break; sleep 0.1; done

# MainPID KHÁC pid đang nghe → phải là "other", kèm pid thật.
kichban active 0 999999
KQ=$(port_owner "$CONG")
[[ "$KQ" == other\ * ]] && kq ok "another process holds it -> other ($KQ)" \
  || kq no "somebody else holds it but it was not reported as other: $KQ"

# MainPID TRÙNG pid đang nghe → "mine". Đây là ca cài lại trên máy đang chạy:
# không được bắt người ta dừng chính web của mình.
kichban active 0 "$NGHE"
KQ=$(port_owner "$CONG")
[[ "$KQ" == "mine $NGHE" ]] && kq ok "our own bee-web holds it -> mine (a reinstall is not blocked)" \
  || kq no "did not recognise our own port: $KQ"

kill "$NGHE" 2>/dev/null || true; wait "$NGHE" 2>/dev/null || true

# ── 2 · doctor có mục `web`, và đỏ đúng chỗ ──────────────────────────────
echo "PORT=$CONG" > "$BEE_ROOT/web.env"

kichban active 0 0
kham
[[ -n "$(check_row)" ]] && kq ok "doctor.json has a web check" || kq no "no web check — exactly the 25/08 hole"

# 2a · unit không active → đỏ. Đây là cái doctor CHƯA BAO GIỜ hỏi.
kichban failed 1005 0
kham
case "$(check_row)" in
  false*1005*) kq ok "bee-web failed after 1005 restarts: red, and says the number";;
  false*)      kq ok "bee-web failed: red (but without the restart count)";;
  *)           kq no "the web is dead and doctor stayed green: $(check_row)";;
esac

# 2b · unit active NHƯNG cổng của người khác → đỏ. Đây là ca 25/08 nguyên bản:
#      curl trả 200 rất ngoan, chỉ là 200 của web người khác.
python3 -c "
import socket,time
s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
s.bind(('127.0.0.1',$CONG)); s.listen(1); time.sleep(20)
" &
NGHE=$!
for _ in $(seq 1 40); do ss -Hltn "sport = :$CONG" 2>/dev/null | grep -q . && break; sleep 0.1; done
printf '#!/bin/sh\necho 200\n' > "$T/bin/curl"; chmod +x "$T/bin/curl"
kichban active 0 999999
kham
case "$(check_row)" in
  false*"held by another process"*) kq ok "port held by somebody else: red, even though curl says 200";;
  true*) kq no "SOMEBODY ELSE OWNS THE PORT AND DOCTOR IS GREEN — the 25/08 hole: $(check_row)";;
  *) kq no "expected red for the wrong port owner: $(check_row)";;
esac
kill "$NGHE" 2>/dev/null || true; wait "$NGHE" 2>/dev/null || true

# 2c · Đúng chủ + curl 200 → xanh (không được đỏ oan).
kichban active 0 0
kham
[[ "$(check_row)" == true* ]] && kq ok "unit active + port owned by us + 200: green" \
  || kq no "expected green: $(check_row)"

# 2d · Restart nhiều bất thường → đỏ, kể cả khi đang trả lời được.
kichban active 42 0
kham
[[ "$(check_row)" == false*42* ]] && kq ok "42 restarts: red even while answering — something keeps kicking it" \
  || kq no "abnormal restart count but still green: $(check_row)"

# 2e · Chưa cài web → đỏ có chỉ dẫn, không phải im lặng.
kichban inactive 0 0 khong
kham
[[ "$(check_row)" == false*install* ]] && kq ok "no bee-web.service: red, and says how to install it" \
  || kq no "missing unit with no way forward: $(check_row)"

# ── 3 · Mã thoát tách khỏi kết quả khám ──────────────────────────────────
# Trước T19: bee-doctor.service báo "failed" mỗi lần máy có mục đỏ — đọc như
# hỏng hóc trong khi nó chỉ đang làm đúng việc.
kichban failed 1005 0
bash "$DAY/../bin/doctor.sh" >/dev/null 2>&1 && MA=0 || MA=$?
[[ $MA -eq 1 ]] && kq ok "command line: anything red -> exit 1 (usable in CI)" \
  || kq no "expected exit 1, got $MA"

bash "$DAY/../bin/doctor.sh" --exit-zero >/dev/null 2>&1 && MA=0 || MA=$?
[[ $MA -eq 0 ]] && kq ok "--exit-zero: finding a fault is not doctor failing -> exit 0" \
  || kq no "--exit-zero still exited $MA — unit sẽ còn báo failed oan"

[[ "$(check_row)" == false* ]] \
  && kq ok "--exit-zero still records every red finding in doctor.json" \
  || kq no "--exit-zero swallowed the findings: $(check_row)"

bash "$DAY/../bin/doctor.sh" --xxx >/dev/null 2>&1 && MA=0 || MA=$?
[[ $MA -eq 2 ]] && kq ok "unknown argument -> exit 2, not silently ignored" || kq no "unknown argument returned $MA"

# ── 4 · install.sh dừng trước cửa, thay vì bật vào một cổng có chủ ───────
# Trước T19 nó cứ `enable --now` — rồi unit crash-loop im lặng, còn cổng vẫn
# trả 200 vì người kia đang phục vụ. Một lỗi đọc được luôn hơn một lỗi không.
IT="$T/install"; mkdir -p "$IT/home" "$IT/web/.next/standalone/apps/web" "$IT/srv"
: > "$IT/web/.next/standalone/apps/web/server.js"
echo "PORT=$CONG" > "$IT/srv/web.env"

python3 -c "
import socket,time
s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
s.bind(('127.0.0.1',$CONG)); s.listen(1); time.sleep(20)
" &
NGHE=$!
for _ in $(seq 1 40); do ss -Hltn "sport = :$CONG" 2>/dev/null | grep -q . && break; sleep 0.1; done

kichban inactive 0 999999
RA=$(HOME="$IT/home" BEE_PREFIX="$IT/opt" BEE_ROOT="$IT/srv" BEE_WEB="$IT/web" \
       bash "$DAY/../install.sh" 2>&1) && MA=0 || MA=$?
[[ $MA -ne 0 ]] && kq ok "port already owned -> install.sh stops (exit $MA), không bật đại" \
  || kq no "install.sh enabled bee-web on a port somebody else owns"
grep -q "Cổng $CONG" <<<"$RA" && kq ok "and says which port, and who holds it" \
  || kq no "stopped without saying why: $(tail -2 <<<"$RA")"

kill "$NGHE" 2>/dev/null || true; wait "$NGHE" 2>/dev/null || true

# Cổng trống thì KHÔNG được chặn — cửa này để bắt xung đột, không để cản đường.
rm -rf "$IT/home/.config"
HOME="$IT/home" BEE_PREFIX="$IT/opt" BEE_ROOT="$IT/srv" BEE_WEB="$IT/web" \
  bash "$DAY/../install.sh" >/dev/null 2>&1 && MA=0 || MA=$?
[[ $MA -eq 0 ]] && kq ok "free port: install.sh runs through, no false block" \
  || kq no "install.sh failed on a free port (exit $MA)"

# ── 5 · Trần tài nguyên tới được unit ĐÃ CÀI, không chỉ nằm trong template ──
# T17. Đo trên máy thật 27/08: chỉ MemoryMax thì tiến trình vượt trần bị đẩy
# sang swap và sống — 400MB dưới trần 40M. Nên MemorySwapMax=0 mới là thứ làm
# cái trần có hiệu lực, và cả hai phải cùng có mặt trong unit đã cài.
UNIT_FILE="$IT/home/.config/systemd/user/bee-session@.service"
if [[ -f "$UNIT_FILE" ]]; then
  grep -qE "^MemoryMax=[0-9]+M$" "$UNIT_FILE" \
    && kq ok "MemoryMax substituted with a real number, not left as @SESSION_MEM_MAX@" \
    || kq no "MemoryMax wrong: $(grep '^MemoryMax=' "$UNIT_FILE" || echo missing)"
  grep -qx "MemorySwapMax=0" "$UNIT_FILE" \
    && kq ok "MemorySwapMax=0 — without it the cap does not bite" \
    || kq no "no MemorySwapMax=0: a cap that looks set and stops nothing"
  grep -qx "TasksMax=4096" "$UNIT_FILE" \
    && kq ok "TasksMax — a fork bomb is cheaper than RAM" || kq no "no TasksMax"
  grep -q "@SESSION_MEM_MAX@" "$UNIT_FILE" \
    && kq no "placeholder left in the installed unit — systemd would refuse it" \
    || kq ok "no @…@ placeholder survives into the installed unit"
else
  kq no "install.sh did not write bee-session@.service"
fi

echo
if [[ $FAIL == 0 ]]; then echo "RIG-14: ALL GREEN"; else echo "RIG-14: RED"; exit 1; fi

#!/usr/bin/env bash
# Rig-14 — "web có đang phục vụ không", và "cổng này của AI".
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
  *) exit 1;;
esac
EOF
chmod +x "$T/bin/systemctl"
export PATH="$T/bin:$PATH"

kichban() { printf '%s\n%s\n%s\n%s\n' "$1" "$2" "$3" "${4:-co}" > "$T/kichban"; }
muc() { jq -r '.checks[] | select(.id=="web") | "\(.ok)|\(.detail)"' "$BEE_ROOT/doctor.json" 2>/dev/null; }
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
  && kq ok "cổng trống → free" || kq no "cổng trống mà không free: $(port_owner "$CONG")"

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
[[ "$KQ" == other\ * ]] && kq ok "cổng của tiến trình khác → other ($KQ)" \
  || kq no "cổng người khác giữ mà không báo other: $KQ"

# MainPID TRÙNG pid đang nghe → "mine". Đây là ca cài lại trên máy đang chạy:
# không được bắt người ta dừng chính web của mình.
kichban active 0 "$NGHE"
KQ=$(port_owner "$CONG")
[[ "$KQ" == "mine $NGHE" ]] && kq ok "cổng của chính bee-web → mine (cài lại không bị chặn oan)" \
  || kq no "cổng của chính mình mà không nhận ra: $KQ"

kill "$NGHE" 2>/dev/null || true; wait "$NGHE" 2>/dev/null || true

# ── 2 · doctor có mục `web`, và đỏ đúng chỗ ──────────────────────────────
echo "PORT=$CONG" > "$BEE_ROOT/web.env"

kichban active 0 0
kham
[[ -n "$(muc)" ]] && kq ok "doctor.json có mục web" || kq no "doctor không có mục web — đúng cái lỗ 25/08"

# 2a · unit không active → đỏ. Đây là cái doctor CHƯA BAO GIỜ hỏi.
kichban failed 1005 0
kham
case "$(muc)" in
  false*1005*) kq ok "bee-web failed sau 1005 lần restart: đỏ, và nói ra con số";;
  false*)      kq ok "bee-web failed: đỏ (nhưng thiếu số lần restart)";;
  *)           kq no "web chết mà doctor vẫn xanh: $(muc)";;
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
case "$(muc)" in
  false*"tiến trình khác"*) kq ok "cổng bị người khác giữ: đỏ, dù curl trả 200";;
  true*) kq no "CỔNG CỦA NGƯỜI KHÁC MÀ DOCTOR XANH — chính là lỗ 25/08: $(muc)";;
  *) kq no "kỳ vọng đỏ vì sai chủ cổng: $(muc)";;
esac
kill "$NGHE" 2>/dev/null || true; wait "$NGHE" 2>/dev/null || true

# 2c · Đúng chủ + curl 200 → xanh (không được đỏ oan).
kichban active 0 0
kham
[[ "$(muc)" == true* ]] && kq ok "unit active + cổng đúng chủ + 200: xanh" \
  || kq no "lẽ ra xanh: $(muc)"

# 2d · Restart nhiều bất thường → đỏ, kể cả khi đang trả lời được.
kichban active 42 0
kham
[[ "$(muc)" == false*42* ]] && kq ok "restart 42 lần: đỏ dù đang trả lời (bị đá ra liên tục)" \
  || kq no "restart bất thường mà vẫn xanh: $(muc)"

# 2e · Chưa cài web → đỏ có chỉ dẫn, không phải im lặng.
kichban inactive 0 0 khong
kham
[[ "$(muc)" == false*install* ]] && kq ok "chưa có bee-web.service: đỏ + chỉ cách cài" \
  || kq no "thiếu unit mà không chỉ được đường: $(muc)"

# ── 3 · Mã thoát tách khỏi kết quả khám ──────────────────────────────────
# Trước T19: bee-doctor.service báo "failed" mỗi lần máy có mục đỏ — đọc như
# hỏng hóc trong khi nó chỉ đang làm đúng việc.
kichban failed 1005 0
bash "$DAY/../bin/doctor.sh" >/dev/null 2>&1 && MA=0 || MA=$?
[[ $MA -eq 1 ]] && kq ok "dòng lệnh: có mục đỏ → exit 1 (cắm được vào CI)" \
  || kq no "kỳ vọng exit 1, nhận $MA"

bash "$DAY/../bin/doctor.sh" --exit-zero >/dev/null 2>&1 && MA=0 || MA=$?
[[ $MA -eq 0 ]] && kq ok "--exit-zero: khám ra bệnh KHÔNG phải doctor hỏng → exit 0" \
  || kq no "--exit-zero vẫn exit $MA — unit sẽ còn báo failed oan"

[[ "$(muc)" == false* ]] \
  && kq ok "--exit-zero vẫn ghi đủ kết quả đỏ vào doctor.json" \
  || kq no "--exit-zero nuốt mất kết quả khám: $(muc)"

bash "$DAY/../bin/doctor.sh" --xxx >/dev/null 2>&1 && MA=0 || MA=$?
[[ $MA -eq 2 ]] && kq ok "tham số lạ → exit 2, không im lặng bỏ qua" || kq no "tham số lạ trả $MA"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-14: TẤT CẢ XANH"; else echo "RIG-14: CÓ ĐỎ"; exit 1; fi

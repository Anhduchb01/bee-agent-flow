#!/usr/bin/env bash
# Rig-09 — trần chi cho MỘT phiên (FR-3.4).
#
# Phiên chạy sai cả tiếng lúc 2 giờ sáng là kịch bản PRD §1.1 gọi tên. Phanh
# hạn mức (T5) chỉ chặn MỞ phiên; cái này chặn một phiên đang chạy đốt quá trần.
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run"
mkdir -p "$BEE_ROOT/sessions" "$BEE_RUNTIME"

# systemctl giả: mọi unit "active", và GHI LẠI lệnh stop để rig kiểm.
mkdir -p "$T/bin"
export RIG_STOP_LOG="$T/stop.log"; : > "$RIG_STOP_LOG"
cat > "$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
for a in "$@"; do [[ "$a" == "stop" ]] && { echo "$*" >> "$RIG_STOP_LOG"; exit 0; }; done
case " $* " in *" is-active "*) echo active; exit 0;; esac
exit 0
EOF
chmod +x "$T/bin/systemctl"; export PATH="$T/bin:$PATH"

# phien <id> <status> <cost đã đốt>
make_session_dir() {
  local id="$1" st="$2" cost="$3" sd="$BEE_ROOT/sessions/$1"
  mkdir -p "$sd"
  jq -cn --arg s "$st" '{status:$s, attempt:0, needs_human:false}' > "$sd/meta.json"
  jq -cn --argjson c "$cost" '{type:"result", subtype:"success", total_cost_usd:$c, num_turns:9}' > "$sd/run.jsonl"
  echo '{"id":"x"}' > "$sd/session.json"
  : > "$BEE_RUNTIME/$id.in"
}

ID_DOT=cccccccc-0000-4000-8000-000000000001   # đang chạy, đốt 6.2 USD
ID_NHE=cccccccc-0000-4000-8000-000000000002   # đang chạy, đốt 0.3 USD
ID_DONE=cccccccc-0000-4000-8000-000000000003  # đã xong, đốt 9 USD

make_session_dir "$ID_DOT"  running 6.2
make_session_dir "$ID_NHE"  running 0.3
make_session_dir "$ID_DONE" done    9.0

meta() { jq -r "$2" "$BEE_ROOT/sessions/$1/meta.json"; }

# --- 1. Có trần: phiên vượt trần bị dừng, phiên nhẹ không bị đụng ---------
SESSION_MAX_USD=5 bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true

grep -q "$ID_DOT" "$RIG_STOP_LOG" \
  && kq ok "vượt trần: đã gọi stop unit" \
  || kq no "vượt trần mà KHÔNG dừng phiên"
[[ "$(meta "$ID_DOT" '.needs_human')" == "true" ]] \
  && kq ok "vượt trần: gắn needs_human" || kq no "vượt trần: thiếu needs_human"
[[ "$(meta "$ID_DOT" '.reason // empty')" == *"trần"* || "$(meta "$ID_DOT" '.reason // empty')" == *"budget"* ]] \
  && kq ok "vượt trần: meta nói lý do ($(meta "$ID_DOT" '.reason'))" \
  || kq no "vượt trần: meta không nói vì sao (reason=$(meta "$ID_DOT" '.reason // empty'))"
grep -q "5" "$BEE_ROOT/sessions/$ID_DOT/run.jsonl" && grep -qi "trần\|usd" "$BEE_ROOT/sessions/$ID_DOT/run.jsonl" \
  && kq ok "vượt trần: người dùng thấy CHỮ trong live view, không phải im lặng" \
  || kq no "vượt trần: không có dòng lifecycle giải thích"

grep -q "$ID_NHE" "$RIG_STOP_LOG" && kq no "phiên nhẹ BỊ DỪNG oan" || kq ok "phiên dưới trần: không đụng"
grep -q "$ID_DONE" "$RIG_STOP_LOG" && kq no "phiên đã xong bị dừng lại" || kq ok "phiên đã kết thúc: không đụng"

# --- 2. Không cấu hình trần → không bao giờ dừng (hành vi hôm nay) --------
: > "$RIG_STOP_LOG"
make_session_dir "$ID_DOT" running 99
bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true
[[ -s "$RIG_STOP_LOG" ]] && kq no "không có trần mà vẫn dừng phiên" || kq ok "không cấu hình trần: không phanh ai (mặc định an toàn)"

# --- 3. Trần bằng 0 = tắt, không phải 'chặn hết' --------------------------
SESSION_MAX_USD=0 bash "$DAY/../bin/reaper.sh" >/dev/null 2>&1 || true
[[ -s "$RIG_STOP_LOG" ]] && kq no "SESSION_MAX_USD=0 lại chặn tất cả" || kq ok "SESSION_MAX_USD=0 = tắt trần"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-09: TẤT CẢ XANH"; else echo "RIG-09: CÓ ĐỎ"; exit 1; fi

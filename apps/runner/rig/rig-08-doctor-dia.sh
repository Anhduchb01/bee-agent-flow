#!/usr/bin/env bash
# Rig-08 — doctor phải NHÌN THẤY đĩa, và phải bắt được gc chết im lặng.
#
# Bất biến #3 của kiến trúc: mỗi kiểu hỏng có đúng một cơ chế bắt. gc chạy
# trong timer nền — nó chết thì không có job đỏ nào để nhìn, chỉ là đĩa lặng lẽ
# đầy lên. Tuổi của gc.json là cơ chế bắt duy nhất.
set -euo pipefail

DAY=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run"

# Stub: doctor gọi gh/systemctl/loginctl — rig không có cái nào, và cũng không
# cần: bài này chỉ hỏi về mục đĩa.
mkdir -p "$T/bin"
for c in gh systemctl loginctl; do printf '#!/bin/sh\nexit 1\n' > "$T/bin/$c"; chmod +x "$T/bin/$c"; done
export PATH="$T/bin:$PATH"

san() {  # dựng lại sân sạch: <số worktree> <số worktree mồ côi>
  rm -rf "$BEE_ROOT"; mkdir -p "$BEE_ROOT"/{sessions,work,repos}
  local i
  for i in $(seq 1 "$1"); do
    local id="bbbbbbbb-0000-4000-8000-00000000000$i"
    mkdir -p "$BEE_ROOT/work/$id" "$BEE_ROOT/sessions/$id"
    echo '{"status":"done"}' > "$BEE_ROOT/sessions/$id/meta.json"
    head -c 100000 /dev/zero > "$BEE_ROOT/work/$id/big"
  done
  for i in $(seq 1 "${2:-0}"); do
    mkdir -p "$BEE_ROOT/work/mocoi-$i"   # có thư mục, không có phiên
  done
}

muc() { jq -r '.checks[] | select(.id=="dia-phien") | "\(.ok)|\(.detail)"' "$BEE_ROOT/doctor.json" 2>/dev/null; }

# --- 1. gc chưa chạy lần nào → đỏ, và nói cách bật ------------------------
san 2
bash "$DAY/../bin/doctor.sh" >/dev/null 2>&1 || true
case "$(muc)" in
  false*bee-gc*) kq ok "gc chưa chạy lần nào: đỏ + chỉ cách bật timer";;
  "")            kq no "doctor.json không có mục dia-phien";;
  *)             kq no "gc chưa chạy mà không đỏ: $(muc)";;
esac

# --- 2. gc mới chạy, đĩa nhỏ → xanh, có số thật --------------------------
san 2 1
echo '{"ts":"x","removed":0,"freed_bytes":0,"items":[]}' > "$BEE_ROOT/gc.json"
bash "$DAY/../bin/doctor.sh" >/dev/null 2>&1 || true
KQ=$(muc)
[[ "$KQ" == true* ]] && kq ok "gc mới chạy + đĩa nhỏ: xanh" || kq no "lẽ ra xanh: $KQ"
grep -qE '[0-9]+(\.[0-9]+)?[KMG]' <<<"$KQ" \
  && kq ok "detail mang số thật, không phải chữ chung chung" \
  || kq no "detail thiếu dung lượng: $KQ"
grep -q "mồ côi" <<<"$KQ" && kq ok "đếm được worktree mồ côi (có thư mục, không có phiên)" \
  || kq no "không đếm worktree mồ côi: $KQ"

# --- 3. gc im lặng > 48h → đỏ (chết im lặng là chế độ hỏng nguy hiểm nhất) -
touch -d '72 hours ago' "$BEE_ROOT/gc.json"
bash "$DAY/../bin/doctor.sh" >/dev/null 2>&1 || true
case "$(muc)" in
  false*72h*|false*gc*) kq ok "gc im lặng 72h: đỏ ($(muc | cut -d'|' -f2))";;
  *) kq no "gc chết im lặng mà doctor vẫn xanh: $(muc)";;
esac

# --- 4. Vượt ngưỡng dung lượng → đỏ --------------------------------------
san 2
echo '{"ts":"x"}' > "$BEE_ROOT/gc.json"
GC_WARN_GB=0 bash "$DAY/../bin/doctor.sh" >/dev/null 2>&1 || true
[[ "$(muc)" == false* ]] && kq ok "vượt ngưỡng GC_WARN_GB: đỏ" || kq no "vượt ngưỡng mà vẫn xanh: $(muc)"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-08: TẤT CẢ XANH"; else echo "RIG-08: CÓ ĐỎ"; exit 1; fi

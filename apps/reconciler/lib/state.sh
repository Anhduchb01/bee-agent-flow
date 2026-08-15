#!/usr/bin/env bash
# state.sh — claim, đếm slot, phục hồi sau sự cố.
#
# Nguyên tắc: GitHub luôn là nguồn sự thật. State trên đĩa chỉ là cache để biết
# "lần chạy này đã đi tới đâu"; mất sạch state cũng không sai kết quả, chỉ là
# reconciler phải làm lại từ đầu.
#
# Khoá thật KHÔNG nằm trong file nào — nó là việc systemd từ chối start một
# template unit đang active.

unit_of()      { printf 'bee-task@%s.service' "$1"; }   # $1 = <slug>-<số>
unit_failed()  { systemctl is-failed --quiet "$(unit_of "$1")"; }

# `bee-task@` là Type=oneshot, và một oneshot ĐANG CHẠY nằm ở
# ActiveState=activating / SubState=start — nó KHÔNG BAO GIỜ đi qua "active"
# hay "running". Đó là hai chỗ dưới đây từng sai, và cả hai đều sai im lặng:
#
#   `is-active --quiet` trả 3 suốt lúc task chạy, nên dispatcher tưởng không có
#   gì chạy và giao lại chính việc đó ở mỗi tick.
#
#   `--state=running` không khớp gì cả, nên đếm slot luôn ra 0 — toàn bộ trần
#   MAX_BUILD_SLOTS trở nên vô hiệu, và dashboard báo "không có gì đang chạy"
#   trong khi máy đang bận.
unit_active() {
  local s; s=$(systemctl show "$(unit_of "$1")" -p ActiveState --value 2>/dev/null)
  [[ "$s" == "active" || "$s" == "activating" ]]
}

# Danh sách id đang chạy, mỗi dòng một id.
running_ids() {
  systemctl list-units --type=service --all --no-legend --plain \
      'bee-task@*.service' 2>/dev/null \
    | awk '$3 == "active" || $3 == "activating" { print $1 }' \
    | sed -E 's/^bee-task@(.*)\.service$/\1/'
}

running_count()      { running_ids | wc -l; }
running_in_repo()    { running_ids | grep -c "^$1-" || true; }
# `n=$((n+1))` chứ KHÔNG phải `(( n++ ))`.
#
# `(( n++ ))` là hậu tố: nó trả về giá trị CŨ, nên khi n=0 biểu thức bằng 0, và
# số học bằng 0 nghĩa là mã thoát 1. Với `set -e` thì lần đếm ĐẦU TIÊN giết cả
# hàm — kiểm được bằng `bash -c 'set -e; n=0; true && (( n++ )); echo sống'`.
#
# Ở đây nó chưa từng nổ, vì hàm luôn được gọi qua `$( )` và bash không cho `-e`
# giết tiến trình cha từ trong một command substitution. Nhưng đó là may, không
# phải thiết kế: đổi chỗ gọi thành `running_in_pool build` trực tiếp là hàm im
# lặng trả về rỗng, `pool_has_slot` coi rỗng là 0, và trần slot biến mất.
running_in_pool() {
  local pool="$1" id n=0
  while read -r id; do
    [[ -z "$id" ]] && continue
    if [[ "$(cat "$(state_dir "$id")/pool" 2>/dev/null)" == "$pool" ]]; then
      n=$((n + 1))
    fi
  done < <(running_ids)
  printf '%d' "$n"
}

state_dir() { printf '%s/state/%s' "$BEE_SRV" "$1"; }

claim_write() {
  local id="$1" repo="$2" num="$3" rule="$4" pool="$5"
  local d; d=$(state_dir "$id")
  mkdir -p "$d"
  printf '%s' "$pool" > "$d/pool"
  printf '%s' "$rule" > "$d/rule"
  jq -n --arg id "$id" --arg repo "$repo" --argjson num "$num" \
        --arg rule "$rule" --arg pool "$pool" --arg at "$(now_iso)" \
        '{id:$id, repo:$repo, number:$num, rule:$rule, pool:$pool, started_at:$at}' \
    > "$d/claim.json"
}

claim_clear() { rm -rf -- "$(state_dir "$1")"; }

claim_started_epoch() {
  local f; f="$(state_dir "$1")/claim.json"
  [[ -f "$f" ]] || { printf '0'; return; }
  date -d "$(jq -r '.started_at' "$f")" +%s 2>/dev/null || printf '0'
}

# Bộ đếm lần thử — sống lâu hơn claim, vì claim bị xoá sau mỗi lần chạy.
attempt_file() { printf '%s/attempts/%s' "$BEE_SRV" "$1"; }
attempt_get()  { cat "$(attempt_file "$1")" 2>/dev/null || printf '0'; }
attempt_bump() {
  local f; f=$(attempt_file "$1"); mkdir -p "$(dirname "$f")"
  printf '%d' "$(( $(attempt_get "$1") + 1 ))" > "$f"
}
attempt_reset() { rm -f -- "$(attempt_file "$1")"; }

# Vân tay của bộ comment mà rule 02 đã xử lý xong.
#
# PHẢI nằm ngoài thư mục state, cùng lý do với bộ đếm ở trên — và đây từng là
# một lỗi thật: rule 02 ghi mốc bằng `touch "$D/reviewed-$n"`, còn worker.sh có
# `trap … claim_clear "$ID"` khi thoát, tức là xoá sạch thư mục đó. Mốc chống
# lặp bị xoá ngay sau khi được đặt.
#
# Hậu quả không phải "chạy thừa một lần": comment do chính bee đăng ở cuối lần
# chạy làm `updatedAt` của PR đổi, `scan_changed` mở cổng ở tick sau, mốc thì
# không còn — nên nó chạy lại, đăng comment, đổi updatedAt, mãi mãi. Mỗi vòng là
# một lần gọi model.
reviewed_file() { printf '%s/reviewed/%s' "$BEE_SRV" "$1"; }
reviewed_get()  { cat "$(reviewed_file "$1")" 2>/dev/null || true; }
reviewed_set() {
  local f; f=$(reviewed_file "$1"); mkdir -p "$(dirname "$f")"
  printf '%s' "$2" > "$f"
}

# Ghi lịch sử một lần chạy để dashboard hiển thị "gần đây".
#
# Mức dùng của lần chạy (`usage.json` do `run_agent` để lại trong thư mục state
# của chính id này) được gộp vào nếu có. Đọc theo `id` chứ không theo biến toàn
# cục: hàm này đã nhận id rồi, và một phụ thuộc ngầm vào `$D` sẽ ghi nhầm lúc
# nào đó mà không ai biết.
#
# Cố ý gộp cả ở đường THẤT BẠI. Không có nó thì "chết vì hết hạn mức" và "chết
# vì test đỏ" cùng là một `result` khác `ok`, mà hai chuyện đó cần hai cách xử
# lý khác hẳn nhau. Rule 01 dọn một claim chết cũng đọc đúng thư mục state đó,
# nên `usage.json` của lần chạy vừa đổ vẫn còn và đi kèm được vào bản ghi
# "gave-up" — đó là thông tin đắt nhất của cả bản ghi ấy.
record_run() {
  local id="$1" repo="$2" num="$3" rule="$4" result="$5" turns="${6:-0}" dur="${7:-0}"
  local f="$BEE_SRV/state/recent.jsonl"
  local u; u="$(state_dir "$id")/usage.json"
  local extra='{}'
  # `session_id` là thứ DUY NHẤT cho phép nối lại cuộc hội thoại của lần chạy
  # này. Nó nằm trong thư mục state, mà thư mục đó bị xoá lúc worker thoát —
  # nên không chép vào đây thì phiên vẫn còn trong home của agent nhưng không ai
  # biết tên nó nữa.
  local sid; sid=$(cat "$(state_dir "$id")/session_id" 2>/dev/null || true)

  # Kết quả cuối cùng, để `run_archive` trong trap EXIT của worker biết dán nhãn
  # gì. CỐ Ý không phải `local`: trap chạy sau khi rule_run đã trả về, nên nó
  # cần một biến sống ở shell của worker. Rule nào cũng đi qua đây trước khi
  # thoát, nên đây là chỗ duy nhất biết chắc.
  RUN_KET="$result"

  # `jq -e .` chứ không phải `[[ -s ]]`: file có thể đứt giữa chừng nếu tiến
  # trình chết đúng lúc ghi, và một bản ghi lịch sử hỏng không đáng để làm đổ
  # cả lần chạy.
  [[ -f "$u" ]] && extra=$(jq -ce . "$u" 2>/dev/null || printf '{}')

  mkdir -p "$(dirname "$f")"
  jq -nc --arg id "$id" --arg repo "$repo" --argjson number "$num" --arg rule "$rule" \
         --arg result "$result" --argjson turns "$turns" --argjson duration_s "$dur" \
         --arg at "$(now_iso)" --argjson extra "$extra" --arg sid "$sid" \
         '{id:$id,repo:$repo,number:$number,rule:$rule,result:$result,
           turns:$turns,duration_s:$duration_s,at:$at,
           session_id:(if $sid == "" then null else $sid end)} + $extra' >> "$f"
  # Giữ file bounded — dashboard chỉ hiển thị vài dòng cuối.
  tail -n 200 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}

# ---------------------------------------------------------------------------
# Lưu lại một lần chạy — để người xem được agent đã làm gì, và nối lại được
# phiên của nó.
#
# `claim_clear` xoá cả thư mục state khi worker thoát, nên `run.jsonl`,
# `agent-output.txt` và `session_id` biến mất ngay sau khi lần chạy kết thúc.
# Bản ghi duy nhất còn lại là một dòng trong `recent.jsonl` với tám con số.
#
# Bản chép đầy đủ nằm trong home của bee-agent (`~/.claude/projects/…`) và phải
# ở nguyên đó: `bee-web` không được đọc home của agent, đó là ranh giới. Nên
# orch chép phần cần thiết ra một chỗ app đọc được.
run_root() { printf '%s/runs' "$BEE_SRV"; }
run_dir()  { printf '%s/runs/%s/%s/%s' "$BEE_SRV" "$1" "$2" "$3"; }

# `run.jsonl` là stream đầy đủ, có thể vài chục MB với một task dài. Giữ phần
# ĐUÔI: khúc cuối là chỗ có kết quả, lỗi, và những lượt gần nhất — thứ người ta
# mở log ra để xem. Khúc đầu là đọc file và tìm kiếm.
RUN_LOG_MAX_LINES="${RUN_LOG_MAX_LINES:-4000}"

# run_archive <id> <slug> <num> <rule> <result>
run_archive() {
  local id="$1" slug="$2" num="$3" rule="$4" ket="$5"
  local d; d=$(state_dir "$id")
  [[ -d "$d" ]] || return 0

  local dest stage sid
  sid=$(cat "$d/session_id" 2>/dev/null || true)
  dest=$(run_dir "$slug" "$num" "$id-$(date -u +%Y%m%dT%H%M%SZ)")
  stage="$dest.dang-ghi"
  rm -rf -- "$stage"; mkdir -p "$stage"

  if [[ -f "$d/run.jsonl" ]]; then
    local n; n=$(wc -l < "$d/run.jsonl" 2>/dev/null || echo 0)
    if (( n > RUN_LOG_MAX_LINES )); then
      printf '{"type":"bee_truncated","dropped":%d,"kept":%d}\n' \
        $(( n - RUN_LOG_MAX_LINES )) "$RUN_LOG_MAX_LINES" > "$stage/run.jsonl"
      tail -n "$RUN_LOG_MAX_LINES" "$d/run.jsonl" >> "$stage/run.jsonl"
    else
      cp -- "$d/run.jsonl" "$stage/run.jsonl"
    fi
  fi
  [[ -f "$d/agent-output.txt" ]] && cp -- "$d/agent-output.txt" "$stage/output.txt"
  [[ -f "$d/usage.json"       ]] && cp -- "$d/usage.json"       "$stage/usage.json"

  jq -nc --arg id "$id" --arg repo "$slug" --argjson number "$num" \
         --arg rule "$rule" --arg result "$ket" --arg at "$(now_iso)" \
         --arg session_id "$sid" \
         --argjson turns "$(cat "$d/turns" 2>/dev/null || echo 0)" \
         --argjson duration_s "$(cat "$d/duration" 2>/dev/null || echo 0)" \
         '{id:$id,repo:$repo,number:$number,rule:$rule,result:$result,at:$at,
           turns:$turns,duration_s:$duration_s,
           session_id:(if $session_id == "" then null else $session_id end)}' \
    > "$stage/meta.json"

  # Group theo chính thư mục gốc, đúng cách `evidence_write` làm — installer
  # quyết định group, và đọc tại chỗ thì hai bên không lệch nhau được.
  local gr; gr=$(stat -c %G "$(run_root)" 2>/dev/null || printf '%s' "$BEE_GROUP")
  chgrp -R "$gr" "$stage" 2>/dev/null || true
  chmod -R g+rX,o-rwx "$stage" 2>/dev/null || true

  mkdir -p "$(dirname "$dest")"
  mv -- "$stage" "$dest"
}

# Cache quét: trả về 0 (đã đổi, cần quét lại) nếu token khác lần trước.
#
# Tick chạy 2.880 lần/ngày. Nếu mỗi rule gọi một API cho mỗi PR thì rate limit
# GitHub (5.000/giờ) sẽ cạn. Phần lớn PR không đổi gì giữa hai tick, nên gate
# theo updatedAt cắt được gần hết lưu lượng ở trạng thái nghỉ.
scan_changed() {
  local key="$1" token="$2" f="$BEE_SRV/state/scan/$key"
  [[ "$(cat "$f" 2>/dev/null)" == "$token" ]] && return 1
  mkdir -p "$(dirname "$f")"
  printf '%s' "$token" > "$f"
  return 0
}

heartbeat_write() { printf '%s' "$(now_iso)" > "$BEE_SRV/state/heartbeat"; }
heartbeat_age_s() {
  local f="$BEE_SRV/state/heartbeat"
  [[ -f "$f" ]] || { printf '999999'; return; }
  printf '%d' "$(( $(now_epoch) - $(date -d "$(cat "$f")" +%s 2>/dev/null || echo 0) ))"
}

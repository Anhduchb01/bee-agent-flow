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
unit_active()  { systemctl is-active --quiet "$(unit_of "$1")"; }
unit_failed()  { systemctl is-failed --quiet "$(unit_of "$1")"; }

# Danh sách id đang chạy, mỗi dòng một id.
running_ids() {
  systemctl list-units --type=service --state=running --no-legend --plain \
      'bee-task@*.service' 2>/dev/null \
    | awk '{print $1}' \
    | sed -E 's/^bee-task@(.*)\.service$/\1/'
}

running_count()      { running_ids | wc -l; }
running_in_repo()    { running_ids | grep -c "^$1-" || true; }
running_in_pool() {
  local pool="$1" id n=0
  while read -r id; do
    [[ -z "$id" ]] && continue
    [[ "$(cat "$(state_dir "$id")/pool" 2>/dev/null)" == "$pool" ]] && (( n++ ))
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

# Ghi lịch sử một lần chạy để dashboard hiển thị "gần đây".
record_run() {
  local id="$1" repo="$2" num="$3" rule="$4" result="$5" turns="${6:-0}" dur="${7:-0}"
  local f="$BEE_SRV/state/recent.jsonl"
  mkdir -p "$(dirname "$f")"
  jq -nc --arg id "$id" --arg repo "$repo" --argjson number "$num" --arg rule "$rule" \
         --arg result "$result" --argjson turns "$turns" --argjson duration_s "$dur" \
         --arg at "$(now_iso)" \
         '{id:$id,repo:$repo,number:$number,rule:$rule,result:$result,
           turns:$turns,duration_s:$duration_s,at:$at}' >> "$f"
  # Giữ file bounded — dashboard chỉ hiển thị vài dòng cuối.
  tail -n 200 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
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

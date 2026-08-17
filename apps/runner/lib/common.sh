#!/usr/bin/env bash
# Thư viện chung của runner — mọi script source file này trước tiên.
# Hai biến gốc đều override được bằng env, để rig chạy trên sân giả
# mà không đụng /srv thật.

BEE_ROOT="${BEE_ROOT:-/srv/bee}"
BEE_RUNTIME="${BEE_RUNTIME:-${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/bee}"

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()     { printf '[%s] %s\n' "$(date +%T)" "$*" >&2; }
die()     { log "LỖI: $*"; exit 1; }

# meta_merge <dir> <json-object>
# Trộn một object vào meta.json, ghi nguyên tử (tmp + mv) — reaper và
# session-run có thể cùng đọc file này, không ai được thấy nửa file.
meta_merge() {
  local d="$1" patch="$2" tmp
  tmp=$(mktemp "$d/.meta.XXXXXX")
  if [[ -f "$d/meta.json" ]]; then
    jq --argjson p "$patch" '. + $p' "$d/meta.json" > "$tmp"
  else
    printf '%s\n' "$patch" | jq . > "$tmp"
  fi
  mv "$tmp" "$d/meta.json"
}

# lifecycle <dir> <msg>
# Sự kiện vòng đời đi CHUNG dòng chảy với đầu ra của claude — người dùng
# thấy chữ trong live view, kể cả khi model chưa nói gì. Đây là thứ làm
# "< 5 giây tới sự kiện đầu tiên" giữ được bất kể model nhanh chậm.
lifecycle() {
  local d="$1" msg="$2"
  jq -cn --arg m "$msg" --arg t "$(now_iso)" \
    '{type:"bee_lifecycle", msg:$m, ts:$t}' >> "$d/run.jsonl"
}

#!/usr/bin/env bash
# Rule 06 — dựng preview env cho PR có label preview:on.
#
# OPT-IN có chủ đích. Preview env sống suốt vòng đời PR và ngốn ~1,5GB RAM,
# trong khi phần lớn task PM chỉ cần xem video là duyệt được. Vì vậy nó tắt
# mặc định, và toàn bộ hạ tầng Caddy/cloudflared nằm ngoài đường găng (mốc M6).
#
# TRIỂN KHAI Ở M6 — hiện chỉ scan để dry-run hiển thị đúng.

RULE_ID="06-preview"
RULE_POOL="build"
RULE_AGENT=0

rule_scan() {
  [[ "${ENABLE_PREVIEW:-0}" == "1" ]] || return 0

  local slug="$1" num
  while read -r num; do
    [[ -z "$num" ]] && continue
    docker compose -p "$slug-$num" ps -q 2>/dev/null | grep -q . && continue
    printf '%s\t0\tdựng preview env\n' "$num"
  done < <(gh_prs "$REPO_FULL" \
             | jq -r '.[] | select([.labels[].name] | index("preview:on")) | .number')
}

rule_run() {
  local slug="$1" num="$2"
  warn "rule 06 chưa triển khai (mốc M6) — bỏ qua $slug#$num"
  return 0
}

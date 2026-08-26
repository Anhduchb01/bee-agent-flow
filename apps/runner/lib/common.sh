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

# Dựng worktree cho một phiên. Tách khỏi session-run.sh để rig gọi được ĐÚNG
# đoạn code chạy thật, không phải một bản chép gần giống.
#   dung_worktree <bare> <worktree> <branch> <nhánh-mặc-định>
dung_worktree() {
  local bare="$1" wt="$2" branch="$3" def="$4"

  # Worktree bị xoá thô (crash, gc, rm -rf) vẫn còn ĐĂNG KÝ trong bare repo,
  # và git từ chối dựng lại với "already used by worktree". prune dọn đăng ký
  # chết; nó không đụng gì tới worktree còn sống.
  git --git-dir="$bare" worktree prune

  if git --git-dir="$bare" show-ref --verify --quiet "refs/heads/$branch"; then
    # Nhánh ĐÃ CÓ (mở lại phiên cũ sau khi worktree bị dọn): checkout đúng chỗ
    # nó đang đứng. TUYỆT ĐỐI không dùng -B ở đây — `-B` là force reset về
    # $def, tức thổi bay mọi commit chưa push. Rig-06 §2 giữ chỗ này.
    # Nhánh đang bị worktree khác giữ thì git tự từ chối, và đó là đúng.
    git --git-dir="$bare" worktree add --quiet "$wt" "$branch"
  else
    git --git-dir="$bare" worktree add --quiet -b "$branch" "$wt" "$def"
  fi
}

# ghi_cong <worktree> <base|rỗng> — đưa dải cổng của phiên vào worktree.
#
# compose của repo ghim cổng bằng `${POSTGRES_PORT:-5432}`, nên hai phiên cùng
# repo sẽ đụng nhau nếu không có dải riêng. bee cấp dải; repo tự chọn ánh xạ
# cổng nào vào việc gì (bee KHÔNG biết tên biến của từng repo, và không nên biết).
ghi_cong() {
  local wt="$1" base="$2"
  [[ -n "$base" ]] || return 0
  mkdir -p "$wt/.bee"
  {
    echo "# Sinh bởi bee — dải cổng riêng của phiên này. Đừng commit."
    echo "BEE_PORT_BASE=$base"
    local i
    for i in $(seq 0 9); do echo "BEE_PORT_$i=$(( base + i ))"; done
  } > "$wt/.bee/ports.env"
}

# chep_env_d <env.d/slug> <worktree> <base|rỗng>
#
# Chép file env vào worktree, thay `${BEE_PORT_n}` bằng cổng thật. CHỈ thay
# đúng họ biến đó: `envsubst` không giới hạn sẽ nuốt luôn `$VAR` trong secret
# của repo và làm hỏng chính thứ nó đang mang.
chep_env_d() {
  local envd="$1" wt="$2" base="$3"
  [[ -d "$envd" ]] || return 0
  local ds=""
  if [[ -n "$base" ]]; then
    ds='${BEE_PORT_BASE}'
    local i
    for i in $(seq 0 9); do ds="$ds \${BEE_PORT_$i}"; done
    export BEE_PORT_BASE="$base"
    for i in $(seq 0 9); do export "BEE_PORT_$i=$(( base + i ))"; done
  fi

  # The session's service slice (T15), if it has one. bee does not know what
  # this repo calls its database variable and must not learn (T14) — the owner
  # writes the mapping once in env.d, we only substitute. The name list stays
  # BOUNDED for the same reason as the ports above: an unlimited envsubst
  # would swallow a `$VAR` that belongs to the repo's own secret.
  if [[ -f "$wt/.bee/services.env" ]]; then
    local ten
    while IFS='=' read -r ten _; do
      [[ "$ten" == BEE_* ]] || continue
      ds="$ds \${$ten}"
    done < "$wt/.bee/services.env"
    set -a; . "$wt/.bee/services.env"; set +a
  fi
  local f rel
  while IFS= read -r f; do
    rel="${f#./}"
    mkdir -p "$wt/$(dirname "$rel")"
    if [[ -n "$ds" ]] && command -v envsubst >/dev/null; then
      envsubst "$ds" < "$envd/$rel" > "$wt/$rel"
    else
      cp "$envd/$rel" "$wt/$rel"
    fi
  done < <(cd "$envd" && find . -type f)
}

# port_owner <port> [unit] — who is listening on <port>, in exactly one line.
#
#   free                 nobody is listening
#   mine <pid>           <unit> (default bee-web.service) holds it
#   other <pid> <user>   somebody else holds it, and we can see who
#   other ? khac-user    somebody holds it but the kernel hides the pid from
#                        us — which by itself proves it is NOT ours
#   unknown              no `ss` on this machine, cannot answer
#
# Why this exists (25/08): bee-web crash-looped on EADDRINUSE 1005 times while
# `curl 127.0.0.1:3210` answered 200 the whole time — the answer came from
# ducba's web. "The port answers" is NOT "our web is up", and every check that
# conflated the two stayed green through the outage.
port_owner() {
  local port="$1" unit="${2:-bee-web.service}" line pid mine
  command -v ss >/dev/null 2>&1 || { echo "unknown"; return 0; }
  line=$(ss -Hltnp "sport = :$port" 2>/dev/null | head -1)
  [[ -n "$line" ]] || { echo "free"; return 0; }

  pid=$(sed -n 's/.*[^a-z]pid=\([0-9]\+\).*/\1/p' <<<"$line")
  mine=$(systemctl --user show "$unit" -p MainPID --value 2>/dev/null || echo 0)
  if [[ -n "$pid" && -n "$mine" && "$mine" != "0" && "$pid" == "$mine" ]]; then
    echo "mine $pid"
  elif [[ -n "$pid" ]]; then
    echo "other $pid $(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  else
    echo "other ? khac-user"
  fi
}

# ── Service slices (T15) — see docs/specs/lat-dich-vu.md ──────────────────

# doan_kieu <image> — map a docker image to the service kind bee knows how to
# carve a slice out of. Prints the kind, or nothing when it cannot tell.
#
# The owner chose "guess from the image" over a declaration file. That choice
# comes with one safety rule, and it is the whole reason this is a table and
# not a heuristic: an image we cannot place returns EMPTY, never a wrong kind.
# Guessing wrong towards "shared slice" writes into somebody else's database;
# guessing wrong towards "run it per session" costs a little RAM and shows up
# immediately. The two mistakes are not the same price.
#
# Matching is on the LAST path segment only, so a registry prefix cannot
# create a match (docker.io/library/postgres -> postgres) and a substring
# cannot either (ghcr.io/acme/not-postgres-at-all -> nothing).
doan_kieu() {
  local img="$1" path seg
  [[ -n "$img" ]] || return 0

  # Strip the tag, but only when the colon comes after the last slash —
  # otherwise a registry port (host:5000/img) loses its host.
  path="$img"
  if [[ "${path##*/}" == *:* ]]; then path="${path%:*}"; fi
  seg="${path##*/}"

  case "$seg" in
    postgres|postgis|pgvector|timescaledb) echo postgres;;
    rabbitmq)                              echo rabbitmq;;
    minio)                                 echo s3;;
    mysql|mariadb|percona)                 echo mysql;;
    redis|valkey)                          echo redis;;
    *)                                     : ;;   # unknown on purpose
  esac
}

# doc_compose <dir> — list the services a compose file declares, one per line:
#     "<service> <image> <kind>"       kind is empty when unrecognised
#
# Parsed as TEXT, not through `docker compose config`. This runs before claude
# starts, on a machine where docker may be down and where the repo's compose
# may not even be valid yet — needing docker to find out whether we need docker
# is a loop nobody wants at 2am.
#
# Two things it must get right, both pinned by rig-15:
#   · a service with no `image:` (built from source) is SKIPPED — there is
#     nothing to guess from, and it is never a shared service anyway;
#   · an `image:` outside the `services:` block (x-anchors, top-level keys)
#     is NOT a service. Compose files legally carry those.
#
# Awk over a YAML parser is a deliberate trade: the only thing we read is
# two-space-indented keys under `services:` and their `image:`. A file exotic
# enough to break that (merge keys, flow mappings) degrades to fewer rows,
# which lands on "run it per session" — the safe side of §3.
doc_compose() {
  local dir="$1" f
  for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    [[ -f "$dir/$f" ]] || continue
    awk '
      # Track which top-level block we are in. A top-level key has no indent.
      /^[^[:space:]#]/ { in_svc = ($0 ~ /^services:/); name = ""; next }
      !in_svc { next }
      # Service name: exactly one indent level (2 spaces), ends with a colon.
      /^[[:space:]]{2}[^[:space:]#][^:]*:[[:space:]]*$/ {
        name = $1; sub(/:$/, "", name); next
      }
      # image: belonging to the service we are inside.
      name != "" && /^[[:space:]]+image:[[:space:]]*/ {
        img = $0
        sub(/^[[:space:]]+image:[[:space:]]*/, "", img)
        gsub(/^["\x27]|["\x27][[:space:]]*$/, "", img)
        sub(/[[:space:]]+$/, "", img)
        if (img != "") print name, img
        name = ""
      }
    ' "$dir/$f" | while read -r ten img; do
      printf '%s %s %s\n' "$ten" "$img" "$(doan_kieu "$img")"
    done
    return 0
  done
}

# cap_lat_dich_vu <session-dir> <session-id> — the gate session-run puts in
# front of the pool. Returns non-zero when the session must NOT start.
#
# It lives here rather than inline in session-run so it can be tested without
# the whole session harness, and so the refusal always writes a lifecycle line
# — a session that dies at this gate must say why in the live view, not just
# in a journal nobody opens.
cap_lat_dich_vu() {
  local sdir="$1" id="$2"
  local sh_lat
  sh_lat="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../bin/service-slice.sh"
  [[ -x "$sh_lat" ]] || return 0

  local out rc=0
  out=$("$sh_lat" provision "$id" 2>&1) || rc=$?
  if (( rc != 0 )); then
    lifecycle "$sdir" "Could not provision the service slice: ${out:-unknown error}"
    return "$rc"
  fi

  # Say which services this session will run on its own. Silence here is the
  # failure mode guessing-from-image is most exposed to: an image bee cannot
  # place quietly becomes a per-session container, and the RAM goes missing
  # with nobody told.
  local rec="$sdir/services.json"
  if [[ -f "$rec" ]]; then
    local rieng
    rieng=$(jq -r '[.items[]? | select(.in_pool==false) | .service] | join(", ")' "$rec" 2>/dev/null || true)
    [[ -n "$rieng" && "$rieng" != "null" ]] \
      && lifecycle "$sdir" "Services not in the pool — this session will run its own when needed: $rieng"
    local chung
    chung=$(jq -r '[.items[]? | select(.in_pool==true) | .kind] | join(", ")' "$rec" 2>/dev/null || true)
    [[ -n "$chung" && "$chung" != "null" ]] \
      && lifecycle "$sdir" "Private service slice ready: $chung (see .bee/services.env)"
  fi
  return 0
}

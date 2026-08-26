#!/usr/bin/env bash
# Rig-15 — service slices (T15). See docs/specs/lat-dich-vu.md.
#
# The whole slice layer is deliberately rule-based, not AI (spec §2): it runs
# before claude even starts, it holds admin credentials, and gc has to be able
# to DERIVE the names again later to reclaim them. So it is testable on paper,
# and this rig is where that promise is kept.
set -euo pipefail

HERE=$(dirname "$(readlink -f "$0")")
FAIL=0
kq() { if [[ "$1" == ok ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; FAIL=1; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export BEE_ROOT="$T/srv" BEE_RUNTIME="$T/run"
mkdir -p "$BEE_ROOT"/{sessions,work,repos,services}

source "$HERE/../lib/common.sh"

# ── 1 · doan_kieu: image string → service kind ────────────────────────────
# Guessing from the image is what the owner chose over a declaration file
# (spec §0.1). The safety rule that comes with it: an image we cannot place
# must return EMPTY, never a wrong kind — writing into somebody else's
# database costs far more than one redundant container.
echo "-- 1 · image -> kind --"

kiem_kieu() {  # kiem_kieu <image> <expected>
  local got; got=$(doan_kieu "$1")
  [[ "$got" == "$2" ]] \
    && kq ok "$1 -> ${2:-<empty>}" \
    || kq no "$1 -> '$got', expected '${2:-<empty>}'"
}

kiem_kieu "postgres:16"                 postgres
kiem_kieu "postgres"                    postgres
kiem_kieu "postgis/postgis:16-3.4"      postgres
kiem_kieu "pgvector/pgvector:pg16"      postgres
kiem_kieu "rabbitmq:3-management"       rabbitmq
kiem_kieu "minio/minio:latest"          s3
kiem_kieu "mysql:8"                     mysql
kiem_kieu "mariadb:11"                  mysql
kiem_kieu "redis:7-alpine"              redis
kiem_kieu "valkey/valkey:8"             redis
kiem_kieu "mycompany/db-custom:2"       ""
kiem_kieu ""                            ""

# A registry-qualified image must not fool the matcher, in either direction.
kiem_kieu "docker.io/library/postgres:16"        postgres
kiem_kieu "ghcr.io/acme/not-postgres-at-all:1"   ""

# ── 2 · doc_compose: compose file -> "<service> <image> <kind>" lines ─────
# Parsed as text on purpose, NOT via `docker compose config`: this runs before
# claude starts, on a machine where docker may be down or the repo's compose
# may not even be valid yet. Needing docker to find out whether we need docker
# is a loop we do not want at 2am.
echo
echo "-- 2 · compose -> services --"

WT="$T/wt"; mkdir -p "$WT"
cat > "$WT/docker-compose.yml" <<'EOF'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
  cache:
    image: redis:7
  api:
    build: .
    depends_on: [db]
  blob:
    image: mycompany/blob:2
EOF

RA=$(doc_compose "$WT")

grep -qx "db postgres:16 postgres" <<<"$RA" \
  && kq ok "reads service + image + kind" || kq no "wrong row for db: $(grep '^db ' <<<"$RA")"
grep -qx "cache redis:7 redis" <<<"$RA" \
  && kq ok "redis recognised as its own kind" || kq no "cache row wrong"
grep -qx "blob mycompany/blob:2 " <<<"$RA" \
  && kq ok "unknown image: listed, kind left EMPTY (not dropped)" \
  || kq no "unknown image must still be listed so the UI can warn: $(grep '^blob ' <<<"$RA")"
grep -q "^api " <<<"$RA" \
  && kq no "service with no image must be skipped — nothing to guess from" \
  || kq ok "service built from source (no image): skipped"
[[ "$(wc -l <<<"$RA")" == 3 ]] \
  && kq ok "exactly three rows, no stray lines" || kq no "row count wrong: $(wc -l <<<"$RA")"

# A worktree with no compose at all is the common case, not an error.
[[ -z "$(doc_compose "$T/khong-co")" ]] \
  && kq ok "no compose file: empty output, no error" || kq no "missing compose file did not stay quiet"

# `image:` outside the services block must not be picked up — top-level keys
# like x-templates are legal compose and would otherwise leak in.
cat > "$WT/compose.yaml" <<'EOF'
x-shared: &shared
  image: postgres:16
volumes:
  data:
services:
  only:
    image: rabbitmq:3
EOF
rm -f "$WT/docker-compose.yml"
RA2=$(doc_compose "$WT")
[[ "$RA2" == "only rabbitmq:3 rabbitmq" ]] \
  && kq ok "ignores image: outside services (x-anchors, volumes)" \
  || kq no "leaked a non-service image: $RA2"

# ── 3 · service-slice.sh provision ────────────────────────────────────────
echo
echo "-- 3 · provision --"

mkdir -p "$T/bin"
export RIG_DOCKER_LOG="$T/docker.log"
cat > "$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$RIG_DOCKER_LOG"
[[ "$1" == info ]] && { [[ "${RIG_POOL_UP:-1}" == 1 ]] && exit 0 || exit 1; }
if [[ "$1" == ps ]]; then
  for pj in ${RIG_DOCKER_PROJECTS:-}; do
    case " $* " in *"project=$pj"*) echo "c0ffeec0ffee"; exit 0;; esac
  done
  exit 0
fi
exit 0
EOF
chmod +x "$T/bin/docker"
export PATH="$T/bin:$PATH"

# The pool: what the owner maintains on the Settings screen.
cat > "$BEE_ROOT/services/compose.yml" <<'EOF'
services:
  postgres:
    image: postgres:16
  rabbitmq:
    image: rabbitmq:3-management
EOF

LAT="$HERE/../bin/service-slice.sh"

phien_lat() {  # phien_lat <id> <worktree:true|false> <compose-body|"">
  local id="$1" wt="$2" body="$3"
  local sd="$BEE_ROOT/sessions/$id"
  mkdir -p "$sd" "$BEE_ROOT/work/$id"
  jq -cn --arg i "$id" --argjson w "$wt" \
    '{id:$i, slug:"myapp", num:1, repo:"you/myapp", worktree:$w}' > "$sd/session.json"
  [[ -n "$body" ]] && printf '%s\n' "$body" > "$BEE_ROOT/work/$id/docker-compose.yml"
  : > "$sd/run.jsonl"
}

CO_PG=$'services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7\n  blob:\n    image: acme/blob:1'

ID_CHAT=cc000000-0000-4000-8000-00000000000a
ID_PG=cc000000-0000-4000-8000-00000000000b
ID_TRONG=cc000000-0000-4000-8000-00000000000c

phien_lat "$ID_CHAT"  false ""
phien_lat "$ID_PG"    true  "$CO_PG"
phien_lat "$ID_TRONG" true  ""

# A chat session has no worktree and therefore no services. It must not even
# look — a database created for a conversation is pure waste.
: > "$RIG_DOCKER_LOG"
bash "$LAT" provision "$ID_CHAT" >/dev/null 2>&1 && rc=0 || rc=$?
[[ $rc -eq 0 && ! -f "$BEE_ROOT/sessions/$ID_CHAT/services.json" ]] \
  && kq ok "chat session: no-op, no slice file" || kq no "chat session got a slice (rc=$rc)"
[[ ! -s "$RIG_DOCKER_LOG" ]] \
  && kq ok "chat session: docker never called" || kq no "docker called for a chat session"

# A repo with no compose declares no services — same nothing, cheaply.
bash "$LAT" provision "$ID_TRONG" >/dev/null 2>&1 && rc=0 || rc=$?
[[ $rc -eq 0 && ! -f "$BEE_ROOT/sessions/$ID_TRONG/services.json" ]] \
  && kq ok "repo without compose: no-op" || kq no "slice created with no compose (rc=$rc)"

# The real path.
: > "$RIG_DOCKER_LOG"
RIG_POOL_UP=1 bash "$LAT" provision "$ID_PG" >/dev/null 2>&1 && rc=0 || rc=$?
SJ="$BEE_ROOT/sessions/$ID_PG/services.json"
ENVF="$BEE_ROOT/work/$ID_PG/.bee/services.env"

[[ $rc -eq 0 ]] && kq ok "provision succeeded" || kq no "provision failed rc=$rc"
[[ -f "$SJ" ]] && kq ok "sessions/<id>/services.json written" || kq no "no services.json"
[[ "$(stat -c %a "$SJ" 2>/dev/null)" == 600 ]] \
  && kq ok "services.json is 600 — it holds a password" || kq no "services.json mode $(stat -c %a "$SJ" 2>/dev/null)"
[[ "$(stat -c %a "$ENVF" 2>/dev/null)" == 600 ]] \
  && kq ok ".bee/services.env is 600" || kq no "services.env mode $(stat -c %a "$ENVF" 2>/dev/null)"

grep -q "^BEE_DB_URL=postgres://bee_cc000000:" "$ENVF" 2>/dev/null \
  && kq ok "BEE_DB_URL points at the session's own role" \
  || kq no "BEE_DB_URL wrong: $(grep '^BEE_DB_URL=' "$ENVF" 2>/dev/null | sed 's/:[^:]*@/:***@/')"

grep -q "CREATE ROLE bee_cc000000" "$RIG_DOCKER_LOG" \
  && kq ok "role created before the database (it owns it)" || kq no "no CREATE ROLE in docker log"
grep -q "REVOKE CONNECT" "$RIG_DOCKER_LOG" \
  && kq ok "REVOKE CONNECT … FROM PUBLIC — the point of a per-session role" \
  || kq no "database left open to PUBLIC: any session could read it"

# redis is cheap enough to run per session, and acme/blob is unrecognised.
# Neither is in the pool, so neither may reach an admin command.
grep -q "redis\|acme/blob" "$RIG_DOCKER_LOG" \
  && kq no "ran an admin command for a service that is not in the pool" \
  || kq ok "kinds absent from the pool: recorded, never provisioned"
jq -e '[.items[] | select(.in_pool == false)] | length == 2' "$SJ" >/dev/null 2>&1 \
  && kq ok "both non-pool services recorded so the UI can explain them" \
  || kq no "non-pool services not recorded: $(jq -c '[.items[].service]' "$SJ" 2>/dev/null)"

# Continue must not rotate the password: the worktree may still hold the old
# one, and a session that comes back to a database it can no longer open is
# the kind of failure nobody traces back.
MK1=$(jq -r '.items[] | select(.kind=="postgres") | .password' "$SJ")
bash "$LAT" provision "$ID_PG" >/dev/null 2>&1
MK2=$(jq -r '.items[] | select(.kind=="postgres") | .password' "$SJ")
[[ -n "$MK1" && "$MK1" == "$MK2" ]] \
  && kq ok "idempotent: same password on a second provision" \
  || kq no "password rotated on re-provision — a resumed session loses its db"

# Pool down while the repo needs it: refuse LOUDLY at the door instead of
# letting the agent hit connection-refused twenty minutes in.
: > "$RIG_DOCKER_LOG"
ID_CHET=cc000000-0000-4000-8000-00000000000d
phien_lat "$ID_CHET" true "$CO_PG"
RIG_POOL_UP=0 bash "$LAT" provision "$ID_CHET" >"$T/out" 2>&1 && rc=0 || rc=$?
[[ $rc -ne 0 ]] && kq ok "pool down + repo needs it: refuses (rc=$rc)" \
  || kq no "pool down but provision reported success"
grep -qi "pool" "$T/out" \
  && kq ok "and says the pool is why" || kq no "refused without naming the pool: $(head -1 "$T/out")"
[[ ! -f "$BEE_ROOT/sessions/$ID_CHET/services.json" ]] \
  && kq ok "nothing half-written when it refuses" || kq no "left a partial services.json"

# A session id that is not a uuid must die at the door, before any argv.
: > "$RIG_DOCKER_LOG"
bash "$LAT" provision '../../etc/passwd' >/dev/null 2>&1 && rc=0 || rc=$?
[[ $rc -ne 0 && ! -s "$RIG_DOCKER_LOG" ]] \
  && kq ok "dirty session id: rejected at the door, docker untouched" \
  || kq no "dirty id got past the gate (rc=$rc)"

# ── 4 · service-slice.sh reclaim ──────────────────────────────────────────
# This is the dangerous half: it DROPs databases, in a timer, with nobody
# watching. Everything here is about bounding that blast radius.
echo
echo "-- 4 · reclaim --"

: > "$RIG_DOCKER_LOG"
RIG_POOL_UP=1 bash "$LAT" reclaim "$ID_PG" >/dev/null 2>&1 && rc=0 || rc=$?
[[ $rc -eq 0 ]] && kq ok "reclaim succeeded" || kq no "reclaim failed rc=$rc"

grep -q "DROP DATABASE IF EXISTS bee_cc000000" "$RIG_DOCKER_LOG" \
  && kq ok "drops the database" || kq no "database not dropped"
grep -q "DROP ROLE IF EXISTS bee_cc000000" "$RIG_DOCKER_LOG" \
  && kq ok "drops the role too — a role left behind still owns grants" \
  || kq no "role left behind"
[[ "$(grep -n 'DROP DATABASE' "$RIG_DOCKER_LOG" | cut -d: -f1)" -lt \
   "$(grep -n 'DROP ROLE' "$RIG_DOCKER_LOG" | cut -d: -f1)" ]] \
  && kq ok "database before role — postgres refuses to drop an owner" \
  || kq no "wrong order: role dropped while it still owns the database"

# Never touches anything outside the pool services it was told about.
grep -q "redis\|acme/blob" "$RIG_DOCKER_LOG" \
  && kq no "reclaim reached for a service that was never provisioned" \
  || kq ok "leaves non-pool services alone"

[[ ! -f "$BEE_ROOT/sessions/$ID_PG/services.json" ]] \
  && kq ok "slice record removed — nothing claims a slice that is gone" \
  || kq no "services.json survived reclaim"

# Reclaiming twice must be quiet, because gc will run again tomorrow.
bash "$LAT" reclaim "$ID_PG" >/dev/null 2>&1 \
  && kq ok "second reclaim: no-op, no error" || kq no "reclaim is not idempotent"

# THE important one. services.json is a file on disk; if a name in it ever
# reached psql unchecked, a crafted record would run arbitrary SQL as
# superuser in a timer. The name must be re-derived and re-checked, always.
ID_XAU=cc000000-0000-4000-8000-00000000000e
phien_lat "$ID_XAU" true "$CO_PG"
RIG_POOL_UP=1 bash "$LAT" provision "$ID_XAU" >/dev/null 2>&1
jq -c '.slice = "bee_x; DROP DATABASE postgres; --"' \
  "$BEE_ROOT/sessions/$ID_XAU/services.json" > "$T/xau.json"
cp "$T/xau.json" "$BEE_ROOT/sessions/$ID_XAU/services.json"
: > "$RIG_DOCKER_LOG"
bash "$LAT" reclaim "$ID_XAU" >/dev/null 2>&1 || true
grep -q "DROP DATABASE postgres" "$RIG_DOCKER_LOG" \
  && kq no "A TAMPERED services.json REACHED psql — arbitrary SQL as superuser" \
  || kq ok "tampered slice name never reaches psql (name re-derived from uuid)"
grep -q "DROP DATABASE IF EXISTS bee_cc000000" "$RIG_DOCKER_LOG" \
  && kq ok "and it still reclaims the real slice it derived" \
  || kq no "derived name was not used either"

# Pool down: refuse and keep the record, so the next tick can try again.
ID_SAU=cc000000-0000-4000-8000-00000000000f
phien_lat "$ID_SAU" true "$CO_PG"
RIG_POOL_UP=1 bash "$LAT" provision "$ID_SAU" >/dev/null 2>&1
RIG_POOL_UP=0 bash "$LAT" reclaim "$ID_SAU" >/dev/null 2>&1 && rc=0 || rc=$?
[[ $rc -ne 0 && -f "$BEE_ROOT/sessions/$ID_SAU/services.json" ]] \
  && kq ok "pool down: refuses and KEEPS the record for the next tick" \
  || kq no "dropped the record without reclaiming — the slice becomes an orphan (rc=$rc)"

echo
if [[ $FAIL == 0 ]]; then echo "RIG-15: ALL GREEN"; else echo "RIG-15: RED"; exit 1; fi

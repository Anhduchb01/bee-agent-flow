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

echo
if [[ $FAIL == 0 ]]; then echo "RIG-15: ALL GREEN"; else echo "RIG-15: RED"; exit 1; fi

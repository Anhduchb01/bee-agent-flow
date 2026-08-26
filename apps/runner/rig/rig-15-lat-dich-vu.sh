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

echo
if [[ $FAIL == 0 ]]; then echo "RIG-15: ALL GREEN"; else echo "RIG-15: RED"; exit 1; fi

#!/usr/bin/env bash
# service-slice.sh — carve a per-session slice out of the shared service pool,
# and give it back. See docs/specs/service-slices.md.
#
#   service-slice.sh provision <session-id>
#   service-slice.sh reclaim   <session-id>
#
# WHY THIS IS A SCRIPT AND NOT THE AGENT (spec §2): it runs before claude even
# starts, it drives admin-level commands, and gc has to be able to DERIVE the
# same names again later with nobody watching. Any one of those rules out an
# LLM; together it is not close.
#
# THE SAFETY PROPERTY, stated once: every name that reaches a command is
# derived from the session uuid and re-checked against SLICE_RE. Nothing read
# back from services.json is ever trusted straight into an argv. `reclaim`
# drops databases in a timer with no human present — that is the blast radius
# this rule exists to bound.
#
# Admin credentials never leave the pool containers: every privileged command
# runs THROUGH `docker compose exec` inside the service itself, where the
# image's own bootstrap already granted superuser. The host needs no psql, no
# rabbitmqctl, no mc, and no copy of the password.
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"

POOL_PROJECT="${BEE_POOL_PROJECT:-bee-services}"
POOL_DIR="$BEE_ROOT/services"
UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
SLICE_RE='^bee[_-][0-9a-f]{8}$'

err() { printf '%s\n' "$*" >&2; }

# ── The pool ──────────────────────────────────────────────────────────────

pool_alive() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

# pool_exec <service> <cmd...> — run a command inside a pool container.
pool_exec() {
  local svc="$1"; shift
  docker compose -p "$POOL_PROJECT" exec -T "$svc" "$@"
}

# pool_service_for <kind> — which pool service provides this kind, if any.
pool_service_for() {
  local kind="$1" name img k
  while read -r name img k; do
    [[ "$k" == "$kind" ]] && { printf '%s\n' "$name"; return 0; }
  done < <(read_compose "$POOL_DIR")
  return 1
}

random_password() { head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24; }

# ── Provisioning, one function per kind ───────────────────────────────────
# Each is idempotent: a resumed session must land on the SAME slice with the
# SAME password. Rotating it would strand a worktree that still holds the old
# one, and that failure surfaces far from its cause.

provision_postgres() {  # provision_postgres <pool-service> <slice> <password>
  local svc="$1" slice="$2" pw="$3"
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$slice') THEN
        CREATE ROLE $slice LOGIN PASSWORD '$pw';
      END IF;
    END \$\$;"
  # Not inside the DO block: CREATE DATABASE cannot run in a transaction.
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$slice'" | grep -q 1 \
    || pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
         -c "CREATE DATABASE $slice OWNER $slice"
  # The whole point of a per-session role: nobody else may connect.
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "REVOKE CONNECT ON DATABASE $slice FROM PUBLIC"
}

provision_rabbitmq() {  # provision_rabbitmq <pool-service> <slice> <password>
  local svc="$1" slice="$2" pw="$3"
  pool_exec "$svc" rabbitmqctl add_vhost "/$slice" 2>/dev/null || true
  pool_exec "$svc" rabbitmqctl add_user "$slice" "$pw" 2>/dev/null \
    || pool_exec "$svc" rabbitmqctl change_password "$slice" "$pw"
  pool_exec "$svc" rabbitmqctl set_permissions -p "/$slice" "$slice" '.*' '.*' '.*'
}

provision_s3() {  # provision_s3 <pool-service> <slice> <password>
  local svc="$1" slice="$2" pw="$3"
  pool_exec "$svc" mc alias set beelocal http://127.0.0.1:9000 \
    "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin}" >/dev/null
  pool_exec "$svc" mc mb --ignore-existing "beelocal/$slice" >/dev/null
  pool_exec "$svc" mc admin user add beelocal "$slice" "$pw" >/dev/null 2>&1 || true
  pool_exec "$svc" mc admin policy attach beelocal readwrite --user "$slice" >/dev/null 2>&1 || true
}

# ── provision ─────────────────────────────────────────────────────────────

do_provision() {
  local id="$1"
  [[ "$id" =~ $UUID_RE ]] || { err "service-slice: not a session id"; return 2; }

  local uuid8="${id//-/}"; uuid8="${uuid8:0:8}"
  local slice="bee_$uuid8"
  [[ "$slice" =~ $SLICE_RE ]] || { err "service-slice: derived slice name failed its own check"; return 2; }

  local sdir="$BEE_ROOT/sessions/$id" wt="$BEE_ROOT/work/$id"
  [[ -f "$sdir/session.json" ]] || { err "service-slice: no such session"; return 2; }

  # A chat session has no worktree and therefore no services. Do not even
  # look — a database created for a conversation is pure waste.
  [[ "$(jq -r '.worktree // false' "$sdir/session.json")" == "true" ]] || return 0

  local wanted; wanted=$(read_compose "$wt")
  [[ -n "$wanted" ]] || return 0          # repo declares nothing

  # Does anything the repo wants actually live in the pool? Only then does a
  # dead pool block the session.
  local needs_pool="" name img kind svc
  while read -r name img kind; do
    [[ -n "$kind" ]] || continue
    pool_service_for "$kind" >/dev/null 2>&1 && needs_pool=1
  done <<<"$wanted"

  if [[ -n "$needs_pool" ]] && ! pool_alive; then
    err "service-slice: this repo needs a shared service but the pool is not running — start it from /setup, or the session would only fail later"
    return 3
  fi

  # Reuse the password from a previous provision. Idempotency lives here.
  local prev_file="$sdir/services.json" prev=""
  [[ -f "$prev_file" ]] && prev=$(cat "$prev_file")

  local items='[]' env_lines=""
  while read -r name img kind; do
    [[ -n "$name" ]] || continue
    if [[ -z "$kind" ]] || ! svc=$(pool_service_for "$kind"); then
      # Unknown image, or a kind the pool does not carry: the session runs it
      # itself later. Recorded, never provisioned — but recorded is the point,
      # because a silent miss is exactly how guessing-from-image goes wrong.
      items=$(jq -c --arg s "$name" --arg i "$img" --arg k "$kind" \
        '. + [{service:$s, image:$i, kind:$k, in_pool:false}]' <<<"$items")
      continue
    fi

    # Reuse the password a previous provision picked. Idempotency lives here:
    # rotating would strand a worktree that still holds the old one.
    local pw
    pw=$(jq -r --arg k "$kind" '.items[]? | select(.kind==$k) | .password // empty' <<<"${prev:-{\}}" 2>/dev/null || true)
    [[ -n "$pw" ]] || pw=$(random_password)

    case "$kind" in
      postgres) provision_postgres "$svc" "$slice" "$pw"
                env_lines+="BEE_DB_HOST=127.0.0.1"$'\n'
                env_lines+="BEE_DB_NAME=$slice"$'\n'
                env_lines+="BEE_DB_USER=$slice"$'\n'
                env_lines+="BEE_DB_PASS=$pw"$'\n'
                env_lines+="BEE_DB_URL=postgres://$slice:$pw@127.0.0.1/$slice"$'\n';;
      rabbitmq) provision_rabbitmq "$svc" "$slice" "$pw"
                env_lines+="BEE_AMQP_VHOST=/$slice"$'\n'
                env_lines+="BEE_AMQP_USER=$slice"$'\n'
                env_lines+="BEE_AMQP_PASS=$pw"$'\n'
                env_lines+="BEE_AMQP_URL=amqp://$slice:$pw@127.0.0.1/$slice"$'\n';;
      s3)       provision_s3 "$svc" "$slice" "$pw"
                env_lines+="BEE_S3_ENDPOINT=http://127.0.0.1:9000"$'\n'
                env_lines+="BEE_S3_BUCKET=${slice//_/-}"$'\n'
                env_lines+="BEE_S3_KEY=$slice"$'\n'
                env_lines+="BEE_S3_SECRET=$pw"$'\n';;
      *)        items=$(jq -c --arg s "$name" --arg i "$img" --arg k "$kind" \
                  '. + [{service:$s, image:$i, kind:$k, in_pool:false}]' <<<"$items")
                continue;;
    esac

    items=$(jq -c --arg s "$name" --arg i "$img" --arg k "$kind" \
      --arg l "$slice" --arg p "$pw" --arg v "$svc" \
      '. + [{service:$s, image:$i, kind:$k, in_pool:true, pool_service:$v, slice:$l, password:$p}]' <<<"$items")
  done <<<"$wanted"

  # tmp + chmod BEFORE rename: the password must never sit world-readable,
  # not even for the moment between create and chmod.
  local tmp="$sdir/.services.json.tmp"
  jq -n --arg l "$slice" --arg t "$(now_iso)" --argjson i "$items" \
    '{slice:$l, at:$t, items:$i}' > "$tmp"
  chmod 600 "$tmp"; mv "$tmp" "$sdir/services.json"

  if [[ -n "$env_lines" ]]; then
    mkdir -p "$wt/.bee"
    local etmp="$wt/.bee/.services.env.tmp"
    { echo "# Written by bee. Per-session service slice. Do not commit."
      printf '%s' "$env_lines"; } > "$etmp"
    chmod 600 "$etmp"; mv "$etmp" "$wt/.bee/services.env"
    local excl="$wt/.git/info/exclude"
    [[ -f "$wt/.git" ]] && excl="$(git -C "$wt" rev-parse --git-dir 2>/dev/null)/info/exclude"
    if [[ -n "${excl:-}" && -d "$(dirname "$excl")" ]]; then
      grep -qxF "/.bee/services.env" "$excl" 2>/dev/null || echo "/.bee/services.env" >> "$excl"
    fi
  fi
  return 0
}

# ── Reclaiming, one function per kind ─────────────────────────────────────
# The dangerous half. Every name below is DERIVED from the uuid argument and
# re-checked against SLICE_RE — never read back out of services.json. That file
# lives on disk; if a name in it reached psql unchecked, a crafted record
# would run arbitrary SQL as superuser inside a timer. rig-15 tampers with it
# on purpose and asserts nothing escapes.

reclaim_postgres() {  # reclaim_postgres <pool-service> <slice>
  local svc="$1" slice="$2"
  # Database first: postgres refuses to drop a role that still owns one.
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $slice"
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "DROP ROLE IF EXISTS $slice"
}

reclaim_rabbitmq() {  # reclaim_rabbitmq <pool-service> <slice>
  local svc="$1" slice="$2"
  pool_exec "$svc" rabbitmqctl delete_vhost "/$slice" 2>/dev/null || true
  pool_exec "$svc" rabbitmqctl delete_user "$slice" 2>/dev/null || true
}

reclaim_s3() {  # reclaim_s3 <pool-service> <slice>
  local svc="$1" slice="$2"
  pool_exec "$svc" mc alias set beelocal http://127.0.0.1:9000 \
    "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin}" >/dev/null 2>&1 || true
  pool_exec "$svc" mc rb --force "beelocal/${slice//_/-}" >/dev/null 2>&1 || true
  pool_exec "$svc" mc admin user rm beelocal "$slice" >/dev/null 2>&1 || true
}

do_reclaim() {
  local id="$1"
  [[ "$id" =~ $UUID_RE ]] || { err "service-slice: not a session id"; return 2; }

  local uuid8="${id//-/}"; uuid8="${uuid8:0:8}"
  local slice="bee_$uuid8"
  [[ "$slice" =~ $SLICE_RE ]] || { err "service-slice: derived slice name failed its own check"; return 2; }

  # Split, not one `local`: bash declares every name in a `local` statement
  # (unset) before assigning any of them, so `rec="$sdir/..."` on the same
  # line would read an unset sdir and die under `set -u`.
  local sdir="$BEE_ROOT/sessions/$id"
  local rec="$sdir/services.json"
  # Nothing recorded means nothing was ever carved. gc runs again tomorrow,
  # so silence here has to be success, not an error.
  [[ -f "$rec" ]] || return 0

  # Only the KIND is taken from the record, and only to pick which pool
  # service to talk to. The name itself is always the derived one above.
  local kinds
  kinds=$(jq -r '[.items[]? | select(.in_pool == true) | .kind] | unique[]' "$rec" 2>/dev/null || true)
  [[ -n "$kinds" ]] || { rm -f "$rec"; return 0; }

  if ! pool_alive; then
    err "service-slice: pool is not running — keeping the slice record so the next tick can retry"
    return 3
  fi

  local kind svc
  while read -r kind; do
    [[ -n "$kind" ]] || continue
    svc=$(pool_service_for "$kind") || continue
    case "$kind" in
      postgres) reclaim_postgres "$svc" "$slice";;
      rabbitmq) reclaim_rabbitmq "$svc" "$slice";;
      s3)       reclaim_s3 "$svc" "$slice";;
    esac
  done <<<"$kinds"

  rm -f "$rec"
  return 0
}

# do_pool — the pool as JSON, for the web.
#
# The web asks this script rather than re-implementing the image table in
# TypeScript. Two copies of that table would drift, and the drift would show
# up as the UI promising a shared slice that the runner never carved.
do_pool() {
  local out='[]' name img kind
  while read -r name img kind; do
    [[ -n "$name" ]] || continue
    out=$(jq -c --arg s "$name" --arg i "$img" --arg k "$kind" \
      '. + [{service:$s, image:$i, kind:$k}]' <<<"$out")
  done < <(read_compose "$POOL_DIR")
  printf '%s\n' "$out"
}

case "${1:-}" in
  provision) do_provision "${2:-}";;
  reclaim)   do_reclaim   "${2:-}";;
  pool)      do_pool;;
  *) err "usage: service-slice.sh provision|reclaim <session-id> | pool"; exit 2;;
esac

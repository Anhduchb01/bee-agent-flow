#!/usr/bin/env bash
# service-slice.sh — carve a per-session slice out of the shared service pool,
# and give it back. See docs/specs/lat-dich-vu.md.
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
# derived from the session uuid and re-checked against LAT_RE. Nothing read
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
LAT_RE='^bee[_-][0-9a-f]{8}$'

loi() { printf '%s\n' "$*" >&2; }

# ── The pool ──────────────────────────────────────────────────────────────

pool_song() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

# pool_exec <service> <cmd...> — run a command inside a pool container.
pool_exec() {
  local svc="$1"; shift
  docker compose -p "$POOL_PROJECT" exec -T "$svc" "$@"
}

# pool_service_for <kind> — which pool service provides this kind, if any.
pool_service_for() {
  local kind="$1" ten img k
  while read -r ten img k; do
    [[ "$k" == "$kind" ]] && { printf '%s\n' "$ten"; return 0; }
  done < <(doc_compose "$POOL_DIR")
  return 1
}

mat_khau() { head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24; }

# ── Provisioning, one function per kind ───────────────────────────────────
# Each is idempotent: a resumed session must land on the SAME slice with the
# SAME password. Rotating it would strand a worktree that still holds the old
# one, and that failure surfaces far from its cause.

cap_postgres() {  # cap_postgres <pool-service> <slice> <password>
  local svc="$1" lat="$2" mk="$3"
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$lat') THEN
        CREATE ROLE $lat LOGIN PASSWORD '$mk';
      END IF;
    END \$\$;"
  # Not inside the DO block: CREATE DATABASE cannot run in a transaction.
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$lat'" | grep -q 1 \
    || pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
         -c "CREATE DATABASE $lat OWNER $lat"
  # The whole point of a per-session role: nobody else may connect.
  pool_exec "$svc" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "REVOKE CONNECT ON DATABASE $lat FROM PUBLIC"
}

cap_rabbitmq() {  # cap_rabbitmq <pool-service> <slice> <password>
  local svc="$1" lat="$2" mk="$3"
  pool_exec "$svc" rabbitmqctl add_vhost "/$lat" 2>/dev/null || true
  pool_exec "$svc" rabbitmqctl add_user "$lat" "$mk" 2>/dev/null \
    || pool_exec "$svc" rabbitmqctl change_password "$lat" "$mk"
  pool_exec "$svc" rabbitmqctl set_permissions -p "/$lat" "$lat" '.*' '.*' '.*'
}

cap_s3() {  # cap_s3 <pool-service> <slice> <password>
  local svc="$1" lat="$2" mk="$3"
  pool_exec "$svc" mc alias set beelocal http://127.0.0.1:9000 \
    "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin}" >/dev/null
  pool_exec "$svc" mc mb --ignore-existing "beelocal/$lat" >/dev/null
  pool_exec "$svc" mc admin user add beelocal "$lat" "$mk" >/dev/null 2>&1 || true
  pool_exec "$svc" mc admin policy attach beelocal readwrite --user "$lat" >/dev/null 2>&1 || true
}

# ── provision ─────────────────────────────────────────────────────────────

lam_provision() {
  local id="$1"
  [[ "$id" =~ $UUID_RE ]] || { loi "service-slice: not a session id"; return 2; }

  local uuid8="${id//-/}"; uuid8="${uuid8:0:8}"
  local lat="bee_$uuid8"
  [[ "$lat" =~ $LAT_RE ]] || { loi "service-slice: derived slice name failed its own check"; return 2; }

  local sdir="$BEE_ROOT/sessions/$id" wt="$BEE_ROOT/work/$id"
  [[ -f "$sdir/session.json" ]] || { loi "service-slice: no such session"; return 2; }

  # A chat session has no worktree and therefore no services. Do not even
  # look — a database created for a conversation is pure waste.
  [[ "$(jq -r '.worktree // false' "$sdir/session.json")" == "true" ]] || return 0

  local can; can=$(doc_compose "$wt")
  [[ -n "$can" ]] || return 0          # repo declares nothing

  # Does anything the repo wants actually live in the pool? Only then does a
  # dead pool block the session.
  local can_pool="" ten img kind svc
  while read -r ten img kind; do
    [[ -n "$kind" ]] || continue
    pool_service_for "$kind" >/dev/null 2>&1 && can_pool=1
  done <<<"$can"

  if [[ -n "$can_pool" ]] && ! pool_song; then
    loi "service-slice: this repo needs a shared service but the pool is not running — start it from /setup, or the session would only fail later"
    return 3
  fi

  # Reuse the password from a previous provision. Idempotency lives here.
  local truoc="$sdir/services.json" cu=""
  [[ -f "$truoc" ]] && cu=$(cat "$truoc")

  local items='[]' env_lines=""
  while read -r ten img kind; do
    [[ -n "$ten" ]] || continue
    if [[ -z "$kind" ]] || ! svc=$(pool_service_for "$kind"); then
      # Unknown image, or a kind the pool does not carry: the session runs it
      # itself later. Recorded, never provisioned — but recorded is the point,
      # because a silent miss is exactly how guessing-from-image goes wrong.
      items=$(jq -c --arg s "$ten" --arg i "$img" --arg k "$kind" \
        '. + [{service:$s, image:$i, kind:$k, in_pool:false}]' <<<"$items")
      continue
    fi

    local mk
    mk=$(jq -r --arg k "$kind" '.items[]? | select(.kind==$k) | .password // empty' <<<"${cu:-{\}}" 2>/dev/null || true)
    [[ -n "$mk" ]] || mk=$(mat_khau)

    case "$kind" in
      postgres) cap_postgres "$svc" "$lat" "$mk"
                env_lines+="BEE_DB_HOST=127.0.0.1"$'\n'
                env_lines+="BEE_DB_NAME=$lat"$'\n'
                env_lines+="BEE_DB_USER=$lat"$'\n'
                env_lines+="BEE_DB_PASS=$mk"$'\n'
                env_lines+="BEE_DB_URL=postgres://$lat:$mk@127.0.0.1/$lat"$'\n';;
      rabbitmq) cap_rabbitmq "$svc" "$lat" "$mk"
                env_lines+="BEE_AMQP_VHOST=/$lat"$'\n'
                env_lines+="BEE_AMQP_USER=$lat"$'\n'
                env_lines+="BEE_AMQP_PASS=$mk"$'\n'
                env_lines+="BEE_AMQP_URL=amqp://$lat:$mk@127.0.0.1/$lat"$'\n';;
      s3)       cap_s3 "$svc" "$lat" "$mk"
                env_lines+="BEE_S3_ENDPOINT=http://127.0.0.1:9000"$'\n'
                env_lines+="BEE_S3_BUCKET=${lat//_/-}"$'\n'
                env_lines+="BEE_S3_KEY=$lat"$'\n'
                env_lines+="BEE_S3_SECRET=$mk"$'\n';;
      *)        items=$(jq -c --arg s "$ten" --arg i "$img" --arg k "$kind" \
                  '. + [{service:$s, image:$i, kind:$k, in_pool:false}]' <<<"$items")
                continue;;
    esac

    items=$(jq -c --arg s "$ten" --arg i "$img" --arg k "$kind" \
      --arg l "$lat" --arg p "$mk" --arg v "$svc" \
      '. + [{service:$s, image:$i, kind:$k, in_pool:true, pool_service:$v, slice:$l, password:$p}]' <<<"$items")
  done <<<"$can"

  # tmp + chmod BEFORE rename: the password must never sit world-readable,
  # not even for the moment between create and chmod.
  local tmp="$sdir/.services.json.tmp"
  jq -n --arg l "$lat" --arg t "$(now_iso)" --argjson i "$items" \
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

case "${1:-}" in
  provision) lam_provision "${2:-}";;
  *) loi "usage: service-slice.sh provision <session-id>"; exit 2;;
esac

#!/usr/bin/env bash
# config.sh — nạp cấu hình toàn cục và cấu hình từng repo.

# --- mặc định, bị ghi đè bởi /etc/bee/bee.env -----------------------
POLL_INTERVAL=30
MAX_BUILD_SLOTS=3
MAX_EVIDENCE_SLOTS=1
MAX_PER_REPO=2
MAX_TURNS=80
AGENT_TIMEOUT=30m
HEARTBEAT_STALE_S=600
RECENT_KEEP=20

load_global_config() {
  # shellcheck source=/dev/null
  [[ -f "$BEE_ETC/bee.env" ]] && source "$BEE_ETC/bee.env"
  # orch.env chứa GH_TOKEN — chỉ root đọc được, systemd nạp qua EnvironmentFile.
  # Ở đây chỉ source khi chạy tay và có quyền.
  # shellcheck source=/dev/null
  [[ -r "$BEE_ETC/orch.env" ]] && source "$BEE_ETC/orch.env"
  return 0
}

# In ra slug của mọi repo đang bật, mỗi dòng một slug.
enabled_repos() {
  local f slug
  shopt -s nullglob
  for f in "$BEE_ETC/repos.d"/*.env; do
    slug=$(basename "$f" .env)
    ( # subshell để biến của repo này không rò sang repo khác
      ENABLED=1
      # shellcheck source=/dev/null
      source "$f"
      [[ "$ENABLED" == "1" ]] && printf '%s\n' "$slug"
    )
  done
  shopt -u nullglob
}

# Nạp cấu hình một repo vào biến REPO_*. Gọi trong subshell nếu lặp nhiều repo.
load_repo_config() {
  local slug="$1" f="$BEE_ETC/repos.d/$1.env"
  [[ -f "$f" ]] || die "chưa cấu hình repo: $slug"

  ENABLED=1 REPO='' REVIEWERS_PM='' REVIEWERS_TL='' REPO_MAX_WIP=3
  # shellcheck source=/dev/null
  source "$f"

  [[ -n "$REPO" ]] || die "$f: thiếu REPO=org/name"

  REPO_SLUG="$slug"
  REPO_FULL="$REPO"
  REPO_ENABLED="$ENABLED"
  REPO_GIT="$BEE_SRV/repos/$slug.git"
  REPO_PM="$REVIEWERS_PM"
  REPO_TL="$REVIEWERS_TL"
  REPO_WIP_MAX="$REPO_MAX_WIP"
  export REPO_SLUG REPO_FULL REPO_ENABLED REPO_GIT REPO_PM REPO_TL REPO_WIP_MAX
}

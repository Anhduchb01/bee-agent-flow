#!/usr/bin/env bash
# Rule 09 — index lại GitNexus khi main có commit mới.
#
# Đứng cuối cùng: chạy khi rảnh, không chặn ai. GitNexus là trí nhớ DẪN XUẤT —
# sinh lại được hoàn toàn từ code, nên không drift, không poisoning được, sai
# thì index lại. Khác hẳn memory dạng vector store.

RULE_ID="09-reindex"
RULE_POOL="build"
RULE_AGENT=0

rule_scan() {
  local slug="$1" head last
  command -v gitnexus >/dev/null 2>&1 || return 0

  head=$(git --git-dir="$REPO_GIT" rev-parse origin/HEAD 2>/dev/null) || return 0
  last=$(cat "$BEE_SRV/state/$slug.indexed" 2>/dev/null || true)
  [[ "$head" == "$last" ]] && return 0

  printf '0\t0\tindex lại GitNexus (%s)\n' "${head:0:7}"
}

rule_run() {
  local slug="$1" head wt
  head=$(git --git-dir="$REPO_GIT" rev-parse origin/HEAD)

  wt="$BEE_SRV/work/$slug-index"
  rm -rf -- "$wt"
  git --git-dir="$REPO_GIT" worktree add --detach "$wt" "$head" >/dev/null

  ( cd "$wt" && gitnexus analyze . ) || warn "gitnexus analyze thất bại cho $slug"

  git --git-dir="$REPO_GIT" worktree remove --force "$wt" 2>/dev/null || true
  printf '%s' "$head" > "$BEE_SRV/state/$slug.indexed"
}

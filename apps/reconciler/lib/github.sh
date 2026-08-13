#!/usr/bin/env bash
# github.sh — bọc `gh` cho gọn. Mọi hàm ở đây chỉ chạy dưới bee-orch
# (user duy nhất cầm GH_TOKEN). Agent không bao giờ gọi những hàm này.

# Issue đang mở có ĐỦ các label truyền vào.
# gh_issues <repo> <label> [label...]
gh_issues() {
  local repo="$1"; shift
  local args=()
  local l; for l in "$@"; do args+=(--label "$l"); done
  gh issue list --repo "$repo" --state open "${args[@]}" \
     --limit 100 --json number,title,labels 2>/dev/null || echo '[]'
}

# PR đang mở. Một lời gọi cho cả repo — các rule dùng chung kết quả này thay vì
# mỗi rule tự gọi API, vì tick chạy 2.880 lần/ngày và rate limit là 5.000/giờ.
gh_prs() {
  local repo="$1"
  gh pr list --repo "$repo" --state open --limit 100 \
     --json number,title,headRefOid,isDraft,labels,updatedAt,latestReviews 2>/dev/null \
    || echo '[]'
}

# Body của PR — dùng để kiểm tra khối bằng chứng đã khớp SHA hiện tại chưa.
gh_pr_body() {
  gh pr view "$2" --repo "$1" --json body --jq '.body' 2>/dev/null || true
}

# Review comment trên diff có nhắc @claude. Trả về số lượng.
gh_pending_claude_comments() {
  local repo="$1" pr="$2"
  gh api "repos/$repo/pulls/$pr/comments" --paginate \
     --jq '[.[] | select(.body | test("@claude"; "i"))] | length' 2>/dev/null || echo 0
}

# Commit status do chính hệ thống này đẩy lên (context bắt đầu bằng bee/).
gh_status_contexts() {
  local repo="$1" sha="$2"
  gh api "repos/$repo/commits/$sha/statuses" \
     --jq '[.[] | select(.context | startswith("bee/")) | .context] | unique | .[]' \
     2>/dev/null || true
}

gh_set_status() {
  local repo="$1" sha="$2" state="$3" context="$4" desc="${5:-}" url="${6:-}"
  gh api "repos/$repo/statuses/$sha" -X POST \
     -f state="$state" -f context="$context" \
     -f description="${desc:0:139}" ${url:+-f target_url="$url"} >/dev/null
}

gh_add_label()    { gh issue edit "$2" --repo "$1" --add-label "$3" >/dev/null 2>&1 || true; }
gh_remove_label() { gh issue edit "$2" --repo "$1" --remove-label "$3" >/dev/null 2>&1 || true; }
gh_comment()      { gh issue comment "$2" --repo "$1" --body "$3" >/dev/null 2>&1 || true; }

# Số PR đang mở do agent tạo — dùng cho trần WIP.
gh_open_agent_prs() {
  gh pr list --repo "$1" --state open --label "agent:built" --limit 100 \
     --json number --jq 'length' 2>/dev/null || echo 0
}

# Kill switch phía repo: file .agent/PAUSE trên nhánh mặc định.
# Đọc từ bare clone local nên không tốn lượt gọi API.
repo_paused() {
  local git_dir="$1"
  [[ -d "$git_dir" ]] || return 1
  git --git-dir="$git_dir" cat-file -e "origin/HEAD:.agent/PAUSE" 2>/dev/null
}

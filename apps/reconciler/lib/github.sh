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

# Mọi comment nhắc @claude trên một PR, gộp từ BA nguồn của GitHub. In ra một
# mảng JSON, sắp theo thời gian.
#
# GitHub để comment của một PR ở ba chỗ khác nhau, và trước đây rule 02 chỉ đọc
# chỗ đầu tiên:
#
#   /pulls/N/comments   comment gắn vào một dòng trong diff
#   /issues/N/comments  comment thường trong tab Conversation  ← BỎ SÓT
#   /pulls/N/reviews    lời tổng kết khi bấm Approve / Request changes  ← BỎ SÓT
#
# Techlead gõ "@claude sửa lại chỗ này" vào ô cuối trang là chuyện bình thường
# nhất trên đời, và bee im lặng không phản ứng. Không có lỗi nào, không có log
# nào — chỉ có một người ngồi đợi.
#
# `unique_by(.url)` không phải vì ba nguồn chồng nhau (chúng rời nhau), mà vì
# `--paginate` có thể trả trùng khi ai đó comment giữa lúc lật trang, và vì nguồn
# thứ tư sẽ được thêm vào một ngày nào đó.
#
# Lọc bỏ comment của CHÍNH BEE là chốt chống lặp thật sự: mọi comment bee đăng
# đều mang `<!-- agent-run -->`, và bee thì trích lại nguyên văn yêu cầu của
# người dùng — nghĩa là trích lại cả chữ "@claude". Thiếu dòng lọc này thì bee
# tự trả lời chính nó cho tới khi hết hạn mức.
gh_claude_comments() {
  local repo="$1" pr="$2"
  {
    gh api "repos/$repo/pulls/$pr/comments" --paginate --jq \
      '.[] | {url:.html_url, at:.created_at, who:.user.login,
              path:.path, line:(.line // .original_line // 0), body:.body}' 2>/dev/null || true
    gh api "repos/$repo/issues/$pr/comments" --paginate --jq \
      '.[] | {url:.html_url, at:.created_at, who:.user.login,
              path:null, line:0, body:.body}' 2>/dev/null || true
    gh api "repos/$repo/pulls/$pr/reviews" --paginate --jq \
      '.[] | select(.body != "" and .body != null)
       | {url:.html_url, at:.submitted_at, who:.user.login,
          path:null, line:0, body:.body}' 2>/dev/null || true
  } | gh_claude_merge
}

# Phần lọc, tách riêng để test được mà không cần token: đọc từng dòng JSON ở
# stdin, in ra một mảng.
gh_claude_merge() {
  jq -sc '
      map(select(.body | test("@claude"; "i")))
    | map(select(.body | test("<!-- agent-run -->") | not))
    | unique_by(.url) | sort_by(.at)'
}

# Vân tay của TẬP comment, không phải số đếm.
#
# Mốc cũ đếm số comment, và đếm thì không phân biệt được "vẫn ba comment cũ" với
# "xoá một, thêm một". TL sửa lại yêu cầu mà giữ nguyên số lượng thì bee bỏ qua
# vĩnh viễn — im lặng, không dấu vết.
gh_claude_fingerprint() {
  jq -r '[.[].url] | sort | join("\n")' <<<"$1" | sha1sum | cut -c1-12
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

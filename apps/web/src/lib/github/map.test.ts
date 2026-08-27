/**
 * Ánh xạ response GitHub → `types.ts`, kiểm bằng **payload thật**.
 *
 * `__real__/github-api.json` tải thẳng từ api.github.com và không sửa một
 * trường nào. Đó là toàn bộ giá trị của bài test này: một object viết tay chỉ
 * chứng minh code khớp với TRÍ NHỚ của người viết nó, mà trí nhớ là thứ vừa sai
 * ở tám trong chín lỗi của reconciler.
 */
import { describe, expect, it } from "vitest";

import that from "./__real__/github-api.json";
import {
  issueOfPr,
  isPullRequest,
  mapChecks,
  mapComment,
  mapLabels,
  mapPull,
  mapReviews,
  mapTask,
  mapUser,
  type ApiIssue,
  type ApiPull,
} from "./map";

const issue = that.issue as ApiIssue;
const prAsIssue = that.issue_that_is_actually_a_pr as ApiIssue;
const pull = that.pull as unknown as ApiPull;

describe("payload thật", () => {
  /*
   * Cái bẫy kinh điển của `GET /issues`: nó trả về CẢ pull request. Không lọc
   * thì mỗi PR hiện thêm một lần như một task riêng và bảng việc dài gấp đôi.
   * Dòng dưới chứng minh cái bẫy có thật, không phải tôi nhớ nhầm.
   */
  it("danh sách issue thật có lẫn pull request", () => {
    expect(isPullRequest(issue)).toBe(false);
    expect(isPullRequest(prAsIssue)).toBe(true);
  });

  it("issue thật ánh xạ đủ trường màn hình cần", () => {
    const t = mapTask("cli", issue, null);
    expect(t.number).toBe(issue.number);
    expect(t.title).toBe(issue.title);
    expect(t.url).toMatch(/^https:\/\/github\.com\//);
    expect(t.state).toBe("open");
    expect(t.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(t.author.login.length).toBeGreaterThan(0);
  });

  /*
   * Payload issue/PR KHÔNG mang tên thật của người dùng — chỉ `login` và
   * `avatar_url`. Fixture thì ai cũng có tên đẹp, nên khác biệt này phải hiện ra
   * ở đây; nếu không nó sẽ hiện ra dưới dạng một cột "Tên" trống trên màn hình.
   */
  it("người dùng thật không có trường `name`", () => {
    expect(issue.user).toBeDefined();
    expect("name" in (issue.user as object)).toBe(false);
    expect(mapUser(issue.user).name).toBe(issue.user?.login);
  });

  it("nhãn lạ của repo bị bỏ, không ép sang GhLabel", () => {
    // cli/cli dùng `needs-triage`, `bug`… — không nhãn nào thuộc bộ của bee.
    expect(mapLabels(issue.labels)).toEqual([]);
    expect(mapLabels([{ name: "needs-human" }, { name: "bug" }])).toEqual(["needs-human"]);
  });

  it("pull request thật", () => {
    const p = mapPull(pull, [], []);
    expect(p.number).toBe(pull.number);
    expect(p.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof p.draft).toBe("boolean");
  });

  it("review thật giữ đúng ba trạng thái", () => {
    const rs = mapReviews(that.reviews);
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]).toContain(r.state);
  });

  // PENDING là review đang soạn dở và CHƯA gửi. Hiện nó lên là hiện một chữ ký
  // chưa được ký.
  it("bỏ review PENDING và DISMISSED", () => {
    expect(mapReviews([{ state: "PENDING", user: { login: "a" } }])).toEqual([]);
    expect(mapReviews([{ state: "DISMISSED", user: { login: "a" } }])).toEqual([]);
  });

  /*
   * Commit status và check-run là HAI API tách rời với hai hình dạng khác nhau.
   * bee đẩy `bee/test` vào cái thứ nhất; GitHub Actions ghi vào cái thứ hai.
   * Đọc một cái thì hoặc mất hết cổng của bee, hoặc mất hết CI của repo.
   */
  it("gộp cả commit status lẫn check-run", () => {
    const checks = mapChecks(that.commit_status_with_statuses, that.check_runs);
    const name = checks.map((c) => c.name);
    expect(name).toContain(that.commit_status_with_statuses.statuses[0].context);
    expect(name).toContain(that.check_runs.check_runs[0].name);
    expect(checks.length).toBe(
      that.commit_status_with_statuses.statuses.length + that.check_runs.check_runs.length,
    );
  });

  it("commit không có status nào thì không bịa ra check nào", () => {
    expect(mapChecks(that.commit_status, { check_runs: [] })).toEqual([]);
  });

  // Đang chạy thì chưa có kết luận. Cho nó màu xám là nói rằng CI đã xong.
  it("check-run chưa xong là pending, không phải neutral", () => {
    expect(
      mapChecks(null, { check_runs: [{ name: "e2e", status: "in_progress", conclusion: null }] }),
    ).toEqual([{ name: "e2e", conclusion: "pending" }]);
  });

  it("API hỏng hoặc trả null thì không làm đổ trang", () => {
    expect(mapChecks(null, null)).toEqual([]);
    expect(mapReviews(null)).toEqual([]);
  });
});

describe("issueOfPr", () => {
  // Câu bee luôn viết khi mở PR — xem `worktree_push_and_report`.
  it("đọc được `Closes #4` của bee", () => {
    expect(issueOfPr("Closes #4\n\n<!-- evidence:start -->")).toBe(4);
  });

  it("đọc được các biến thể từ khoá của GitHub", () => {
    expect(issueOfPr("fixes #12")).toBe(12);
    expect(issueOfPr("Resolved: #7")).toBe(7);
    expect(issueOfPr("FIX #9")).toBe(9);
  });

  // "#4" trần trụi trong câu văn là một tham chiếu, không phải một lời hứa
  // đóng issue. Nhận nhầm là gắn PR vào một task nó không làm.
  it("không nhận nhầm tham chiếu thường", () => {
    expect(issueOfPr("giống #4 nhưng khác chỗ")).toBeNull();
    expect(issueOfPr("closes the gap in #4")).toBeNull();
    expect(issueOfPr(null)).toBeNull();
    expect(issueOfPr(undefined)).toBeNull();
  });

  it("nhiều issue thì lấy cái đầu tiên", () => {
    expect(issueOfPr("Closes #3, closes #8")).toBe(3);
  });
});

describe("mapComment", () => {
  it("nhận ra comment của agent qua dấu HTML", () => {
    expect(mapComment({ id: 1, body: "<!-- agent-run -->\n🤖 xong" }, "issue").from_agent).toBe(
      true,
    );
    expect(mapComment({ id: 2, body: "trông ổn đấy" }, "issue").from_agent).toBe(false);
  });

  it("body null không làm đổ", () => {
    expect(mapComment({ id: 3, body: null }, "review").body).toBe("");
  });
});

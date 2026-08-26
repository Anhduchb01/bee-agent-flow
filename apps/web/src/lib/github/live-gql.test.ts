/**
 * Đường đọc GraphQL, kiểm trên payload THẬT.
 *
 * Vì sao đổi từ REST sang GraphQL: bản REST tốn `2 + 3 × số PR đang mở` lời gọi
 * cho một màn hình. Repo 20 PR là 62 lời gọi mỗi lần tải trang, trên hạn mức
 * 5.000/giờ. Truy vấn này tốn 1 điểm trong hạn mức 5.000 điểm/giờ.
 *
 * Bài đếm lời gọi ở cuối file là bài giữ điều đó khỏi trôi ngược.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import that from "./__real__/github-graphql.json";
import { mapGqlChecks, mapGqlPull, mapGqlReviews, mapGqlTask, type GqlIssue } from "./map";

const REPOS = [{ slug: "cli", full: "cli/cli" }];

vi.mock("@/lib/auth/token", () => ({
  getActorWithToken: vi.fn(async () => ({
    login: "ai-do", name: "Ai Đó", avatar_url: "", role: "tl" as const, token: "gho_gia",
  })),
}));
vi.mock("./repos-store", async (goc) => ({
  ...(await goc<typeof import("./repos-store")>()),
  readRepos: vi.fn(async () => REPOS),
  writeRepos: vi.fn(async () => {}),
}));

const ISSUES = that.repository.issues.nodes as GqlIssue[];
const PULLS = that.repository.pullRequests.nodes;

/** Thân GraphQL thật bọc trong `data` — đó là hình dạng api.github.com trả về. */
function dungFetch(data: unknown) {
  return dungThan({ data });
}

/** Thân thô, để dựng đúng trường hợp "HTTP 200 mà lỗi nằm trong thân". */
function dungThan(body: unknown) {
  // Nhận `url` để bài đếm lời gọi kiểm được nó gọi tới đâu.
  return vi.fn(async (url: unknown) => {
    void url;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => body,
    } as unknown as Response;
  });
}

async function nguon() {
  const { createLiveGithubSource } = await import("./live");
  return createLiveGithubSource();
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("ánh xạ payload GraphQL thật", () => {
  it("issue thật ra đủ trường màn hình cần", () => {
    const t = mapGqlTask("cli", ISSUES[0], null);
    expect(t.number).toBe(ISSUES[0].number);
    expect(t.title).toBe(ISSUES[0].title);
    expect(t.author.login.length).toBeGreaterThan(0);
    expect(t.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(t.state).toBe("open");
  });

  /*
   * GraphQL viết HOA: "CLOSED". So với "closed" thường như bản REST thì mọi
   * issue đã đóng đọc ra "open" — và bảng việc dài gấp đôi bằng những thứ đã
   * xong, không có lỗi nào để lần theo.
   */
  it("state viết hoa được hiểu đúng", () => {
    expect(mapGqlTask("cli", { ...ISSUES[0], state: "CLOSED" }, null).state).toBe("closed");
    expect(mapGqlTask("cli", { ...ISSUES[0], state: "OPEN" }, null).state).toBe("open");
  });

  it("tài khoản đã xoá (author null) không làm đổ trang", () => {
    expect(mapGqlTask("cli", { ...ISSUES[0], author: null }, null).author.login).toBe("unknown");
  });

  it("PR thật ra draft, sha, và check", () => {
    const p = mapGqlPull(PULLS[0]);
    expect(p.number).toBe(PULLS[0].number);
    expect(p.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof p.draft).toBe("boolean");
    expect(p.checks.length).toBeGreaterThan(0);
  });

  // CheckRun thật của GitHub Actions: conclusion VIẾT HOA.
  it("CheckRun đang chạy là pending, không phải neutral", () => {
    expect(
      mapGqlChecks({
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  nodes: [{ __typename: "CheckRun", name: "e2e", status: "IN_PROGRESS", conclusion: null }],
                },
              },
            },
          },
        ],
      }),
    ).toEqual([{ name: "e2e", conclusion: "pending" }]);
  });

  /*
   * ⚠ Nhánh DUY NHẤT chưa đối chiếu payload thật: không repo công khai nào tôi
   * tìm được còn dùng commit status. Nhưng đây chính là chỗ bee đẩy `bee/test`
   * và `bee/approvals`, và cũng chính là chỗ bản REST từng sai.
   */
  it("StatusContext — chỗ bee đẩy bee/test", () => {
    expect(
      mapGqlChecks({
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  nodes: [
                    { __typename: "StatusContext", context: "bee/test", state: "SUCCESS" },
                    { __typename: "StatusContext", context: "bee/approvals", state: "PENDING" },
                    { __typename: "StatusContext", context: "khac", state: "ERROR" },
                  ],
                },
              },
            },
          },
        ],
      }),
    ).toEqual([
      { name: "bee/test", conclusion: "success" },
      { name: "bee/approvals", conclusion: "pending" },
      { name: "khac", conclusion: "failure" },
    ]);
  });

  it("PR chưa có check nào thì rỗng, không ném", () => {
    expect(mapGqlChecks({ nodes: [{ commit: { statusCheckRollup: null } }] })).toEqual([]);
    expect(mapGqlChecks(undefined)).toEqual([]);
  });

  it("bỏ review PENDING và DISMISSED", () => {
    expect(
      mapGqlReviews({
        nodes: [
          { state: "PENDING", author: { login: "a" } },
          { state: "DISMISSED", author: { login: "b" } },
          { state: "APPROVED", author: { login: "c" }, submittedAt: "2026-08-15T00:00:00Z" },
        ],
      }),
    ).toEqual([
      {
        author: { login: "c", name: "c", avatar_url: "" },
        state: "APPROVED",
        submitted_at: "2026-08-15T00:00:00Z",
      },
    ]);
  });
});

describe("số lời gọi mạng", () => {
  /*
   * Đây là lý do tồn tại của cả lần đổi này. Bản REST gọi `2 + 3N`; bài test
   * này đỏ ngay nếu ai đó thêm lại một lời gọi cho mỗi PR.
   */
  it("một màn hình = MỘT lời gọi cho mỗi repo, bất kể bao nhiêu PR", async () => {
    const f = dungFetch(that);
    vi.stubGlobal("fetch", f);
    await (await nguon()).listTasks();
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0] ?? "")).toContain("/graphql");
  });

  it("issues của GraphQL không lẫn PR, nên không cần lọc", async () => {
    vi.stubGlobal("fetch", dungFetch(that));
    const ds = await (await nguon()).listTasks();
    const soIssue = ISSUES.length;
    // Task = mọi issue, cộng PR mồ côi không tham chiếu issue nào.
    expect(ds.length).toBeGreaterThanOrEqual(soIssue);
    expect(new Set(ds.map((t) => t.number)).size).toBe(ds.length);
  });

  it("repo không đọc được thì rỗng, không ném", async () => {
    vi.stubGlobal("fetch", dungFetch({ repository: null }));
    expect(await (await nguon()).listTasks()).toEqual([]);
  });

  /*
   * Thiếu token là lỗi CẤU HÌNH (OAuth app thiếu scope `repo`, hoặc phiên cũ
   * chưa mang access_token). Trả danh sách rỗng thì nó đội lốt "chưa có task
   * nào" và người dùng đi tìm nhầm chỗ.
   */
  it("thiếu token thì NÉM, không trả rỗng", async () => {
    const { getActorWithToken } = await import("@/lib/auth/token");
    vi.mocked(getActorWithToken).mockResolvedValueOnce({
      login: "x", name: "x", avatar_url: "", role: "pm", token: undefined,
    });
    vi.stubGlobal("fetch", dungFetch(that));
    await expect((await nguon()).listTasks()).rejects.toThrow(/token/i);
  });

  /*
   * GraphQL báo lỗi trong THÂN với HTTP 200. Đọc `res.ok` rồi tin là ra
   * `data: null` và một danh sách rỗng — repo trông như không có gì.
   */
  it("lỗi nằm trong thân với HTTP 200 vẫn phải nổ", async () => {
    vi.stubGlobal(
      "fetch",
      dungThan({ errors: [{ message: "Could not resolve to a Repository", type: "NOT_FOUND" }] }),
    );
    await expect((await nguon()).listTasks()).rejects.toThrow(/NOT_FOUND|resolve/i);
  });
});

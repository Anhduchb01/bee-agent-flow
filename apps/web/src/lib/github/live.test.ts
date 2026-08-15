/**
 * Đường ĐỌC của `GITHUB_SOURCE=live`, chạy trên payload thật.
 *
 * Bài này sinh ra từ một lỗi thật: chat tạo được issue #8 (reconciler nhặt được
 * nó ngay tick sau, nên nó có thật trên GitHub), mà trang task lại 404 — tức là
 * `getTask` trả `null` một cách sạch sẽ, không lỗi, không log.
 *
 * `fetch` bị chặn ở đây thay vì gọi thật: bài test không được phụ thuộc vào
 * mạng, vào token của ai, hay vào việc repo đó còn tồn tại.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import that from "./__real__/github-api.json";

const REPOS = [{ slug: "lifebook-assessment", full: "Anhduchb01/lifebook-assessment" }];

vi.mock("@/lib/auth/token", () => ({
  getActorWithToken: vi.fn(async () => ({
    login: "Anhduchb01",
    name: "Duc",
    avatar_url: "",
    role: "tl" as const,
    token: "gho_gia",
  })),
}));

vi.mock("./repos-store", async (goc) => ({
  ...(await goc<typeof import("./repos-store")>()),
  docRepos: vi.fn(async () => REPOS),
  ghiRepos: vi.fn(async () => {}),
}));

/**
 * Issue thật, đổi số và tiêu đề cho khớp cảnh đang dựng lại.
 *
 * KHÔNG được đặt `pull_request: undefined` để "cho rõ ràng": `"pull_request" in
 * obj` trả về TRUE cho một khoá gán undefined, nên issue đó sẽ bị lọc mất và
 * bài test đổ vì lỗi của chính nó. Payload thật thì vắng hẳn khoá ấy.
 */
function issue(number: number, title: string) {
  const x = { ...that.issue, number, title } as Record<string, unknown>;
  delete x.pull_request;
  return x;
}

function dungFetch(issues: unknown[], pulls: unknown[] = []) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    const body = u.includes("/issues?")
      ? issues
      : u.includes("/pulls?")
        ? pulls
        : u.includes("/status")
          ? that.commit_status
          : u.includes("/check-runs")
            ? that.check_runs
            : [];
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

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTask trên dữ liệu thật", () => {
  it("tìm được issue vừa tạo", async () => {
    vi.stubGlobal("fetch", dungFetch([issue(8, "Thêm trang Chính sách & Điều khoản")]));
    const t = await (await nguon()).getTask("lifebook-assessment", 8);
    expect(t).not.toBeNull();
    expect(t?.number).toBe(8);
    expect(t?.slug).toBe("lifebook-assessment");
  });

  // `GET /issues` trả về CẢ pull request — cái bẫy kinh điển của endpoint này.
  it("lọc pull request ra khỏi danh sách task", async () => {
    vi.stubGlobal(
      "fetch",
      dungFetch([issue(8, "task thật"), { ...that.issue_that_is_actually_a_pr, number: 9 }]),
    );
    const src = await nguon();
    expect(await src.getTask("lifebook-assessment", 8)).not.toBeNull();
    expect(await src.getTask("lifebook-assessment", 9)).toBeNull();
  });

  it("số không có thật thì trả null, không ném", async () => {
    vi.stubGlobal("fetch", dungFetch([issue(8, "task thật")]));
    expect(await (await nguon()).getTask("lifebook-assessment", 999)).toBeNull();
  });

  // Repo không nằm trong danh sách của app thì mọi task của nó cũng không —
  // và đó là một trong ba khả năng của lỗi 404 đang điều tra.
  it("slug lệch thì không khớp", async () => {
    vi.stubGlobal("fetch", dungFetch([issue(8, "task thật")]));
    expect(await (await nguon()).getTask("lifebook", 8)).toBeNull();
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
    vi.stubGlobal("fetch", dungFetch([issue(8, "task thật")]));
    await expect((await nguon()).getTask("lifebook-assessment", 8)).rejects.toThrow(/token/i);
  });
});

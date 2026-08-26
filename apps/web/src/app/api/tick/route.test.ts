import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchClaudeAccountUsage, harvestClaudeUsage } from "@/lib/bee/machine-ctl";

import { POST } from "./route";

vi.mock("@/lib/bee/machine-ctl", () => ({
  fetchClaudeAccountUsage: vi.fn(async () => ({ ok: true })),
  harvestClaudeUsage: vi.fn(async () => ({ ok: true })),
}));
// Hàng đợi có test riêng (queue-run.test); ở đây chỉ cần biết tick CÓ gọi nó
// và trả lý do ra ngoài, không nuốt.
vi.mock("@/lib/bee/queue-fs", () => ({
  docHangDoi: vi.fn(async () => ({ items: [], paused: false })),
  ghiHangDoi: vi.fn(async () => {}),
}));
vi.mock("@/lib/bee/session-ctl", () => ({ moPhien: vi.fn() }));
vi.mock("@/lib/bee", () => ({ getBee: () => ({ listSessions: async () => [] }) }));

const TOKEN = "a".repeat(32);

function goi(token?: string): Promise<Response> {
  return POST(
    new Request("http://127.0.0.1:3210/api/tick", {
      method: "POST",
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    }),
  );
}

describe("POST /api/tick — the timer's only way in", () => {
  beforeEach(() => {
    process.env.BEE_TICK_TOKEN = TOKEN;
    vi.mocked(fetchClaudeAccountUsage).mockClear();
    vi.mocked(harvestClaudeUsage).mockClear();
  });
  afterEach(() => {
    delete process.env.BEE_TICK_TOKEN;
  });

  it("refreshes the account quota when the token matches", async () => {
    const res = await goi(TOKEN);
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchClaudeAccountUsage)).toHaveBeenCalled();
    expect(vi.mocked(harvestClaudeUsage)).toHaveBeenCalled();
  });

  it("no token on the request → 401, and nothing runs", async () => {
    const res = await goi();
    expect(res.status).toBe(401);
    expect(vi.mocked(fetchClaudeAccountUsage)).not.toHaveBeenCalled();
  });

  it("wrong token → 401", async () => {
    expect((await goi("b".repeat(32))).status).toBe(401);
    expect(vi.mocked(fetchClaudeAccountUsage)).not.toHaveBeenCalled();
  });

  it("a token of the wrong LENGTH is refused too (no early-exit leak)", async () => {
    expect((await goi("a")).status).toBe(401);
  });

  it("BEE_TICK_TOKEN unset → 503, never runs open to anyone", async () => {
    delete process.env.BEE_TICK_TOKEN;
    const res = await goi(TOKEN);
    expect(res.status).toBe(503);
    expect(vi.mocked(fetchClaudeAccountUsage)).not.toHaveBeenCalled();
  });

  it("a failing quota refresh is reported, not swallowed — and the tick still answers", async () => {
    vi.mocked(fetchClaudeAccountUsage).mockResolvedValueOnce({
      ok: false,
      message: "usage endpoint 401",
    });
    const res = await goi(TOKEN);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      quota: { ok: false, message: expect.stringContaining("401") },
    });
  });
});

describe("POST /api/tick — nhịp hàng đợi", () => {
  beforeEach(() => {
    process.env.BEE_TICK_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.BEE_TICK_TOKEN;
  });

  it("hàng rỗng: trả lý do đọc được, không đụng gì thêm", async () => {
    const res = await goi(TOKEN);
    await expect(res.json()).resolves.toMatchObject({
      queue: { opened: null, reason: expect.stringMatching(/queue is empty/) },
    });
  });

  it("refresh hạn mức chạy TRƯỚC hàng đợi — phanh phải đọc số vừa lấy", async () => {
    const { docHangDoi } = await import("@/lib/bee/queue-fs");
    const thuTu: string[] = [];
    vi.mocked(fetchClaudeAccountUsage).mockImplementationOnce(async () => {
      thuTu.push("quota");
      return { ok: true };
    });
    vi.mocked(docHangDoi).mockImplementationOnce(async () => {
      thuTu.push("queue");
      return { items: [], paused: false };
    });

    await goi(TOKEN);
    expect(thuTu).toEqual(["quota", "queue"]);
  });
});

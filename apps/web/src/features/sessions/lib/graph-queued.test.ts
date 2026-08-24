import { describe, expect, it } from "vitest";

import type { HangDoi } from "@/lib/bee/types";

import { dungDoThi } from "./build-graph";

const HANG = (status: "waiting" | "running" = "waiting"): HangDoi => ({
  paused: false,
  items: [{
    slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default",
    status, sessionId: null, reason: null, added_at: "2026-08-24T15:00:00Z",
  }],
});

describe("canvas — issue đã xếp hàng mà CHƯA chạy cũng phải thấy được (D5)", () => {
  it("mọc một node chờ, nhãn nói rõ đây là dự định chứ chưa xảy ra", () => {
    const { nodes } = dungDoThi([{ repo: "you/myapp", phien: [] }], {}, {}, {}, HANG());
    const cho = nodes.find((n) => n.type === "cho-chay");
    expect(cho).toBeDefined();
    expect(JSON.stringify(cho?.data)).toMatch(/41/);
    expect(JSON.stringify(cho?.data)).toMatch(/chờ|queued/i);
  });

  it("node chờ nằm trong đúng group của repo, không trôi ra ngoài", () => {
    const { nodes } = dungDoThi([{ repo: "you/myapp", phien: [] }], {}, {}, {}, HANG());
    expect(nodes.find((n) => n.type === "cho-chay")?.parentId).toBe("group-you/myapp");
  });

  it("việc đã chạy KHÔNG mọc node chờ — phiên thật thay chỗ nó", () => {
    const { nodes } = dungDoThi([{ repo: "you/myapp", phien: [] }], {}, {}, {}, HANG("running"));
    expect(nodes.some((n) => n.type === "cho-chay")).toBe(false);
  });

  it("repo không có trong hàng đợi thì canvas y như cũ", () => {
    const truoc = dungDoThi([{ repo: "you/blog", phien: [] }], {}, {}, {});
    const sau = dungDoThi([{ repo: "you/blog", phien: [] }], {}, {}, {}, HANG());
    expect(sau.nodes.length).toBe(truoc.nodes.length);
  });
});

import { describe, expect, it } from "vitest";

import type { Queue } from "@/lib/bee/types";

import { buildGraph } from "./build-graph";

const HANG = (status: "waiting" | "running" = "waiting"): Queue => ({
  paused: false,
  items: [{
    slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default",
    status, sessionId: null, reason: null, added_at: "2026-08-24T15:00:00Z",
  }],
});

describe("canvas — issue đã xếp hàng mà CHƯA chạy cũng phải thấy được (D5)", () => {
  it("mọc một node chờ, nhãn nói rõ đây là dự định chứ chưa xảy ra", () => {
    const { nodes } = buildGraph([{ repo: "you/myapp", session: [] }], {}, {}, {}, HANG());
    const waitFor = nodes.find((n) => n.type === "queued");
    expect(waitFor).toBeDefined();
    expect(JSON.stringify(waitFor?.data)).toMatch(/41/);
    expect(JSON.stringify(waitFor?.data)).toMatch(/chờ|queued/i);
  });

  it("node chờ nằm trong đúng group của repo, không trôi ra ngoài", () => {
    const { nodes } = buildGraph([{ repo: "you/myapp", session: [] }], {}, {}, {}, HANG());
    expect(nodes.find((n) => n.type === "queued")?.parentId).toBe("group-you/myapp");
  });

  it("việc đã chạy KHÔNG mọc node chờ — phiên thật thay chỗ nó", () => {
    const { nodes } = buildGraph([{ repo: "you/myapp", session: [] }], {}, {}, {}, HANG("running"));
    expect(nodes.some((n) => n.type === "queued")).toBe(false);
  });

  it("repo không có trong hàng đợi thì canvas y như cũ", () => {
    const prev = buildGraph([{ repo: "you/blog", session: [] }], {}, {}, {});
    const next = buildGraph([{ repo: "you/blog", session: [] }], {}, {}, {}, HANG());
    expect(next.nodes.length).toBe(prev.nodes.length);
  });
});

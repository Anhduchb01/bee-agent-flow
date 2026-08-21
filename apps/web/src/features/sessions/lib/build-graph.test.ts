import { describe, expect, it } from "vitest";

import type { BeeSession } from "@/lib/bee/types";

import { dungDoThi } from "./build-graph";

function phien(id: string, slug: string, num: number, repo: string): BeeSession {
  return {
    id, slug, num, repo,
    title: null, phase: "work", worktree: true, status: "running",
    created_at: null, started_at: null, ended_at: null,
    attempt: 0, needs_human: false,
  };
}

const A = "aaaaaaaa-1111-4222-8333-444444444444";
const B = "bbbbbbbb-1111-4222-8333-444444444444";

describe("dungDoThi", () => {
  it("mỗi repo một cột, artifact nối edge về đúng phiên đẻ ra nó", () => {
    const { nodes, edges } = dungDoThi(
      [
        { repo: "you/myapp", phien: [phien(A, "myapp", 41, "you/myapp")] },
        { repo: "you/blog", phien: [phien(B, "blog", 7, "you/blog")] },
      ],
      {
        [A]: [
          { kind: "issue", url: "https://github.com/you/myapp/issues/41", number: 41, ts: null, title: null },
          { kind: "pr", url: "https://github.com/you/myapp/pull/123", number: 123, ts: null, title: null },
        ],
      },
    );

    // 2 nhãn repo + 2 phiên + 2 artifact
    expect(nodes).toHaveLength(6);

    // Hai cột khác x; artifact dạt phải phiên của nó
    const nodeA = nodes.find((n) => n.id === A);
    const nodeB = nodes.find((n) => n.id === B);
    expect(nodeA?.position.x).not.toBe(nodeB?.position.x);
    const artifactPr = nodes.find((n) => n.id === `${A}-pr-123`);
    expect(artifactPr?.position.x).toBeGreaterThan(nodeA?.position.x ?? Infinity);

    // Edge đi từ phiên tới artifact, không dây sang phiên khác
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.source === A)).toBe(true);
  });

  it("phiên có nhiều artifact chiếm chỗ cao hơn — phiên sau không đè lên", () => {
    const { nodes } = dungDoThi(
      [{ repo: "you/myapp", phien: [phien(A, "myapp", 41, "you/myapp"), phien(B, "myapp", 42, "you/myapp")] }],
      {
        [A]: [
          { kind: "issue", url: "https://github.com/x/y/issues/1", number: 1, ts: null, title: null },
          { kind: "pr", url: "https://github.com/x/y/pull/2", number: 2, ts: null, title: null },
          { kind: "pr", url: "https://github.com/x/y/pull/3", number: 3, ts: null, title: null },
        ],
      },
    );
    const yA = nodes.find((n) => n.id === A)?.position.y ?? 0;
    const yB = nodes.find((n) => n.id === B)?.position.y ?? 0;
    // 3 artifact × 84 = 252 > cao phiên chuẩn — phiên B phải nằm dưới cả chồng đó
    expect(yB).toBeGreaterThanOrEqual(yA + 252);
  });

  it("không phiên nào thì đồ thị rỗng — trạng thái tốt, không phải lỗi", () => {
    expect(dungDoThi([], {})).toEqual({ nodes: [], edges: [] });
  });

  it("phiên chat (worktree=false) mang nhãn 'chat' thay vì bịa tên nhánh", () => {
    const chat = { ...phien(A, "myapp", 3, "you/myapp"), worktree: false };
    const { nodes } = dungDoThi([{ repo: "you/myapp", phien: [chat] }], {});
    const node = nodes.find((n) => n.id === A);
    expect(node?.type === "phien" && node.data.nhanh).toBe("chat");
  });
});

describe("node 🎬 demo (phương án A)", () => {
  it("video của phiên treo vào node PR khi có, vào node phiên khi chưa có PR", () => {
    const phien = {
      id: "p1", slug: "myapp", num: 1, repo: "you/myapp", title: "t", phase: "work" as const,
      worktree: true, status: "done" as const, created_at: null, started_at: null,
      ended_at: null, attempt: 0, needs_human: false,
    };
    const coPR = dungDoThi(
      [{ repo: "you/myapp", phien: [phien] }],
      { p1: [{ kind: "pr", url: "https://github.com/you/myapp/pull/9", number: 9, ts: null, title: null }] },
      {},
      { p1: [{ name: "demo.webm", url: "/api/evidence/session/p1/demo.webm" }] },
    );
    const nodeDemo = coPR.nodes.find((n) => n.type === "demo");
    expect(nodeDemo).toMatchObject({ data: { name: "demo.webm" } });
    expect(coPR.edges).toContainEqual({ id: "e-p1-demo-0", source: "p1-pr-9", target: "p1-demo-0" });

    const chuaPR = dungDoThi(
      [{ repo: "you/myapp", phien: [phien] }],
      { p1: [] },
      {},
      { p1: [{ name: "demo.webm", url: "/x" }] },
    );
    expect(chuaPR.edges).toContainEqual({ id: "e-p1-demo-0", source: "p1", target: "p1-demo-0" });
  });
});

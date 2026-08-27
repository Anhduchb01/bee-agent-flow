import { describe, expect, it } from "vitest";

import type { BeeSession } from "@/lib/bee/types";

import { buildGraph } from "./build-graph";

function session(id: string, slug: string, num: number, repo: string): BeeSession {
  return {
    id, slug, num, repo,
    title: null, phase: "work", worktree: true, status: "running",
    created_at: null, started_at: null, ended_at: null,
    attempt: 0, needs_human: false,
  };
}

const A = "aaaaaaaa-1111-4222-8333-444444444444";
const B = "bbbbbbbb-1111-4222-8333-444444444444";

describe("buildGraph", () => {
  it("mỗi repo một cột, artifact nối edge về đúng phiên đẻ ra nó", () => {
    const { nodes, edges } = buildGraph(
      [
        { repo: "you/myapp", session: [session(A, "myapp", 41, "you/myapp")] },
        { repo: "you/blog", session: [session(B, "blog", 7, "you/blog")] },
      ],
      {
        [A]: [
          { kind: "issue", url: "https://github.com/you/myapp/issues/41", number: 41, ts: null, title: null },
          { kind: "pr", url: "https://github.com/you/myapp/pull/123", number: 123, ts: null, title: null },
        ],
      },
    );

    // 2 container repo + 2 phiên + 2 artifact
    expect(nodes).toHaveLength(6);

    // Mỗi repo MỘT container: group đứng TRƯỚC con (React Flow bắt buộc),
    // con mang parentId + extent parent, hai container khác x.
    const groupA = nodes.find((n) => n.id === "group-you/myapp");
    const groupB = nodes.find((n) => n.id === "group-you/blog");
    expect(groupA?.type).toBe("repo-group");
    expect(groupA?.position.x).not.toBe(groupB?.position.x);
    expect(nodes.findIndex((n) => n.id === "group-you/myapp")).toBeLessThan(
      nodes.findIndex((n) => n.id === A),
    );
    const nodeA = nodes.find((n) => n.id === A);
    expect(nodeA?.type === "session" && nodeA.parentId).toBe("group-you/myapp");
    expect(nodeA?.type === "session" && nodeA.extent).toBe("parent");

    // Artifact dạt phải phiên (toạ độ TƯƠNG ĐỐI trong container)
    const artifactPr = nodes.find((n) => n.id === `${A}-pr-123`);
    expect(artifactPr?.position.x).toBeGreaterThan(nodeA?.position.x ?? Infinity);

    // Edge đi từ phiên tới artifact, không dây sang phiên khác
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.source === A)).toBe(true);
  });

  it("phiên có nhiều artifact chiếm chỗ cao hơn — phiên sau không đè lên", () => {
    const { nodes } = buildGraph(
      [{ repo: "you/myapp", session: [session(A, "myapp", 41, "you/myapp"), session(B, "myapp", 42, "you/myapp")] }],
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
    expect(buildGraph([], {})).toEqual({ nodes: [], edges: [] });
  });

  it("phiên chat (worktree=false) mang nhãn 'chat' thay vì bịa tên nhánh", () => {
    const chat = { ...session(A, "myapp", 3, "you/myapp"), worktree: false };
    const { nodes } = buildGraph([{ repo: "you/myapp", session: [chat] }], {});
    const node = nodes.find((n) => n.id === A);
    expect(node?.type === "session" && node.data.branch).toBe("chat");
  });
});

describe("node 🎬 demo (phương án A)", () => {
  it("video của phiên treo vào node PR khi có, vào node phiên khi chưa có PR", () => {
    const session = {
      id: "p1", slug: "myapp", num: 1, repo: "you/myapp", title: "t", phase: "work" as const,
      worktree: true, status: "done" as const, created_at: null, started_at: null,
      ended_at: null, attempt: 0, needs_human: false,
    };
    const coPR = buildGraph(
      [{ repo: "you/myapp", session: [session] }],
      { p1: [{ kind: "pr", url: "https://github.com/you/myapp/pull/9", number: 9, ts: null, title: null }] },
      {},
      { p1: [{ name: "demo.webm", url: "/api/evidence/session/p1/demo.webm" }] },
    );
    const nodeDemo = coPR.nodes.find((n) => n.type === "demo");
    expect(nodeDemo).toMatchObject({ data: { name: "demo.webm" } });
    expect(coPR.edges).toContainEqual({ id: "e-p1-demo-0", source: "p1-pr-9", target: "p1-demo-0" });

    const withoutPr = buildGraph(
      [{ repo: "you/myapp", session: [session] }],
      { p1: [] },
      {},
      { p1: [{ name: "demo.webm", url: "/x" }] },
    );
    expect(withoutPr.edges).toContainEqual({ id: "e-p1-demo-0", source: "p1", target: "p1-demo-0" });
  });
});

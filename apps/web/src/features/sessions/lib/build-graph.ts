import type { BeeArtifact, BeeSession } from "@/lib/bee/types";

import type { NhomPhien } from "../api/load";

/**
 * Dựng đồ thị canvas từ dữ liệu phiên — THUẦN, không import React Flow, để
 * test được không cần DOM và để server dựng sẵn, client chỉ vẽ.
 *
 * Layout là hàm của dữ liệu, không phải trạng thái: repo là cột, phiên xếp
 * dọc, artifact dạt phải phiên đẻ ra nó. V1 không lưu vị trí kéo tay —
 * reload về auto-layout (spec canvas §2).
 */

export interface NodePhien {
  id: string;
  type: "phien";
  position: { x: number; y: number };
  data: {
    title: string;
    nhanh: string;
    status: BeeSession["status"];
    needsHuman: boolean;
    href: string;
    /** Câu cuối agent nói — preview một dòng, node kể được chuyện đang tới đâu. */
    cauCuoi: string | null;
    createdAt: string | null;
  };
}

export interface NodeArtifact {
  id: string;
  type: "artifact";
  position: { x: number; y: number };
  data: {
    kind: BeeArtifact["kind"];
    number: number | null;
    url: string;
    title: string | null;
    ts: string | null;
  };
}

export interface NodeNhanRepo {
  id: string;
  type: "nhan-repo";
  position: { x: number; y: number };
  data: { repo: string };
}

export type NodeCanvas = NodePhien | NodeArtifact | NodeNhanRepo;

export interface EdgeCanvas {
  id: string;
  source: string;
  target: string;
}

const RONG_COT = 560;
const CAO_PHIEN = 120;
const CAO_ARTIFACT = 84;
const LECH_ARTIFACT_X = 300;

export function dungDoThi(
  nhom: NhomPhien[],
  artifacts: Record<string, BeeArtifact[]>,
  xemTruoc: Record<string, string | null> = {},
): { nodes: NodeCanvas[]; edges: EdgeCanvas[] } {
  const nodes: NodeCanvas[] = [];
  const edges: EdgeCanvas[] = [];

  nhom.forEach((g, cot) => {
    const x = cot * RONG_COT;
    nodes.push({ id: `repo-${g.repo}`, type: "nhan-repo", position: { x, y: 0 }, data: { repo: g.repo } });

    let y = 48;
    for (const p of g.phien) {
      nodes.push({
        id: p.id,
        type: "phien",
        position: { x, y },
        data: {
          title: p.title ?? `${p.slug}-${p.num}`,
          nhanh: `bee/${p.slug}-${p.num}`,
          status: p.status,
          needsHuman: p.needs_human,
          href: `/sessions/${p.id}`,
          cauCuoi: xemTruoc[p.id] ?? null,
          createdAt: p.created_at,
        },
      });

      const cua = artifacts[p.id] ?? [];
      cua.forEach((a, i) => {
        const idA = `${p.id}-${a.kind}-${a.number ?? i}`;
        nodes.push({
          id: idA,
          type: "artifact",
          position: { x: x + LECH_ARTIFACT_X, y: y + i * CAO_ARTIFACT },
          data: { kind: a.kind, number: a.number, url: a.url, title: a.title, ts: a.ts },
        });
        edges.push({ id: `e-${idA}`, source: p.id, target: idA });
      });

      // Phiên chiếm chỗ theo cái cao hơn: chính nó hay chồng artifact của nó.
      y += Math.max(CAO_PHIEN, cua.length * CAO_ARTIFACT) + 24;
    }
  });

  return { nodes, edges };
}

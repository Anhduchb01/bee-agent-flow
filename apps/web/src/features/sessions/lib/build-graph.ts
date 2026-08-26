import type { BeeArtifact, BeeSession, Queue } from "@/lib/bee/types";

import type { SessionGroup } from "../api/load";

/**
 * Dựng đồ thị canvas từ dữ liệu phiên — THUẦN, không import React Flow, để
 * test được không cần DOM và để server dựng sẵn, client chỉ vẽ.
 *
 * Mỗi repo là MỘT CONTAINER (group node của React Flow): phiên/artifact/demo
 * là con, vị trí TƯƠNG ĐỐI trong container, `extent:"parent"` giữ con không
 * kéo lọt ra ngoài — kéo container là cả cụm đi theo. V1 không lưu vị trí
 * kéo tay — reload (hoặc nút Tidy) về auto-layout (spec canvas §2).
 */

export interface NodeSession {
  id: string;
  type: "phien";
  position: { x: number; y: number };
  parentId?: string;
  extent?: "parent";
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
  parentId?: string;
  extent?: "parent";
  data: {
    kind: BeeArtifact["kind"];
    number: number | null;
    url: string;
    title: string | null;
    ts: string | null;
  };
}

/** Container một repo — group node, style mang kích thước tính sẵn. */
export interface NodeRepoGroup {
  id: string;
  type: "repo-group";
  position: { x: number; y: number };
  data: { repo: string };
  style: { width: number; height: number };
}

/** 🎬 demo video node: attached to the PR its session made. */
/** Node cho việc CHƯA xảy ra — vẽ mờ, nhãn nói rõ nó là dự định. */
export interface NodeQueued {
  id: string;
  type: "cho-chay";
  position: { x: number; y: number };
  parentId?: string;
  extent?: "parent";
  data: { title: string; moTa: string; href: string };
}

export interface NodeDemo {
  id: string;
  type: "demo";
  position: { x: number; y: number };
  parentId?: string;
  extent?: "parent";
  data: {
    name: string;
    /** /api/evidence/session/… — same-origin, authed. */
    url: string;
  };
}

export type NodeCanvas = NodeSession | NodeArtifact | NodeRepoGroup | NodeDemo | NodeQueued;

export interface EdgeCanvas {
  id: string;
  source: string;
  target: string;
}

const PAD = 24;
const CAO_HEADER = 44;
const CAO_PHIEN = 120;
const CAO_ARTIFACT = 84;
const CAO_DEMO = 64;
const X_PHIEN = PAD;
const X_ARTIFACT = PAD + 300;
const X_DEMO = X_ARTIFACT + 280;
const RONG_PHIEN = 256; // w-64
const RONG_ARTIFACT = 224; // w-56
const RONG_DEMO = 208; // w-52
const KHOANG_CACH_NHOM = 48;

export function buildGraph(
  nhom: SessionGroup[],
  artifacts: Record<string, BeeArtifact[]>,
  xemTruoc: Record<string, string | null> = {},
  /** Demo videos per session (name + authed url) — grows a 🎬 node each. */
  videos: Record<string, { name: string; url: string }[]> = {},
  /** Hàng đợi Autopilot — issue đã xếp mà CHƯA chạy mọc node mờ (V3.D5). */
  queue: Queue = { items: [], paused: false },
): { nodes: NodeCanvas[]; edges: EdgeCanvas[] } {
  const nodes: NodeCanvas[] = [];
  const edges: EdgeCanvas[] = [];

  let nhomX = 0;
  for (const g of nhom) {
    const idNhom = `group-${g.repo}`;
    const con: NodeCanvas[] = [];
    let y = CAO_HEADER;
    let coArtifact = false;
    let coDemo = false;

    // Việc đã xếp hàng mà chưa chạy: canvas cho thấy cả TƯƠNG LAI, không chỉ
    // quá khứ. Cố ý là node riêng (`cho-chay`) chứ không giả dạng node phiên —
    // vẽ một dự định trông như việc đã xảy ra là nói dối bằng đồ hoạ. Việc đã
    // chạy thì thôi, node phiên thật thay chỗ.
    for (const v of queue.items) {
      if (v.repo !== g.repo || v.status !== "waiting") continue;
      con.push({
        id: `queued-${v.repo}#${v.issue}`,
        type: "cho-chay",
        position: { x: X_PHIEN, y },
        parentId: idNhom,
        extent: "parent",
        data: {
          title: `#${v.issue}`,
          moTa: "chờ tự chạy",
          href: `/projects?p=${v.slug}&view=kanban`,
        },
      });
      y += CAO_PHIEN;
    }

    for (const p of g.phien) {
      con.push({
        id: p.id,
        type: "phien",
        position: { x: X_PHIEN, y },
        parentId: idNhom,
        extent: "parent",
        data: {
          title: p.title ?? `${p.slug}-${p.num}`,
          // Phiên chat không có branch — node nói thật điều đó thay vì bịa tên nhánh.
          nhanh: p.worktree ? `bee/${p.slug}-${p.num}` : "chat",
          status: p.status,
          needsHuman: p.needs_human,
          href: `/sessions/${p.id}`,
          cauCuoi: xemTruoc[p.id] ?? null,
          createdAt: p.created_at,
        },
      });

      const cua = artifacts[p.id] ?? [];
      cua.forEach((a, i) => {
        coArtifact = true;
        const idA = `${p.id}-${a.kind}-${a.number ?? i}`;
        con.push({
          id: idA,
          type: "artifact",
          position: { x: X_ARTIFACT, y: y + i * CAO_ARTIFACT },
          parentId: idNhom,
          extent: "parent",
          data: { kind: a.kind, number: a.number, url: a.url, title: a.title, ts: a.ts },
        });
        edges.push({ id: `e-${idA}`, source: p.id, target: idA });
      });

      // 🎬 demo videos hang off the PR node (the artifact they evidence);
      // a session with no PR yet parks them on the session node itself.
      const clip = videos[p.id] ?? [];
      const prIdx = cua.findIndex((a) => a.kind === "pr");
      clip.forEach((v, i) => {
        coDemo = true;
        const idV = `${p.id}-demo-${i}`;
        con.push({
          id: idV,
          type: "demo",
          position: {
            x: prIdx >= 0 ? X_DEMO : X_ARTIFACT,
            y: y + (prIdx >= 0 ? prIdx * CAO_ARTIFACT : cua.length * CAO_ARTIFACT) + i * CAO_DEMO,
          },
          parentId: idNhom,
          extent: "parent",
          data: { name: v.name, url: v.url },
        });
        edges.push({
          id: `e-${idV}`,
          source: prIdx >= 0 ? `${p.id}-pr-${cua[prIdx]!.number ?? prIdx}` : p.id,
          target: idV,
        });
      });

      // Phiên chiếm chỗ theo cái cao hơn: chính nó hay chồng artifact + demo.
      y += Math.max(CAO_PHIEN, cua.length * CAO_ARTIFACT + clip.length * CAO_DEMO) + 24;
    }

    // Kích thước container theo thứ xa phải nhất nó thật sự chứa.
    const rong = coDemo
      ? X_DEMO + RONG_DEMO + PAD
      : coArtifact
        ? X_ARTIFACT + RONG_ARTIFACT + PAD
        : X_PHIEN + RONG_PHIEN + PAD;
    const cao = Math.max(y, CAO_HEADER + CAO_PHIEN) + PAD - 24;

    // Group PHẢI đứng trước con trong mảng — React Flow yêu cầu vậy.
    nodes.push({
      id: idNhom,
      type: "repo-group",
      position: { x: nhomX, y: 0 },
      data: { repo: g.repo },
      style: { width: rong, height: cao },
    });
    nodes.push(...con);
    nhomX += rong + KHOANG_CACH_NHOM;
  }

  return { nodes, edges };
}

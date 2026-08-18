"use client";

import { useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { StatusDot, type Tone } from "@/components/status-dot";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { BeeSession, TrangThaiPhien } from "@/lib/bee/types";
import { khoangThoiGian } from "@/lib/duration";

import type { EdgeCanvas, NodeArtifact, NodeCanvas, NodeNhanRepo, NodePhien } from "../lib/build-graph";
import { LiveView } from "./live-view";

/**
 * Vẽ đồ thị đã dựng sẵn ở server (build-graph.ts) — component này KHÔNG có
 * logic layout, chỉ ánh xạ node type sang hình. Kéo node được cho sướng tay
 * nhưng V1 không lưu vị trí (spec canvas §2).
 *
 * Click node phiên mở panel chat NGAY TRÊN canvas (Sheet chứa LiveView) —
 * không rời ngữ cảnh đồ thị; link ↗ trong node đi sang trang riêng.
 */

const TONE: Record<TrangThaiPhien, Tone> = {
  running: "agent",
  starting: "idle",
  done: "ok",
  stopped: "idle",
  failed: "down",
};

type FlowPhien = Node<NodePhien["data"] & Record<string, unknown>, "phien">;
type FlowArtifact = Node<NodeArtifact["data"] & Record<string, unknown>, "artifact">;
type FlowNhanRepo = Node<NodeNhanRepo["data"] & Record<string, unknown>, "nhan-repo">;

/** "2h ago" từ ISO — tính lúc render, node canvas không cần đồng hồ chạy. */
function tuoi(ts: string | null): string | null {
  if (ts === null) return null;
  const giay = Math.floor((Date.now() - Date.parse(ts)) / 1000);
  if (!Number.isFinite(giay) || giay < 0) return null;
  if (giay < 60) return "just now";
  return `${khoangThoiGian(giay)} ago`;
}

function PhienNode({ data }: NodeProps<FlowPhien>) {
  return (
    <div
      className={`w-64 cursor-pointer rounded-card border bg-card px-3 py-2 shadow-none ${
        data.needsHuman ? "border-destructive" : "border-border"
      }`}
    >
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
      <span className="flex items-center gap-2">
        <StatusDot tone={data.needsHuman ? "down" : TONE[data.status]} />
        <span className="min-w-0 flex-1 truncate text-sm text-body">{data.title}</span>
        {/* Đường sang trang riêng — stopPropagation để khỏi mở panel cùng lúc */}
        <a
          href={data.href}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-muted-foreground hover:text-body"
          aria-label="Open full page"
        >
          ↗
        </a>
      </span>
      {data.cauCuoi !== null && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground italic">“{data.cauCuoi}”</p>
      )}
      <span className="mt-1.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{data.nhanh}</span>
        <span className="flex-1" />
        {tuoi(data.createdAt) !== null && <span>{tuoi(data.createdAt)}</span>}
        <span className={data.needsHuman ? "text-destructive" : ""}>
          {data.needsHuman ? "needs you" : data.status}
        </span>
      </span>
    </div>
  );
}

function ArtifactNode({ data }: NodeProps<FlowArtifact>) {
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-56 rounded-control border border-border bg-secondary px-3 py-2"
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <span className="flex items-center gap-2">
        {/* Xanh lá cho issue mở, tím cho PR — đúng ngôn ngữ màu của GitHub */}
        <span className={data.kind === "pr" ? "text-purple-400" : "text-green-500"}>
          {data.kind === "pr" ? "⇄" : "◉"}
        </span>
        <span className="font-mono text-xs font-semibold text-body">
          {data.kind === "pr" ? "PR" : "Issue"}
          {data.number !== null ? ` #${data.number}` : ""}
        </span>
        <span className="flex-1" />
        {tuoi(data.ts) !== null && (
          <span className="font-mono text-[0.625rem] text-muted-foreground">{tuoi(data.ts)}</span>
        )}
      </span>
      {data.title !== null && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{data.title}</p>
      )}
    </a>
  );
}

function NhanRepoNode({ data }: NodeProps<FlowNhanRepo>) {
  return (
    <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
      {data.repo}
    </span>
  );
}

const nodeTypes: NodeTypes = {
  phien: PhienNode,
  artifact: ArtifactNode,
  "nhan-repo": NhanRepoNode,
};

export function CanvasView({
  nodes,
  edges,
  phien,
}: {
  nodes: NodeCanvas[];
  edges: EdgeCanvas[];
  phien: BeeSession[];
}) {
  const flowNodes: Node[] = nodes.map((n) => ({ ...n, data: { ...n.data } }));
  const flowEdges: Edge[] = edges.map((e) => ({ ...e }));
  const [chon, setChon] = useState<BeeSession | null>(null);

  return (
    <div className="h-full w-full">
      <ReactFlow
        defaultNodes={flowNodes}
        defaultEdges={flowEdges}
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        minZoom={0.2}
        nodesConnectable={false}
        deleteKeyCode={null}
        onNodeClick={(_, node) => {
          if (node.type === "phien") setChon(phien.find((p) => p.id === node.id) ?? null);
        }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Panel chat tại chỗ — cùng LiveView với trang riêng, một nguồn sự thật */}
      <Sheet open={chon !== null} onOpenChange={(mo) => !mo && setChon(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          {chon !== null && (
            <>
              <SheetTitle className="border-b border-border px-4 py-3 text-sm">
                {chon.title ?? `${chon.slug}-${chon.num}`}
              </SheetTitle>
              <LiveView phien={chon} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

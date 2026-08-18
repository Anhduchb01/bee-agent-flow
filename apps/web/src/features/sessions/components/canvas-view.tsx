"use client";

import Link from "next/link";
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
import type { TrangThaiPhien } from "@/lib/bee/types";

import type { EdgeCanvas, NodeArtifact, NodeCanvas, NodeNhanRepo, NodePhien } from "../lib/build-graph";

/**
 * Vẽ đồ thị đã dựng sẵn ở server (build-graph.ts) — component này KHÔNG có
 * logic layout, chỉ ánh xạ node type sang hình. Kéo node được cho sướng tay
 * nhưng V1 không lưu vị trí (spec canvas §2).
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

function PhienNode({ data }: NodeProps<FlowPhien>) {
  return (
    <Link
      href={data.href}
      className={`block w-60 rounded-card border bg-card px-3 py-2 shadow-none ${
        data.needsHuman ? "border-destructive" : "border-border"
      }`}
    >
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
      <span className="flex items-center gap-2">
        <StatusDot tone={data.needsHuman ? "down" : TONE[data.status]} />
        <span className="truncate text-sm text-body">{data.title}</span>
      </span>
      <span className="mt-1 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>{data.nhanh}</span>
        <span>{data.needsHuman ? "needs you" : data.status}</span>
      </span>
    </Link>
  );
}

function ArtifactNode({ data }: NodeProps<FlowArtifact>) {
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-44 rounded-control border border-border bg-secondary px-3 py-1.5"
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <span className="font-mono text-xs text-body">
        {data.kind === "pr" ? "PR" : "Issue"}
        {data.number !== null ? ` #${data.number}` : ""}
      </span>
      <span className="ml-1 font-mono text-xs text-muted-foreground">↗</span>
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

export function CanvasView({ nodes, edges }: { nodes: NodeCanvas[]; edges: EdgeCanvas[] }) {
  const flowNodes: Node[] = nodes.map((n) => ({ ...n, data: { ...n.data } }));
  const flowEdges: Edge[] = edges.map((e) => ({ ...e }));

  return (
    <div className="h-full w-full">
      <ReactFlow
        defaultNodes={flowNodes}
        defaultEdges={flowEdges}
        nodeTypes={nodeTypes}
        colorMode="system"
        fitView
        minZoom={0.2}
        nodesConnectable={false}
        deleteKeyCode={null}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

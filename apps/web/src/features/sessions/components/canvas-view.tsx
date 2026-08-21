"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { StatusDot, type Tone } from "@/components/status-dot";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { BeeRepoDangKy, BeeSession, TrangThaiPhien } from "@/lib/bee/types";
import { khoangThoiGian } from "@/lib/duration";

import { loadArtifactDetailAction } from "../api/actions";
import { bocArtifactUrl, mauArtifact, type ArtifactSong } from "../lib/artifact-live";
import type {
  EdgeCanvas,
  NodeArtifact,
  NodeCanvas,
  NodeDemo,
  NodeNhomRepo,
  NodePhien,
} from "../lib/build-graph";
import { ArtifactPanel } from "./artifact-panel";
import { LiveView } from "./live-view";
import { NewSessionForm } from "./new-session-form";

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
type FlowNhomRepo = Node<NodeNhomRepo["data"] & Record<string, unknown>, "repo-group">;

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
  // Click mở panel chi tiết NGAY TRÊN canvas (onNodeClick); ↗ là lối tắt
  // sang GitHub — stopPropagation để hai đường không giẫm nhau.
  const live = (data as { live?: ArtifactSong | null }).live ?? null;
  const checks = live?.checks != null ? CHECKS_GLYPH[live.checks] : null;
  return (
    <div className="w-56 cursor-pointer rounded-control border border-border bg-secondary px-3 py-2">
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <span className="flex items-center gap-2">
        <span className={mauArtifact(data.kind, live)} title={live?.state.toLowerCase()}>
          {data.kind === "pr" ? "⇄" : "◉"}
        </span>
        <span className="font-mono text-xs font-semibold text-body">
          {data.kind === "pr" ? "PR" : "Issue"}
          {data.number !== null ? ` #${data.number}` : ""}
        </span>
        {live !== null && live.state !== "OPEN" && (
          <span className="font-mono text-[0.625rem] text-muted-foreground">
            {live.state.toLowerCase()}
          </span>
        )}
        {checks !== null && (
          <span className={`font-mono text-[0.625rem] ${checks.mau}`} title={`checks ${live?.checks}`}>
            {checks.ky}
          </span>
        )}
        <span className="flex-1" />
        {tuoi(data.ts) !== null && (
          <span className="font-mono text-[0.625rem] text-muted-foreground">{tuoi(data.ts)}</span>
        )}
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-muted-foreground hover:text-body"
          aria-label="Open on GitHub"
        >
          ↗
        </a>
      </span>
      {data.title !== null && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{data.title}</p>
      )}
    </div>
  );
}

const CHECKS_GLYPH: Record<string, { ky: string; mau: string }> = {
  pass: { ky: "✓", mau: "text-green-500" },
  fail: { ky: "✗", mau: "text-red-400" },
  pending: { ky: "●", mau: "text-amber-500" },
};

type FlowDemo = Node<NodeDemo["data"] & Record<string, unknown>, "demo">;

/** 🎬 demo video — click previews IN a canvas sheet; ↗ opens the raw file. */
function DemoNode({ data }: NodeProps<FlowDemo>) {
  return (
    <div
      className="w-52 cursor-pointer rounded-control border border-border bg-secondary px-3 py-2"
      title="Preview demo video"
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <span className="flex items-center gap-2">
        <span aria-hidden>🎬</span>
        <span className="min-w-0 truncate font-mono text-xs text-body">{data.name}</span>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-body"
          aria-label="Open raw video"
        >
          ↗
        </a>
      </span>
    </div>
  );
}

/**
 * Container một repo: group node — con nằm trong, kéo container cả cụm đi
 * theo, `extent:"parent"` giữ con không lọt ra ngoài. Kích thước do
 * build-graph tính (node.style), div này chỉ việc phủ kín.
 */
function RepoGroupNode({ data }: NodeProps<FlowNhomRepo>) {
  return (
    <div className="h-full w-full rounded-card border border-border/70 bg-muted/10">
      <p className="px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {data.repo}
      </p>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  phien: PhienNode,
  artifact: ArtifactNode,
  "repo-group": RepoGroupNode,
  demo: DemoNode,
};

export function CanvasView({
  nodes,
  edges,
  phien,
  repos = [],
  commands = [],
}: {
  nodes: NodeCanvas[];
  edges: EdgeCanvas[];
  phien: BeeSession[];
  repos?: BeeRepoDangKy[];
  commands?: { name: string; moTa: string }[];
}) {
  const router = useRouter();
  const [chon, setChon] = useState<BeeSession | null>(null);
  const [xemArtifact, setXemArtifact] = useState<{
    repo: string;
    kind: "issue" | "pr";
    number: number;
    url: string;
    title: string | null;
  } | null>(null);
  const [xemVideo, setXemVideo] = useState<{ name: string; url: string } | null>(null);

  // Controlled nodes + a 5s server refresh = the canvas updates LIVE: new
  // sessions and freshly created issue/PR nodes appear without a reload.
  // defaultNodes (uncontrolled) ignored refreshed props entirely.
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>(
    nodes.map((n) => ({ ...n, data: { ...n.data } })),
  );
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(
    edges.map((e) => ({ ...e })),
  );
  const khoaDoThi = JSON.stringify([nodes, edges]);
  const khoaCu = useRef(khoaDoThi);
  useEffect(() => {
    // Only rebuild when the graph really changed — otherwise every poll
    // would yank nodes out of the user's hands mid-drag.
    if (khoaDoThi === khoaCu.current) return;
    khoaCu.current = khoaDoThi;
    setFlowNodes(nodes.map((n) => ({ ...n, data: { ...n.data } })));
    setFlowEdges(edges.map((e) => ({ ...e })));
  }, [khoaDoThi, nodes, edges, setFlowNodes, setFlowEdges]);
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [router]);

  // V2.2 — live artifact state. One fetch per visible artifact node (cap
  // 12), re-run when the graph changes and every 60s (matches the server
  // cache TTL). Doubles as PREFETCH: the detail panel opens warm.
  const [songTheo, setSongTheo] = useState<Record<string, ArtifactSong>>({});
  useEffect(() => {
    let song = true;
    async function tai() {
      const arts = nodes.filter((n): n is NodeArtifact => n.type === "artifact").slice(0, 12);
      const cap = await Promise.all(
        arts.map(async (n) => {
          const boc = bocArtifactUrl(n.data.url);
          if (boc === null) return null;
          const ket = await loadArtifactDetailAction(boc.repo, boc.kind, boc.number);
          if (!ket.ok) return null;
          return [
            n.data.url,
            {
              state: ket.detail.state,
              draft: ket.detail.pr?.draft ?? false,
              checks: ket.detail.pr?.checks ?? null,
            },
          ] as const;
        }),
      );
      if (song) {
        setSongTheo(Object.fromEntries(cap.filter((c): c is NonNullable<typeof c> => c !== null)));
      }
    }
    void tai();
    const t = setInterval(() => {
      if (!document.hidden) void tai();
    }, 60_000);
    return () => {
      song = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- khoaDoThi IS the nodes' identity
  }, [khoaDoThi]);
  useEffect(() => {
    setFlowNodes((ns) =>
      ns.map((n) =>
        n.type === "artifact"
          ? { ...n, data: { ...n.data, live: songTheo[(n.data as { url: string }).url] ?? null } }
          : n,
      ),
    );
  }, [songTheo, setFlowNodes]);

  // Chat panel width — restored from the last drag, VSCode-style. Lazy
  // init is safe: the Sheet only mounts when opened, all client-side.
  const [rongPanel, setRongPanel] = useState(() => {
    if (typeof window === "undefined") return 1152;
    try {
      const luu = Number(localStorage.getItem("bee-chat-width"));
      return Number.isFinite(luu) && luu >= 360 ? luu : 1152;
    } catch {
      return 1152;
    }
  });
  const dangKeo = useRef<{ batDau: number; rong: number } | null>(null);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        minZoom={0.2}
        nodesConnectable={false}
        deleteKeyCode={null}
        onNodeClick={(_, node) => {
          if (node.type === "phien") setChon(phien.find((p) => p.id === node.id) ?? null);
          if (node.type === "demo") {
            const d = node.data as NodeDemo["data"];
            setXemVideo({ name: d.name, url: d.url });
          }
          if (node.type === "artifact") {
            const d = node.data as FlowArtifact["data"];
            const boc = bocArtifactUrl(d.url);
            if (boc !== null) {
              setXemArtifact({ ...boc, url: d.url, title: (d.title as string | null) ?? null });
            } else {
              // URL lạ (không phải github.com issues/pull) — mở thẳng tab mới.
              window.open(d.url, "_blank", "noopener,noreferrer");
            }
          }
        }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
        {/* Tạo phiên ngay trên canvas — xong là panel chat mở tại chỗ,
            node mới hiện sau router.refresh, không rời đồ thị */}
        <Panel position="top-left" className="w-[26rem] max-w-[calc(100vw-2rem)]">
          <NewSessionForm repos={repos} onCreated={(p) => setChon(p)} />
        </Panel>
        {/* Kéo tay xong rối mắt? Một nút quay về auto-layout — vị trí không
            được lưu (spec canvas §2), nên đây chỉ là rebuild từ props. */}
        <Panel position="top-right">
          <button
            type="button"
            onClick={() => {
              setFlowNodes(nodes.map((n) => ({ ...n, data: { ...n.data } })));
              setFlowEdges(edges.map((e) => ({ ...e })));
            }}
            className="rounded-control border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-body"
          >
            ⌗ Tidy layout
          </button>
        </Panel>
      </ReactFlow>

      {/* Panel chat tại chỗ — cùng LiveView với trang riêng, một nguồn sự thật.
          Width is draggable like a VSCode side panel; remembered per browser. */}
      <Sheet open={chon !== null} onOpenChange={(mo) => !mo && setChon(null)}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0"
          // Inline beats class: shadcn's built-in sm:max-w-sm silently pinned
          // the panel at 384px, which also made dragging look dead. 100vw cap:
          // the remembered desktop width (default 1152) must never overflow a
          // phone screen.
          style={{ width: rongPanel, maxWidth: "100vw" }}
        >
          {/* Pointer CAPTURE, not window listeners: Radix's modal layer eats
              window events, which is why the first version never dragged. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat panel"
            className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none hover:bg-muted-foreground/30"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              dangKeo.current = { batDau: e.clientX, rong: rongPanel };
            }}
            onPointerMove={(e) => {
              if (dangKeo.current === null) return;
              const moi = Math.min(
                Math.max(dangKeo.current.rong + (dangKeo.current.batDau - e.clientX), 360),
                window.innerWidth - 120,
              );
              setRongPanel(moi);
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              dangKeo.current = null;
              try {
                localStorage.setItem("bee-chat-width", String(rongPanel));
              } catch {
                // Private mode — width just won't persist.
              }
            }}
          />
          {chon !== null && (
            <>
              <SheetTitle className="border-b border-border px-4 py-3 text-sm">
                {chon.title ?? `${chon.slug}-${chon.num}`}
              </SheetTitle>
              <LiveView phien={chon} commands={commands} />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 🎬 preview video demo ngay trên canvas — không rời đồ thị */}
      <Sheet open={xemVideo !== null} onOpenChange={(mo) => !mo && setXemVideo(null)}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0"
          style={{ width: "min(760px, 100vw)", maxWidth: "100vw" }}
        >
          {xemVideo !== null && (
            <>
              <SheetTitle className="border-b border-border px-4 py-3 pr-10 font-mono text-sm">
                🎬 {xemVideo.name}
              </SheetTitle>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                <video
                  src={xemVideo.url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full rounded-control border border-border"
                />
                <a
                  href={xemVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Open raw file ↗
                </a>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Panel chi tiết issue/PR — đọc từ gh của máy, nút ↗ cho phần còn lại */}
      <Sheet open={xemArtifact !== null} onOpenChange={(mo) => !mo && setXemArtifact(null)}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0"
          style={{ width: "min(560px, 100vw)", maxWidth: "100vw" }}
        >
          {xemArtifact !== null && (
            <>
              <SheetTitle className="border-b border-border px-4 py-3 pr-10 text-sm">
                <span className="font-mono text-muted-foreground">
                  {xemArtifact.kind === "pr" ? "PR" : "Issue"} #{xemArtifact.number} ·{" "}
                  {xemArtifact.repo}
                </span>
                {xemArtifact.title !== null && (
                  <span className="mt-0.5 block truncate">{xemArtifact.title}</span>
                )}
              </SheetTitle>
              <ArtifactPanel
                key={`${xemArtifact.repo}#${xemArtifact.kind}#${xemArtifact.number}`}
                repo={xemArtifact.repo}
                kind={xemArtifact.kind}
                number={xemArtifact.number}
                url={xemArtifact.url}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

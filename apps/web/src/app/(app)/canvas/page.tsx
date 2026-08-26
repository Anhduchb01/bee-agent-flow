import { CanvasView, buildGraph, loadCanvas, loadRepos } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";
import { readQueue } from "@/lib/bee/queue-fs";

export default async function CanvasPage() {
  const actor = await getActor();
  if (!actor) return null;

  const [{ nhom, artifacts, previewOf, videos }, repos, skills, queue] = await Promise.all([
    loadCanvas(),
    loadRepos(),
    getBee().listCommands(),
    readQueue(process.env.BEE_SRV ?? "/srv/bee"),
  ]);
  const { nodes, edges } = buildGraph(nhom, artifacts, previewOf, videos, queue);

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader
        title="Canvas"
        meta={
          <span className="font-mono text-xs text-muted-foreground">
            {nodes.length} nodes · {edges.length} links
          </span>
        }
      />
      <div className="min-h-0 flex-1">
        <CanvasView
          nodes={nodes}
          edges={edges}
          session={nhom.flatMap((g) => g.session)}
          repos={repos}
          commands={skills}
        />
      </div>
    </div>
  );
}

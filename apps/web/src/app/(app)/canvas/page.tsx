import { CanvasView, dungDoThi, loadCanvas, loadRepos } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function CanvasPage() {
  const actor = await getActor();
  if (!actor) return null;

  const [{ nhom, artifacts, xemTruoc }, repos] = await Promise.all([loadCanvas(), loadRepos()]);
  const { nodes, edges } = dungDoThi(nhom, artifacts, xemTruoc);

  return (
    <div className="flex h-svh flex-col">
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
          phien={nhom.flatMap((g) => g.phien)}
          repos={repos}
        />
      </div>
    </div>
  );
}

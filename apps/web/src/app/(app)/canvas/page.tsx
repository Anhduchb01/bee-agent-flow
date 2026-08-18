import { CanvasView, dungDoThi, loadCanvas } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function CanvasPage() {
  const actor = await getActor();
  if (!actor) return null;

  const { nhom, artifacts } = await loadCanvas();
  const { nodes, edges } = dungDoThi(nhom, artifacts);

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
      {nodes.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          Nothing to draw yet. Start a session — its issues and pull requests will grow here as nodes.
        </p>
      ) : (
        <div className="min-h-0 flex-1">
          <CanvasView nodes={nodes} edges={edges} phien={nhom.flatMap((g) => g.phien)} />
        </div>
      )}
    </div>
  );
}

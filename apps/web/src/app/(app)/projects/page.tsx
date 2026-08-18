import { StatGrid } from "@/components/stat-grid";
import { AddProjectDialog, loadProjects, ProjectCard, thongKeDuAn } from "@/features/project";
import { PageHeader } from "@/features/shell";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getActor } from "@/lib/auth";

export default async function DuAnPage() {
  const actor = await getActor();
  if (!actor) return null;

  const projects = await loadProjects();

  return (
    <>
      <PageHeader title="Projects" meta={<span className="text-xs text-muted-foreground">One project is one repo</span>}>
        <AddProjectDialog />
      </PageHeader>

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <StatGrid stats={thongKeDuAn(projects)} />

        {projects.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>
                Hit Add project above, then run <code>be repo add &lt;org/repo&gt;</code> on the agent machine.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

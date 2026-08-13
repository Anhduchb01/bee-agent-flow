import { PageTitle } from "@/components/page-title";
import { StatGrid } from "@/components/stat-grid";
import { AddProjectDialog, loadProjects, ProjectCard, thongKeDuAn } from "@/features/project";
import { getActor } from "@/lib/auth";

export default async function DuAnPage() {
  const actor = await getActor();
  if (!actor) return null;

  const projects = await loadProjects();

  return (
    <main className="mx-auto flex w-full max-w-[88rem] flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title="Dự án" hint="Một dự án là một repo." />
        <AddProjectDialog />
      </div>

      <StatGrid stats={thongKeDuAn(projects)} />

      {projects.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium tracking-title text-foreground">Chưa có dự án nào</p>
          <p className="mt-1.5 text-sm text-body">
            Bấm <span className="text-foreground">Thêm dự án</span> ở trên, rồi chạy{" "}
            <code>be repo add &lt;org/repo&gt;</code> trên máy agent.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </ul>
      )}
    </main>
  );
}

import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { StatGrid } from "@/components/stat-grid";
import { StatusDot } from "@/components/status-dot";
import { loadProject, ProjectTaskTable, thongKeMotDuAn } from "@/features/project";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

export default async function DuAnChiTietPage({ params }: PageProps<"/p/[slug]">) {
  const actor = await getActor();
  if (!actor) return null;

  const { slug } = await params;

  const project = await loadProject(slug);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title={project.slug}
        meta={
          <>
            <span className="font-mono text-xs text-muted-foreground">{project.full}</span>
            {project.repo?.paused ? (
              <span className="flex items-center gap-1.5">
                <StatusDot tone="warn" />
                <span className="text-xs text-body">paused by .agent/PAUSE</span>
              </span>
            ) : null}
            {project.repo === null ? (
              <span className="flex items-center gap-1.5">
                <StatusDot tone="idle" />
                <span className="text-xs text-body">runner does not know this project</span>
              </span>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <StatGrid stats={thongKeMotDuAn(project)} />

        <section className="flex flex-col gap-4">
          <Eyebrow>Task</Eyebrow>
          <ProjectTaskTable slug={project.slug} tasks={project.tasks} now={project.readAt} />
        </section>
      </div>
    </>
  );
}

import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { StatGrid } from "@/components/stat-grid";
import { StatusDot } from "@/components/status-dot";
import {
  docViewMode,
  loadProject,
  ProjectKanban,
  ProjectTaskTable,
  QueueList,
  thongKeMotDuAn,
  ViewSwitch,
} from "@/features/project";
import { PageHeader } from "@/features/shell";
import { CreateTaskDialog } from "@/features/task-new";
import { getActor } from "@/lib/auth";

export default async function DuAnChiTietPage({
  params,
  searchParams,
}: PageProps<"/p/[slug]">) {
  const actor = await getActor();
  if (!actor) return null;

  const { slug } = await params;
  const { view } = await searchParams;
  const kieuXem = docViewMode(view);

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
                <span className="text-xs text-body">reconciler does not know this project</span>
              </span>
            ) : null}
          </>
        }
      >
        <CreateTaskDialog slug={project.slug} />
      </PageHeader>

      <div className="flex flex-col gap-6 p-4 sm:p-6">
      <StatGrid stats={thongKeMotDuAn(project)} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>Task</Eyebrow>
          <ViewSwitch slug={project.slug} current={kieuXem} />
        </div>

        {kieuXem === "kanban" ? (
          <ProjectKanban slug={project.slug} tasks={project.tasks} now={project.readAt} />
        ) : (
          <ProjectTaskTable slug={project.slug} tasks={project.tasks} now={project.readAt} />
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <Eyebrow>Machine queue</Eyebrow>
        <QueueList items={project.repo?.queue ?? []} slug={slug} />
      </section>
      </div>
    </>
  );
}

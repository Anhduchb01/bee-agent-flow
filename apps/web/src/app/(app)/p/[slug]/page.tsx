import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { PageTitle } from "@/components/page-title";
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <PageTitle title={project.slug} hint={project.full} />
          {project.repo?.paused ? (
            <span className="flex items-center gap-1.5">
              <StatusDot tone="warn" />
              <span className="eyebrow">tạm dừng bằng .agent/PAUSE</span>
            </span>
          ) : null}
          {project.repo === null ? (
            <span className="flex items-center gap-1.5">
              <StatusDot tone="idle" />
              <span className="eyebrow">reconciler chưa biết dự án này</span>
            </span>
          ) : null}
        </div>
        <CreateTaskDialog slug={project.slug} />
      </div>

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
        <Eyebrow>Hàng đợi của máy</Eyebrow>
        <QueueList items={project.repo?.queue ?? []} slug={slug} />
      </section>
    </main>
  );
}

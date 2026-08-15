import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { StatGrid } from "@/components/stat-grid";
import { StatusDot } from "@/components/status-dot";
import {
  anhChupDuAn,
  docLichSuChat,
  docViewMode,
  loadProject,
  ProjectChat,
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

  const lichSu = await docLichSuChat(project.slug);

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

      {/* Hai cột như trang task: bảng bên trái cuộn, chat bên phải đứng yên. */}
      <div className="grid gap-6 p-4 sm:p-6 xl:h-[calc(100dvh-var(--spacing)*24)] xl:grid-cols-[minmax(0,1fr)_26rem] xl:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-6 xl:overflow-y-auto xl:pr-2">
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

      <aside className="flex min-h-0 min-w-0 flex-col rounded-card border border-border bg-card p-4 xl:h-full">
        <ProjectChat
          slug={project.slug}
          boiCanh={anhChupDuAn(project.slug, project.tasks, new Date(project.readAt))}
          lichSu={lichSu}
        />
      </aside>
      </div>
    </>
  );
}

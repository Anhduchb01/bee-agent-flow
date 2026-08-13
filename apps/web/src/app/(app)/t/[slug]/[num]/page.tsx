import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { StatGrid } from "@/components/stat-grid";
import { STAGE_LABEL, STAGE_TONE, stageOf } from "@/lib/task-stage";
import {
  ChatBox,
  EvidenceViewer,
  loadTask,
  TaskActions,
  TaskBody,
  TaskStatus,
  TaskTimeline,
  thongKeTask,
} from "@/features/task";
import { getActor } from "@/lib/auth";

export default async function TaskPage({ params }: PageProps<"/t/[slug]/[num]">) {
  const actor = await getActor();
  if (!actor) return null;

  const { slug, num } = await params;
  const number = Number(num);
  if (!Number.isInteger(number)) notFound();

  const view = await loadTask(slug, number);
  if (!view) notFound();

  const { task, timeline, evidence, evidenceCu, dangChay } = view;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
          <Link
            href={`/p/${task.slug}`}
            className="font-mono underline underline-offset-4 hover:text-foreground"
          >
            {task.slug}
          </Link>
          <span className="font-mono">#{task.number}</span>
          <span>·</span>
          <span>{task.author.name} mở</span>
          {task.labels.includes("priority:high") ? (
            <span className="eyebrow rounded-pill border border-border px-2 py-0.5">
              ưu tiên
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-heading text-foreground">
          {task.title}
        </h1>
        <TaskActions task={task} actor={actor} />
      </header>

      <StatGrid
        stats={thongKeTask({
          task,
          stageLabel: STAGE_LABEL[stageOf(task)],
          stageTone: STAGE_TONE[stageOf(task)],
          evidence,
        })}
      />

      <TaskStatus task={task} dangChay={dangChay} />

      <section className="flex flex-col gap-5 border-t border-border pt-9">
        <Eyebrow>Hợp đồng</Eyebrow>
        <TaskBody body={task.body} />
      </section>

      <section className="flex flex-col gap-5 border-t border-border pt-9">
        <Eyebrow>Bằng chứng</Eyebrow>
        <EvidenceViewer
          evidence={evidence}
          cu={evidenceCu}
          headSha={task.pull?.head_sha ?? null}
        />
      </section>

      <section className="flex flex-col gap-7 border-t border-border pt-9">
        <Eyebrow>Trao đổi</Eyebrow>
        <TaskTimeline comments={timeline} />
        <ChatBox
          slug={task.slug}
          num={task.number}
          dangChayRule={dangChay?.rule ?? null}
          dangChayGiay={dangChay?.elapsed_s ?? 0}
        />
      </section>
      </div>
    </div>
  );
}

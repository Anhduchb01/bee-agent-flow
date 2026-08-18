import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { StatGrid } from "@/components/stat-grid";
import {
  EvidenceViewer,
  loadTask,
  RunList,
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

  const { task, timeline, evidence, evidenceCu, dangChay, runs } = view;

  return (
    <div className="flex min-w-0 flex-col gap-10 p-4 sm:p-6">
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
          <span>opened by {task.author.name}</span>
          {task.labels.includes("priority:high") ? (
            <span className="eyebrow rounded-pill border border-border px-2 py-0.5">
              priority
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-heading text-foreground">
          {task.title}
        </h1>
      </header>

      <StatGrid stats={thongKeTask({ task, evidence })} />

      <TaskStatus task={task} dangChay={dangChay} />

      <section className="flex flex-col gap-5 border-t border-border pt-9">
        <Eyebrow>Contract</Eyebrow>
        <TaskBody body={task.body} />
      </section>

      <section className="flex flex-col gap-5 border-t border-border pt-9">
        <Eyebrow>Evidence</Eyebrow>
        <EvidenceViewer
          evidence={evidence}
          cu={evidenceCu}
          headSha={task.pull?.head_sha ?? null}
        />
      </section>

      <RunList runs={runs} />

      <section className="flex flex-col gap-7 border-t border-border pt-9">
        <Eyebrow>Conversation</Eyebrow>
        <TaskTimeline comments={timeline} />
      </section>
    </div>
  );
}

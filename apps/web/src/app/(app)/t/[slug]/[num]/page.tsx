import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ChatBox,
  EvidenceViewer,
  loadTask,
  TaskActions,
  TaskBody,
  TaskStatus,
  TaskTimeline,
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href={`/p/${task.slug}`} className="underline underline-offset-4">
            {task.slug}
          </Link>
          <span className="font-mono">#{task.number}</span>
          <span>·</span>
          <span>{task.author.name} mở</span>
          {task.labels.includes("priority:high") ? (
            <Badge variant="outline">ưu tiên</Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        <TaskActions task={task} actor={actor} />
      </header>

      <TaskStatus task={task} dangChay={dangChay} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Hợp đồng</h2>
        <TaskBody body={task.body} />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Bằng chứng</h2>
        <EvidenceViewer
          evidence={evidence}
          cu={evidenceCu}
          headSha={task.pull?.head_sha ?? null}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Trao đổi</h2>
        <TaskTimeline comments={timeline} />
        <ChatBox
          slug={task.slug}
          num={task.number}
          dangChayRule={dangChay?.rule ?? null}
          dangChayGiay={dangChay?.elapsed_s ?? 0}
        />
      </section>
    </main>
  );
}

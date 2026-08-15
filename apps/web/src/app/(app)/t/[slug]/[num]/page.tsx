import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { StatGrid } from "@/components/stat-grid";
import { STAGE_LABEL, STAGE_TONE, stageOf } from "@/lib/task-stage";
import {
  EvidenceViewer,
  loadTask,
  TaskActions,
  RunList,
  TaskBody,
  TaskChat,
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

  // Phiên để nối lại: lần chạy GẦN NHẤT có gọi model. Lấy lần gần nhất bất kể
  // có phiên hay không thì rule 03 (chạy CI, không gọi model) sẽ che mất lần
  // build ngay trước nó, và ô chat báo "chưa có phiên" trên một task vừa được
  // agent làm xong.
  const phien = runs.find((r) => r.session_id) ?? null;

  return (
    /*
     * Hai cột, chat ở bên phải và đứng yên khi cột trái cuộn — bố cục của một
     * cửa sổ soạn thảo, không phải của một trang tài liệu.
     *
     * Dưới `xl` thì xếp dọc: hai cột trên màn hẹp cho ra hai cột hẹp, và cột
     * chat hẹp thì mọi câu trả lời đều xuống dòng sau bốn chữ.
     */
    <div className="grid min-h-0 gap-6 p-4 sm:p-6 xl:h-[calc(100dvh-var(--spacing)*4)] xl:grid-cols-[minmax(0,1fr)_26rem] xl:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-10 xl:overflow-y-auto xl:pr-2">
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

      <aside className="flex min-h-0 min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-4 xl:h-full">
        <Eyebrow>Agent</Eyebrow>
        <div className="min-h-0 flex-1">
          <TaskChat
            slug={task.slug}
            num={task.number}
            taskId={phien?.id ?? null}
            sessionId={phien?.session_id ?? null}
            coPr={task.pull !== null}
          />
        </div>
      </aside>
    </div>
  );
}

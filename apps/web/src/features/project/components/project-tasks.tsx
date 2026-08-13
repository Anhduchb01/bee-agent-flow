import Link from "next/link";

import { StatusDot } from "@/components/status-dot";
import { khoangThoiGian } from "@/lib/duration";
import type { GhTask } from "@/lib/github/types";
import { cn } from "@/lib/utils";

import { STAGE_HINT, STAGE_LABEL, STAGE_TONE, stageOf, xepTheoStage } from "@/lib/task-stage";

const COT = "grid grid-cols-[10rem_5rem_1fr_8rem] items-center gap-3 px-5";

function tuoi(iso: string, now: number): string {
  return khoangThoiGian((now - Date.parse(iso)) / 1000);
}

function KhongCoTask() {
  return (
    <div className="rounded-card border border-dashed border-border bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium tracking-title text-foreground">No tasks yet</p>
      <p className="mt-1.5 text-sm text-body">
        Hit <span className="text-foreground">New task</span> above to write the first one.
      </p>
    </div>
  );
}

/** Kiểu xem bảng: mọi task một danh sách, có cột giai đoạn. */
export function ProjectTaskTable({
  slug,
  tasks,
  now,
}: {
  slug: string;
  tasks: GhTask[];
  now: number;
}) {
  const mo = tasks.filter((t) => t.state === "open");
  if (mo.length === 0) return <KhongCoTask />;

  const sap = [...mo].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem] overflow-hidden rounded-card border border-border bg-card">
        <div className={cn(COT, "border-b border-border py-2.5")}>
          <span className="eyebrow">Stage</span>
          <span className="eyebrow">No.</span>
          <span className="eyebrow">Title</span>
          <span className="eyebrow text-right">Updated</span>
        </div>

        <ul aria-label="Project tasks">
          {sap.map((t) => {
            const stage = stageOf(t);
            return (
              <li key={t.number} className={cn(COT, "border-b border-border py-3 last:border-b-0")}>
                <span className="flex items-center gap-1.5">
                  <StatusDot tone={STAGE_TONE[stage]} />
                  <span className="eyebrow truncate">{STAGE_LABEL[stage]}</span>
                </span>

                <span className="font-mono text-xs text-muted-foreground">#{t.number}</span>

                <span className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/t/${slug}/${t.number}`}
                    className="truncate text-sm font-medium tracking-title text-foreground underline-offset-4 hover:underline"
                  >
                    {t.title}
                  </Link>
                  {t.pull ? (
                    <a
                      href={t.pull.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 font-mono text-xs text-link underline underline-offset-4"
                    >
                      PR #{t.pull.number}
                    </a>
                  ) : null}
                  {t.labels.includes("priority:high") ? (
                    <span className="eyebrow shrink-0 rounded-pill border border-border px-1.5">
                      priority
                    </span>
                  ) : null}
                </span>

                <time
                  dateTime={t.updated_at}
                  className="text-right font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {tuoi(t.updated_at, now)} ago
                </time>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Kiểu xem kanban: sáu cột theo đúng chiều công việc chảy. */
export function ProjectKanban({
  slug,
  tasks,
  now,
}: {
  slug: string;
  tasks: GhTask[];
  now: number;
}) {
  const cot = xepTheoStage(tasks);
  if (cot.every((c) => c.tasks.length === 0)) return <KhongCoTask />;

  return (
    /*
     * Lưới sáu cột bằng nhau, **không cuộn ngang** trên desktop.
     *
     * Cuộn ngang trong một bảng kanban là một cái bẫy: hai cột cuối nằm ngoài
     * tầm mắt, nên "Chờ duyệt PR" và "Cần người" — đúng hai cột chứa việc cần
     * người nhất — là hai cột dễ bị quên nhất. Ép chúng vào màn hình quan
     * trọng hơn việc giữ thẻ rộng rãi.
     *
     * Dưới 1024px thì mới cho cuộn: ở bề ngang đó, sáu cột bóp lại còn hẹp
     * hơn một từ.
     */
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0">
      <div
        role="group"
        aria-label="Kanban board"
        className="grid min-w-max grid-flow-col auto-cols-[15rem] gap-4 lg:min-w-0 lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-6"
      >
        {cot.map((c) => (
          <section
            key={c.stage}
            aria-label={STAGE_LABEL[c.stage]}
            className="flex min-w-0 flex-col gap-3"
          >
            <header className="flex flex-col gap-1">
              <div className="flex items-start gap-1.5">
                <StatusDot tone={STAGE_TONE[c.stage]} className="mt-1" />
                <h3 className="eyebrow leading-tight">{STAGE_LABEL[c.stage]}</h3>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {c.tasks.length}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                {STAGE_HINT[c.stage]}
              </p>
            </header>

            <ul className="flex flex-col gap-2">
              {c.tasks.length === 0 ? (
                <li className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  empty
                </li>
              ) : (
                c.tasks.map((t) => (
                  <li key={t.number}>
                    <Link
                      href={`/t/${slug}/${t.number}`}
                      className="flex flex-col gap-2 rounded-card border border-border bg-card px-3.5 py-3 transition-colors hover:border-faint"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{t.number}</span>
                        {t.labels.includes("priority:high") ? (
                          <span className="eyebrow rounded-pill border border-border px-1.5">
                            priority
                          </span>
                        ) : null}
                        <time
                          dateTime={t.updated_at}
                          className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
                        >
                          {tuoi(t.updated_at, now)}
                        </time>
                      </div>
                      <p className="text-sm leading-snug font-medium tracking-title text-foreground">
                        {t.title}
                      </p>
                      {t.pull ? (
                        <p className="font-mono text-xs text-muted-foreground">
                          PR #{t.pull.number}
                          {t.pull.draft ? " · draft" : ""}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

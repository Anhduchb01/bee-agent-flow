import Link from "next/link";

import { khoangThoiGian } from "@/lib/duration";
import type { GhTask } from "@/lib/github/types";
import { cn } from "@/lib/utils";

const COT = "grid grid-cols-[5rem_1fr_8rem] items-center gap-3 px-5";

function tuoi(iso: string, now: number): string {
  return khoangThoiGian((now - Date.parse(iso)) / 1000);
}

function KhongCoTask() {
  return (
    <div className="rounded-card border border-dashed border-border bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium tracking-title text-foreground">No tasks yet</p>
    </div>
  );
}

/** Bảng task: mọi task đang mở, mới cập nhật trước. */
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
      <div className="min-w-[36rem] overflow-hidden rounded-card border border-border bg-card">
        <div className={cn(COT, "border-b border-border py-2.5")}>
          <span className="eyebrow">No.</span>
          <span className="eyebrow">Title</span>
          <span className="eyebrow text-right">Updated</span>
        </div>

        <ul aria-label="Project tasks">
          {sap.map((t) => (
            <li key={t.number} className={cn(COT, "border-b border-border py-3 last:border-b-0")}>
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
          ))}
        </ul>
      </div>
    </div>
  );
}

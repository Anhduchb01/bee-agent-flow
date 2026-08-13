import Link from "next/link";
import { notFound } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { khoangThoiGian } from "@/lib/duration";
import { loadProject, QueueList } from "@/features/project";
import { getActor } from "@/lib/auth";

export default async function DuAnChiTietPage({ params }: PageProps<"/p/[slug]">) {
  const actor = await getActor();
  if (!actor) return null;

  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle title={project.slug} hint={project.full} />
        {project.repo?.paused ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
            tạm dừng bằng .agent/PAUSE
          </Badge>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Đang chạy</h2>
        {project.running.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có việc nào đang chạy.</p>
        ) : (
          <ul className="divide-y rounded-lg border px-4">
            {project.running.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <Link href={`/t/${slug}/${r.number}`} className="font-medium underline-offset-4 hover:underline">
                  #{r.number}
                </Link>
                <code className="text-xs text-muted-foreground">{r.rule}</code>
                <Badge variant="outline">{r.pool}</Badge>
                <span className="text-xs text-muted-foreground">
                  {khoangThoiGian(r.elapsed_s)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Hàng đợi</h2>
        <QueueList items={project.repo?.queue ?? []} slug={slug} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">PR đang mở</h2>
        {project.prs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có PR nào.</p>
        ) : (
          <ul className="divide-y rounded-lg border px-4">
            {project.prs.map((t) => (
              <li key={t.number} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <Link href={`/t/${slug}/${t.number}`} className="font-medium underline-offset-4 hover:underline">
                  {t.title}
                </Link>
                <a
                  href={t.pull!.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-muted-foreground underline underline-offset-4"
                >
                  PR #{t.pull!.number}
                </a>
                {t.pull!.draft ? <Badge variant="outline">nháp</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Gần đây</h2>
        {(project.repo?.recent ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lần chạy nào.</p>
        ) : (
          <ul className="divide-y rounded-lg border px-4">
            {project.repo!.recent.map((r) => (
              <li key={`${r.id}-${r.at}`} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className="font-mono text-xs">#{r.number}</span>
                <code className="text-xs text-muted-foreground">{r.rule}</code>
                <Badge
                  variant="outline"
                  className={
                    r.result === "ok"
                      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                      : "border-destructive/40 text-destructive"
                  }
                >
                  {r.result}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {khoangThoiGian(r.duration_s)} · {r.turns} lượt
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

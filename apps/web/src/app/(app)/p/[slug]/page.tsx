import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/eyebrow";
import { PageTitle } from "@/components/page-title";
import { StatusDot, type Tone } from "@/components/status-dot";
import { loadProject, QueueList } from "@/features/project";
import { getActor } from "@/lib/auth";
import { khoangThoiGian } from "@/lib/duration";

function Ma({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-control border border-border bg-muted px-1.5 py-0.5 text-xs text-body">
      {children}
    </code>
  );
}

function Khoi({ children }: { children: React.ReactNode }) {
  return (
    <ul className="overflow-hidden rounded-card border border-border bg-card">{children}</ul>
  );
}

function Muc({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-5 py-3.5 text-sm last:border-b-0">
      {children}
    </li>
  );
}

export default async function DuAnChiTietPage({ params }: PageProps<"/p/[slug]">) {
  const actor = await getActor();
  if (!actor) return null;

  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-wrap items-center gap-4">
        <PageTitle title={project.slug} hint={project.full} />
        {project.repo?.paused ? (
          <span className="flex items-center gap-1.5">
            <StatusDot tone="warn" />
            <span className="eyebrow">tạm dừng bằng .agent/PAUSE</span>
          </span>
        ) : null}
      </div>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <Eyebrow>Đang chạy</Eyebrow>
        {project.running.length === 0 ? (
          <p className="text-sm text-body">Không có việc nào đang chạy.</p>
        ) : (
          <Khoi>
            {project.running.map((r) => (
              <Muc key={r.id}>
                <StatusDot tone="agent" />
                <Link
                  href={`/t/${slug}/${r.number}`}
                  className="font-mono font-medium text-foreground underline-offset-4 hover:underline"
                >
                  #{r.number}
                </Link>
                <Ma>{r.rule}</Ma>
                <span className="eyebrow">{r.pool}</span>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {khoangThoiGian(r.elapsed_s)}
                </span>
              </Muc>
            ))}
          </Khoi>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <Eyebrow>Hàng đợi</Eyebrow>
        <QueueList items={project.repo?.queue ?? []} slug={slug} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <Eyebrow>PR đang mở</Eyebrow>
        {project.prs.length === 0 ? (
          <p className="text-sm text-body">Chưa có PR nào.</p>
        ) : (
          <Khoi>
            {project.prs.map((t) => (
              <Muc key={t.number}>
                <Link
                  href={`/t/${slug}/${t.number}`}
                  className="font-medium tracking-title text-foreground underline-offset-4 hover:underline"
                >
                  {t.title}
                </Link>
                <a
                  href={t.pull!.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-link underline underline-offset-4"
                >
                  PR #{t.pull!.number}
                </a>
                {t.pull!.draft ? <span className="eyebrow">nháp</span> : null}
              </Muc>
            ))}
          </Khoi>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <Eyebrow>Gần đây</Eyebrow>
        {(project.repo?.recent ?? []).length === 0 ? (
          <p className="text-sm text-body">Chưa có lần chạy nào.</p>
        ) : (
          <Khoi>
            {project.repo!.recent.map((r) => {
              const tone: Tone = r.result === "ok" ? "ok" : "down";
              return (
                <Muc key={`${r.id}-${r.at}`}>
                  <StatusDot tone={tone} />
                  <span className="font-mono text-xs text-foreground">#{r.number}</span>
                  <Ma>{r.rule}</Ma>
                  <span className="font-mono text-xs text-body">{r.result}</span>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {khoangThoiGian(r.duration_s)} · {r.turns} lượt
                  </span>
                </Muc>
              );
            })}
          </Khoi>
        )}
      </section>
      </div>
    </main>
  );
}

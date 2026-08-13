import Link from "next/link";

import { PageTitle } from "@/components/page-title";
import { buttonVariants } from "@/components/ui/button";
import { loadProjects, ProjectCard } from "@/features/project";
import { getActor } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default async function DuAnPage() {
  const actor = await getActor();
  if (!actor) return null;

  const projects = await loadProjects();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title="Dự án" hint="Một dự án là một repo." />
        <Link href="/task-moi" className={cn(buttonVariants())}>
          Tạo task
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium tracking-title text-foreground">Chưa có dự án nào</p>
          <p className="mt-1.5 text-sm text-body">
            Thêm bằng <code>be repo add &lt;org/repo&gt;</code> trên máy agent.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </ul>
      )}
    </main>
  );
}

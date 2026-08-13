import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import type { ProjectView } from "../api/load";

export function ProjectCard({ project }: { project: ProjectView }) {
  const queue = project.repo?.queue.length ?? 0;

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/p/${project.slug}`}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          {project.slug}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{project.full}</span>
        {project.repo?.paused ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
            tạm dừng
          </Badge>
        ) : null}
        {project.repo === null ? (
          <Badge variant="outline">reconciler chưa biết dự án này</Badge>
        ) : null}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Đang chạy</dt>
          <dd className="font-mono tabular-nums">
            {project.running.length}/{project.repo?.wip.max ?? "?"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Hàng đợi</dt>
          <dd className="font-mono tabular-nums">{queue}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Task mở</dt>
          <dd className="font-mono tabular-nums">{project.tasks.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">PR mở</dt>
          <dd className="font-mono tabular-nums">{project.prs.length}</dd>
        </div>
      </dl>
    </li>
  );
}

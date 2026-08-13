import Link from "next/link";

import { StatusDot } from "@/components/status-dot";

import type { ProjectView } from "../api/load";

function So({ nhan, gia }: { nhan: string; gia: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="eyebrow">{nhan}</dt>
      <dd className="font-mono text-sm tabular-nums text-foreground">{gia}</dd>
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectView }) {
  const queue = project.repo?.queue.length ?? 0;

  return (
    <li className="rounded-card border border-border bg-card px-5 py-4 transition-colors hover:border-faint">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link
          href={`/p/${project.slug}`}
          className="text-sm font-medium tracking-title text-foreground underline-offset-4 hover:underline"
        >
          {project.slug}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{project.full}</span>
        {project.repo?.paused ? (
          <span className="flex items-center gap-1.5">
            <StatusDot tone="warn" />
            <span className="eyebrow">tạm dừng</span>
          </span>
        ) : null}
        {project.repo === null ? (
          <span className="flex items-center gap-1.5">
            <StatusDot tone="idle" />
            <span className="eyebrow">reconciler chưa biết dự án này</span>
          </span>
        ) : null}
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
        <So nhan="Đang chạy" gia={`${project.running.length}/${project.repo?.wip.max ?? "?"}`} />
        <So nhan="Hàng đợi" gia={String(queue)} />
        <So nhan="Task mở" gia={String(project.tasks.length)} />
        <So nhan="PR mở" gia={String(project.prs.length)} />
      </dl>
    </li>
  );
}

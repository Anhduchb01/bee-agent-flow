import Link from "next/link";

import { StatusDot } from "@/components/status-dot";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ProjectView } from "../api/load";

function So({ nhan, gia }: { nhan: string; gia: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="eyebrow">{nhan}</dt>
      <dd className="font-mono text-lg leading-none tabular-nums tracking-title text-foreground">
        {gia}
      </dd>
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectView }) {
  const queue = project.repo?.queue.length ?? 0;

  return (
    <li>
      <Card className="h-full transition-colors hover:border-faint">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2.5 tracking-title">
          <Link href={`/p/${project.slug}`} className="underline-offset-4 hover:underline">
            {project.slug}
          </Link>
          {project.repo?.paused ? (
            <span className="flex items-center gap-1.5 text-xs font-normal text-body">
              <StatusDot tone="warn" />
              tạm dừng
            </span>
          ) : null}
          {project.repo === null ? (
            <span className="flex items-center gap-1.5 text-xs font-normal text-body">
              <StatusDot tone="idle" />
              reconciler chưa biết dự án này
            </span>
          ) : null}
        </CardTitle>
        <CardDescription className="font-mono">{project.full}</CardDescription>
      </CardHeader>

      <CardContent>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <So nhan="Đang chạy" gia={`${project.running.length}/${project.repo?.wip.max ?? "?"}`} />
          <So nhan="Hàng đợi" gia={String(queue)} />
          <So nhan="Task mở" gia={String(project.tasks.length)} />
          <So nhan="PR mở" gia={String(project.prs.length)} />
        </dl>
      </CardContent>
      </Card>
    </li>
  );
}

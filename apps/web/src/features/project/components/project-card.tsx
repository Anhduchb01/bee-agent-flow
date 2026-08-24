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
  return (
    <li>
      {/*
       * The whole card is the tap target, not just the slug text. It used to
       * be a text-sized link inside a card that already had hover styling —
       * on a phone that reads as "the card does nothing". `after:inset-0`
       * stretches the ONE link over the card (nothing else in here is
       * interactive, so no nested-control trap) and keeps a single
       * accessible name for screen readers.
       */}
      <Card className="relative h-full transition-colors hover:border-faint focus-within:border-faint">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2.5 tracking-title">
          <Link
            href={`/p/${project.slug}`}
            className="underline-offset-4 after:absolute after:inset-0 hover:underline"
          >
            {project.slug}
          </Link>
          {project.repo?.paused ? (
            <span className="flex items-center gap-1.5 text-xs font-normal text-body">
              <StatusDot tone="warn" />
              paused
            </span>
          ) : null}
          {project.repo === null ? (
            <span className="flex items-center gap-1.5 text-xs font-normal text-body">
              <StatusDot tone="idle" />
              runner does not know this project
            </span>
          ) : null}
        </CardTitle>
        <CardDescription className="font-mono">{project.full}</CardDescription>
      </CardHeader>

      <CardContent>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <So nhan="Running" gia={String(project.running.length)} />
          <So nhan="Open tasks" gia={String(project.tasks.length)} />
          <So nhan="Open PRs" gia={String(project.prs.length)} />
        </dl>
      </CardContent>
      </Card>
    </li>
  );
}

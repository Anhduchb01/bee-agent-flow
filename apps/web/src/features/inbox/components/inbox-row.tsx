import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { daCho } from "@/lib/duration";
import { cn } from "@/lib/utils";

import { KIND_LABEL, type InboxItem } from "../lib/derive";

const TONE: Record<InboxItem["kind"], string> = {
  "can-nguoi": "border-destructive/40 text-destructive",
  "agent-hoi-nguoc": "border-violet-500/40 text-violet-600 dark:text-violet-400",
  "duyet-pr": "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  "duyet-spec": "border-sky-500/40 text-sky-700 dark:text-sky-400",
  "cho-phep-nhan-task": "border-amber-500/40 text-amber-700 dark:text-amber-500",
};

export function InboxRow({ item }: { item: InboxItem }) {
  const href = `/t/${item.slug}/${item.number}`;

  return (
    <li className="flex flex-col gap-3 border-b px-1 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={TONE[item.kind]}>
            {KIND_LABEL[item.kind]}
          </Badge>
          {item.priority ? <Badge variant="outline">ưu tiên</Badge> : null}
          <span className="font-mono text-xs text-muted-foreground">
            {item.slug}#{item.number}
          </span>
        </div>

        <Link
          href={href}
          className="mt-1.5 block text-sm font-medium underline-offset-4 hover:underline"
        >
          {item.title}
        </Link>

        <p className="mt-1 text-xs text-muted-foreground">
          <time dateTime={item.waitingSince}>{daCho(item.waitingS)}</time>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {item.prUrl ? (
          <a
            href={item.prUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            PR #{item.prNumber}
          </a>
        ) : null}
        <Link
          href={href}
          className={cn(
            buttonVariants({
              size: "sm",
              variant: item.action.kind === "mo-task" ? "outline" : "default",
            }),
          )}
        >
          {item.action.label}
        </Link>
      </div>
    </li>
  );
}

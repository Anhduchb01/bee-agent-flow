import Link from "next/link";

import { StatusDot, type Tone } from "@/components/status-dot";
import { buttonVariants } from "@/components/ui/button";
import { daCho } from "@/lib/duration";
import { cn } from "@/lib/utils";

import { KIND_LABEL, type InboxItem } from "../lib/derive";

/** Màu chỉ tới mức một chấm 6px — xem docs/design/vercel-geist.md §2.3. */
const TONE: Record<InboxItem["kind"], Tone> = {
  "can-nguoi": "down",
  "agent-hoi-nguoc": "agent",
  "duyet-pr": "ok",
  "duyet-spec": "ok",
  "cho-phep-nhan-task": "warn",
};

export function InboxRow({ item }: { item: InboxItem }) {
  const href = `/t/${item.slug}/${item.number}`;

  return (
    <li className="group flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-1.5">
            <StatusDot tone={TONE[item.kind]} />
            <span className="eyebrow">{KIND_LABEL[item.kind]}</span>
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {item.slug}#{item.number}
          </span>
          {item.priority ? (
            <span className="eyebrow rounded-pill border border-border px-2 py-0.5">
              ưu tiên
            </span>
          ) : null}
        </div>

        <Link
          href={href}
          className="mt-2 block text-sm font-medium tracking-title text-foreground underline-offset-4 hover:underline"
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
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-body")}
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

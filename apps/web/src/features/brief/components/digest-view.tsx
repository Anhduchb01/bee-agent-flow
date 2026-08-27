import Link from "next/link";

import { StatusDot } from "@/components/status-dot";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

import type { Digest } from "../lib/digest";

/**
 * Activity. Thứ tự cố ý: **chờ bạn duyệt** trước (việc của người), rồi **kẹt**
 * (cần can thiệp), rồi phần còn lại. Mở điện thoại ra thì hai mục đầu là tất
 * cả những gì cần đọc.
 */
export function DigestView({ digest }: { digest: Digest }) {
  if (digest.kind !== "worked") {
    // Rỗng-vì-không-xếp-việc ≠ rỗng-vì-không-chạy-được (PRD §4.1).
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {digest.kind === "nothing-queued"
              ? "Nothing has been queued"
              : "Work is queued but nothing could run"}
          </EmptyTitle>
          <EmptyDescription>
            {digest.kind === "nothing-queued" ? (
              <>Queue an issue into the Autopilot lane on the{" "}<Link href="/projects?view=kanban" className="underline">project board</Link>, then hit Run now — or leave it for the next tick.</>
            ) : (
              <>The reason is on each item below — usually the quota brake or PAUSE.</>
            )}
          </EmptyDescription>
        </EmptyHeader>
        {digest.stillQueued.length > 0 && <WaitingList digest={digest} />}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {digest.toReview.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Waiting for you ({digest.toReview.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {digest.toReview.map((m) => (
              <li key={m.session.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-3">
                <StatusDot tone="ok" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {m.session.title ?? `${m.session.slug}-${m.session.num}`}
                </span>
                {m.pr !== null && (
                  <Link href={`/pr/${m.session.slug}/${m.pr.number ?? 0}`} className="font-mono text-xs text-body hover:underline">
                    PR #{m.pr.number} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {digest.outcome.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Stuck ({digest.outcome.length})</h2>
          <ul className="flex flex-col gap-2">
            {digest.outcome.map((m) => (
              <li key={m.session.id} className="flex flex-col gap-1 rounded-card border border-border bg-card p-3">
                <span className="flex items-center gap-2">
                  <StatusDot tone={m.session.needs_human ? "down" : "warn"} />
                  <Link href={`/sessions/${m.session.id}`} className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                    {m.session.title ?? `${m.session.slug}-${m.session.num}`}
                  </Link>
                </span>
                {/* Câu vì-sao là lý do bản tin này tồn tại. */}
                <span className="text-xs text-body">{m.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Ran ({digest.ran.length})</h2>
        <ul className="flex flex-col gap-1">
          {digest.ran.map((m) => (
            <li key={m.session.id} className="flex items-center gap-3 px-1 text-xs">
              <span className="font-mono text-muted-foreground">{m.session.status}</span>
              <Link href={`/sessions/${m.session.id}`} className="min-w-0 flex-1 truncate text-body hover:underline">
                {m.session.title ?? `${m.session.slug}-${m.session.num}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {digest.stillQueued.length > 0 && <WaitingList digest={digest} />}
    </div>
  );
}

function WaitingList({ digest }: { digest: Digest }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">Still queued ({digest.stillQueued.length})</h2>
      <ul className="flex flex-col gap-1">
        {digest.stillQueued.map((m) => (
          <li key={`${m.item.repo}#${m.item.issue}`} className="flex flex-wrap items-center gap-2 px-1 text-xs">
            <span className="font-mono text-muted-foreground">
              {m.item.slug}#{m.item.issue}
            </span>
            <span className="text-body">{m.why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

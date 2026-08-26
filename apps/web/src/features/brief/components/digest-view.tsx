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
  if (digest.loai !== "co-viec") {
    // Rỗng-vì-không-xếp-việc ≠ rỗng-vì-không-chạy-được (PRD §4.1).
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {digest.loai === "khong-xep-viec"
              ? "Nothing has been queued"
              : "Work is queued but nothing could run"}
          </EmptyTitle>
          <EmptyDescription>
            {digest.loai === "khong-xep-viec" ? (
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
              <li key={m.phien.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-3">
                <StatusDot tone="ok" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {m.phien.title ?? `${m.phien.slug}-${m.phien.num}`}
                </span>
                {m.pr !== null && (
                  <Link href={`/pr/${m.phien.slug}/${m.pr.number ?? 0}`} className="font-mono text-xs text-body hover:underline">
                    PR #{m.pr.number} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {digest.ket.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Stuck ({digest.ket.length})</h2>
          <ul className="flex flex-col gap-2">
            {digest.ket.map((m) => (
              <li key={m.phien.id} className="flex flex-col gap-1 rounded-card border border-border bg-card p-3">
                <span className="flex items-center gap-2">
                  <StatusDot tone={m.phien.needs_human ? "down" : "warn"} />
                  <Link href={`/sessions/${m.phien.id}`} className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                    {m.phien.title ?? `${m.phien.slug}-${m.phien.num}`}
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
            <li key={m.phien.id} className="flex items-center gap-3 px-1 text-xs">
              <span className="font-mono text-muted-foreground">{m.phien.status}</span>
              <Link href={`/sessions/${m.phien.id}`} className="min-w-0 flex-1 truncate text-body hover:underline">
                {m.phien.title ?? `${m.phien.slug}-${m.phien.num}`}
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
          <li key={`${m.viec.repo}#${m.viec.issue}`} className="flex flex-wrap items-center gap-2 px-1 text-xs">
            <span className="font-mono text-muted-foreground">
              {m.viec.slug}#{m.viec.issue}
            </span>
            <span className="text-body">{m.why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

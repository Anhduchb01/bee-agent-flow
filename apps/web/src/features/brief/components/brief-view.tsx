import Link from "next/link";

import { StatusDot } from "@/components/status-dot";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

import type { BanTin } from "../lib/tom-tat";

/**
 * Activity. Thứ tự cố ý: **chờ bạn duyệt** trước (việc của người), rồi **kẹt**
 * (cần can thiệp), rồi phần còn lại. Mở điện thoại ra thì hai mục đầu là tất
 * cả những gì cần đọc.
 */
export function BriefView({ banTin }: { banTin: BanTin }) {
  if (banTin.loai !== "co-viec") {
    // Rỗng-vì-không-xếp-việc ≠ rỗng-vì-không-chạy-được (PRD §4.1).
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {banTin.loai === "khong-xep-viec"
              ? "Nothing has been queued"
              : "Work is queued but nothing could run"}
          </EmptyTitle>
          <EmptyDescription>
            {banTin.loai === "khong-xep-viec" ? (
              <>Queue an issue into the Autopilot lane on the{" "}<Link href="/projects?view=kanban" className="underline">project board</Link>, then hit Run now — or leave it for the next tick.</>
            ) : (
              <>The reason is on each item below — usually the quota brake or PAUSE.</>
            )}
          </EmptyDescription>
        </EmptyHeader>
        {banTin.conCho.length > 0 && <DanhSachCho banTin={banTin} />}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {banTin.choDuyet.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Waiting for you ({banTin.choDuyet.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {banTin.choDuyet.map((m) => (
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

      {banTin.ket.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Stuck ({banTin.ket.length})</h2>
          <ul className="flex flex-col gap-2">
            {banTin.ket.map((m) => (
              <li key={m.phien.id} className="flex flex-col gap-1 rounded-card border border-border bg-card p-3">
                <span className="flex items-center gap-2">
                  <StatusDot tone={m.phien.needs_human ? "down" : "warn"} />
                  <Link href={`/sessions/${m.phien.id}`} className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                    {m.phien.title ?? `${m.phien.slug}-${m.phien.num}`}
                  </Link>
                </span>
                {/* Câu vì-sao là lý do bản tin này tồn tại. */}
                <span className="text-xs text-body">{m.viSao}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Ran ({banTin.daChay.length})</h2>
        <ul className="flex flex-col gap-1">
          {banTin.daChay.map((m) => (
            <li key={m.phien.id} className="flex items-center gap-3 px-1 text-xs">
              <span className="font-mono text-muted-foreground">{m.phien.status}</span>
              <Link href={`/sessions/${m.phien.id}`} className="min-w-0 flex-1 truncate text-body hover:underline">
                {m.phien.title ?? `${m.phien.slug}-${m.phien.num}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {banTin.conCho.length > 0 && <DanhSachCho banTin={banTin} />}
    </div>
  );
}

function DanhSachCho({ banTin }: { banTin: BanTin }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">Still queued ({banTin.conCho.length})</h2>
      <ul className="flex flex-col gap-1">
        {banTin.conCho.map((m) => (
          <li key={`${m.viec.repo}#${m.viec.issue}`} className="flex flex-wrap items-center gap-2 px-1 text-xs">
            <span className="font-mono text-muted-foreground">
              {m.viec.slug}#{m.viec.issue}
            </span>
            <span className="text-body">{m.viSao}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

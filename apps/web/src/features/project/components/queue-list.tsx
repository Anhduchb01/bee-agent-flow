import Link from "next/link";

import type { BeeQueueItem } from "@/lib/bee/types";

/**
 * Hàng đợi kèm `wait_reason`.
 *
 * Trường đó là thứ đáng giá nhất trên trang này: nó trả lời "sao task của tôi
 * chưa chạy?" mà không cần ai mở log trên máy. Bỏ nó đi thì danh sách này chỉ
 * còn là một cột số.
 */
export function QueueList({ items, slug }: { items: BeeQueueItem[]; slug: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-body">Không có gì đang chờ slot.</p>;
  }

  return (
    <ul aria-label="Hàng đợi" className="overflow-hidden rounded-card border border-border bg-card">
      {items.map((q) => (
        <li key={`${q.number}-${q.rule}`} className="flex flex-col gap-1.5 border-b border-border px-5 py-3.5 last:border-b-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/t/${slug}/${q.number}`}
              className="text-sm font-medium tracking-title text-foreground underline-offset-4 hover:underline"
            >
              {q.title}
            </Link>
            <span className="font-mono text-xs text-muted-foreground">#{q.number}</span>
            <code className="rounded-control border border-border bg-muted px-1.5 py-0.5 text-xs text-body">{q.rule}</code>
          </div>
          <p className="text-xs text-muted-foreground">{q.wait_reason}</p>
        </li>
      ))}
    </ul>
  );
}

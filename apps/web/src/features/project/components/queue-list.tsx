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
    return <p className="text-sm text-muted-foreground">Không có gì đang chờ slot.</p>;
  }

  return (
    <ul aria-label="Hàng đợi" className="divide-y rounded-lg border px-4">
      {items.map((q) => (
        <li key={`${q.number}-${q.rule}`} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/t/${slug}/${q.number}`}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {q.title}
            </Link>
            <span className="font-mono text-xs text-muted-foreground">#{q.number}</span>
            <code className="text-xs text-muted-foreground">{q.rule}</code>
          </div>
          <p className="text-xs text-muted-foreground">{q.wait_reason}</p>
        </li>
      ))}
    </ul>
  );
}

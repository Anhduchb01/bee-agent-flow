import Link from "next/link";

import { cn } from "@/lib/utils";

export type ViewMode = "bang" | "kanban";

export function docViewMode(value: string | string[] | undefined): ViewMode {
  return value === "kanban" ? "kanban" : "bang";
}

/**
 * Chuyển kiểu xem bằng hai `<Link>` chứ không bằng state trong trình duyệt.
 *
 * Kiểu xem nằm trong URL nên nó chia sẻ được, quay lại được bằng nút Back, và
 * server dựng sẵn đúng kiểu — không có một nhịp nháy đổi bố cục sau khi trang
 * đã hiện. Một `useState` ở đây sẽ mất cả ba thứ đó để đổi lấy đúng con số 0.
 */
export function ViewSwitch({ slug, current }: { slug: string; current: ViewMode }) {
  const items: { mode: ViewMode; label: string; href: string }[] = [
    { mode: "bang", label: "Table", href: `/p/${slug}` },
    { mode: "kanban", label: "Kanban", href: `/p/${slug}?view=kanban` },
  ];

  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex rounded-control border border-border bg-card p-0.5"
    >
      {items.map((i) => (
        <Link
          key={i.mode}
          href={i.href}
          aria-current={current === i.mode ? "true" : undefined}
          className={cn(
            "rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors",
            current === i.mode
              ? "bg-primary text-primary-foreground"
              : "text-body hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

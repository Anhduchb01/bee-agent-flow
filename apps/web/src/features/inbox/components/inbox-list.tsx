import type { InboxItem } from "../lib/derive";
import { InboxRow } from "./inbox-row";

/**
 * Rỗng **là** trạng thái tốt, và phải trông như vậy.
 *
 * Một danh sách rỗng không có chữ trông giống hệt một lần tải hỏng, và người
 * dùng sẽ tải lại trang vài lần trước khi tin. Nói thẳng ra là xong.
 */
function KhongCoGi() {
  return (
    <div className="rounded-card border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="text-sm font-medium tracking-title text-foreground">
        Không có gì chờ bạn
      </p>
      <p className="mt-1.5 text-sm text-body">
        Mọi thứ đang ở phía máy. Bạn sẽ nhận thông báo khi có việc cần bạn quyết.
      </p>
    </div>
  );
}

export function InboxList({ items }: { items: InboxItem[] }) {
  if (items.length === 0) return <KhongCoGi />;

  return (
    <ul
      aria-label="Việc đang chờ bạn"
      className="overflow-hidden rounded-card border border-border bg-card"
    >
      {items.map((item) => (
        <InboxRow key={item.key} item={item} />
      ))}
    </ul>
  );
}

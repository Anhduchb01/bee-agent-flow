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
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="text-sm font-medium">Không có gì chờ bạn</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Mọi thứ đang ở phía máy. Bạn sẽ nhận thông báo khi có việc cần bạn quyết.
      </p>
    </div>
  );
}

export function InboxList({ items }: { items: InboxItem[] }) {
  if (items.length === 0) return <KhongCoGi />;

  return (
    <ul aria-label="Việc đang chờ bạn" className="rounded-lg border px-4">
      {items.map((item) => (
        <InboxRow key={item.key} item={item} />
      ))}
    </ul>
  );
}

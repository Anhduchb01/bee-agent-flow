import type { InboxItem } from "./derive";

export interface NhomDuAn {
  slug: string;
  items: InboxItem[];
  /** Việc chờ lâu nhất trong nhóm — khoá xếp hạng của chính nhóm. */
  choLauNhatS: number;
}

/**
 * Gộp việc theo dự án.
 *
 * Một danh sách phẳng trộn ba dự án bắt người đọc tự phân loại trong đầu ở mỗi
 * dòng: "cái này của repo nào, có phải cùng chỗ với dòng trên không". Gộp lại
 * thì mắt đọc theo khối, và mỗi khối là một ngữ cảnh.
 *
 * **Nhóm vẫn xếp theo việc chờ lâu nhất bên trong nó**, không xếp theo bảng
 * chữ cái. Gộp là để dễ đọc, không phải để đánh mất thứ tự khẩn cấp — dự án
 * đang có thứ thối rữa một ngày phải nằm trên dự án vừa mới có việc.
 */
export function nhomTheoDuAn(items: InboxItem[]): NhomDuAn[] {
  const map = new Map<string, InboxItem[]>();
  for (const i of items) {
    const cu = map.get(i.slug);
    if (cu) cu.push(i);
    else map.set(i.slug, [i]);
  }

  return [...map.entries()]
    .map(([slug, ds]) => ({
      slug,
      // Danh sách vào đã xếp theo thời gian chờ giảm dần; giữ nguyên thứ tự đó.
      items: ds,
      choLauNhatS: ds.reduce((max, i) => Math.max(max, i.waitingS), 0),
    }))
    .sort((a, b) => b.choLauNhatS - a.choLauNhatS || a.slug.localeCompare(b.slug));
}

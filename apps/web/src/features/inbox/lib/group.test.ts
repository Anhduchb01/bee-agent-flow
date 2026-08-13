import { describe, expect, it } from "vitest";

import type { InboxItem } from "./derive";
import { nhomTheoDuAn } from "./group";

function muc(slug: string, number: number, waitingS: number): InboxItem {
  return {
    key: `${slug}#${number}`,
    kind: "duyet-spec",
    slug,
    number,
    title: `Việc ${number}`,
    waitingSince: "2026-08-13T09:00:00Z",
    waitingS,
    priority: false,
    prNumber: null,
    prUrl: null,
    action: { kind: "duyet-spec", label: "Duyệt spec" },
  };
}

// Danh sách vào luôn đã xếp theo thời gian chờ giảm dần (deriveInbox làm việc đó).
const DS = [
  muc("blog", 9, 93_600),
  muc("myapp", 47, 24_000),
  muc("shop", 30, 16_200),
  muc("myapp", 38, 12_000),
  muc("shop", 36, 9_600),
  muc("myapp", 41, 3_900),
];

describe("nhomTheoDuAn", () => {
  it("gộp đúng theo dự án", () => {
    const nhom = nhomTheoDuAn(DS);

    expect(nhom.map((n) => n.slug)).toEqual(["blog", "myapp", "shop"]);
    expect(nhom.find((n) => n.slug === "myapp")?.items).toHaveLength(3);
  });

  // Gộp là để dễ đọc, không phải để đánh mất thứ tự khẩn cấp.
  it("nhóm xếp theo việc chờ lâu nhất bên trong, không theo bảng chữ cái", () => {
    const nhom = nhomTheoDuAn(DS);

    expect(nhom.map((n) => n.choLauNhatS)).toEqual([93_600, 24_000, 16_200]);
  });

  it("dự án chỉ có việc mới thì nằm dưới dự án có việc cũ", () => {
    const nhom = nhomTheoDuAn([muc("a", 1, 100), muc("b", 2, 90_000)]);

    expect(nhom.map((n) => n.slug)).toEqual(["b", "a"]);
  });

  it("trong mỗi nhóm giữ nguyên thứ tự đã xếp của danh sách vào", () => {
    const myapp = nhomTheoDuAn(DS).find((n) => n.slug === "myapp")!;

    expect(myapp.items.map((i) => i.number)).toEqual([47, 38, 41]);
  });

  it("hai dự án chờ bằng nhau thì xếp theo tên cho ổn định", () => {
    const nhom = nhomTheoDuAn([muc("zebra", 1, 500), muc("alpha", 2, 500)]);

    expect(nhom.map((n) => n.slug)).toEqual(["alpha", "zebra"]);
  });

  it("danh sách rỗng thì không có nhóm nào", () => {
    expect(nhomTheoDuAn([])).toEqual([]);
  });

  it("không làm mất mục nào", () => {
    const tong = nhomTheoDuAn(DS).reduce((n, g) => n + g.items.length, 0);
    expect(tong).toBe(DS.length);
  });
});

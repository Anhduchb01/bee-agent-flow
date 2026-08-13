import { describe, expect, it } from "vitest";

import type { InboxItem } from "./derive";
import { BO_LOC_RONG, coLocGiKhong, duAnCoTrong, loaiCoTrong, locViec } from "./filter";

function muc(over: Partial<InboxItem> = {}): InboxItem {
  return {
    key: "myapp#44",
    kind: "duyet-spec",
    slug: "myapp",
    number: 44,
    title: "Lọc đơn hàng theo trạng thái",
    waitingSince: "2026-08-13T09:00:00Z",
    waitingS: 3600,
    priority: false,
    prNumber: null,
    prUrl: null,
    action: { kind: "duyet-spec", label: "Duyệt spec" },
    ...over,
  };
}

const DS: InboxItem[] = [
  muc(),
  muc({ key: "shop#30", slug: "shop", number: 30, kind: "duyet-pr", title: "Tính thuế theo vùng", waitingS: 16_200 }),
  muc({ key: "blog#9", slug: "blog", number: 9, kind: "can-nguoi", title: "RSS trả về 500", waitingS: 93_600, priority: true }),
  muc({ key: "myapp#41", number: 41, kind: "cho-phep-nhan-task", title: "Gộp màn hình thông báo", waitingS: 900 }),
];

describe("locViec", () => {
  it("không lọc gì thì trả nguyên danh sách", () => {
    expect(locViec(DS, BO_LOC_RONG)).toHaveLength(4);
  });

  it("lọc theo loại việc", () => {
    expect(locViec(DS, { ...BO_LOC_RONG, loai: "can-nguoi" }).map((i) => i.key)).toEqual([
      "blog#9",
    ]);
  });

  it("lọc theo dự án", () => {
    expect(locViec(DS, { ...BO_LOC_RONG, duAn: "myapp" }).map((i) => i.number)).toEqual([44, 41]);
  });

  it("lọc theo thời gian đã chờ", () => {
    expect(locViec(DS, { ...BO_LOC_RONG, choLauHonS: 4 * 3600 }).map((i) => i.key)).toEqual([
      "shop#30",
      "blog#9",
    ]);
  });

  it("lọc theo ưu tiên", () => {
    expect(locViec(DS, { ...BO_LOC_RONG, uuTien: true }).map((i) => i.key)).toEqual(["blog#9"]);
  });

  it("các bộ lọc cộng dồn chứ không thay nhau", () => {
    const ket = locViec(DS, { ...BO_LOC_RONG, duAn: "myapp", loai: "duyet-spec" });
    expect(ket.map((i) => i.key)).toEqual(["myapp#44"]);
  });

  describe("ô tìm", () => {
    it("tìm trong tiêu đề", () => {
      expect(locViec(DS, { ...BO_LOC_RONG, tim: "thuế" }).map((i) => i.key)).toEqual(["shop#30"]);
    });

    it("tìm theo slug#số", () => {
      expect(locViec(DS, { ...BO_LOC_RONG, tim: "blog#9" }).map((i) => i.key)).toEqual(["blog#9"]);
    });

    // Người ta gõ không dấu khi vội, và một ô tìm không tha thứ điều đó thì
    // sẽ bị bỏ dùng sau vài lần trả về rỗng.
    it("gõ không dấu vẫn tìm được", () => {
      expect(locViec(DS, { ...BO_LOC_RONG, tim: "loc don" }).map((i) => i.key)).toEqual([
        "myapp#44",
      ]);
      expect(locViec(DS, { ...BO_LOC_RONG, tim: "tinh thue" }).map((i) => i.key)).toEqual([
        "shop#30",
      ]);
    });

    it("không phân biệt hoa thường, bỏ khoảng trắng thừa", () => {
      expect(locViec(DS, { ...BO_LOC_RONG, tim: "  RSS  " })).toHaveLength(1);
    });

    it("không khớp gì thì trả rỗng, không ném lỗi", () => {
      expect(locViec(DS, { ...BO_LOC_RONG, tim: "không có thứ này" })).toEqual([]);
    });
  });

  it("giữ nguyên thứ tự đã xếp của danh sách vào", () => {
    const ket = locViec(DS, { ...BO_LOC_RONG, duAn: "myapp" });
    expect(ket.map((i) => i.key)).toEqual(["myapp#44", "myapp#41"]);
  });
});

describe("coLocGiKhong", () => {
  it("phân biệt được bảng rỗng vì lọc với bảng rỗng vì hết việc", () => {
    expect(coLocGiKhong(BO_LOC_RONG)).toBe(false);
    expect(coLocGiKhong({ ...BO_LOC_RONG, tim: "x" })).toBe(true);
    expect(coLocGiKhong({ ...BO_LOC_RONG, uuTien: true })).toBe(true);
    expect(coLocGiKhong({ ...BO_LOC_RONG, choLauHonS: 3600 })).toBe(true);
  });
});

describe("lựa chọn dựng từ dữ liệu thật", () => {
  it("chỉ liệt kê dự án có mặt trong danh sách", () => {
    expect(duAnCoTrong(DS)).toEqual(["blog", "myapp", "shop"]);
  });

  it("chỉ liệt kê loại việc có mặt", () => {
    expect(new Set(loaiCoTrong(DS))).toEqual(
      new Set(["duyet-spec", "duyet-pr", "can-nguoi", "cho-phep-nhan-task"]),
    );
  });

  it("danh sách rỗng thì không có lựa chọn nào", () => {
    expect(duAnCoTrong([])).toEqual([]);
    expect(loaiCoTrong([])).toEqual([]);
  });
});

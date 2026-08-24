import { describe, expect, it } from "vitest";

import { boQuaViec, doiThuTu, themViec, viecKeTiep, type HangDoi } from "./queue";

const RONG: HangDoi = { items: [], paused: false };

const V = (slug: string, issue: number) => ({ slug, repo: `you/${slug}`, issue });

describe("hàng đợi Autopilot — thuần, thứ tự là ý nghĩa", () => {
  it("thêm việc: xuống cuối hàng, trạng thái waiting", () => {
    const q = themViec(themViec(RONG, V("myapp", 41)), V("blog", 7));
    expect(q.items.map((i) => i.issue)).toEqual([41, 7]);
    expect(q.items[0]?.status).toBe("waiting");
  });

  it("cùng một issue không vào hàng hai lần", () => {
    const q = themViec(themViec(RONG, V("myapp", 41)), V("myapp", 41));
    expect(q.items).toHaveLength(1);
  });

  it("cùng số issue nhưng KHÁC repo là hai việc khác nhau", () => {
    const q = themViec(themViec(RONG, V("myapp", 7)), V("blog", 7));
    expect(q.items).toHaveLength(2);
  });

  it("bỏ việc theo repo+issue", () => {
    const q = boQuaViec(themViec(themViec(RONG, V("myapp", 41)), V("blog", 7)), "you/myapp", 41);
    expect(q.items.map((i) => i.issue)).toEqual([7]);
  });

  it("đổi thứ tự: lên/xuống một bậc, đầu và cuối không rơi ra ngoài", () => {
    let q = [41, 39, 7].reduce((acc, n) => themViec(acc, V("myapp", n)), RONG);
    q = doiThuTu(q, "you/myapp", 39, -1);
    expect(q.items.map((i) => i.issue)).toEqual([39, 41, 7]);
    q = doiThuTu(q, "you/myapp", 39, -1); // đã ở đầu
    expect(q.items.map((i) => i.issue)).toEqual([39, 41, 7]);
    q = doiThuTu(q, "you/myapp", 7, +1); // đã ở cuối
    expect(q.items.map((i) => i.issue)).toEqual([39, 41, 7]);
  });

  it("bỏ qua việc đang chạy, lấy waiting kế tiếp (khi còn chỗ)", () => {
    // Còn chỗ = songSongToiDa 2; với trần mặc định 1 thì đúng là KHÔNG nhặt gì,
    // và đó là bài của test ngay dưới.
    let q = themViec(themViec(RONG, V("myapp", 41)), V("blog", 7));
    q = { ...q, items: [{ ...q.items[0]!, status: "running" }, q.items[1]!] };
    expect(viecKeTiep(q, { songSongToiDa: 2 })?.issue).toBe(7);
  });

  it("đã có việc đang chạy và trần song song là 1 → không nhặt thêm", () => {
    let q = themViec(themViec(RONG, V("myapp", 41)), V("blog", 7));
    q = { ...q, items: [{ ...q.items[0]!, status: "running" }, q.items[1]!] };
    expect(viecKeTiep(q, { songSongToiDa: 1 })).toBeNull();
    expect(viecKeTiep(q, { songSongToiDa: 2 })?.issue).toBe(7);
  });

  it("⏸ tạm dừng: hàng đợi giữ nguyên nhưng không nhặt việc nào", () => {
    const q = { ...themViec(RONG, V("myapp", 41)), paused: true };
    expect(viecKeTiep(q)).toBeNull();
    expect(q.items).toHaveLength(1);
  });

  it("việc đã xong ở lại trong hàng — người dùng chốt là 'xong vẫn ở lại'", () => {
    let q = themViec(RONG, V("myapp", 41));
    q = { ...q, items: [{ ...q.items[0]!, status: "done" }] };
    expect(q.items).toHaveLength(1);
    expect(viecKeTiep(q)).toBeNull();
  });
});

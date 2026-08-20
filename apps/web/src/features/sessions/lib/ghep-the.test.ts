import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ghepThe, type Muc } from "./ghep-the";
import { gopSuKien } from "./parse-events";

function laToolCard(m: Muc): m is Extract<Muc, { loai: "tool-card" }> {
  return m.loai === "tool-card";
}

function docFixture(ten: string): string[] {
  const file = path.join(process.cwd(), "src", "features", "sessions", "lib", "fixtures", ten);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((d) => d.trim() !== "");
}

describe("ghepThe", () => {
  it("fixture thật: tool Bash ghép cặp theo tool_use id thành một thẻ đã xong", () => {
    const { suKien } = gopSuKien(docFixture("fixture-interject.jsonl"));
    const the = ghepThe(suKien).filter(laToolCard);

    expect(the).toHaveLength(1);
    expect(the[0].ten).toBe("Bash");
    expect(the[0].id).toMatch(/^toolu_/);
    expect(the[0].trangThai).toBe("xong");
    expect(the[0].ketQua).toContain("xong");
    expect(the[0].lenh).toContain("sleep 8");
  });

  it("tool chưa có kết quả giữ trạng thái đang chạy — spinner có thật để quay", () => {
    const the = ghepThe([
      { loai: "tool", ten: "Bash", thamSo: "{}", id: "toolu_1", lenh: "pnpm test" },
    ]).filter(laToolCard);
    expect(the[0].trangThai).toBe("dang-chay");
    expect(the[0].ketQua).toBeNull();
  });

  it("is_error đánh dấu thẻ lỗi, và kết quả vào ĐÚNG thẻ theo id dù xen kẽ", () => {
    const the = ghepThe([
      { loai: "tool", ten: "Bash", thamSo: "{}", id: "toolu_a" },
      { loai: "tool", ten: "Write", thamSo: "{}", id: "toolu_b", file: "a.ts" },
      { loai: "tool-xong", text: "boom", id: "toolu_b", loi: true },
      { loai: "tool-xong", text: "ok", id: "toolu_a", loi: false },
    ]).filter(laToolCard);

    expect(the.map((t) => [t.ten, t.trangThai, t.ketQua])).toEqual([
      ["Bash", "xong", "ok"],
      ["Write", "loi", "boom"],
    ]);
  });

  it("sự kiện cũ không có id rơi về FIFO — stream ghi trước bản này vẫn đọc được", () => {
    const the = ghepThe([
      { loai: "tool", ten: "Read", thamSo: "{}" },
      { loai: "tool-xong", text: "nội dung file" },
    ]).filter(laToolCard);
    expect(the[0].trangThai).toBe("xong");
  });

  it("thẻ nằm ở vị trí tool BẮT ĐẦU trong dòng thời gian, không nhảy xuống lúc xong", () => {
    const muc = ghepThe([
      { loai: "tool", ten: "Bash", thamSo: "{}", id: "toolu_1" },
      { loai: "agent-noi", text: "đang chờ lệnh chạy…" },
      { loai: "tool-xong", text: "ok", id: "toolu_1" },
    ]);
    expect(muc.map((m) => m.loai)).toEqual(["tool-card", "agent-noi"]);
    expect(muc[0]).toMatchObject({ trangThai: "xong" });
  });
});

describe("thẻ xin-quyền (V2.5b)", () => {
  it("bee_approval ghép ngược vào đúng thẻ theo requestId — không thêm dòng", () => {
    const muc = ghepThe([
      { loai: "xin-quyen", requestId: "r1", ten: "Bash", thamSo: '{"command":"ls"}' },
      { loai: "xin-quyen", requestId: "r2", ten: "Write", thamSo: "{}" },
      { loai: "quyen-da-tra-loi", requestId: "r1", choPhep: true },
    ]);
    expect(muc).toHaveLength(2);
    expect(muc[0]).toMatchObject({ loai: "xin-quyen", requestId: "r1", traLoi: "allow" });
    expect(muc[1]).toMatchObject({ loai: "xin-quyen", requestId: "r2", traLoi: null });
  });
});

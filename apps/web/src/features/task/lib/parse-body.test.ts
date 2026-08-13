import { describe, expect, it } from "vitest";

import { seedGithub } from "@/lib/fixtures/github";

import { parseTaskBody } from "./parse-body";

const seed = seedGithub(new Date("2026-08-13T10:00:00Z"));
const body = (slug: string, num: number) =>
  seed.tasks.find((t) => t.slug === slug && t.number === num)!.body;

describe("parseTaskBody", () => {
  it("tách đủ năm mục của một issue đúng hợp đồng", () => {
    const parsed = parseTaskBody(body("myapp", 38));

    expect(parsed.sections.map((s) => s.heading)).toEqual([
      "Mục tiêu",
      "Acceptance Criteria",
      "Ràng buộc kỹ thuật",
      "Out of scope",
      "UI Reference",
    ]);
    expect(parsed.missing).toEqual([]);
    expect(parsed.preamble).toBe("");
  });

  it("rút AC thành checkbox", () => {
    const parsed = parseTaskBody(body("myapp", 38));

    expect(parsed.acceptance).toHaveLength(2);
    expect(parsed.acceptance[0].text).toContain("Given danh sách đơn");
    expect(parsed.acceptance[0].done).toBe(false);
  });

  it("đọc được checkbox đã tick", () => {
    const parsed = parseTaskBody(
      "### Acceptance Criteria\n\n- [x] Xong rồi\n- [ ] Chưa xong\n* [X] Cũng xong",
    );

    expect(parsed.acceptance).toEqual([
      { text: "Xong rồi", done: true },
      { text: "Chưa xong", done: false },
      { text: "Cũng xong", done: true },
    ]);
  });

  // Issue tạo tay, hoặc từ thời trước khi có template. Không được mất chữ.
  it("issue không đúng hợp đồng thì nói thiếu mục nào, không mất chữ", () => {
    const parsed = parseTaskBody(body("shop", 33));

    expect(parsed.sections.map((s) => s.heading)).toEqual(["Mục tiêu"]);
    expect(parsed.missing).toEqual([
      "Acceptance Criteria",
      "Ràng buộc kỹ thuật",
      "Out of scope",
      "UI Reference",
    ]);
    expect(parsed.sections[0].body).toContain("Còn đang viết");
  });

  it("văn bản trước mục đầu tiên được giữ lại", () => {
    const parsed = parseTaskBody("Ghi chú tự do.\n\n### Mục tiêu\n\nLàm X.");

    expect(parsed.preamble).toBe("Ghi chú tự do.");
    expect(parsed.sections[0].body).toBe("Làm X.");
  });

  it("mục lạ vẫn hiện, chỉ là không thuộc hợp đồng", () => {
    const parsed = parseTaskBody("### Ghi chú thêm\n\nMột thứ gì đó.");

    expect(parsed.sections[0].known).toBe(false);
    expect(parsed.missing).toHaveLength(5);
  });

  it("body rỗng không làm sập gì cả", () => {
    expect(parseTaskBody("")).toEqual({
      preamble: "",
      sections: [],
      acceptance: [],
      missing: [
        "Mục tiêu",
        "Acceptance Criteria",
        "Ràng buộc kỹ thuật",
        "Out of scope",
        "UI Reference",
      ],
    });
  });

  it("xuống dòng kiểu Windows không làm lệch việc tách mục", () => {
    const parsed = parseTaskBody("### Mục tiêu\r\n\r\nLàm X.\r\n");

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].body).toBe("Làm X.");
  });
});

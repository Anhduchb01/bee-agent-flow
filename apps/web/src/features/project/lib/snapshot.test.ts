import { describe, expect, it } from "vitest";

import type { GhTask } from "@/lib/github/types";

import { anhChupDuAn } from "./snapshot";

const NOW = new Date("2026-08-15T12:00:00Z");

function task(p: Partial<GhTask> & { number: number }): GhTask {
  return {
    slug: "myapp",
    title: "Một task",
    body: "",
    labels: [],
    author: { login: "pm", name: "PM", avatar_url: "" },
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-15T10:00:00Z",
    url: "",
    state: "open",
    pull: null,
    ...p,
  };
}

describe("anhChupDuAn", () => {
  /*
   * Khối này là TOÀN BỘ những gì model biết — nó không có tool, không đọc repo.
   * Nên mọi thứ thiếu ở đây là một câu hỏi nó không trả lời được, và (nếu prompt
   * làm đúng việc) một câu "snapshot không nói".
   */
  it("mang đủ số hiệu, giai đoạn, và task đứng yên bao lâu", () => {
    const s = anhChupDuAn("myapp", [task({ number: 8, title: "Trang pháp lý" })], NOW);
    expect(s).toContain("#8");
    expect(s).toContain("Trang pháp lý");
    expect(s).toContain("đứng yên 2 giờ");
    expect(s).toContain("1 task đang mở, 0 đã đóng");
  });

  it("gọi tên task đang xin người — thứ hay bị bỏ sót nhất", () => {
    const s = anhChupDuAn("myapp", [task({ number: 9, labels: ["needs-human"] })], NOW);
    expect(s).toContain("ĐANG XIN NGƯỜI");
  });

  it("PR kèm số approve và check đỏ", () => {
    const s = anhChupDuAn(
      "myapp",
      [
        task({
          number: 6,
          pull: {
            number: 12,
            title: "PR",
            url: "",
            draft: false,
            head_sha: "abc",
            checks: [
              { name: "bee/test", conclusion: "failure" },
              { name: "lint", conclusion: "success" },
            ],
            reviews: [
              { author: { login: "pm", name: "PM", avatar_url: "" }, state: "APPROVED", submitted_at: "" },
            ],
          },
        }),
      ],
      NOW,
    );
    expect(s).toContain("PR #12");
    expect(s).toContain("1 approve");
    expect(s).toContain("check đỏ: bee/test");
    expect(s).not.toContain("lint"); // check xanh không phải tin
  });

  it("task đã đóng chỉ được đếm, không liệt kê", () => {
    const s = anhChupDuAn("myapp", [task({ number: 1, state: "closed", title: "Xong rồi" })], NOW);
    expect(s).toContain("0 task đang mở, 1 đã đóng");
    expect(s).not.toContain("Xong rồi");
  });

  // Cả ảnh chụp phải vừa một lượt chat; phần đuôi hiếm khi là thứ đang được hỏi.
  it("cắt ở 40 task và NÓI RA là đã cắt", () => {
    const nhieu = Array.from({ length: 50 }, (_, i) => task({ number: i + 1 }));
    const s = anhChupDuAn("myapp", nhieu, NOW);
    expect(s).toContain("chỉ liệt kê 40 task đầu");
    expect(s.split("\n").filter((l) => l.startsWith("- ")).length).toBe(40);
  });
});

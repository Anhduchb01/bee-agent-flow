import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pairToolCards, type Card } from "./pair-tool-cards";
import { mergeEvents } from "./parse-events";

function isToolCard(m: Card): m is Extract<Card, { loai: "tool-card" }> {
  return m.loai === "tool-card";
}

function readFixture(name: string): string[] {
  const file = path.join(process.cwd(), "src", "features", "sessions", "lib", "fixtures", name);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((d) => d.trim() !== "");
}

describe("pairToolCards", () => {
  it("fixture thật: tool Bash ghép cặp theo tool_use id thành một thẻ đã xong", () => {
    const { events } = mergeEvents(readFixture("fixture-interject.jsonl"));
    const the = pairToolCards(events).filter(isToolCard);

    expect(the).toHaveLength(1);
    expect(the[0].name).toBe("Bash");
    expect(the[0].id).toMatch(/^toolu_/);
    expect(the[0].status).toBe("xong");
    expect(the[0].result).toContain("xong");
    expect(the[0].lenh).toContain("sleep 8");
  });

  it("tool chưa có kết quả giữ trạng thái đang chạy — spinner có thật để quay", () => {
    const the = pairToolCards([
      { loai: "tool", name: "Bash", thamSo: "{}", id: "toolu_1", lenh: "pnpm test" },
    ]).filter(isToolCard);
    expect(the[0].status).toBe("dang-chay");
    expect(the[0].result).toBeNull();
  });

  it("is_error đánh dấu thẻ lỗi, và kết quả vào ĐÚNG thẻ theo id dù xen kẽ", () => {
    const the = pairToolCards([
      { loai: "tool", name: "Bash", thamSo: "{}", id: "toolu_a" },
      { loai: "tool", name: "Write", thamSo: "{}", id: "toolu_b", file: "a.ts" },
      { loai: "tool-xong", text: "boom", id: "toolu_b", err: true },
      { loai: "tool-xong", text: "ok", id: "toolu_a", err: false },
    ]).filter(isToolCard);

    expect(the.map((t) => [t.name, t.status, t.result])).toEqual([
      ["Bash", "xong", "ok"],
      ["Write", "loi", "boom"],
    ]);
  });

  it("sự kiện cũ không có id rơi về FIFO — stream ghi trước bản này vẫn đọc được", () => {
    const the = pairToolCards([
      { loai: "tool", name: "Read", thamSo: "{}" },
      { loai: "tool-xong", text: "nội dung file" },
    ]).filter(isToolCard);
    expect(the[0].status).toBe("xong");
  });

  it("thẻ nằm ở vị trí tool BẮT ĐẦU trong dòng thời gian, không nhảy xuống lúc xong", () => {
    const row = pairToolCards([
      { loai: "tool", name: "Bash", thamSo: "{}", id: "toolu_1" },
      { loai: "agent-noi", text: "đang chờ lệnh chạy…" },
      { loai: "tool-xong", text: "ok", id: "toolu_1" },
    ]);
    expect(row.map((m) => m.loai)).toEqual(["tool-card", "agent-noi"]);
    expect(row[0]).toMatchObject({ status: "xong" });
  });
});

describe("thẻ xin-quyền (V2.5b)", () => {
  it("bee_approval ghép ngược vào đúng thẻ theo requestId — không thêm dòng", () => {
    const row = pairToolCards([
      { loai: "xin-quyen", requestId: "r1", name: "Bash", thamSo: '{"command":"ls"}' },
      { loai: "xin-quyen", requestId: "r2", name: "Write", thamSo: "{}" },
      { loai: "quyen-da-tra-loi", requestId: "r1", allow: true },
    ]);
    expect(row).toHaveLength(2);
    expect(row[0]).toMatchObject({ loai: "xin-quyen", requestId: "r1", answer: "allow" });
    expect(row[1]).toMatchObject({ loai: "xin-quyen", requestId: "r2", answer: null });
  });
});

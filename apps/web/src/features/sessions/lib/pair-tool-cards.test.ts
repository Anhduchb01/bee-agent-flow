import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pairToolCards, type Card } from "./pair-tool-cards";
import { mergeEvents } from "./parse-events";

function isToolCard(m: Card): m is Extract<Card, { kind: "tool-card" }> {
  return m.kind === "tool-card";
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
    const card = pairToolCards(events).filter(isToolCard);

    expect(card).toHaveLength(1);
    expect(card[0].name).toBe("Bash");
    expect(card[0].id).toMatch(/^toolu_/);
    expect(card[0].status).toBe("done");
    expect(card[0].result).toContain("xong");
    expect(card[0].command).toContain("sleep 8");
  });

  it("tool chưa có kết quả giữ trạng thái đang chạy — spinner có thật để quay", () => {
    const card = pairToolCards([
      { kind: "tool", name: "Bash", args: "{}", id: "toolu_1", command: "pnpm test" },
    ]).filter(isToolCard);
    expect(card[0].status).toBe("running");
    expect(card[0].result).toBeNull();
  });

  it("is_error đánh dấu thẻ lỗi, và kết quả vào ĐÚNG thẻ theo id dù xen kẽ", () => {
    const card = pairToolCards([
      { kind: "tool", name: "Bash", args: "{}", id: "toolu_a" },
      { kind: "tool", name: "Write", args: "{}", id: "toolu_b", file: "a.ts" },
      { kind: "tool-done", text: "boom", id: "toolu_b", err: true },
      { kind: "tool-done", text: "ok", id: "toolu_a", err: false },
    ]).filter(isToolCard);

    expect(card.map((t) => [t.name, t.status, t.result])).toEqual([
      ["Bash", "done", "ok"],
      ["Write", "error", "boom"],
    ]);
  });

  it("sự kiện cũ không có id rơi về FIFO — stream ghi trước bản này vẫn đọc được", () => {
    const card = pairToolCards([
      { kind: "tool", name: "Read", args: "{}" },
      { kind: "tool-done", text: "nội dung file" },
    ]).filter(isToolCard);
    expect(card[0].status).toBe("done");
  });

  it("thẻ nằm ở vị trí tool BẮT ĐẦU trong dòng thời gian, không nhảy xuống lúc xong", () => {
    const row = pairToolCards([
      { kind: "tool", name: "Bash", args: "{}", id: "toolu_1" },
      { kind: "agent-said", text: "đang chờ lệnh chạy…" },
      { kind: "tool-done", text: "ok", id: "toolu_1" },
    ]);
    expect(row.map((m) => m.kind)).toEqual(["tool-card", "agent-said"]);
    expect(row[0]).toMatchObject({ status: "done" });
  });
});

describe("thẻ xin-quyền (V2.5b)", () => {
  it("bee_approval ghép ngược vào đúng thẻ theo requestId — không thêm dòng", () => {
    const row = pairToolCards([
      { kind: "permission-asked", requestId: "r1", name: "Bash", args: '{"command":"ls"}' },
      { kind: "permission-asked", requestId: "r2", name: "Write", args: "{}" },
      { kind: "permission-answered", requestId: "r1", allow: true },
    ]);
    expect(row).toHaveLength(2);
    expect(row[0]).toMatchObject({ kind: "permission-asked", requestId: "r1", answer: "allow" });
    expect(row[1]).toMatchObject({ kind: "permission-asked", requestId: "r2", answer: null });
  });
});

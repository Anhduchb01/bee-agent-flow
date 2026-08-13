import { describe, expect, it } from "vitest";

import { seedGithub } from "@/lib/fixtures/github";
import type { GhTask } from "@/lib/github/types";

import { STAGES, stageOf, xepTheoStage } from "./task-stage";

const seed = seedGithub(new Date("2026-08-13T10:00:00Z"));
const t = (slug: string, num: number): GhTask =>
  seed.tasks.find((x) => x.slug === slug && x.number === num)!;

describe("stageOf — theo vòng đời thật của reconciler", () => {
  it("status:draft → Nháp", () => {
    expect(stageOf(t("shop", 33))).toBe("nhap");
  });

  it("status:ready-for-spec và status:spec-review → Chờ chấm spec", () => {
    expect(stageOf(t("myapp", 50))).toBe("cho-spec");
    expect(stageOf(t("myapp", 38))).toBe("cho-spec");
  });

  it("agent:build mà thiếu agent:eligible → Chờ giao", () => {
    expect(stageOf(t("myapp", 41))).toBe("cho-giao");
    expect(stageOf(t("shop", 36))).toBe("cho-giao");
  });

  it("có đủ agent:build và agent:eligible → Agent đang làm", () => {
    expect(stageOf(t("myapp", 44))).toBe("agent-lam");
    expect(stageOf(t("myapp", 42))).toBe("agent-lam");
  });

  it("PR mở không nháp → Chờ duyệt PR", () => {
    expect(stageOf(t("myapp", 40))).toBe("cho-duyet");
    expect(stageOf(t("shop", 30))).toBe("cho-duyet");
  });

  it("PR còn nháp thì chưa phải chờ duyệt", () => {
    expect(t("myapp", 49).pull?.draft).toBe(true);
    expect(stageOf(t("myapp", 49))).toBe("agent-lam");
  });

  it("needs-human → Cần người", () => {
    expect(stageOf(t("myapp", 47))).toBe("can-nguoi");
    expect(stageOf(t("blog", 9))).toBe("can-nguoi");
  });

  // Nhãn là một TẬP HỢP, không phải một trường trạng thái. Một issue mang cả
  // agent:build lẫn needs-human là chuyện xảy ra thật.
  it("needs-human thắng mọi nhãn khác", () => {
    const task = { ...t("myapp", 40), labels: ["needs-human", "agent:build", "agent:eligible"] };
    expect(stageOf(task as GhTask)).toBe("can-nguoi");
  });

  it("không có nhãn nào thì rơi về Nháp, không ném lỗi", () => {
    expect(stageOf({ ...t("myapp", 40), labels: [], pull: null } as GhTask)).toBe("nhap");
  });
});

describe("xepTheoStage", () => {
  const cot = xepTheoStage(seed.tasks.filter((x) => x.slug === "myapp"));

  // Bảng mất cột khi rỗng thì mỗi lần mở lên lại có hình dạng khác, và người
  // dùng không còn học được vị trí của thứ gì.
  it("luôn trả đủ sáu cột, kể cả cột rỗng", () => {
    expect(cot.map((c) => c.stage)).toEqual(STAGES);
  });

  it("mỗi task nằm ở đúng một cột", () => {
    const mo = seed.tasks.filter((x) => x.slug === "myapp" && x.state === "open");
    expect(cot.reduce((n, c) => n + c.tasks.length, 0)).toBe(mo.length);

    const keys = cot.flatMap((c) => c.tasks.map((x) => x.number));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("trong mỗi cột, thẻ mới cập nhật đứng trước", () => {
    for (const c of cot) {
      const times = c.tasks.map((x) => Date.parse(x.updated_at));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    }
  });

  it("task đã đóng không lên bảng", () => {
    const dong = seed.tasks.map((x) => ({ ...x, state: "closed" as const }));
    expect(xepTheoStage(dong).every((c) => c.tasks.length === 0)).toBe(true);
  });

  it("không có task nào thì vẫn đủ sáu cột rỗng", () => {
    expect(xepTheoStage([]).map((c) => c.tasks.length)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

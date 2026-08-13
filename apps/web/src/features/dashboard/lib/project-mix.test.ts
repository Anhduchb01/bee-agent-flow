import { describe, expect, it } from "vitest";

import { seedGithub } from "@/lib/fixtures/github";
import type { GhTask } from "@/lib/github/types";

import { honHopDuAn } from "./project-mix";

const seed = seedGithub(new Date("2026-08-13T10:00:00Z"));
const cua = (slug: string): GhTask[] => seed.tasks.filter((t) => t.slug === slug);

const DU_AN = [
  { slug: "myapp", full: "org/myapp", tasks: cua("myapp") },
  { slug: "shop", full: "org/shop", tasks: cua("shop") },
  { slug: "blog", full: "org/blog", tasks: cua("blog") },
];

describe("honHopDuAn", () => {
  it("tổng khớp số task đang mở", () => {
    const mix = honHopDuAn(DU_AN);

    expect(mix.find((m) => m.slug === "myapp")?.tong).toBe(8);
    expect(mix.find((m) => m.slug === "shop")?.tong).toBe(4);
    expect(mix.find((m) => m.slug === "blog")?.tong).toBe(2);
  });

  it("các khúc cộng lại bằng tổng", () => {
    for (const m of honHopDuAn(DU_AN)) {
      expect(m.khuc.reduce((n, k) => n + k.so, 0)).toBe(m.tong);
    }
  });

  // Thanh vẽ ra không nên có đoạn dài 0px, và chú giải không nên liệt kê những
  // dòng "0 cần người".
  it("chỉ giữ giai đoạn có task", () => {
    const blog = honHopDuAn(DU_AN).find((m) => m.slug === "blog")!;

    expect(blog.khuc.map((k) => k.stage)).toEqual(["cho-spec", "can-nguoi"]);
    expect(blog.khuc.every((k) => k.so > 0)).toBe(true);
  });

  it("khúc xếp theo chiều công việc chảy, không theo số lượng", () => {
    const myapp = honHopDuAn(DU_AN).find((m) => m.slug === "myapp")!;

    expect(myapp.khuc.map((k) => k.stage)).toEqual([
      "cho-spec",
      "cho-giao",
      "agent-lam",
      "cho-duyet",
      "can-nguoi",
    ]);
  });

  // Đây là toàn bộ lý do khối này tồn tại: hai dự án khác hẳn nhau mà một cột
  // "tổng số task" không phân biệt được.
  it("phân biệt được dự án đang kẹt với dự án đang chạy", () => {
    const mix = honHopDuAn(DU_AN);
    const blog = mix.find((m) => m.slug === "blog")!;
    const myapp = mix.find((m) => m.slug === "myapp")!;

    const keKet = (m: (typeof mix)[number]) =>
      (m.khuc.find((k) => k.stage === "can-nguoi")?.so ?? 0) / m.tong;

    expect(keKet(blog)).toBe(0.5);
    expect(keKet(myapp)).toBeLessThan(0.2);
  });

  it("task đã đóng không được tính", () => {
    const dong = DU_AN.map((p) => ({
      ...p,
      tasks: p.tasks.map((t) => ({ ...t, state: "closed" as const })),
    }));

    expect(honHopDuAn(dong).every((m) => m.tong === 0 && m.khuc.length === 0)).toBe(true);
  });

  it("dự án chưa có task nào vẫn có mặt, với tổng 0", () => {
    expect(honHopDuAn([{ slug: "moi", full: "org/moi", tasks: [] }])).toEqual([
      { slug: "moi", full: "org/moi", tong: 0, khuc: [] },
    ]);
  });
});

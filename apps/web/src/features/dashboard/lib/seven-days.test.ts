import { describe, expect, it } from "vitest";

import type { BeeRecentRun } from "@/lib/bee/types";

import { lastSevenDays, tomTatBayNgay } from "./seven-days";

const NOW = new Date(2026, 7, 13, 15, 0, 0); // Thứ 5, 13/8/2026

function runIt(daysAgo: number, result: string, n = 1): BeeRecentRun[] {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 10, 0, 0);
  return Array.from({ length: n }, (_, i) => ({
    id: `x-${daysAgo}-${result}-${i}`,
    repo: "myapp",
    number: 1,
    rule: "07-build",
    result,
    turns: 1,
    duration_s: 10,
    at: d.toISOString(),
  }));
}

describe("lastSevenDays", () => {
  // Bỏ ngày rỗng thì cuối tuần biến mất và trục thời gian co lại — người đọc
  // thấy một đường liền mạch ở chỗ máy thực ra đã nằm im hai hôm.
  it("luôn trả đủ bảy ngày, kể cả ngày không có lần chạy nào", () => {
    const days = lastSevenDays([], NOW);

    expect(days).toHaveLength(7);
    expect(days.every((d) => d.tong === 0)).toBe(true);
  });

  it("ngày cuối là hôm nay, và được gọi tên", () => {
    const days = lastSevenDays([], NOW);

    expect(days.at(-1)?.label).toBe("Today");
    expect(days.at(-1)?.ngay).toBe("2026-08-13");
    expect(days[0].ngay).toBe("2026-08-07");
  });

  it("đếm đúng xong và lỗi theo ngày", () => {
    const days = lastSevenDays([...runIt(0, "ok", 7), ...runIt(0, "fail", 6), ...runIt(2, "ok", 3)], NOW);

    expect(days.at(-1)).toMatchObject({ finished: 7, err: 6, tong: 13 });
    expect(days.at(-3)).toMatchObject({ finished: 3, err: 0, tong: 3 });
  });

  // `result` do từng rule tự đặt và không phải tập đóng.
  it("mọi result khác 'ok' đều tính là lỗi", () => {
    const days = lastSevenDays([...runIt(0, "gave-up"), ...runIt(0, "timeout"), ...runIt(0, "ok")], NOW);

    expect(days.at(-1)).toMatchObject({ finished: 1, err: 2 });
  });

  it("bỏ qua lần chạy ngoài cửa sổ bảy ngày", () => {
    const days = lastSevenDays(runIt(30, "ok", 5), NOW);

    expect(days.reduce((n, d) => n + d.tong, 0)).toBe(0);
  });

  it("mốc thời gian rác không làm sập gì cả", () => {
    const xau = [{ ...runIt(0, "ok")[0], at: "hôm qua" }];
    expect(() => lastSevenDays(xau, NOW)).not.toThrow();
    expect(lastSevenDays(xau, NOW).at(-1)?.tong).toBe(0);
  });

  it("nhãn thứ đúng theo lịch", () => {
    // 13/8/2026 là Thứ 5 → sáu ngày trước là Thứ 6 tuần trước.
    expect(lastSevenDays([], NOW).map((d) => d.label)).toEqual([
      "Fri",
      "Sat",
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Today",
    ]);
  });
});

describe("tomTatBayNgay", () => {
  it("gọi tên khi hôm nay tệ hơn hẳn", () => {
    const days = lastSevenDays([...runIt(0, "ok", 7), ...runIt(0, "fail", 6), ...runIt(3, "ok", 12)], NOW);

    expect(tomTatBayNgay(days)).toContain("6 of 13 runs failed today");
    expect(tomTatBayNgay(days)).toContain("sharply higher");
  });

  it("không kêu khi tỉ lệ lỗi hôm nay giống mọi hôm", () => {
    const days = lastSevenDays(
      [...runIt(0, "ok", 9), ...runIt(0, "fail"), ...runIt(2, "ok", 9), ...runIt(2, "fail")],
      NOW,
    );

    expect(tomTatBayNgay(days)).toBe("9 of 10 runs finished today.");
  });

  it("nói rõ khi hôm nay chưa chạy gì", () => {
    expect(tomTatBayNgay(lastSevenDays(runIt(2, "ok", 4), NOW))).toBe("No runs today yet.");
  });

  it("bảy ngày không có gì thì không có câu nào để nói", () => {
    expect(tomTatBayNgay(lastSevenDays([], NOW))).toBeNull();
  });
});

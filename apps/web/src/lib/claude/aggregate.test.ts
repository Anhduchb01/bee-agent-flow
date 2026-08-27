import { describe, expect, it } from "vitest";

import type { BeeRecentRun } from "@/lib/bee/types";

import { quotaFrom, accountQuota, aggregateUsage } from "./aggregate";

const BAY_GIO = new Date("2026-08-14T15:00:00Z");

function runIt(p: Partial<BeeRecentRun> & { at: string }): BeeRecentRun {
  return {
    id: "myapp-1",
    repo: "myapp",
    number: 1,
    rule: "07-build",
    result: "ok",
    turns: 5,
    duration_s: 60,
    ...p,
  };
}

describe("aggregateUsage", () => {
  it("không có gì thì mọi số bằng 0, không phải NaN", () => {
    const m = aggregateUsage([], BAY_GIO);
    expect(m).toEqual({
      runCount: 0,
      errorCount: 0,
      token: 0,
      cacheRate: 0,
      costToday: 0,
      costSevenDays: 0,
      stoppedOnQuota: 0,
    });
  });

  it("cộng token và chi phí của hôm nay", () => {
    const m = aggregateUsage(
      [
        runIt({
          at: "2026-08-14T09:00:00Z",
          tokens_in: 1_000,
          tokens_out: 2_000,
          tokens_cache_read: 7_000,
          tokens_cache_write: 0,
          cost_usd: 0.5,
        }),
        runIt({ at: "2026-08-14T11:00:00Z", tokens_in: 10, cost_usd: 0.25 }),
      ],
      BAY_GIO,
    );
    expect(m.runCount).toBe(2);
    expect(m.token).toBe(10_010);
    expect(m.cacheRate).toBeCloseTo(7_000 / 10_010);
    expect(m.costToday).toBe(0.75);
  });

  /*
   * Đây là lý do `numOpt` giữ `undefined` thay vì quy về 0. Bản ghi của rule 03
   * (chạy CI, không gọi agent) không có trường usage nào cả — nó vẫn là một lần
   * chạy, nhưng nó không tiêu token nào, và nó KHÔNG được kéo `tiLeCache` xuống
   * bằng cách góp một mẫu số 0.
   */
  it("bản ghi không có usage vẫn được đếm là một lần chạy", () => {
    const m = aggregateUsage(
      [
        runIt({ at: "2026-08-14T09:00:00Z", rule: "03-run-ci" }),
        runIt({ at: "2026-08-14T10:00:00Z", tokens_cache_read: 100, tokens_in: 100 }),
      ],
      BAY_GIO,
    );
    expect(m.runCount).toBe(2);
    expect(m.token).toBe(200);
    expect(m.cacheRate).toBe(0.5);
  });

  /*
   * Mốc "hôm nay" tính theo giờ MÁY CHẠY DASHBOARD, nên hai mốc dưới đây phải
   * dựng từ `BAY_GIO` chứ không viết tay bằng giờ UTC: một chuỗi `…T23:00:00Z`
   * là hôm qua ở UTC nhưng là hôm nay ở UTC+7, và bài test sẽ đỏ hoặc xanh tuỳ
   * máy ai chạy nó.
   */
  it("hôm qua không tính vào hôm nay nhưng vẫn tính vào bảy ngày", () => {
    const prev = (hours: number) => new Date(BAY_GIO.getTime() - hours * 3_600_000).toISOString();
    const m = aggregateUsage(
      [runIt({ at: prev(24), cost_usd: 3 }), runIt({ at: prev(2), cost_usd: 1 })],
      BAY_GIO,
    );
    expect(m.runCount).toBe(1);
    expect(m.costToday).toBe(1);
    expect(m.costSevenDays).toBe(4);
  });

  it("quá bảy ngày thì rơi khỏi cả hai", () => {
    const m = aggregateUsage([runIt({ at: "2026-08-01T10:00:00Z", cost_usd: 9 })], BAY_GIO);
    expect(m.costSevenDays).toBe(0);
  });

  /*
   * Toàn bộ lý do reconciler giữ lại `stop_reason` và `api_error_status`. Không
   * có hai trường đó thì "chết vì hết hạn mức" và "chết vì test đỏ" cùng là một
   * `result` khác `ok` — mà hai chuyện ấy cần hai cách xử lý khác hẳn nhau.
   */
  it("phân biệt hết hạn mức với thất bại thường", () => {
    const m = aggregateUsage(
      [
        runIt({ at: "2026-08-14T09:00:00Z", result: "fail", api_error_status: 429 }),
        runIt({ at: "2026-08-14T10:00:00Z", result: "fail", api_error_status: null }),
        runIt({ at: "2026-08-14T11:00:00Z", result: "ok", stop_reason: "end_turn" }),
      ],
      BAY_GIO,
    );
    expect(m.errorCount).toBe(2);
    expect(m.stoppedOnQuota).toBe(1);
  });

  it("dòng có `at` hỏng bị bỏ hẳn, không lệch giữa hai cửa sổ", () => {
    const m = aggregateUsage(
      [runIt({ at: "không-phải-ngày", cost_usd: 5 }), runIt({ at: "2026-08-14T09:00:00Z" })],
      BAY_GIO,
    );
    expect(m.runCount).toBe(1);
    expect(m.costSevenDays).toBe(0);
  });
});

describe("quotaFrom", () => {
  const baseDir = {
    status: "allowed",
    resetsAt: 1_786_000_000,
    rateLimitType: "five_hour",
    overageStatus: "not_configured",
    isUsingOverage: false,
    seen_at: "2026-08-14T14:00:00Z",
  };

  it("chưa có sự kiện nào thì không có thanh nào — không phải một thanh rỗng", () => {
    expect(quotaFrom(null)).toEqual([]);
  });

  it("một sự kiện cho đúng một cửa sổ", () => {
    expect(quotaFrom(baseDir)).toEqual([
      { usageWindow: "five_hour", status: "allowed", percentOf: null, resetsAt: 1_786_000_000 },
    ]);
  });

  it("percentOf luôn null — không nguồn nào phát ra nó", () => {
    expect(quotaFrom({ ...baseDir, status: "allowed_warning" })[0].percentOf).toBeNull();
  });

  it("đọc được các biến thể của status", () => {
    expect(quotaFrom({ ...baseDir, status: "allowed_warning" })[0].status).toBe("warning");
    expect(quotaFrom({ ...baseDir, status: "rejected" })[0].status).toBe("exceeded");
  });

  // Một thanh dán nhãn sai tệ hơn hẳn một thanh vắng mặt.
  it("cửa sổ lạ thì bỏ hẳn chứ không quy về five_hour", () => {
    expect(quotaFrom({ ...baseDir, rateLimitType: "monthly" })).toEqual([]);
  });
});

describe("accountQuota — account-wide windows from the oauth usage endpoint", () => {
  it("maps both windows with REAL percentages and epoch resets", () => {
    const hm = accountQuota({
      five_hour: { percent: 9, resets_at: "2026-08-19T11:19:59.906684+00:00" },
      seven_day: { percent: 27, resets_at: "2026-08-21T06:59:59.906706+00:00" },
      fetched_at: "2026-08-19T07:00:00Z",
    });
    expect(hm).toHaveLength(2);
    expect(hm[0]).toMatchObject({ usageWindow: "five_hour", percentOf: 9, status: "allowed" });
    expect(hm[0]!.resetsAt).toBe(Math.floor(Date.parse("2026-08-19T11:19:59.906684+00:00") / 1000));
    expect(hm[1]).toMatchObject({ usageWindow: "weekly", percentOf: 27 });
  });

  it("percent drives the tone: ≥80 warns, ≥100 exceeded", () => {
    const hm = accountQuota({
      five_hour: { percent: 85, resets_at: null },
      seven_day: { percent: 100, resets_at: null },
      fetched_at: "2026-08-19T07:00:00Z",
    });
    expect(hm[0]!.status).toBe("warning");
    expect(hm[1]!.status).toBe("exceeded");
    expect(hm[0]!.resetsAt).toBeNull();
  });

  it("missing windows are dropped, not faked", () => {
    expect(
      accountQuota({ five_hour: null, seven_day: null, fetched_at: "x" }),
    ).toEqual([]);
  });
});

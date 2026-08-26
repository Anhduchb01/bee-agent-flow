import { describe, expect, it } from "vitest";

import { xetHanMuc } from "./quota-gate";
import type { BeeClaudeAccountUsage } from "./types";

const LUC = new Date("2026-08-24T15:00:00Z");

function usage(p: Partial<BeeClaudeAccountUsage> = {}): BeeClaudeAccountUsage {
  return {
    five_hour: { percent: 10, resets_at: "2026-08-24T16:20:00Z" },
    seven_day: { percent: 20, resets_at: "2026-08-28T07:00:00Z" },
    fetched_at: "2026-08-24T14:45:00Z",
    ...p,
  };
}

describe("xetHanMuc — the brake (FR-3.3)", () => {
  it("well under the threshold: opens, and says nothing alarming", () => {
    const k = xetHanMuc(usage(), { nguong: 85, luc: LUC });
    expect(k.moDuoc).toBe(true);
  });

  it("over the threshold on the 5h window: refuses, and names the window + reset time", () => {
    const k = xetHanMuc(usage({ five_hour: { percent: 91, resets_at: "2026-08-24T16:20:00Z" } }), {
      nguong: 85,
      luc: LUC,
    });
    expect(k.moDuoc).toBe(false);
    expect(k.lyDo).toMatch(/5h/);
    expect(k.lyDo).toMatch(/91%/);
    // Người bị chặn cần biết CHỜ TỚI BAO GIỜ, không chỉ "bị chặn".
    expect(k.lyDo).toMatch(/16:20|1h ?20|80 phút/);
  });

  it("the 7-day window brakes too — it is the one that ruins a week", () => {
    const k = xetHanMuc(usage({ seven_day: { percent: 96, resets_at: "2026-08-28T07:00:00Z" } }), {
      nguong: 85,
      luc: LUC,
    });
    expect(k.moDuoc).toBe(false);
    expect(k.lyDo).toMatch(/7-day/);
  });

  it("exactly at the threshold still opens — the rule is 'over', not 'at'", () => {
    expect(xetHanMuc(usage({ five_hour: { percent: 85, resets_at: null } }), { nguong: 85, luc: LUC }).moDuoc).toBe(true);
    expect(xetHanMuc(usage({ five_hour: { percent: 86, resets_at: null } }), { nguong: 85, luc: LUC }).moDuoc).toBe(false);
  });

  it("never measured → opens, and SAYS it is flying blind", () => {
    const k = xetHanMuc(null, { nguong: 85, luc: LUC });
    expect(k.moDuoc).toBe(true);
    expect(k.lyDo).toMatch(/never been measured/i);
  });

  it("stale numbers → still opens, but the reason admits the brake is untrustworthy", () => {
    // Fail-open on purpose: a dead tick must not make the machine unusable.
    // doctor is where a dead tick turns red; here we only refuse to pretend.
    const k = xetHanMuc(usage({ fetched_at: "2026-08-24T04:00:00Z" }), { nguong: 85, luc: LUC });
    expect(k.moDuoc).toBe(true);
    expect(k.lyDo).toMatch(/cũ|11h/i);
  });

  it("stale numbers that are ALREADY over the threshold still brake", () => {
    // Old and over is worse than fresh and over — do not open on stale data
    // that was already past the line.
    const k = xetHanMuc(
      usage({ fetched_at: "2026-08-24T04:00:00Z", five_hour: { percent: 99, resets_at: null } }),
      { nguong: 85, luc: LUC },
    );
    expect(k.moDuoc).toBe(false);
  });

  it("a threshold of 0 disables the brake — an escape hatch that is explicit", () => {
    const k = xetHanMuc(usage({ five_hour: { percent: 99, resets_at: null } }), { nguong: 0, luc: LUC });
    expect(k.moDuoc).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import type { BeeRecentRun } from "@/lib/bee/types";

import { hanMucTu, hanMucTuTaiKhoan, tongHopMucDung } from "./aggregate";

const BAY_GIO = new Date("2026-08-14T15:00:00Z");

function chay(p: Partial<BeeRecentRun> & { at: string }): BeeRecentRun {
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

describe("tongHopMucDung", () => {
  it("không có gì thì mọi số bằng 0, không phải NaN", () => {
    const m = tongHopMucDung([], BAY_GIO);
    expect(m).toEqual({
      soLanChay: 0,
      soLanLoi: 0,
      token: 0,
      tiLeCache: 0,
      chiPhiHomNay: 0,
      chiPhiBayNgay: 0,
      dungViHetHanMuc: 0,
    });
  });

  it("cộng token và chi phí của hôm nay", () => {
    const m = tongHopMucDung(
      [
        chay({
          at: "2026-08-14T09:00:00Z",
          tokens_in: 1_000,
          tokens_out: 2_000,
          tokens_cache_read: 7_000,
          tokens_cache_write: 0,
          cost_usd: 0.5,
        }),
        chay({ at: "2026-08-14T11:00:00Z", tokens_in: 10, cost_usd: 0.25 }),
      ],
      BAY_GIO,
    );
    expect(m.soLanChay).toBe(2);
    expect(m.token).toBe(10_010);
    expect(m.tiLeCache).toBeCloseTo(7_000 / 10_010);
    expect(m.chiPhiHomNay).toBe(0.75);
  });

  /*
   * Đây là lý do `numOpt` giữ `undefined` thay vì quy về 0. Bản ghi của rule 03
   * (chạy CI, không gọi agent) không có trường usage nào cả — nó vẫn là một lần
   * chạy, nhưng nó không tiêu token nào, và nó KHÔNG được kéo `tiLeCache` xuống
   * bằng cách góp một mẫu số 0.
   */
  it("bản ghi không có usage vẫn được đếm là một lần chạy", () => {
    const m = tongHopMucDung(
      [
        chay({ at: "2026-08-14T09:00:00Z", rule: "03-run-ci" }),
        chay({ at: "2026-08-14T10:00:00Z", tokens_cache_read: 100, tokens_in: 100 }),
      ],
      BAY_GIO,
    );
    expect(m.soLanChay).toBe(2);
    expect(m.token).toBe(200);
    expect(m.tiLeCache).toBe(0.5);
  });

  /*
   * Mốc "hôm nay" tính theo giờ MÁY CHẠY DASHBOARD, nên hai mốc dưới đây phải
   * dựng từ `BAY_GIO` chứ không viết tay bằng giờ UTC: một chuỗi `…T23:00:00Z`
   * là hôm qua ở UTC nhưng là hôm nay ở UTC+7, và bài test sẽ đỏ hoặc xanh tuỳ
   * máy ai chạy nó.
   */
  it("hôm qua không tính vào hôm nay nhưng vẫn tính vào bảy ngày", () => {
    const truoc = (gio: number) => new Date(BAY_GIO.getTime() - gio * 3_600_000).toISOString();
    const m = tongHopMucDung(
      [chay({ at: truoc(24), cost_usd: 3 }), chay({ at: truoc(2), cost_usd: 1 })],
      BAY_GIO,
    );
    expect(m.soLanChay).toBe(1);
    expect(m.chiPhiHomNay).toBe(1);
    expect(m.chiPhiBayNgay).toBe(4);
  });

  it("quá bảy ngày thì rơi khỏi cả hai", () => {
    const m = tongHopMucDung([chay({ at: "2026-08-01T10:00:00Z", cost_usd: 9 })], BAY_GIO);
    expect(m.chiPhiBayNgay).toBe(0);
  });

  /*
   * Toàn bộ lý do reconciler giữ lại `stop_reason` và `api_error_status`. Không
   * có hai trường đó thì "chết vì hết hạn mức" và "chết vì test đỏ" cùng là một
   * `result` khác `ok` — mà hai chuyện ấy cần hai cách xử lý khác hẳn nhau.
   */
  it("phân biệt hết hạn mức với thất bại thường", () => {
    const m = tongHopMucDung(
      [
        chay({ at: "2026-08-14T09:00:00Z", result: "fail", api_error_status: 429 }),
        chay({ at: "2026-08-14T10:00:00Z", result: "fail", api_error_status: null }),
        chay({ at: "2026-08-14T11:00:00Z", result: "ok", stop_reason: "end_turn" }),
      ],
      BAY_GIO,
    );
    expect(m.soLanLoi).toBe(2);
    expect(m.dungViHetHanMuc).toBe(1);
  });

  it("dòng có `at` hỏng bị bỏ hẳn, không lệch giữa hai cửa sổ", () => {
    const m = tongHopMucDung(
      [chay({ at: "không-phải-ngày", cost_usd: 5 }), chay({ at: "2026-08-14T09:00:00Z" })],
      BAY_GIO,
    );
    expect(m.soLanChay).toBe(1);
    expect(m.chiPhiBayNgay).toBe(0);
  });
});

describe("hanMucTu", () => {
  const goc = {
    status: "allowed",
    resetsAt: 1_786_000_000,
    rateLimitType: "five_hour",
    overageStatus: "not_configured",
    isUsingOverage: false,
    seen_at: "2026-08-14T14:00:00Z",
  };

  it("chưa có sự kiện nào thì không có thanh nào — không phải một thanh rỗng", () => {
    expect(hanMucTu(null)).toEqual([]);
  });

  it("một sự kiện cho đúng một cửa sổ", () => {
    expect(hanMucTu(goc)).toEqual([
      { cuaSo: "five_hour", trangThai: "allowed", phanTram: null, resetsAt: 1_786_000_000 },
    ]);
  });

  it("phanTram luôn null — không nguồn nào phát ra nó", () => {
    expect(hanMucTu({ ...goc, status: "allowed_warning" })[0].phanTram).toBeNull();
  });

  it("đọc được các biến thể của status", () => {
    expect(hanMucTu({ ...goc, status: "allowed_warning" })[0].trangThai).toBe("warning");
    expect(hanMucTu({ ...goc, status: "rejected" })[0].trangThai).toBe("exceeded");
  });

  // Một thanh dán nhãn sai tệ hơn hẳn một thanh vắng mặt.
  it("cửa sổ lạ thì bỏ hẳn chứ không quy về five_hour", () => {
    expect(hanMucTu({ ...goc, rateLimitType: "monthly" })).toEqual([]);
  });
});

describe("hanMucTuTaiKhoan — account-wide windows from the oauth usage endpoint", () => {
  it("maps both windows with REAL percentages and epoch resets", () => {
    const hm = hanMucTuTaiKhoan({
      five_hour: { percent: 9, resets_at: "2026-08-19T11:19:59.906684+00:00" },
      seven_day: { percent: 27, resets_at: "2026-08-21T06:59:59.906706+00:00" },
      fetched_at: "2026-08-19T07:00:00Z",
    });
    expect(hm).toHaveLength(2);
    expect(hm[0]).toMatchObject({ cuaSo: "five_hour", phanTram: 9, trangThai: "allowed" });
    expect(hm[0]!.resetsAt).toBe(Math.floor(Date.parse("2026-08-19T11:19:59.906684+00:00") / 1000));
    expect(hm[1]).toMatchObject({ cuaSo: "weekly", phanTram: 27 });
  });

  it("percent drives the tone: ≥80 warns, ≥100 exceeded", () => {
    const hm = hanMucTuTaiKhoan({
      five_hour: { percent: 85, resets_at: null },
      seven_day: { percent: 100, resets_at: null },
      fetched_at: "2026-08-19T07:00:00Z",
    });
    expect(hm[0]!.trangThai).toBe("warning");
    expect(hm[1]!.trangThai).toBe("exceeded");
    expect(hm[0]!.resetsAt).toBeNull();
  });

  it("missing windows are dropped, not faked", () => {
    expect(
      hanMucTuTaiKhoan({ five_hour: null, seven_day: null, fetched_at: "x" }),
    ).toEqual([]);
  });
});

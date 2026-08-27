import { describe, expect, it } from "vitest";

import { parseRecentLine } from "./parse";

describe("parseRecentLine", () => {
  it("đọc đúng một dòng recent.jsonl", () => {
    const line = JSON.stringify({
      id: "myapp-39",
      repo: "myapp",
      number: 39,
      rule: "04-evidence",
      result: "ok",
      turns: 12,
      duration_s: 403,
      at: "2026-08-12T09:14:03Z",
    });

    expect(parseRecentLine(line)).toEqual({
      id: "myapp-39",
      repo: "myapp",
      number: 39,
      rule: "04-evidence",
      result: "ok",
      turns: 12,
      duration_s: 403,
      at: "2026-08-12T09:14:03Z",
    });
  });

  it("trả null cho dòng rác thay vì ném lỗi", () => {
    expect(parseRecentLine("")).toBeNull();
    expect(parseRecentLine("{nope")).toBeNull();
    expect(parseRecentLine(JSON.stringify({ id: "x" }))).toBeNull();
  });

  const baseDir = {
    id: "myapp-41",
    repo: "myapp",
    number: 41,
    rule: "07-build",
    result: "ok",
    turns: 9,
    duration_s: 800,
    at: "2026-08-13T10:00:00Z",
  };

  /*
   * `record_run()` chỉ gộp mức dùng khi lần chạy đó có gọi agent. Dòng của
   * rule 03 (chạy CI) không bao giờ có, và mọi dòng ghi trước khi reconciler
   * được sửa cũng không. Bắt buộc các trường này là vứt sạch lịch sử ngay lúc
   * nâng cấp — mà lịch sử chính là thứ biểu đồ bảy ngày sống bằng.
   */
  it("dòng cũ không có mức dùng vẫn đọc được nguyên vẹn", () => {
    const r = parseRecentLine(JSON.stringify(baseDir));

    expect(r).toMatchObject(baseDir);
    expect(r?.tokens_in).toBeUndefined();
    expect(r?.cost_usd).toBeUndefined();
  });

  it("dòng mới mang mức dùng theo vào", () => {
    const r = parseRecentLine(
      JSON.stringify({
        ...baseDir,
        tokens_in: 1200,
        tokens_out: 8400,
        tokens_cache_read: 990_000,
        tokens_cache_write: 31_000,
        cost_usd: 0.42,
        stop_reason: "end_turn",
        api_error_status: null,
      }),
    );

    expect(r?.tokens_in).toBe(1200);
    expect(r?.cost_usd).toBe(0.42);
    expect(r?.stop_reason).toBe("end_turn");
  });

  /*
   * Đây là lý do cả việc này tồn tại: không có `api_error_status` thì "agent
   * chết vì hết hạn mức" và "agent chết vì test đỏ" cùng là một `result` khác
   * `ok`, mà hai chuyện đó cần hai cách xử lý khác hẳn nhau.
   */
  it("phân biệt được ba trạng thái: vắng mặt · null · có lỗi", () => {
    const none = parseRecentLine(JSON.stringify(baseDir));
    const cleaned = parseRecentLine(
      JSON.stringify({ ...baseDir, stop_reason: "end_turn", api_error_status: null }),
    );
    const quotaExhausted = parseRecentLine(
      JSON.stringify({ ...baseDir, result: "fail", stop_reason: null, api_error_status: 429 }),
    );

    // Không gọi agent — khác hẳn "có gọi mà không lỗi".
    expect(none).not.toHaveProperty("api_error_status");
    expect(cleaned?.api_error_status).toBeNull();
    expect(quotaExhausted?.api_error_status).toBe(429);
  });
});

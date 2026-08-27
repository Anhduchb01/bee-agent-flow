import { describe, expect, it } from "vitest";

import { readSlayerPool, isSlotTarget, isSlotName, isSlayerToken } from "./slayer";

/** Nguyên văn `tok list --json` lấy trên máy 25/08, cắt bớt cho gọn. */
const THAT = JSON.stringify({
  schema: "accounts@1",
  namespace: "token_slayer",
  active: "pdtoan2811@gmail.com",
  generated_at: 1787655477,
  accounts: [
    {
      index: 1,
      name: "pdtoan2811@gmail.com",
      alias: null,
      email: "pdtoan2811@gmail.com",
      org_uuid: null,
      uuid: "a875f7e0",
      plan: null,
      active: true,
      state: "active",
      usage: {
        five_hour: { utilization: 29.0, resets_at: 1787656799 },
        seven_day: { utilization: 36.0, resets_at: 1787900399 },
        polled_at: 1787654125,
        token_expired: false,
      },
    },
  ],
});

describe("readSlayerPool — đọc bảng tài khoản", () => {
  it("đọc đúng slot đang bật và mức dùng", () => {
    const pool = readSlayerPool(THAT);
    expect(pool?.enabled).toBe("pdtoan2811@gmail.com");
    expect(pool?.slots).toHaveLength(1);
    expect(pool?.slots[0]).toMatchObject({
      index: 1,
      email: "pdtoan2811@gmail.com",
      enabled: true,
      state: "active",
      expired: false,
    });
    expect(pool?.slots[0].fiveHour?.percentOf).toBe(29);
    expect(pool?.slots[0].sevenDay?.resetAt).toBe(1787900399);
  });

  it("máy chưa có slot nào → pool rỗng, không phải lỗi", () => {
    const pool = readSlayerPool(JSON.stringify({ schema: "accounts@1", active: null, accounts: [] }));
    expect(pool).toEqual({ enabled: null, slots: [] });
  });

  it("thiếu usage thì slot vẫn hiện, chỉ là không có thanh", () => {
    const pool = readSlayerPool(
      JSON.stringify({ schema: "accounts@1", accounts: [{ index: 1, name: "work" }] }),
    );
    expect(pool?.slots[0]).toMatchObject({ name: "work", fiveHour: null, sevenDay: null });
  });

  it("phần trăm vô lý bị kẹp — thanh 130% đọc như lỗi hiển thị", () => {
    const pool = readSlayerPool(
      JSON.stringify({
        schema: "accounts@1",
        accounts: [{ index: 1, name: "w", usage: { five_hour: { utilization: 130 } } }],
      }),
    );
    expect(pool?.slots[0].fiveHour?.percentOf).toBe(100);
  });

  it("token hết hạn là một trường riêng, không suy từ state", () => {
    const pool = readSlayerPool(
      JSON.stringify({
        schema: "accounts@1",
        accounts: [{ index: 1, name: "w", state: "reauth", usage: { token_expired: true } }],
      }),
    );
    expect(pool?.slots[0]).toMatchObject({ state: "reauth", expired: true });
  });

  it("tài liệu lạ → null, không đoán", () => {
    expect(readSlayerPool("khong-phai-json")).toBeNull();
    expect(readSlayerPool("null")).toBeNull();
    // Schema khác hẳn: đoán mò cấu trúc của công cụ bên thứ ba là cách êm
    // nhất để hiện SAI tài khoản đang bật.
    expect(readSlayerPool(JSON.stringify({ schema: "seats@9", accounts: [] }))).toBeNull();
    expect(readSlayerPool(JSON.stringify({ schema: "accounts@1" }))).toBeNull();
  });

  it("bỏ qua mục không có tên thay vì đẻ ra slot vô danh", () => {
    const pool = readSlayerPool(
      JSON.stringify({ schema: "accounts@1", accounts: [{ index: 1 }, { index: 2, name: "ok" }] }),
    );
    expect(pool?.slots.map((s) => s.name)).toEqual(["ok"]);
  });
});

describe("canh cổng cho những chuỗi sắp vào argv", () => {
  it("mục tiêu switch: số, tên, alias, email", () => {
    for (const t of ["1", "work", "personal-2", "you@company.com", "a.b_c"]) {
      expect(isSlotTarget(t)).toBe(true);
    }
  });

  it("từ chối thứ shell đọc ra nghĩa khác", () => {
    for (const t of ["", "work; rm -rf /", "$(id)", "a b", "`id`", "--login", "'x'"]) {
      expect(isSlotTarget(t)).toBe(false);
    }
  });

  it("tên slot mới KHÔNG nhận @ — slot không được mang tên trông như email", () => {
    expect(isSlotName("work")).toBe(true);
    expect(isSlotName("you@company.com")).toBe(false);
  });

  it("token slayer: chuỗi URL-safe cỡ máy thật (47 ký tự)", () => {
    expect(isSlayerToken("a".repeat(47))).toBe(true);
    expect(isSlayerToken("ngan")).toBe(false);
    expect(isSlayerToken(`${"a".repeat(40)} ; id`)).toBe(false);
  });
});

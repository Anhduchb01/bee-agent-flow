import { describe, expect, it } from "vitest";

import { daCho, khoangThoiGian } from "./duration";

describe("khoangThoiGian", () => {
  it.each([
    [0, "0s"],
    [7, "7s"],
    [59, "59s"],
    [60, "1m00s"],
    [252, "4m12s"],
    [3599, "59m59s"],
    [3600, "1h00m"],
    [12_000, "3h20m"],
    [86_399, "23h59m"],
    [86_400, "1 ngày 0h"],
    [280_800, "3 ngày 6h"],
  ])("%is → %s", (s, want) => {
    expect(khoangThoiGian(s)).toBe(want);
  });

  it("số âm không làm ra chuỗi vô nghĩa", () => {
    expect(khoangThoiGian(-5)).toBe("0s");
  });

  it("daCho ghép đúng cụm", () => {
    expect(daCho(12_000)).toBe("đã chờ 3h20m");
  });
});

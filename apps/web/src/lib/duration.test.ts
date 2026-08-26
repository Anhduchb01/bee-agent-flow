import { describe, expect, it } from "vitest";

import { waitedFor, humanDuration } from "./duration";

describe("humanDuration", () => {
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
    [86_400, "1d 0h"],
    [280_800, "3d 6h"],
  ])("%is → %s", (s, want) => {
    expect(humanDuration(s)).toBe(want);
  });

  it("số âm không làm ra chuỗi vô nghĩa", () => {
    expect(humanDuration(-5)).toBe("0s");
  });

  it("waitedFor ghép đúng cụm", () => {
    expect(waitedFor(12_000)).toBe("waited 3h20m");
  });
});

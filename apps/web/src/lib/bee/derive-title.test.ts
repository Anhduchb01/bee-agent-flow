import { describe, expect, it } from "vitest";

import { deriveSessionTitle } from "./derive-title";

describe("deriveSessionTitle", () => {
  it("short message becomes the title as-is", () => {
    expect(deriveSessionTitle("Fix the login redirect")).toBe("Fix the login redirect");
  });

  it("takes only the first line and collapses whitespace", () => {
    expect(deriveSessionTitle("  Fix   the login\nand then some more context")).toBe(
      "Fix the login",
    );
  });

  it("truncates long messages at a word boundary with an ellipsis", () => {
    const dai =
      "làm cho tôi một trang landing thật đẹp có dark mode và animation mượt trên mobile";
    const title = deriveSessionTitle(dai);
    expect(title.length).toBeLessThanOrEqual(61); // 60 + ellipsis char
    expect(title.endsWith("…")).toBe(true);
    // No half-word left hanging before the ellipsis.
    expect(dai).toContain(title.slice(0, -1).trim());
  });

  it("empty or whitespace-only input falls back to Untitled", () => {
    expect(deriveSessionTitle("")).toBe("Untitled");
    expect(deriveSessionTitle("  \n ")).toBe("Untitled");
  });
});

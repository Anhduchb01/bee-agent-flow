import { describe, expect, it } from "vitest";

import { matchesQuery } from "./search-filter";

describe("matchesQuery", () => {
  it("matches case-insensitively", () => {
    expect(matchesQuery("you/MyApp", "myapp")).toBe(true);
    expect(matchesQuery("you/myapp", "MYAPP")).toBe(true);
  });

  it("ignores diacritics in both the text and the query", () => {
    // Vietnamese input often arrives with diacritics even for ASCII repo names.
    expect(matchesQuery("you/myapp", "mỹ")).toBe(true);
    expect(matchesQuery("duc/dự-án", "du-an")).toBe(true);
    // đ is a separate letter, not a combining mark — needs its own mapping.
    expect(matchesQuery("duc/đồ-chơi", "do-choi")).toBe(true);
  });

  it("empty query matches everything", () => {
    expect(matchesQuery("anything", "")).toBe(true);
    expect(matchesQuery("anything", "   ")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesQuery("you/myapp", "site")).toBe(false);
  });
});

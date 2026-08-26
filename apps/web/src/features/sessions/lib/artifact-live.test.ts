import { describe, expect, it } from "vitest";

import { artifactColour } from "./artifact-live";

describe("artifactColour — GitHub's color language, live (V2.2)", () => {
  it("no data yet → the old static colors, no flash", () => {
    expect(artifactColour("pr", null)).toBe("text-purple-400");
    expect(artifactColour("issue", undefined)).toBe("text-green-500");
  });

  it("merged is purple, closed PR red, closed issue gray, draft gray, open green", () => {
    const s = (state: string, draft = false) => ({ state, draft, checks: null });
    expect(artifactColour("pr", s("MERGED"))).toBe("text-purple-400");
    expect(artifactColour("pr", s("CLOSED"))).toBe("text-red-400");
    expect(artifactColour("issue", s("CLOSED"))).toBe("text-muted-foreground");
    expect(artifactColour("pr", s("OPEN", true))).toBe("text-muted-foreground");
    expect(artifactColour("pr", s("OPEN"))).toBe("text-green-500");
    expect(artifactColour("issue", s("OPEN"))).toBe("text-green-500");
  });
});

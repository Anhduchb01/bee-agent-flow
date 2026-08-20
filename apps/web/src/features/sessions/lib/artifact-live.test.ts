import { describe, expect, it } from "vitest";

import { mauArtifact } from "./artifact-live";

describe("mauArtifact — GitHub's color language, live (V2.2)", () => {
  it("no data yet → the old static colors, no flash", () => {
    expect(mauArtifact("pr", null)).toBe("text-purple-400");
    expect(mauArtifact("issue", undefined)).toBe("text-green-500");
  });

  it("merged is purple, closed PR red, closed issue gray, draft gray, open green", () => {
    const s = (state: string, draft = false) => ({ state, draft, checks: null });
    expect(mauArtifact("pr", s("MERGED"))).toBe("text-purple-400");
    expect(mauArtifact("pr", s("CLOSED"))).toBe("text-red-400");
    expect(mauArtifact("issue", s("CLOSED"))).toBe("text-muted-foreground");
    expect(mauArtifact("pr", s("OPEN", true))).toBe("text-muted-foreground");
    expect(mauArtifact("pr", s("OPEN"))).toBe("text-green-500");
    expect(mauArtifact("issue", s("OPEN"))).toBe("text-green-500");
  });
});

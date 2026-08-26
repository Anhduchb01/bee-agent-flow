import { describe, expect, it } from "vitest";

import { defaultTab } from "./tab";

describe("defaultTab — which tab a bare /setup opens on", () => {
  it("machine never verified: the wizard", () => {
    expect(defaultTab(undefined, null)).toBe("install");
  });

  it("machine with red checks: still the wizard — there is something to fix", () => {
    expect(defaultTab(undefined, false)).toBe("install");
  });

  it("machine ready: configuration, because that is why you came back", () => {
    expect(defaultTab(undefined, true)).toBe("config");
  });

  it("an explicit tab always wins — the URL is the state", () => {
    expect(defaultTab("install", true)).toBe("install");
    expect(defaultTab("config", null)).toBe("config");
  });

  it("a junk tab value falls back to the rule instead of blanking the page", () => {
    expect(defaultTab("../../etc/passwd", true)).toBe("config");
    expect(defaultTab(["config"], true)).toBe("config");
  });
});

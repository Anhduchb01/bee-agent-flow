import { describe, expect, it } from "vitest";

import { tabMacDinh } from "./tab";

describe("tabMacDinh — which tab a bare /setup opens on", () => {
  it("machine never verified: the wizard", () => {
    expect(tabMacDinh(undefined, null)).toBe("install");
  });

  it("machine with red checks: still the wizard — there is something to fix", () => {
    expect(tabMacDinh(undefined, false)).toBe("install");
  });

  it("machine ready: configuration, because that is why you came back", () => {
    expect(tabMacDinh(undefined, true)).toBe("config");
  });

  it("an explicit tab always wins — the URL is the state", () => {
    expect(tabMacDinh("install", true)).toBe("install");
    expect(tabMacDinh("config", null)).toBe("config");
  });

  it("a junk tab value falls back to the rule instead of blanking the page", () => {
    expect(tabMacDinh("../../etc/passwd", true)).toBe("config");
    expect(tabMacDinh(["config"], true)).toBe("config");
  });
});

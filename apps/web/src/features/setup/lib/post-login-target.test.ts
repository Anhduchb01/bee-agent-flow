import { describe, expect, it } from "vitest";

import type { BeeDoctor } from "@/lib/bee/types";

import { postLoginTarget } from "./post-login-target";

const GREEN: BeeDoctor = { checked_at: "2026-08-18T09:30:00Z", ok: true, paused: false, checks: [] };
const RED: BeeDoctor = { ...GREEN, ok: false };

describe("postLoginTarget — where login drops you", () => {
  it("machine never checked (doctor null) → /setup", () => {
    expect(postLoginTarget(undefined, null)).toBe("/setup");
  });

  it("doctor failing → /setup", () => {
    expect(postLoginTarget(undefined, RED)).toBe("/setup");
  });

  it("machine ready → overview", () => {
    expect(postLoginTarget(undefined, GREEN)).toBe("/");
  });

  it("an explicit ?tiep-tuc= destination wins over the setup redirect", () => {
    expect(postLoginTarget("/sessions", null)).toBe("/sessions");
    expect(postLoginTarget("/sessions", GREEN)).toBe("/sessions");
  });

  it("external or malformed next is ignored — no open redirect", () => {
    expect(postLoginTarget("https://evil.example", GREEN)).toBe("/");
    expect(postLoginTarget("//evil.example", null)).toBe("/setup");
  });
});

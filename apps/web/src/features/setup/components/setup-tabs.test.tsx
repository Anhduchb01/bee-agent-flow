import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DoctorChecklist } from "./doctor-checklist";

/**
 * The two-tab split (T15c1) is a page-level decision, and the page is a
 * server component — so what is worth pinning here is the RULE behind the
 * default tab, not the markup.
 *
 * The rule: a machine that has not verified yet needs the wizard; one that
 * has is here to change something. Getting it backwards means every visit
 * after the first opens on install instructions nobody needs.
 */
export function tabMacDinh(
  tab: string | undefined,
  doctorOk: boolean | null,
): "install" | "config" {
  return tab === "install" || tab === "config" ? tab : doctorOk === true ? "config" : "install";
}

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

  it("a junk tab value falls back to the rule, it does not blank the page", () => {
    expect(tabMacDinh("../../etc", true)).toBe("config");
  });
});

describe("DoctorChecklist renders whatever checks the machine reports", () => {
  it("shows a new check id without needing a code change for it", () => {
    render(
      <DoctorChecklist
        doctor={{
          checked_at: "2026-08-26T10:00:00Z",
          ok: false,
          paused: false,
          checks: [{ id: "dich-vu", ok: false, detail: "bee cannot tell what these are: blob" }],
        }}
      />,
    );
    expect(screen.getByText(/dich-vu/)).toBeInTheDocument();
    expect(screen.getByText(/bee cannot tell what these are/)).toBeInTheDocument();
  });
});

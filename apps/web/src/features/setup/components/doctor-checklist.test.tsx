import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BeeDoctor } from "@/lib/bee/types";

import { DoctorChecklist } from "./doctor-checklist";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../api/actions", () => ({
  runDoctorAction: vi.fn(),
}));

const DOC: BeeDoctor = {
  checked_at: "2026-08-18T09:30:00Z",
  ok: false,
  paused: true,
  checks: [
    { id: "pat", ok: true, detail: "fine-grained PAT" },
    { id: "repo:blog", ok: false, detail: "CHƯA có branch protection trên main" },
  ],
};

describe("DoctorChecklist", () => {
  it("never ran → says so and points at the install step, no fake green", () => {
    render(<DoctorChecklist doctor={null} />);
    expect(screen.getByText(/doctor has never run/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Doctor checks" })).not.toBeInTheDocument();
  });

  it("renders every check with pass/fail marks and details", () => {
    render(<DoctorChecklist doctor={DOC} />);
    const list = screen.getByRole("list", { name: "Doctor checks" });
    expect(list).toHaveTextContent("pat");
    expect(list).toHaveTextContent("fine-grained PAT");
    expect(screen.getByLabelText("pass")).toBeInTheDocument();
    // Failed checks must show their fix hint, not just a red mark.
    expect(screen.getByLabelText("fail")).toBeInTheDocument();
    expect(list).toHaveTextContent("CHƯA có branch protection trên main");
  });

  it("PAUSE on → visible banner: the machine is intentionally not taking sessions", () => {
    render(<DoctorChecklist doctor={DOC} />);
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
  });

  it("has a re-run button so checks can be repeated from the web", () => {
    render(<DoctorChecklist doctor={DOC} />);
    expect(screen.getByRole("button", { name: "Run doctor again" })).toBeInTheDocument();
  });

  it("all green → summary says the machine is ready", () => {
    render(
      <DoctorChecklist
        doctor={{ ...DOC, ok: true, paused: false, checks: [DOC.checks[0]!] }}
      />,
    );
    expect(screen.getByText(/all checks green/i)).toBeInTheDocument();
  });
});

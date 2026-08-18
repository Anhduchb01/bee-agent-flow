import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClaudeSetup } from "./claude-setup";
import { startClaudeSetupAction, submitClaudeCodeAction } from "../api/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../api/actions", () => ({
  startClaudeSetupAction: vi.fn(async () => ({
    ok: true,
    url: "https://claude.ai/oauth/authorize?demo=1",
  })),
  submitClaudeCodeAction: vi.fn(async () => ({ ok: true, message: "" })),
  saveClaudeTokenAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

describe("ClaudeSetup", () => {
  it("shows live status: signed out is a red mark and an armed login button", () => {
    render(<ClaudeSetup auth="none" />);
    expect(screen.getByLabelText("fail")).toBeInTheDocument();
    expect(screen.getByText(/not signed in yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get login link" })).toBeEnabled();
  });

  it("shows which auth path is active when signed in", () => {
    render(<ClaudeSetup auth="token" />);
    // Status mark + the collapsed fallback form each render one ✓.
    expect(screen.getAllByLabelText("pass").length).toBeGreaterThan(0);
    expect(screen.getByText(/setup-token token on the machine/i)).toBeInTheDocument();
    // Re-auth stays possible, but as the quiet secondary action.
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeInTheDocument();
  });

  it("get link → the URL appears as a link and a code box; submitting finishes sign-in", async () => {
    const user = userEvent.setup();
    render(<ClaudeSetup auth="none" />);

    await user.click(screen.getByRole("button", { name: "Get login link" }));
    expect(vi.mocked(startClaudeSetupAction)).toHaveBeenCalled();

    const link = await screen.findByRole("link", { name: /open claude\.ai and approve/i });
    expect(link).toHaveAttribute("href", "https://claude.ai/oauth/authorize?demo=1");

    await user.type(screen.getByLabelText("Confirmation code"), "AbC123#xyz");
    await user.click(screen.getByRole("button", { name: "Finish sign-in" }));

    expect(vi.mocked(submitClaudeCodeAction)).toHaveBeenCalledWith("AbC123#xyz");
    expect(await screen.findByText(/sessions will run on your subscription/i)).toBeInTheDocument();
    // The flow UI folds away once done.
    expect(screen.queryByRole("link", { name: /open claude\.ai/i })).not.toBeInTheDocument();
  });

  it("a rejected code keeps the flow open and shows the reason", async () => {
    vi.mocked(submitClaudeCodeAction).mockResolvedValueOnce({
      ok: false,
      message: "The code was rejected — get a new link and try again.",
    });
    const user = userEvent.setup();
    render(<ClaudeSetup auth="none" />);

    await user.click(screen.getByRole("button", { name: "Get login link" }));
    await user.type(await screen.findByLabelText("Confirmation code"), "bad#code");
    await user.click(screen.getByRole("button", { name: "Finish sign-in" }));

    expect(await screen.findByText(/code was rejected/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open claude\.ai/i })).toBeInTheDocument();
  });
});

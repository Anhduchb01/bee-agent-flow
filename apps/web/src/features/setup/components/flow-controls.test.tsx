import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlowControls } from "./flow-controls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/actions", () => ({
  saveFlowAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

const { saveFlowAction } = await import("../api/actions");

beforeEach(() => vi.clearAllMocks());

describe("FlowControls", () => {
  it("lists the steps in order, numbered", () => {
    render(<FlowControls steps={["build", "review", "demo", "pr"]} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "1./build↑↓−",
      "2./review↑↓−",
      "3./demo↑↓−",
      "4./pr↑↓−",
    ]);
  });

  it("an empty flow says so instead of showing a bare list", () => {
    render(<FlowControls steps={[]} />);
    expect(screen.getByText(/waits for a human to say the first thing/)).toBeInTheDocument();
  });

  it("only offers +buttons for steps not already in the flow", () => {
    render(<FlowControls steps={["build", "pr"]} />);
    expect(screen.getByRole("button", { name: "Add /review to the flow" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add /build to the flow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add /pr to the flow" })).not.toBeInTheDocument();
  });

  it("the first step cannot move earlier, the last cannot move later", () => {
    render(<FlowControls steps={["build", "pr"]} />);
    expect(screen.getByRole("button", { name: "Move /build earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move /build later" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move /pr earlier" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move /pr later" })).toBeDisabled();
  });

  it("moving a step later swaps it with the next one and saves the whole order", async () => {
    const user = userEvent.setup();
    render(<FlowControls steps={["build", "review", "demo", "pr"]} />);

    await user.click(screen.getByRole("button", { name: "Move /build later" }));
    expect(vi.mocked(saveFlowAction)).toHaveBeenCalledWith(["review", "build", "demo", "pr"]);
  });

  it("removing a step saves the flow without it", async () => {
    const user = userEvent.setup();
    render(<FlowControls steps={["build", "review", "pr"]} />);

    await user.click(screen.getByRole("button", { name: "Remove /review from the flow" }));
    expect(vi.mocked(saveFlowAction)).toHaveBeenCalledWith(["build", "pr"]);
  });

  it("adding a step appends it at the end and saves", async () => {
    const user = userEvent.setup();
    render(<FlowControls steps={["build"]} />);

    await user.click(screen.getByRole("button", { name: "Add /pr to the flow" }));
    expect(vi.mocked(saveFlowAction)).toHaveBeenCalledWith(["build", "pr"]);
  });

  it("a rejected save shows the reason", async () => {
    vi.mocked(saveFlowAction).mockResolvedValueOnce({ ok: false, message: "nope" });
    const user = userEvent.setup();
    render(<FlowControls steps={["build", "pr"]} />);

    await user.click(screen.getByRole("button", { name: "Remove /pr from the flow" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  });
});

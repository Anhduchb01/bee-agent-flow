import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PoolControls } from "./pool-controls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/actions", () => ({
  savePoolComposeAction: vi.fn(async () => ({ ok: true, message: "" })),
  setPoolRunningAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

const { savePoolComposeAction, setPoolRunningAction } = await import("../api/actions");

const COMPOSE = { text: "services:\n  postgres:\n    image: postgres:16\n", exists: true };

beforeEach(() => vi.clearAllMocks());

describe("PoolControls", () => {
  it("says whether the pool is up, and offers the other direction", () => {
    render(<PoolControls running={true} compose={COMPOSE} />);
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("a machine that cannot be asked says so — it does not draw 'stopped'", () => {
    render(<PoolControls running={null} compose={COMPOSE} />);
    expect(screen.getByText("cannot ask systemd")).toBeInTheDocument();
  });

  it("starting the pool asks the machine to start it", async () => {
    const user = userEvent.setup();
    render(<PoolControls running={false} compose={COMPOSE} />);

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(vi.mocked(setPoolRunningAction)).toHaveBeenCalledWith(true, false);
  });

  it("Save is dead until the text actually changes", async () => {
    const user = userEvent.setup();
    render(<PoolControls running={true} compose={COMPOSE} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(screen.getByLabelText("Shared pool compose file"), "\n");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("saving sends the edited file and says what still has to happen", async () => {
    const user = userEvent.setup();
    render(<PoolControls running={true} compose={COMPOSE} />);

    const box = screen.getByLabelText("Shared pool compose file");
    await user.clear(box);
    await user.type(box, "services: redis");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(vi.mocked(savePoolComposeAction)).toHaveBeenCalledWith("services: redis");
    expect(await screen.findByText(/Restart bee-services/)).toBeInTheDocument();
  });

  it("a rejected save shows the reason instead of pretending it worked", async () => {
    vi.mocked(savePoolComposeAction).mockResolvedValueOnce({
      ok: false,
      message: "No top-level `services:` block",
    });
    const user = userEvent.setup();
    render(<PoolControls running={true} compose={COMPOSE} />);

    await user.type(screen.getByLabelText("Shared pool compose file"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("services:");
    expect(screen.queryByText(/Restart bee-services/)).not.toBeInTheDocument();
  });

  it("a refused stop names the cost, and 'Stop anyway' is a SECOND press", async () => {
    vi.mocked(setPoolRunningAction).mockResolvedValueOnce({
      ok: false,
      message: "2 sessions still holds a slice of this pool",
    });
    const user = userEvent.setup();
    render(<PoolControls running={true} compose={COMPOSE} />);

    // No override offered before the refusal — nothing to tick in advance.
    expect(screen.queryByRole("button", { name: "Stop anyway" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("2 sessions");

    await user.click(screen.getByRole("button", { name: "Stop anyway" }));
    expect(vi.mocked(setPoolRunningAction)).toHaveBeenLastCalledWith(false, true);
  });

  it("a refused START offers the same second press — a port clash is overridable too", async () => {
    vi.mocked(setPoolRunningAction).mockResolvedValueOnce({
      ok: false,
      message: "Port 15672 already in use on this machine.",
    });
    const user = userEvent.setup();
    render(<PoolControls running={false} compose={COMPOSE} />);

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("15672");

    await user.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(vi.mocked(setPoolRunningAction)).toHaveBeenLastCalledWith(true, true);
  });

  it("a machine with no compose file yet is told saving will create it", () => {
    render(<PoolControls running={false} compose={{ text: "services: {}\n", exists: false }} />);
    expect(screen.getByText(/saving creates it/)).toBeInTheDocument();
  });
});

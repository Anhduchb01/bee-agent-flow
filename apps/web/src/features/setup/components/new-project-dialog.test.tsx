import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

import { NewProjectDialog } from "./new-project-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/actions", () => ({
  registerRepoAction: vi.fn(async () => ({ ok: true, message: "", slug: "khach-hang" })),
  saveEnvFileAction: vi.fn(async () => ({ ok: true, message: "" })),
  deleteEnvFileAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

function moDialog() {
  render(<NewProjectDialog trigger={<Button>New project</Button>} />);
  return userEvent.setup();
}

describe("NewProjectDialog — register a repo without leaving the screen", () => {
  beforeEach(async () => {
    const { registerRepoAction } = await import("../api/actions");
    vi.mocked(registerRepoAction).mockClear();
  });

  it("registers the repo and then offers the env step for the derived slug", async () => {
    const user = moDialog();
    const { registerRepoAction } = await import("../api/actions");

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("org/repo"), "org/khach-hang");
    await user.click(screen.getByRole("button", { name: "Add project" }));

    expect(vi.mocked(registerRepoAction)).toHaveBeenCalledWith("org/khach-hang");
    // Step two names the slug, because env.d is keyed by slug, not by repo.
    expect(await screen.findByText("khach-hang is registered")).toBeInTheDocument();
    // toBeVisible, không phải toBeInTheDocument: EnvEditor sống trong một
    // <details>, và bản đầu tiên của dialog render nó ĐANG GẬP — field có
    // trong DOM nhưng người dùng không thấy. e2e bắt được, unit thì không.
    expect(screen.getByLabelText("New env file path for khach-hang")).toBeVisible();
  });

  it("env saved from the dialog goes to the same env.d store /setup writes", async () => {
    const user = moDialog();
    const { saveEnvFileAction } = await import("../api/actions");

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("org/repo"), "org/khach-hang");
    await user.click(screen.getByRole("button", { name: "Add project" }));

    await user.type(
      await screen.findByLabelText("New env file path for khach-hang"),
      ".env.local",
    );
    await user.type(
      screen.getByLabelText("New env file content for khach-hang"),
      "API_KEY=abc",
    );
    await user.click(screen.getByRole("button", { name: "Add env file" }));

    expect(vi.mocked(saveEnvFileAction)).toHaveBeenCalledWith(
      "khach-hang",
      ".env.local",
      "API_KEY=abc",
    );
  });

  it("a rejected repo keeps the dialog open, keeps what was typed, and says why", async () => {
    const { registerRepoAction } = await import("../api/actions");
    vi.mocked(registerRepoAction).mockResolvedValueOnce({
      ok: false,
      message: 'Slug "blog" is already used by you/blog.',
    });
    const user = moDialog();

    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("org/repo"), "someone/blog");
    await user.click(screen.getByRole("button", { name: "Add project" }));

    expect(await screen.findByText(/already used by you\/blog/)).toBeInTheDocument();
    expect(screen.getByLabelText("org/repo")).toHaveValue("someone/blog");
  });

  it("does nothing on an empty repo — the button stays disabled", async () => {
    const user = moDialog();
    const { registerRepoAction } = await import("../api/actions");

    await user.click(screen.getByRole("button", { name: "New project" }));
    expect(screen.getByRole("button", { name: "Add project" })).toBeDisabled();
    expect(vi.mocked(registerRepoAction)).not.toHaveBeenCalled();
  });
});

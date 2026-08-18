import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PatForm, PauseToggle } from "./machine-controls";
import { RepoRegistry } from "./repo-registry";
import { registerRepoAction, savePatAction } from "../api/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../api/actions", () => ({
  enableLingerAction: vi.fn(),
  savePatAction: vi.fn(async () => ({ ok: true, message: "" })),
  setPausedAction: vi.fn(async () => ({ ok: true, message: "" })),
  registerRepoAction: vi.fn(async () => ({ ok: false, message: "Repository must be owner/name" })),
  unregisterRepoAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

describe("PatForm", () => {
  it("refuses a classic token CLIENT-side — it never reaches the server", async () => {
    const user = userEvent.setup();
    render(<PatForm done={null} />);

    await user.type(screen.getByLabelText("Fine-grained PAT"), "ghp_classic123");
    await user.click(screen.getByRole("button", { name: "Save PAT" }));

    expect(screen.getByText(/not a fine-grained pat/i)).toBeInTheDocument();
    expect(vi.mocked(savePatAction)).not.toHaveBeenCalled();
  });

  it("a github_pat_ token is sent and the box clears", async () => {
    const user = userEvent.setup();
    render(<PatForm done={null} />);

    const o = screen.getByLabelText("Fine-grained PAT");
    await user.type(o, "github_pat_ABC_123");
    await user.click(screen.getByRole("button", { name: "Save PAT" }));

    expect(vi.mocked(savePatAction)).toHaveBeenCalledWith("github_pat_ABC_123");
    expect(o).toHaveValue("");
    expect(screen.getByText(/git now pushes through this pat/i)).toBeInTheDocument();
  });
});

describe("PauseToggle", () => {
  it("doctor red → going live is disabled and says WHY", () => {
    render(<PauseToggle paused ready={false} />);
    expect(screen.getByRole("button", { name: /remove pause/i })).toBeDisabled();
    expect(screen.getByText(/until every doctor check is green/i)).toBeInTheDocument();
  });

  it("doctor green → the go-live button is armed", () => {
    render(<PauseToggle paused ready />);
    expect(screen.getByRole("button", { name: /remove pause/i })).toBeEnabled();
  });

  it("already live → says so and offers pause instead", () => {
    render(<PauseToggle paused={false} ready />);
    expect(screen.getByText(/machine is live/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause machine/i })).toBeInTheDocument();
  });
});

describe("RepoRegistry", () => {
  const REPOS = [
    { slug: "myapp", repo: "you/myapp" },
    { slug: "blog", repo: "you/blog" },
  ];

  it("lists repos with doctor's protection verdict and a settings deep-link", () => {
    render(<RepoRegistry repos={REPOS} protection={{ myapp: true, blog: false }} />);

    const list = screen.getByRole("list", { name: "Registered repos" });
    expect(list).toHaveTextContent("you/myapp");
    expect(screen.getByLabelText("pass")).toBeInTheDocument();
    expect(screen.getByLabelText("fail")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /protect main/i });
    expect(links[0]).toHaveAttribute("href", "https://github.com/you/myapp/settings/branches");
  });

  it("a rejected registration shows the server's reason", async () => {
    const user = userEvent.setup();
    render(<RepoRegistry repos={[]} protection={{}} />);

    await user.type(screen.getByLabelText("Repository to register"), "not-a-repo");
    await user.click(screen.getByRole("button", { name: "Add repo" }));

    expect(vi.mocked(registerRepoAction)).toHaveBeenCalledWith("not-a-repo");
    expect(screen.getByText(/must be owner\/name/i)).toBeInTheDocument();
  });
});

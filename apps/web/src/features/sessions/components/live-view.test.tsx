import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BeeSession } from "@/lib/bee/types";

import { LiveView } from "./live-view";
import { useSessionStream } from "../hooks/use-session-stream";

vi.mock("../api/actions", () => ({
  guiVaoPhien: vi.fn(async () => ({ ok: true, message: "" })),
  dungPhienAction: vi.fn(async () => ({ ok: true, message: "" })),
  doiModeAction: vi.fn(async () => ({ ok: true, message: "" })),
  tiepTucAction: vi.fn(async () => ({ ok: true, message: "" })),
  batDauPhien: vi.fn(),
}));
vi.mock("../hooks/use-session-stream", () => ({
  useSessionStream: vi.fn(),
}));

const PHIEN: BeeSession = {
  id: "de300000-0000-4000-8000-000000000001",
  slug: "myapp",
  num: 1,
  repo: "you/myapp",
  title: "Test",
  phase: "work",
  worktree: true,
  status: "running",
  created_at: "2026-08-19T00:00:00Z",
  started_at: "2026-08-19T00:00:01Z",
  ended_at: null,
  attempt: 0,
  needs_human: false,
};

function mockStream(input: Partial<ReturnType<typeof useSessionStream>>) {
  vi.mocked(useSessionStream).mockReturnValue({
    suKien: [],
    dangGo: "",
    dangNghi: "",
    trangThai: "dang-xem",
    ketThuc: null,
    boQua: 0,
    ...input,
  } as ReturnType<typeof useSessionStream>);
}

describe("LiveView — one mode, VSCode-style controls", () => {
  it("no interview gate: no 'OK, do it' anywhere, repo session prompts plainly", () => {
    mockStream({});
    render(<LiveView phien={PHIEN} />);
    expect(screen.queryByRole("button", { name: /ok, do it/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Say something to the agent…")).toBeInTheDocument();
  });

  it("agent busy + nothing typed → the round button is STOP, not send", () => {
    mockStream({
      suKien: [{ loai: "nguoi-noi", text: "do the thing" }],
      dangGo: "wor",
    });
    render(<LiveView phien={PHIEN} />);
    expect(screen.getByRole("button", { name: "Stop session" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  });

  it("typing while busy flips the button back to send — the message queues", async () => {
    const user = userEvent.setup();
    mockStream({
      suKien: [{ loai: "nguoi-noi", text: "do the thing" }],
      dangGo: "wor",
    });
    render(<LiveView phien={PHIEN} />);
    await user.type(screen.getByLabelText("Message to the agent"), "and also this");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Stop session" })).not.toBeInTheDocument();
  });

  it("turn finished (result after the say) → idle, send button back", () => {
    mockStream({
      suKien: [
        { loai: "nguoi-noi", text: "do the thing" },
        { loai: "ket-qua", loi: false, luot: 1, nguCanh: 12 },
      ],
    });
    render(<LiveView phien={PHIEN} />);
    expect(screen.queryByRole("button", { name: "Stop session" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("context ring shows the latest result's percentage", () => {
    mockStream({
      suKien: [
        { loai: "ket-qua", loi: false, luot: 1, nguCanh: 7 },
        { loai: "ket-qua", loi: false, luot: 2, nguCanh: 12 },
      ],
    });
    render(<LiveView phien={PHIEN} />);
    expect(screen.getByLabelText("Context 12% full")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("ring spells out the raw tokens — 10% of a 1M window must not read as a bug", () => {
    mockStream({
      suKien: [
        {
          loai: "ket-qua",
          loi: false,
          luot: 1,
          nguCanh: 10,
          dungToken: 104_635,
          cuaSoToken: 1_000_000,
        },
      ],
    });
    render(<LiveView phien={PHIEN} />);
    expect(
      screen.getByLabelText("Context 10% full — 105k/1M tokens"),
    ).toBeInTheDocument();
    expect(screen.getByText("· 105k/1M")).toBeInTheDocument();
  });
});

describe("session mode switch (V2.5a) — the VSCode-style mode menu by the send button", () => {
  it("trigger shows the current mode; picking another calls the action and closes", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { doiModeAction } = await import("../api/actions");
    render(<LiveView phien={{ ...PHIEN, mode: "auto" }} />);

    const nut = screen.getByRole("button", { name: "Session mode" });
    expect(nut).toHaveTextContent("Auto");
    await user.click(nut);
    // Menu mở LÊN trên: từng mode có tên + mô tả, mode hiện tại đánh dấu.
    const menu = screen.getByRole("menu", { name: "Session modes" });
    expect(menu).toHaveTextContent("Read-only");
    await user.click(screen.getByRole("menuitemradio", { name: /plan/i }));

    expect(vi.mocked(doiModeAction)).toHaveBeenCalledWith(PHIEN.id, "plan");
    expect(nut).toHaveTextContent("Plan");
    expect(screen.queryByRole("menu", { name: "Session modes" })).not.toBeInTheDocument();
  });

  it("chat sessions (no tools) have no mode menu", () => {
    mockStream({});
    render(<LiveView phien={{ ...PHIEN, worktree: false }} />);
    expect(screen.queryByRole("button", { name: "Session mode" })).not.toBeInTheDocument();
  });
});

describe("continue a finished session (V2.6)", () => {
  it("ended session shows Continue; clicking calls the action", async () => {
    const user = userEvent.setup();
    mockStream({ ketThuc: "done" });
    const { tiepTucAction } = await import("../api/actions");
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });
    render(<LiveView phien={PHIEN} />);

    await user.click(screen.getByRole("button", { name: /continue session/i }));
    expect(vi.mocked(tiepTucAction)).toHaveBeenCalledWith(PHIEN.id);
    expect(reload).toHaveBeenCalled();
  });
});

describe("working indicator — VSCode-style shimmer while the agent owes an answer", () => {
  it("busy with NOTHING streaming yet → the indicator runs", () => {
    mockStream({ suKien: [{ loai: "nguoi-noi", text: "what is this repo?" }] });
    render(<LiveView phien={PHIEN} />);
    expect(screen.getByLabelText("Agent is working")).toBeInTheDocument();
  });

  it("text or thinking streaming → the indicator yields to the real stream", () => {
    mockStream({
      suKien: [{ loai: "nguoi-noi", text: "do it" }],
      dangGo: "Answer star",
    });
    render(<LiveView phien={PHIEN} />);
    expect(screen.queryByLabelText("Agent is working")).not.toBeInTheDocument();
  });

  it("idle (result landed) → no indicator", () => {
    mockStream({
      suKien: [
        { loai: "nguoi-noi", text: "do it" },
        { loai: "ket-qua", loi: false, luot: 1, nguCanh: 5 },
      ],
    });
    render(<LiveView phien={PHIEN} />);
    expect(screen.queryByLabelText("Agent is working")).not.toBeInTheDocument();
  });
});

describe("slash palette (global ~/.claude/commands)", () => {
  const COMMANDS = [
    { name: "build", moTa: "Implement tasks incrementally" },
    { name: "issue", moTa: "Create a GitHub issue" },
  ];

  it("typing / lists the machine's commands; picking keeps '/name ' for arguments", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView phien={PHIEN} commands={COMMANDS} />);

    const o = screen.getByLabelText("Message to the agent");
    await user.type(o, "/");
    const menu = screen.getByRole("listbox", { name: "Commands" });
    expect(menu).toHaveTextContent("/build");
    expect(menu).toHaveTextContent("/issue");

    await user.click(screen.getByRole("button", { name: /implement tasks incrementally/i }));
    expect(o).toHaveValue("/build ");
  });

  it("filters by what is typed and stays away from no-tool chat sessions", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { rerender } = render(<LiveView phien={PHIEN} commands={COMMANDS} />);
    await user.type(screen.getByLabelText("Message to the agent"), "/is");
    expect(screen.getByRole("listbox", { name: "Commands" })).toHaveTextContent("/issue");
    expect(screen.queryByText("/build")).not.toBeInTheDocument();

    rerender(<LiveView phien={{ ...PHIEN, worktree: false }} commands={COMMANDS} />);
    expect(screen.queryByRole("listbox", { name: "Commands" })).not.toBeInTheDocument();
  });
});

describe("action chips — the phone-first flow buttons", () => {
  const FLOW_COMMANDS = ["issue", "build", "review", "pr", "demo", "preview"].map((n) => ({
    name: n,
    moTa: n,
  }));

  it("repo session shows the flow chips in order; tapping one SENDS the command", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { guiVaoPhien } = await import("../api/actions");
    render(<LiveView phien={PHIEN} commands={FLOW_COMMANDS} />);

    const chips = screen.getByRole("toolbar", { name: "Session actions" });
    expect(chips).toHaveTextContent("Issue");
    expect(chips).toHaveTextContent("Preview");

    await user.click(screen.getByRole("button", { name: "Run /issue" }));
    expect(vi.mocked(guiVaoPhien)).toHaveBeenCalledWith(PHIEN.id, "/issue");
  });

  it("only chips whose command exists on the machine appear", () => {
    mockStream({});
    render(<LiveView phien={PHIEN} commands={[{ name: "build", moTa: "b" }]} />);
    expect(screen.getByRole("button", { name: "Run /build" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run /issue" })).not.toBeInTheDocument();
  });

  it("chat sessions (no tools) get no chips", () => {
    mockStream({});
    render(<LiveView phien={{ ...PHIEN, worktree: false }} commands={FLOW_COMMANDS} />);
    expect(screen.queryByRole("toolbar", { name: "Session actions" })).not.toBeInTheDocument();
  });

  it("V2.4: the flow's NEXT step glows — no issue → Issue; issue → Build; PR → Preview", () => {
    const chip = (ten: string) => screen.getByRole("button", { name: `Run /${ten}` });

    mockStream({});
    const { unmount } = render(<LiveView phien={PHIEN} commands={FLOW_COMMANDS} />);
    expect(chip("issue")).toHaveAttribute("data-suggested");
    expect(chip("build")).not.toHaveAttribute("data-suggested");
    unmount();

    mockStream({
      suKien: [
        { loai: "artifact", kind: "issue", url: "https://github.com/you/myapp/issues/7", number: 7, title: null },
      ],
    });
    const r2 = render(<LiveView phien={PHIEN} commands={FLOW_COMMANDS} />);
    expect(chip("build")).toHaveAttribute("data-suggested");
    r2.unmount();

    mockStream({
      suKien: [
        { loai: "artifact", kind: "issue", url: "https://github.com/you/myapp/issues/7", number: 7, title: null },
        { loai: "artifact", kind: "pr", url: "https://github.com/you/myapp/pull/8", number: 8, title: null },
      ],
    });
    render(<LiveView phien={PHIEN} commands={FLOW_COMMANDS} />);
    expect(chip("preview")).toHaveAttribute("data-suggested");
    expect(chip("issue")).not.toHaveAttribute("data-suggested");
  });
});

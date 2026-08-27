import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BeeSession } from "@/lib/bee/types";

import { LiveView } from "./live-view";
import { useSessionStream } from "../hooks/use-session-stream";

vi.mock("../api/actions", () => ({
  sendToSessionAction: vi.fn(async () => ({ ok: true, message: "" })),
  stopSessionAction: vi.fn(async () => ({ ok: true, message: "" })),
  changeModeAction: vi.fn(async () => ({ ok: true, message: "" })),
  changeModelAction: vi.fn(async () => ({ ok: true, message: "" })),
  continueAction: vi.fn(async () => ({ ok: true, message: "" })),
  uploadFileAction: vi.fn(async () => ({
    ok: true,
    message: "",
    relPath: ".bee/uploads/1-anh.png",
  })),
  startSessionAction: vi.fn(),
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
    events: [],
    typing: "",
    idle: "",
    status: "dang-xem",
    ended: null,
    skipped: 0,
    ...input,
  } as ReturnType<typeof useSessionStream>);
}

describe("LiveView — one mode, VSCode-style controls", () => {
  it("no interview gate: no 'OK, do it' anywhere, repo session prompts plainly", () => {
    mockStream({});
    render(<LiveView session={PHIEN} />);
    expect(screen.queryByRole("button", { name: /ok, do it/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Say something to the agent…")).toBeInTheDocument();
  });

  it("agent busy + nothing typed → the round button is STOP, not send", () => {
    mockStream({
      events: [{ kind: "nguoi-noi", text: "do the thing" }],
      typing: "wor",
    });
    render(<LiveView session={PHIEN} />);
    expect(screen.getByRole("button", { name: "Stop session" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  });

  it("typing while busy flips the button back to send — the message queues", async () => {
    const user = userEvent.setup();
    mockStream({
      events: [{ kind: "nguoi-noi", text: "do the thing" }],
      typing: "wor",
    });
    render(<LiveView session={PHIEN} />);
    await user.type(screen.getByLabelText("Message to the agent"), "and also this");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Stop session" })).not.toBeInTheDocument();
  });

  it("turn finished (result after the say) → idle, send button back", () => {
    mockStream({
      events: [
        { kind: "nguoi-noi", text: "do the thing" },
        { kind: "ket-qua", err: false, turns: 1, contextTokens: 12 },
      ],
    });
    render(<LiveView session={PHIEN} />);
    expect(screen.queryByRole("button", { name: "Stop session" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("context ring shows the latest result's percentage", () => {
    mockStream({
      events: [
        { kind: "ket-qua", err: false, turns: 1, contextTokens: 7 },
        { kind: "ket-qua", err: false, turns: 2, contextTokens: 12 },
      ],
    });
    render(<LiveView session={PHIEN} />);
    expect(screen.getByLabelText("Context 12% full")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("ring spells out the raw tokens — 10% of a 1M window must not read as a bug", () => {
    mockStream({
      events: [
        {
          kind: "ket-qua",
          err: false,
          turns: 1,
          contextTokens: 10,
          validToken: 104_635,
          tokenWindow: 1_000_000,
        },
      ],
    });
    render(<LiveView session={PHIEN} />);
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
    const { changeModeAction } = await import("../api/actions");
    render(<LiveView session={{ ...PHIEN, mode: "auto" }} />);

    const btn = screen.getByRole("button", { name: "Session mode" });
    expect(btn).toHaveTextContent("Auto");
    await user.click(btn);
    // Menu mở LÊN trên: từng mode có tên + mô tả, mode hiện tại đánh dấu.
    const menu = screen.getByRole("menu", { name: "Session modes" });
    expect(menu).toHaveTextContent("Read-only");
    await user.click(screen.getByRole("menuitemradio", { name: /plan/i }));

    expect(vi.mocked(changeModeAction)).toHaveBeenCalledWith(PHIEN.id, "plan");
    expect(btn).toHaveTextContent("Plan");
    expect(screen.queryByRole("menu", { name: "Session modes" })).not.toBeInTheDocument();
  });

  it("chat sessions (no tools) have no mode menu", () => {
    mockStream({});
    render(<LiveView session={{ ...PHIEN, worktree: false }} />);
    expect(screen.queryByRole("button", { name: "Session mode" })).not.toBeInTheDocument();
  });
});

describe("continue a finished session (V2.6)", () => {
  it("ended session shows Continue; clicking calls the action", async () => {
    const user = userEvent.setup();
    mockStream({ ended: "done" });
    const { continueAction } = await import("../api/actions");
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });
    render(<LiveView session={PHIEN} />);

    await user.click(screen.getByRole("button", { name: /continue session/i }));
    expect(vi.mocked(continueAction)).toHaveBeenCalledWith(PHIEN.id);
    expect(reload).toHaveBeenCalled();
  });
});

describe("working indicator — VSCode-style shimmer while the agent owes an answer", () => {
  it("busy with NOTHING streaming yet → the indicator runs", () => {
    mockStream({ events: [{ kind: "nguoi-noi", text: "what is this repo?" }] });
    render(<LiveView session={PHIEN} />);
    expect(screen.getByLabelText("Agent is working")).toBeInTheDocument();
  });

  it("text or thinking streaming → the indicator yields to the real stream", () => {
    mockStream({
      events: [{ kind: "nguoi-noi", text: "do it" }],
      typing: "Answer star",
    });
    render(<LiveView session={PHIEN} />);
    expect(screen.queryByLabelText("Agent is working")).not.toBeInTheDocument();
  });

  it("idle (result landed) → no indicator", () => {
    mockStream({
      events: [
        { kind: "nguoi-noi", text: "do it" },
        { kind: "ket-qua", err: false, turns: 1, contextTokens: 5 },
      ],
    });
    render(<LiveView session={PHIEN} />);
    expect(screen.queryByLabelText("Agent is working")).not.toBeInTheDocument();
  });
});

describe("slash palette (global ~/.claude/commands)", () => {
  const COMMANDS = [
    { name: "build", hint: "Implement tasks incrementally" },
    { name: "issue", hint: "Create a GitHub issue" },
  ];

  it("typing / lists the machine's commands; picking keeps '/name ' for arguments", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView session={PHIEN} commands={COMMANDS} />);

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
    const { rerender } = render(<LiveView session={PHIEN} commands={COMMANDS} />);
    await user.type(screen.getByLabelText("Message to the agent"), "/is");
    expect(screen.getByRole("listbox", { name: "Commands" })).toHaveTextContent("/issue");
    expect(screen.queryByText("/build")).not.toBeInTheDocument();

    rerender(<LiveView session={{ ...PHIEN, worktree: false }} commands={COMMANDS} />);
    expect(screen.queryByRole("listbox", { name: "Commands" })).not.toBeInTheDocument();
  });
});

describe("Enter — phones get a newline, keyboards send", () => {
  function mockPointer(coarse: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({ matches: coarse && q === "(pointer: coarse)" })),
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it("fine pointer (desktop): Enter sends", async () => {
    const user = userEvent.setup();
    mockPointer(false);
    mockStream({});
    const { sendToSessionAction } = await import("../api/actions");
    vi.mocked(sendToSessionAction).mockClear();
    render(<LiveView session={PHIEN} />);
    await user.type(screen.getByLabelText("Message to the agent"), "hello{Enter}");
    expect(vi.mocked(sendToSessionAction)).toHaveBeenCalledWith(PHIEN.id, "hello");
  });

  it("coarse pointer (phone): Enter is a plain newline — only the ↑ button sends", async () => {
    const user = userEvent.setup();
    mockPointer(true);
    mockStream({});
    const { sendToSessionAction } = await import("../api/actions");
    vi.mocked(sendToSessionAction).mockClear();
    render(<LiveView session={PHIEN} />);
    const o = screen.getByLabelText("Message to the agent");
    await user.type(o, "dòng một{Enter}dòng hai");
    expect(vi.mocked(sendToSessionAction)).not.toHaveBeenCalled();
    expect(o).toHaveValue("dòng một\ndòng hai");

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(vi.mocked(sendToSessionAction)).toHaveBeenCalledWith(PHIEN.id, "dòng một\ndòng hai");
  });
});

describe("action chips — the phone-first flow buttons", () => {
  const FLOW_COMMANDS = ["issue", "build", "review", "pr", "demo", "preview"].map((n) => ({
    name: n,
    hint: n,
  }));

  it("tapping a chip PICKS the command as prefix — nothing is sent until the send button", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { sendToSessionAction } = await import("../api/actions");
    vi.mocked(sendToSessionAction).mockClear();
    render(<LiveView session={PHIEN} commands={FLOW_COMMANDS} />);

    const chips = screen.getByRole("toolbar", { name: "Session actions" });
    expect(chips).toHaveTextContent("Issue");
    expect(chips).toHaveTextContent("Preview");

    const o = screen.getByLabelText("Message to the agent");
    await user.click(screen.getByRole("button", { name: "Use /issue" }));
    expect(o).toHaveValue("/issue ");
    expect(vi.mocked(sendToSessionAction)).not.toHaveBeenCalled();

    await user.type(o, "làm màn đăng nhập");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(vi.mocked(sendToSessionAction)).toHaveBeenCalledWith(PHIEN.id, "/issue làm màn đăng nhập");
  });

  it("tapping the picked chip again unpicks it; tapping another swaps the prefix, body kept", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView session={PHIEN} commands={FLOW_COMMANDS} />);

    const o = screen.getByLabelText("Message to the agent");
    await user.type(o, "màn đăng nhập");
    await user.click(screen.getByRole("button", { name: "Use /issue" }));
    expect(o).toHaveValue("/issue màn đăng nhập");
    expect(screen.getByRole("button", { name: "Use /issue" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Use /build" }));
    expect(o).toHaveValue("/build màn đăng nhập");

    await user.click(screen.getByRole("button", { name: "Use /build" }));
    expect(o).toHaveValue("màn đăng nhập");
  });

  it("only chips whose command exists on the machine appear", () => {
    mockStream({});
    render(<LiveView session={PHIEN} commands={[{ name: "build", hint: "b" }]} />);
    expect(screen.getByRole("button", { name: "Use /build" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use /issue" })).not.toBeInTheDocument();
  });

  it("chat sessions (no tools) get no chips", () => {
    mockStream({});
    render(<LiveView session={{ ...PHIEN, worktree: false }} commands={FLOW_COMMANDS} />);
    expect(screen.queryByRole("toolbar", { name: "Session actions" })).not.toBeInTheDocument();
  });

  it("V2.4: the flow's NEXT step glows — no issue → Issue; issue → Build; PR → Preview", () => {
    const chip = (name: string) => screen.getByRole("button", { name: `Use /${name}` });

    mockStream({});
    const { unmount } = render(<LiveView session={PHIEN} commands={FLOW_COMMANDS} />);
    expect(chip("issue")).toHaveAttribute("data-suggested");
    expect(chip("build")).not.toHaveAttribute("data-suggested");
    unmount();

    mockStream({
      events: [
        { kind: "artifact", artifactKind: "issue", url: "https://github.com/you/myapp/issues/7", number: 7, title: null },
      ],
    });
    const r2 = render(<LiveView session={PHIEN} commands={FLOW_COMMANDS} />);
    expect(chip("build")).toHaveAttribute("data-suggested");
    r2.unmount();

    mockStream({
      events: [
        { kind: "artifact", artifactKind: "issue", url: "https://github.com/you/myapp/issues/7", number: 7, title: null },
        { kind: "artifact", artifactKind: "pr", url: "https://github.com/you/myapp/pull/8", number: 8, title: null },
      ],
    });
    render(<LiveView session={PHIEN} commands={FLOW_COMMANDS} />);
    expect(chip("preview")).toHaveAttribute("data-suggested");
    expect(chip("issue")).not.toHaveAttribute("data-suggested");
  });
});

describe("context — VSCode-style compaction affordances", () => {
  it("palette lists the built-in /compact even though no command file exists", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView session={PHIEN} commands={[{ name: "build", hint: "b" }]} />);
    await user.type(screen.getByLabelText("Message to the agent"), "/com");
    expect(screen.getByRole("listbox", { name: "Commands" })).toHaveTextContent("/compact");
  });

  it("ring at ≥90% shows the almost-full hint", () => {
    mockStream({
      events: [
        { kind: "ket-qua", err: false, turns: 3, contextTokens: 93, validToken: 186_000, tokenWindow: 200_000 },
      ],
    });
    render(<LiveView session={PHIEN} />);
    expect(screen.getByText(/almost full/)).toBeInTheDocument();
  });

  it("below the threshold there is no hint", () => {
    mockStream({ events: [{ kind: "ket-qua", err: false, turns: 3, contextTokens: 42 }] });
    render(<LiveView session={PHIEN} />);
    expect(screen.queryByText(/almost full/)).not.toBeInTheDocument();
  });
});

describe("bottom-left input buttons — '+' attach and the actions panel (VSCode-style)", () => {
  it("'+' opens the attach menu; picking a file uploads and drops the path into the draft", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { uploadFileAction } = await import("../api/actions");
    render(<LiveView session={PHIEN} />);

    await user.click(screen.getByRole("button", { name: "Attach" }));
    await user.click(screen.getByRole("menuitem", { name: /upload from computer/i }));
    const file = new File(["x"], "anh.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("File to upload"), file);

    expect(vi.mocked(uploadFileAction)).toHaveBeenCalledWith(PHIEN.id, expect.any(FormData));
    expect(screen.getByLabelText("Message to the agent")).toHaveValue(
      "[attached: .bee/uploads/1-anh.png] ",
    );
  });

  it("the actions panel filters across commands, session actions and modes", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView session={PHIEN} commands={[{ name: "build", hint: "Implement tasks" }]} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    const panel = screen.getByRole("menu", { name: "Session actions menu" });
    expect(panel).toHaveTextContent("/build");
    expect(panel).toHaveTextContent("Compact conversation");
    expect(panel).toHaveTextContent("Manual");

    await user.type(screen.getByLabelText("Filter actions"), "compact");
    expect(panel).not.toHaveTextContent("/build");
    expect(panel).toHaveTextContent("Compact conversation");
  });

  it("panel: a command inserts as prefix; Compact sends /compact right away", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { sendToSessionAction } = await import("../api/actions");
    vi.mocked(sendToSessionAction).mockClear();
    render(<LiveView session={PHIEN} commands={[{ name: "build", hint: "Implement tasks" }]} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: /\/build/ }));
    expect(screen.getByLabelText("Message to the agent")).toHaveValue("/build ");
    expect(vi.mocked(sendToSessionAction)).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: /compact conversation/i }));
    expect(vi.mocked(sendToSessionAction)).toHaveBeenCalledWith(PHIEN.id, "/compact");
  });

  it("chat sessions: no attach button, but the panel stays — a model is not a tool", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView session={{ ...PHIEN, worktree: false }} commands={[{ name: "build", hint: "b" }]} />);
    expect(screen.queryByRole("button", { name: "Attach" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    const panel = screen.getByRole("menu", { name: "Session actions menu" });
    expect(panel).toHaveTextContent("Haiku");
    // No tools in a chat session → neither commands nor permission modes.
    expect(panel).not.toHaveTextContent("/build");
    expect(panel).not.toHaveTextContent("Manual");
  });
});

describe("model picker (V2.7) — the panel's Model group, like VSCode's 'Select a model'", () => {
  it("lists the models with the current one checked; picking calls the action", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { changeModelAction } = await import("../api/actions");
    vi.mocked(changeModelAction).mockClear();
    render(<LiveView session={PHIEN} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    const panel = screen.getByRole("menu", { name: "Session actions menu" });
    expect(panel).toHaveTextContent("Opus (1M context)");
    expect(panel).toHaveTextContent("Haiku");
    // Untouched session = "default": that row is the checked one.
    expect(screen.getByRole("menuitemradio", { name: "Model: Default" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("menuitemradio", { name: "Model: Opus (1M context)" }));
    expect(vi.mocked(changeModelAction)).toHaveBeenCalledWith(PHIEN.id, "opus[1m]");
    // Chosen model shows by the input so it is never a hidden setting.
    expect(screen.getByText("Opus (1M context)")).toBeInTheDocument();
  });

  it("a failed switch rolls the choice back and surfaces the reason", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { changeModelAction } = await import("../api/actions");
    vi.mocked(changeModelAction).mockResolvedValueOnce({ ok: false, message: "Model saved but restart failed: boom" });
    render(<LiveView session={PHIEN} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Model: Haiku" }));
    expect(await screen.findByText(/restart failed: boom/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitemradio", { name: "Model: Default" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("the session's saved model is what the panel shows as checked", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView session={{ ...PHIEN, model: "sonnet" }} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitemradio", { name: "Model: Sonnet" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Model: Sonnet (1M context)" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("filter reaches the models too", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView session={PHIEN} commands={[{ name: "build", hint: "Implement" }]} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.type(screen.getByLabelText("Filter actions"), "haiku");
    const panel = screen.getByRole("menu", { name: "Session actions menu" });
    expect(panel).toHaveTextContent("Haiku");
    expect(panel).not.toHaveTextContent("/build");
  });
});

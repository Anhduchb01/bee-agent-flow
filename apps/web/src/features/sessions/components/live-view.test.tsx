import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BeeSession } from "@/lib/bee/types";

import { LiveView } from "./live-view";
import { useSessionStream } from "../hooks/use-session-stream";

vi.mock("../api/actions", () => ({
  guiVaoPhien: vi.fn(async () => ({ ok: true, message: "" })),
  dungPhienAction: vi.fn(async () => ({ ok: true, message: "" })),
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
});

describe("slash palette", () => {
  it("typing / lists bee commands; picking one inserts the skill trigger", async () => {
    const user = userEvent.setup();
    mockStream({});
    render(<LiveView phien={PHIEN} />);

    const o = screen.getByLabelText("Message to the agent");
    await user.type(o, "/");
    const menu = screen.getByRole("listbox", { name: "Commands" });
    expect(menu).toHaveTextContent("/issue");
    expect(menu).toHaveTextContent("/pr");

    await user.click(screen.getByRole("button", { name: /create a github issue/i }));
    expect(o).toHaveValue("Dùng skill bee-create-issue: tạo issue cho việc đang bàn trong phiên này.");
  });

  it("filters by what is typed and stays away from no-tool chat sessions", async () => {
    const user = userEvent.setup();
    mockStream({});
    const { rerender } = render(<LiveView phien={PHIEN} />);
    await user.type(screen.getByLabelText("Message to the agent"), "/up");
    expect(screen.getByRole("listbox", { name: "Commands" })).toHaveTextContent("/update-pr");
    expect(screen.queryByText("/issue")).not.toBeInTheDocument();

    rerender(<LiveView phien={{ ...PHIEN, worktree: false }} />);
    expect(screen.queryByRole("listbox", { name: "Commands" })).not.toBeInTheDocument();
  });
});

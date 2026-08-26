import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BoardRow } from "../lib/lanes";
import { ReorderButtons, QueueButton } from "./autopilot-controls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/queue-actions", () => ({
  enqueueAction: vi.fn(async () => ({ ok: true, message: "" })),
  dequeueAction: vi.fn(async () => ({ ok: true, message: "" })),
  reorderAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

const MUC = (queued: boolean): BoardRow => ({
  issue: { number: 41, title: "CSV export", state: "OPEN", url: "https://github.com/you/myapp/issues/41", labels: [], assignees: [], createdAt: "", updatedAt: "" },
  slug: "myapp", repo: "you/myapp", session: [], pr: [],
  queue: queued
    ? { slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default", status: "waiting", sessionId: null, reason: null, added_at: "t" }
    : null,
  lane: queued ? "autopilot" : "backlog",
});

describe("nút Autopilot — điện thoại không cần kéo thả", () => {
  it("chưa xếp: nút + gọi thêm vào hàng đợi", async () => {
    const user = userEvent.setup();
    const { enqueueAction } = await import("../api/queue-actions");
    render(<QueueButton row={MUC(false)} />);

    await user.click(screen.getByRole("button", { name: /Queue #41/ }));
    expect(vi.mocked(enqueueAction)).toHaveBeenCalledWith({
      slug: "myapp", repo: "you/myapp", issue: 41,
    });
  });

  it("đã xếp: cùng nút đó gỡ ra", async () => {
    const user = userEvent.setup();
    const { dequeueAction } = await import("../api/queue-actions");
    render(<QueueButton row={MUC(true)} />);

    await user.click(screen.getByRole("button", { name: /Remove #41/ }));
    expect(vi.mocked(dequeueAction)).toHaveBeenCalledWith("you/myapp", 41);
  });

  it("vùng bấm đủ cho ngón tay (size-9 = 36px + viền, không phải icon 16px)", () => {
    render(<QueueButton row={MUC(false)} />);
    expect(screen.getByRole("button", { name: /Queue #41/ })).toHaveClass("size-9");
  });

  it("↑↓ chỉ hiện với việc đã xếp hàng", () => {
    const { rerender } = render(<ReorderButtons row={MUC(false)} />);
    expect(screen.queryByRole("button", { name: /Move #41 earlier/ })).not.toBeInTheDocument();
    rerender(<ReorderButtons row={MUC(true)} />);
    expect(screen.getByRole("button", { name: /Move #41 earlier/ })).toBeInTheDocument();
  });

  it("↑ đi một bậc lên, ↓ một bậc xuống", async () => {
    const user = userEvent.setup();
    const { reorderAction } = await import("../api/queue-actions");
    render(<ReorderButtons row={MUC(true)} />);

    await user.click(screen.getByRole("button", { name: /Move #41 earlier/ }));
    expect(vi.mocked(reorderAction)).toHaveBeenCalledWith("you/myapp", 41, -1);
    await user.click(screen.getByRole("button", { name: /Move #41 later/ }));
    expect(vi.mocked(reorderAction)).toHaveBeenCalledWith("you/myapp", 41, 1);
  });

  it("action hỏng thì nói ra, không im lặng", async () => {
    const user = userEvent.setup();
    const { enqueueAction } = await import("../api/queue-actions");
    vi.mocked(enqueueAction).mockResolvedValueOnce({ ok: false, message: "Invalid issue number." });
    render(<QueueButton row={MUC(false)} />);

    await user.click(screen.getByRole("button", { name: /Queue #41/ }));
    expect(await screen.findByText(/Invalid issue number/)).toBeInTheDocument();
  });
});

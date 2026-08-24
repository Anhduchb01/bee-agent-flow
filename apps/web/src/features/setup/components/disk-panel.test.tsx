import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BeeGc } from "@/lib/bee/gc-fs";

import { DiskPanel } from "./disk-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/actions", () => ({
  runGcAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

const GC: BeeGc = {
  ts: "2026-08-24T15:00:00Z",
  removed: 2,
  freed_bytes: 1_932_735_283,
  age_hours: 24,
  items: [
    { id: "de300000-0000-4000-8000-000000000002", action: "removed", reason: "đã push hết lên origin/bee/myapp-40", bytes: 943_718_400 },
    { id: "de300000-0000-4000-8000-000000000001", action: "kept", reason: "phiên đang running", bytes: 0 },
  ],
};

describe("DiskPanel — a full disk must be explainable without a terminal", () => {
  it("shows what the last run reclaimed, in units a person reads", () => {
    render(<DiskPanel gc={GC} />);
    expect(screen.getByText(/1\.8 ?GB/)).toBeInTheDocument();
    expect(screen.getByText(/2 worktree/)).toBeInTheDocument();
  });

  it("lists WHY each worktree was kept — that is the whole point", () => {
    render(<DiskPanel gc={GC} />);
    expect(screen.getByText(/phiên đang running/)).toBeInTheDocument();
  });

  it("Dọn ngay runs gc and refreshes", async () => {
    const user = userEvent.setup();
    const { runGcAction } = await import("../api/actions");
    render(<DiskPanel gc={GC} />);

    await user.click(screen.getByRole("button", { name: /dọn ngay/i }));
    expect(vi.mocked(runGcAction)).toHaveBeenCalled();
  });

  it("never run → says so and still offers the button", () => {
    render(<DiskPanel gc={null} />);
    expect(screen.getByText(/chưa chạy lần nào/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dọn ngay/i })).toBeEnabled();
  });

  it("a failed run surfaces the reason instead of looking like nothing happened", async () => {
    const user = userEvent.setup();
    const { runGcAction } = await import("../api/actions");
    vi.mocked(runGcAction).mockResolvedValueOnce({ ok: false, message: "bee-gc.service không tồn tại" });
    render(<DiskPanel gc={GC} />);

    await user.click(screen.getByRole("button", { name: /dọn ngay/i }));
    expect(await screen.findByText(/không tồn tại/)).toBeInTheDocument();
  });
});

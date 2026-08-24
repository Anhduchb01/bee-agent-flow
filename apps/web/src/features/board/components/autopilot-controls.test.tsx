import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MucBang } from "../lib/lanes";
import { NutDoiThuTu, NutXepHang } from "./autopilot-controls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/queue-actions", () => ({
  themVaoHangDoiAction: vi.fn(async () => ({ ok: true, message: "" })),
  boKhoiHangDoiAction: vi.fn(async () => ({ ok: true, message: "" })),
  doiThuTuAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

const MUC = (daXep: boolean): MucBang => ({
  issue: { number: 41, title: "CSV export", state: "OPEN", url: "https://github.com/you/myapp/issues/41", labels: [], assignees: [], createdAt: "", updatedAt: "" },
  slug: "myapp", repo: "you/myapp", phien: [], pr: [],
  hangDoi: daXep
    ? { slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default", status: "waiting", sessionId: null, reason: null, added_at: "t" }
    : null,
  lane: daXep ? "autopilot" : "backlog",
});

describe("nút Autopilot — điện thoại không cần kéo thả", () => {
  it("chưa xếp: nút + gọi thêm vào hàng đợi", async () => {
    const user = userEvent.setup();
    const { themVaoHangDoiAction } = await import("../api/queue-actions");
    render(<NutXepHang muc={MUC(false)} />);

    await user.click(screen.getByRole("button", { name: /Xếp #41/ }));
    expect(vi.mocked(themVaoHangDoiAction)).toHaveBeenCalledWith({
      slug: "myapp", repo: "you/myapp", issue: 41,
    });
  });

  it("đã xếp: cùng nút đó gỡ ra", async () => {
    const user = userEvent.setup();
    const { boKhoiHangDoiAction } = await import("../api/queue-actions");
    render(<NutXepHang muc={MUC(true)} />);

    await user.click(screen.getByRole("button", { name: /Bỏ #41/ }));
    expect(vi.mocked(boKhoiHangDoiAction)).toHaveBeenCalledWith("you/myapp", 41);
  });

  it("vùng bấm đủ cho ngón tay (size-9 = 36px + viền, không phải icon 16px)", () => {
    render(<NutXepHang muc={MUC(false)} />);
    expect(screen.getByRole("button", { name: /Xếp #41/ })).toHaveClass("size-9");
  });

  it("↑↓ chỉ hiện với việc đã xếp hàng", () => {
    const { rerender } = render(<NutDoiThuTu muc={MUC(false)} />);
    expect(screen.queryByRole("button", { name: /lên trước/ })).not.toBeInTheDocument();
    rerender(<NutDoiThuTu muc={MUC(true)} />);
    expect(screen.getByRole("button", { name: /lên trước/ })).toBeInTheDocument();
  });

  it("↑ đi một bậc lên, ↓ một bậc xuống", async () => {
    const user = userEvent.setup();
    const { doiThuTuAction } = await import("../api/queue-actions");
    render(<NutDoiThuTu muc={MUC(true)} />);

    await user.click(screen.getByRole("button", { name: /lên trước/ }));
    expect(vi.mocked(doiThuTuAction)).toHaveBeenCalledWith("you/myapp", 41, -1);
    await user.click(screen.getByRole("button", { name: /xuống sau/ }));
    expect(vi.mocked(doiThuTuAction)).toHaveBeenCalledWith("you/myapp", 41, 1);
  });

  it("action hỏng thì nói ra, không im lặng", async () => {
    const user = userEvent.setup();
    const { themVaoHangDoiAction } = await import("../api/queue-actions");
    vi.mocked(themVaoHangDoiAction).mockResolvedValueOnce({ ok: false, message: "Invalid issue number." });
    render(<NutXepHang muc={MUC(false)} />);

    await user.click(screen.getByRole("button", { name: /Xếp #41/ }));
    expect(await screen.findByText(/Invalid issue number/)).toBeInTheDocument();
  });
});

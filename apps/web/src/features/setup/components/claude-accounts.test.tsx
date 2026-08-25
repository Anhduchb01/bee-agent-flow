import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TrangThaiSlayer } from "@/lib/bee/slayer-ctl";

import { ClaudeAccounts } from "./claude-accounts";
import {
  batDauThemSlotAction,
  boTokenGhimAction,
  caiSlayerAction,
  chupSlotAction,
  doiSlotAction,
} from "../api/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/actions", () => ({
  doiSlotAction: vi.fn(async () => ({ ok: true, message: "" })),
  chupSlotAction: vi.fn(async () => ({ ok: true, message: "" })),
  batDauThemSlotAction: vi.fn(async () => ({ ok: true, url: "https://claude.com/cai/oauth/x" })),
  xongThemSlotAction: vi.fn(async () => ({ ok: true, message: "" })),
  caiSlayerAction: vi.fn(async () => ({ ok: true, message: "" })),
  boTokenGhimAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

const HAI_SLOT: TrangThaiSlayer = {
  daCai: true,
  tokenGhim: false,
  message: null,
  pool: {
    dangBat: "work",
    slots: [
      {
        index: 1,
        name: "work",
        alias: null,
        email: "you@company.com",
        state: "active",
        dangBat: true,
        namGio: { phanTram: 29, resetLuc: null },
        bayNgay: { phanTram: 36, resetLuc: null },
        hetHan: false,
      },
      {
        index: 2,
        name: "personal",
        alias: null,
        email: "you@gmail.com",
        state: "reauth",
        dangBat: false,
        namGio: null,
        bayNgay: null,
        hetHan: true,
      },
    ],
  },
};

describe("ClaudeAccounts", () => {
  it("chưa cài → chỉ có ô dán token, không có bảng tài khoản rỗng gây hiểu nhầm", () => {
    render(<ClaudeAccounts trangThai={{ daCai: false, pool: null, tokenGhim: false, message: null }} />);
    expect(screen.getByLabelText("Token token-slayer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dùng cái này" })).not.toBeInTheDocument();
  });

  it("dán token → gọi trình cài đặt", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts trangThai={{ daCai: false, pool: null, tokenGhim: false, message: null }} />);
    await user.type(screen.getByLabelText("Token token-slayer"), "a".repeat(47));
    await user.click(screen.getByRole("button", { name: "Cài" }));
    expect(caiSlayerAction).toHaveBeenCalledWith("a".repeat(47));
  });

  it("liệt kê pool: cái đang dùng có nhãn và KHÔNG có nút đổi sang chính nó", () => {
    render(<ClaudeAccounts trangThai={HAI_SLOT} />);
    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("đang dùng")).toBeInTheDocument();
    // Đúng một nút đổi: slot đang bật không tự đổi sang chính nó.
    expect(screen.getAllByRole("button", { name: "Dùng cái này" })).toHaveLength(1);
  });

  it("slot hết hạn được nói thẳng, không im lặng nằm đó chờ phiên đêm chết", () => {
    render(<ClaudeAccounts trangThai={HAI_SLOT} />);
    expect(screen.getByText(/hết hạn/)).toBeInTheDocument();
  });

  it("bấm đổi → gửi đúng tên slot", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts trangThai={HAI_SLOT} />);
    await user.click(screen.getByRole("button", { name: "Dùng cái này" }));
    expect(doiSlotAction).toHaveBeenCalledWith("personal");
  });

  it("lỗi từ máy hiện nguyên văn — 'còn phiên đang chạy' phải đọc được", async () => {
    vi.mocked(doiSlotAction).mockResolvedValueOnce({
      ok: false,
      message: "Còn 2 phiên đang chạy. Đổi tài khoản là đổi cho CẢ MÁY…",
    });
    const user = userEvent.setup();
    render(<ClaudeAccounts trangThai={HAI_SLOT} />);
    await user.click(screen.getByRole("button", { name: "Dùng cái này" }));
    expect(await screen.findByText(/Còn 2 phiên đang chạy/)).toBeInTheDocument();
  });

  it("token ghim trong claude.env → cảnh báo kèm nút gỡ, vì bảng này khi đó chỉ là trang trí", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts trangThai={{ ...HAI_SLOT, tokenGhim: true }} />);
    expect(screen.getByText(/đang ghim một token/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gỡ token ghim" }));
    expect(boTokenGhimAction).toHaveBeenCalled();
  });

  it("lưu tài khoản đang đăng nhập thành slot mới", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts trangThai={HAI_SLOT} />);
    await user.type(screen.getByLabelText("Tên slot mới"), "laptop");
    await user.click(screen.getByRole("button", { name: /Lưu tài khoản đang đăng nhập/ }));
    expect(chupSlotAction).toHaveBeenCalledWith("laptop");
  });

  it("đăng nhập tài khoản khác → hiện link duyệt rồi mới hỏi mã", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts trangThai={HAI_SLOT} />);
    expect(screen.queryByLabelText("Mã xác nhận")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Tên slot mới"), "personal2");
    await user.click(screen.getByRole("button", { name: /Đăng nhập tài khoản khác/ }));
    expect(batDauThemSlotAction).toHaveBeenCalledWith("personal2");

    const link = await screen.findByRole("link", { name: /Mở trang duyệt/ });
    expect(link).toHaveAttribute("href", "https://claude.com/cai/oauth/x");
    expect(screen.getByLabelText("Mã xác nhận")).toBeInTheDocument();
  });

  it("pool rỗng nói rõ là rỗng, không để trống cho người dùng tự đoán", () => {
    render(
      <ClaudeAccounts
        trangThai={{ daCai: true, pool: { dangBat: null, slots: [] }, tokenGhim: false, message: null }}
      />,
    );
    expect(screen.getByText(/Chưa có tài khoản nào trong pool/)).toBeInTheDocument();
  });
});

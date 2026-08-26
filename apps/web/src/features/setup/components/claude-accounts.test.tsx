import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TrangThaiSlayer } from "@/lib/bee/slayer-ctl";

import { ClaudeAccounts } from "./claude-accounts";
import {
  startAddSlotAction,
  pullGrantedAccountsAction,
  unpinTokenAction,
  installSlayerAction,
  captureSlotAction,
  switchSlotAction,
} from "../api/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/actions", () => ({
  switchSlotAction: vi.fn(async () => ({ ok: true, message: "" })),
  captureSlotAction: vi.fn(async () => ({ ok: true, message: "" })),
  startAddSlotAction: vi.fn(async () => ({ ok: true, url: "https://claude.com/cai/oauth/x" })),
  finishAddSlotAction: vi.fn(async () => ({ ok: true, message: "" })),
  installSlayerAction: vi.fn(async () => ({ ok: true, message: "" })),
  pullGrantedAccountsAction: vi.fn(async () => ({
    ok: true,
    message: "Account 4fe8bd8d: you are a member but this machine has no credential — ask an admin to Reissue.",
  })),
  unpinTokenAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

const HAI_SLOT: TrangThaiSlayer = {
  daCai: true,
  coLoginMay: true,
  tokenGhim: false,
  message: null,
  pool: {
    enabled: "work",
    slots: [
      {
        index: 1,
        name: "work",
        alias: null,
        email: "you@company.com",
        state: "active",
        enabled: true,
        namGio: { percentOf: 29, resetLuc: null },
        bayNgay: { percentOf: 36, resetLuc: null },
        hetHan: false,
      },
      {
        index: 2,
        name: "personal",
        alias: null,
        email: "you@gmail.com",
        state: "reauth",
        enabled: false,
        namGio: null,
        bayNgay: null,
        hetHan: true,
      },
    ],
  },
};

describe("ClaudeAccounts", () => {
  it("chưa cài → chỉ có ô dán token, không có bảng tài khoản rỗng gây hiểu nhầm", () => {
    render(<ClaudeAccounts status={{ daCai: false, pool: null, tokenGhim: false, message: null, coLoginMay: false }} />);
    expect(screen.getByLabelText("Token token-slayer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this one" })).not.toBeInTheDocument();
  });

  it("dán token → gọi trình cài đặt", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts status={{ daCai: false, pool: null, tokenGhim: false, message: null, coLoginMay: false }} />);
    await user.type(screen.getByLabelText("Token token-slayer"), "a".repeat(47));
    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(installSlayerAction).toHaveBeenCalledWith("a".repeat(47));
  });

  it("liệt kê pool: cái đang dùng có nhãn và KHÔNG có nút đổi sang chính nó", () => {
    render(<ClaudeAccounts status={HAI_SLOT} />);
    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("in use")).toBeInTheDocument();
    // Đúng một nút đổi: slot đang bật không tự đổi sang chính nó.
    expect(screen.getAllByRole("button", { name: "Use this one" })).toHaveLength(1);
  });

  it("slot hết hạn được nói thẳng, không im lặng nằm đó chờ phiên đêm chết", () => {
    render(<ClaudeAccounts status={HAI_SLOT} />);
    expect(screen.getByText(/expired/)).toBeInTheDocument();
  });

  it("bấm đổi → gửi đúng tên slot", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts status={HAI_SLOT} />);
    await user.click(screen.getByRole("button", { name: "Use this one" }));
    expect(switchSlotAction).toHaveBeenCalledWith("personal");
  });

  it("lỗi từ máy hiện nguyên văn — 'còn phiên đang chạy' phải đọc được", async () => {
    vi.mocked(switchSlotAction).mockResolvedValueOnce({
      ok: false,
      message: "Còn 2 phiên đang chạy. Đổi tài khoản là đổi cho CẢ MÁY…",
    });
    const user = userEvent.setup();
    render(<ClaudeAccounts status={HAI_SLOT} />);
    await user.click(screen.getByRole("button", { name: "Use this one" }));
    expect(await screen.findByText(/Còn 2 phiên đang chạy/)).toBeInTheDocument();
  });

  it("token ghim trong claude.env → cảnh báo kèm nút gỡ, vì bảng này khi đó chỉ là trang trí", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts status={{ ...HAI_SLOT, tokenGhim: true }} />);
    expect(screen.getByText(/pins a token/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove the pinned token" }));
    expect(unpinTokenAction).toHaveBeenCalled();
  });

  it("lưu tài khoản đang đăng nhập thành slot mới", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts status={HAI_SLOT} />);
    await user.type(screen.getByLabelText("New slot name"), "laptop");
    await user.click(screen.getByRole("button", { name: /Save the account already signed in/ }));
    expect(captureSlotAction).toHaveBeenCalledWith("laptop");
  });

  it("đăng nhập tài khoản khác → hiện link duyệt rồi mới hỏi mã", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts status={HAI_SLOT} />);
    expect(screen.queryByLabelText("Confirmation code")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("New slot name"), "personal2");
    await user.click(screen.getByRole("button", { name: /Sign in with another account/ }));
    expect(startAddSlotAction).toHaveBeenCalledWith("personal2");

    const link = await screen.findByRole("link", { name: /Open the approval page/ });
    expect(link).toHaveAttribute("href", "https://claude.com/cai/oauth/x");
    expect(screen.getByLabelText("Confirmation code")).toBeInTheDocument();
  });

  it("máy không có login tương tác → nút CHỤP tắt, và nói vì sao", () => {
    render(<ClaudeAccounts status={{ ...HAI_SLOT, coLoginMay: false }} />);
    expect(screen.getByRole("button", { name: /Save the account already signed in/ })).toBeDisabled();
    expect(screen.getByText(/not on a login session/)).toBeInTheDocument();
    // Đường còn lại phải mở, nếu không thì panel thành ngõ cụt.
    expect(screen.getByRole("button", { name: /Sign in with another account/ })).toBeInTheDocument();
  });

  it("cài rồi vẫn còn đường dán token mới — giấu đi là bịt lối lúc admin cấp lại", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts status={HAI_SLOT} />);
    await user.type(screen.getByLabelText("Token token-slayer"), "b".repeat(47));
    await user.click(screen.getByRole("button", { name: /Reinstall \/ change token/ }));
    expect(installSlayerAction).toHaveBeenCalledWith("b".repeat(47));
  });

  it("nhận tài khoản admin cấp → in NGUYÊN lời của tok, kể cả khi nó nói 'chưa có gì'", async () => {
    const user = userEvent.setup();
    render(<ClaudeAccounts status={HAI_SLOT} />);
    await user.click(screen.getByRole("button", { name: "Pull accounts your admin granted" }));
    expect(pullGrantedAccountsAction).toHaveBeenCalled();
    // Câu "ask an admin to Reissue" chính là câu trả lời hữu ích duy nhất.
    expect(await screen.findByText(/ask an admin to Reissue/)).toBeInTheDocument();
  });

  it("pool rỗng nói rõ là rỗng, không để trống cho người dùng tự đoán", () => {
    render(
      <ClaudeAccounts
        status={{ daCai: true, pool: { enabled: null, slots: [] }, tokenGhim: false, message: null, coLoginMay: true }}
      />,
    );
    expect(screen.getByText(/No accounts in the pool yet/)).toBeInTheDocument();
  });
});

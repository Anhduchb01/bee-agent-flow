import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventStream } from "./event-stream";
import type { SuKien } from "../lib/parse-events";

describe("EventStream", () => {
  it("vẽ đủ bốn loại chính: lifecycle, lời người, lời agent, thẻ tool", () => {
    const suKien: SuKien[] = [
      { loai: "lifecycle", text: "Đang dựng worktree…" },
      { loai: "nguoi-noi", text: "làm gọn thôi" },
      { loai: "agent-noi", text: "Đã hiểu, tôi bắt đầu." },
      { loai: "tool", ten: "Bash", thamSo: '{"command":"pnpm test"}', id: "toolu_1", lenh: "pnpm test" },
    ];
    render(<EventStream suKien={suKien} dangGo="" />);

    const log = screen.getByRole("log", { name: "Session events" });
    expect(log).toHaveTextContent("Đang dựng worktree…");
    expect(log).toHaveTextContent("làm gọn thôi");
    expect(log).toHaveTextContent("Đã hiểu, tôi bắt đầu.");
    expect(log).toHaveTextContent("Bash");
    expect(log).toHaveTextContent("pnpm test");
  });

  it("tool đã xong là MỘT thẻ: ✓ + tên + kết quả gập trong thẻ — không phải hai dòng rời", () => {
    const suKien: SuKien[] = [
      { loai: "tool", ten: "Bash", thamSo: "{}", id: "toolu_1", lenh: "pnpm test" },
      { loai: "tool-xong", text: "24 tests passed", id: "toolu_1", loi: false },
    ];
    render(<EventStream suKien={suKien} dangGo="" />);

    expect(screen.getByLabelText("done")).toBeInTheDocument();
    expect(screen.getByText("24 tests passed")).toBeInTheDocument();
  });

  it("tool chưa xong hiện trạng thái đang chạy", () => {
    render(
      <EventStream suKien={[{ loai: "tool", ten: "Grep", thamSo: "{}", id: "toolu_2" }]} dangGo="" />,
    );
    expect(screen.getByLabelText("running")).toBeInTheDocument();
  });

  it("tool lỗi: dấu ✗ và thẻ TỰ MỞ — lỗi không được gập lại chờ người tò mò", () => {
    const suKien: SuKien[] = [
      { loai: "tool", ten: "Bash", thamSo: "{}", id: "toolu_3" },
      { loai: "tool-xong", text: "command not found", id: "toolu_3", loi: true },
    ];
    const { container } = render(<EventStream suKien={suKien} dangGo="" />);
    expect(screen.getByLabelText("failed")).toBeInTheDocument();
    expect(container.querySelector("details[open]")).not.toBeNull();
    expect(screen.getByText("command not found")).toBeVisible();
  });

  it("thinking gập mặc định; thinking đang chảy có nhãn riêng", () => {
    render(
      <EventStream
        suKien={[{ loai: "nghi", text: "cần đọc file cấu hình trước" }]}
        dangGo=""
        dangNghi="đang cân nhắc"
      />,
    );
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent is thinking")).toHaveTextContent("đang cân nhắc");
  });

  it("chữ đang gõ dở của agent hiện với nhãn riêng", () => {
    render(<EventStream suKien={[]} dangGo="Đang nghĩ về" />);
    expect(screen.getByLabelText("Agent is typing")).toHaveTextContent("Đang nghĩ về");
  });

  it("đầu ra agent là plain text — thẻ HTML trong nội dung không được render", () => {
    render(
      <EventStream suKien={[{ loai: "agent-noi", text: '<img src=x onerror="alert(1)">' }]} dangGo="" />,
    );
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

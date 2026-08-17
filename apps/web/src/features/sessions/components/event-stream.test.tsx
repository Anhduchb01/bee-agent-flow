import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventStream } from "./event-stream";
import type { SuKien } from "../lib/parse-events";

describe("EventStream", () => {
  it("vẽ đủ bốn loại chính: lifecycle, lời người, lời agent, tool", () => {
    const suKien: SuKien[] = [
      { loai: "lifecycle", text: "Đang dựng worktree…" },
      { loai: "nguoi-noi", text: "làm gọn thôi" },
      { loai: "agent-noi", text: "Đã hiểu, tôi bắt đầu." },
      { loai: "tool", ten: "Bash", thamSo: '{"command":"pnpm test"}' },
    ];
    render(<EventStream suKien={suKien} dangGo="" />);

    const log = screen.getByRole("log", { name: "Session events" });
    expect(log).toHaveTextContent("Đang dựng worktree…");
    expect(log).toHaveTextContent("làm gọn thôi");
    expect(log).toHaveTextContent("Đã hiểu, tôi bắt đầu.");
    expect(log).toHaveTextContent("Bash");
  });

  it("kết quả tool gập lại được — mở ra mới thấy nội dung", () => {
    render(<EventStream suKien={[{ loai: "tool-xong", text: "24 tests passed" }]} dangGo="" />);
    // <details> đóng mặc định: summary thấy được, nội dung nằm trong pre.
    expect(screen.getByText("tool result")).toBeInTheDocument();
    expect(screen.getByText("24 tests passed")).toBeInTheDocument();
  });

  it("chữ đang gõ dở của agent hiện với nhãn riêng", () => {
    render(<EventStream suKien={[]} dangGo="Đang nghĩ về" />);
    expect(screen.getByLabelText("Agent is typing")).toHaveTextContent("Đang nghĩ về");
  });

  it("đầu ra agent là plain text — thẻ HTML trong nội dung không được render", () => {
    render(
      <EventStream suKien={[{ loai: "agent-noi", text: '<img src=x onerror="alert(1)">' }]} dangGo="" />,
    );
    // Nội dung untrusted phải hiện nguyên văn như chữ, không thành phần tử DOM.
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

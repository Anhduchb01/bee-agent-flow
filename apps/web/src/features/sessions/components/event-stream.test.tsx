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

  it("thẻ Edit vẽ diff: dòng cũ mang dấu −, dòng mới mang dấu +, đếm dòng ở summary", () => {
    const suKien: SuKien[] = [
      {
        loai: "tool",
        ten: "Edit",
        thamSo: "{}",
        id: "toolu_d",
        file: "src/a.ts",
        cu: "dòng cũ",
        moi: "dòng mới 1\ndòng mới 2",
      },
      { loai: "tool-xong", text: "ok", id: "toolu_d", loi: false },
    ];
    render(<EventStream suKien={suKien} dangGo="" />);

    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("+2 −1")).toBeInTheDocument();
    expect(screen.getByText("dòng cũ")).toBeInTheDocument();
    expect(screen.getByText("dòng mới 2")).toBeInTheDocument();
  });

  it("thẻ Bash vẽ khối IN/OUT như panel VSCode", () => {
    const suKien: SuKien[] = [
      { loai: "tool", ten: "Bash", thamSo: "{}", id: "toolu_e", lenh: "pnpm test" },
      { loai: "tool-xong", text: "24 passed", id: "toolu_e", loi: false },
    ];
    render(<EventStream suKien={suKien} dangGo="" />);
    expect(screen.getByText("IN")).toBeInTheDocument();
    expect(screen.getByText("OUT")).toBeInTheDocument();
    expect(screen.getByText("24 passed")).toBeInTheDocument();
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

describe("markdown trong lời agent", () => {
  it("bold / inline code / list render thành phần tử thật, như VSCode", () => {
    render(
      <EventStream
        suKien={[{ loai: "agent-noi", text: "Đã xong **hai việc**: chạy `pnpm test`\n\n- một\n- hai" }]}
        dangGo=""
      />,
    );
    expect(screen.getByText("hai việc").tagName).toBe("STRONG");
    expect(screen.getByText("pnpm test").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("HTML thô trong nội dung KHÔNG được render — chống injection như bản plain", () => {
    const { container } = render(
      <EventStream suKien={[{ loai: "agent-noi", text: 'xin chào <img src=x onerror="alert(1)">' }]} dangGo="" />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

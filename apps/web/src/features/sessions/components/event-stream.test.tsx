import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventStream } from "./event-stream";
import type { StreamEvent } from "../lib/parse-events";

describe("EventStream", () => {
  it("vẽ đủ bốn loại chính: lifecycle, lời người, lời agent, thẻ tool", () => {
    const events: StreamEvent[] = [
      { kind: "lifecycle", text: "Đang dựng worktree…" },
      { kind: "user-said", text: "làm gọn thôi" },
      { kind: "agent-said", text: "Đã hiểu, tôi bắt đầu." },
      { kind: "tool", name: "Bash", args: '{"command":"pnpm test"}', id: "toolu_1", command: "pnpm test" },
    ];
    render(<EventStream events={events} typing="" />);

    const log = screen.getByRole("log", { name: "Session events" });
    expect(log).toHaveTextContent("Đang dựng worktree…");
    expect(log).toHaveTextContent("làm gọn thôi");
    expect(log).toHaveTextContent("Đã hiểu, tôi bắt đầu.");
    expect(log).toHaveTextContent("Bash");
    expect(log).toHaveTextContent("pnpm test");
  });

  it("tool đã xong là MỘT thẻ: ✓ + tên + kết quả gập trong thẻ — không phải hai dòng rời", () => {
    const events: StreamEvent[] = [
      { kind: "tool", name: "Bash", args: "{}", id: "toolu_1", command: "pnpm test" },
      { kind: "tool-done", text: "24 tests passed", id: "toolu_1", err: false },
    ];
    render(<EventStream events={events} typing="" />);

    expect(screen.getByLabelText("done")).toBeInTheDocument();
    expect(screen.getByText("24 tests passed")).toBeInTheDocument();
  });

  it("tool chưa xong hiện trạng thái đang chạy", () => {
    render(
      <EventStream events={[{ kind: "tool", name: "Grep", args: "{}", id: "toolu_2" }]} typing="" />,
    );
    expect(screen.getByLabelText("running")).toBeInTheDocument();
  });

  it("tool lỗi: dấu ✗ và thẻ TỰ MỞ — lỗi không được gập lại chờ người tò mò", () => {
    const events: StreamEvent[] = [
      { kind: "tool", name: "Bash", args: "{}", id: "toolu_3" },
      { kind: "tool-done", text: "command not found", id: "toolu_3", err: true },
    ];
    const { container } = render(<EventStream events={events} typing="" />);
    expect(screen.getByLabelText("failed")).toBeInTheDocument();
    expect(container.querySelector("details[open]")).not.toBeNull();
    expect(screen.getByText("command not found")).toBeVisible();
  });

  it("thinking gập mặc định; thinking đang chảy có nhãn riêng", () => {
    render(
      <EventStream
        events={[{ kind: "thinking", text: "cần đọc file cấu hình trước" }]}
        typing=""
        idle="đang cân nhắc"
      />,
    );
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent is thinking")).toHaveTextContent("đang cân nhắc");
  });

  it("thẻ Edit vẽ diff: dòng cũ mang dấu −, dòng mới mang dấu +, đếm dòng ở summary", () => {
    const events: StreamEvent[] = [
      {
        kind: "tool",
        name: "Edit",
        args: "{}",
        id: "toolu_d",
        file: "src/a.ts",
        cu: "dòng cũ",
        latest: "dòng mới 1\ndòng mới 2",
      },
      { kind: "tool-done", text: "ok", id: "toolu_d", err: false },
    ];
    render(<EventStream events={events} typing="" />);

    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("+2 −1")).toBeInTheDocument();
    expect(screen.getByText("dòng cũ")).toBeInTheDocument();
    expect(screen.getByText("dòng mới 2")).toBeInTheDocument();
  });

  it("thẻ Bash vẽ khối IN/OUT như panel VSCode", () => {
    const events: StreamEvent[] = [
      { kind: "tool", name: "Bash", args: "{}", id: "toolu_e", command: "pnpm test" },
      { kind: "tool-done", text: "24 passed", id: "toolu_e", err: false },
    ];
    render(<EventStream events={events} typing="" />);
    expect(screen.getByText("IN")).toBeInTheDocument();
    expect(screen.getByText("OUT")).toBeInTheDocument();
    expect(screen.getByText("24 passed")).toBeInTheDocument();
  });

  it("chữ đang gõ dở của agent hiện với nhãn riêng", () => {
    render(<EventStream events={[]} typing="Đang nghĩ về" />);
    expect(screen.getByLabelText("Agent is typing")).toHaveTextContent("Đang nghĩ về");
  });

  it("đầu ra agent là plain text — thẻ HTML trong nội dung không được render", () => {
    render(
      <EventStream events={[{ kind: "agent-said", text: '<img src=x onerror="alert(1)">' }]} typing="" />,
    );
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("markdown trong lời agent", () => {
  it("bold / inline code / list render thành phần tử thật, như VSCode", () => {
    render(
      <EventStream
        events={[{ kind: "agent-said", text: "Đã xong **hai việc**: chạy `pnpm test`\n\n- một\n- hai" }]}
        typing=""
      />,
    );
    expect(screen.getByText("hai việc").tagName).toBe("STRONG");
    expect(screen.getByText("pnpm test").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("HTML thô trong nội dung KHÔNG được render — chống injection như bản plain", () => {
    const { container } = render(
      <EventStream events={[{ kind: "agent-said", text: 'xin chào <img src=x onerror="alert(1)">' }]} typing="" />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("approval card (V2.5b)", () => {
  it("pending card shows the command and Allow/Deny; clicking Allow passes the input back", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const onAnswer = vi.fn();
    render(
      <EventStream
        events={[
          {
            kind: "permission-asked",
            requestId: "r1",
            name: "Bash",
            args: '{"command":"pnpm test"}',
          },
        ]}
        typing=""
        onAnswerPermission={onAnswer}
      />,
    );
    expect(screen.getByText("Permission — Bash")).toBeInTheDocument();
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(onAnswer).toHaveBeenCalledWith("r1", true, '{"command":"pnpm test"}');
  });

  it("answered card shows the verdict and drops the buttons", () => {
    render(
      <EventStream
        events={[
          { kind: "permission-asked", requestId: "r1", name: "Bash", args: "{}" },
          { kind: "permission-answered", requestId: "r1", allow: false },
        ]}
        typing=""
        onAnswerPermission={vi.fn()}
      />,
    );
    expect(screen.getByText("✗ denied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });
});

describe("compact seam — the visible reason the ring just dropped", () => {
  it("renders the compacted line with trigger and pre-compact size", () => {
    const events: StreamEvent[] = [
      { kind: "agent-said", text: "still here" },
      { kind: "compact", trigger: "auto", preTokens: 165_000 },
    ];
    render(<EventStream events={events} typing="" />);
    const log = screen.getByRole("log", { name: "Session events" });
    expect(log).toHaveTextContent("Conversation compacted (auto) · was 165k tokens");
  });

  it("manual /compact says so; no pre_tokens → no size shown", () => {
    render(
      <EventStream events={[{ kind: "compact", trigger: "manual", preTokens: null }]} typing="" />,
    );
    const log = screen.getByRole("log", { name: "Session events" });
    expect(log).toHaveTextContent("Conversation compacted (/compact)");
    expect(log).not.toHaveTextContent("tokens");
  });
});

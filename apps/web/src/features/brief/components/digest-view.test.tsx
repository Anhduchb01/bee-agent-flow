import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Digest } from "../lib/digest";

import { DigestView } from "./digest-view";

const PHIEN = {
  id: "s1", slug: "myapp", num: 41, repo: "you/myapp", title: "CSV export",
  phase: "work", worktree: true, status: "done", created_at: null,
  started_at: null, ended_at: null, attempt: 0, needs_human: false,
} as Digest["ran"][number]["session"];

const BASE: Digest = {
  kind: "co-viec", since: "t", until: "t",
  ran: [{ session: PHIEN, pr: null, issue: null }],
  toReview: [], outcome: [], stillQueued: [],
};

describe("DigestView — sáng dậy cầm điện thoại là đọc được", () => {
  it("PR chờ duyệt lên đầu, link thẳng vào trang duyệt", () => {
    render(<DigestView digest={{ ...BASE, toReview: [{ session: PHIEN, pr: { kind: "pr", url: "u", number: 12, ts: null, title: null }, issue: null }] }} />);
    expect(screen.getByRole("link", { name: /PR #12/ })).toHaveAttribute("href", "/pr/myapp/12");
  });

  it("việc kẹt mang MỘT CÂU vì sao, không phải mã lỗi", () => {
    render(<DigestView digest={{ ...BASE, outcome: [{ session: PHIEN, why: "vượt trần chi $5 USD" }] }} />);
    expect(screen.getByText("vượt trần chi $5 USD")).toBeInTheDocument();
  });

  it("không xếp việc: nói thẳng là chưa xếp, và chỉ đường đi xếp", () => {
    render(<DigestView digest={{ ...BASE, kind: "khong-xep-viec", ran: [] }} />);
    expect(screen.getByText(/Nothing has been queued/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /project board/ })).toHaveAttribute("href", "/projects?view=kanban");
  });

  it("có xếp mà không chạy được là MỘT CÂU CHUYỆN KHÁC — không gộp với 'chưa xếp'", () => {
    render(
      <DigestView digest={{
        ...BASE, kind: "xep-ma-khong-chay", ran: [],
        stillQueued: [{ item: { slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default", status: "waiting", sessionId: null, reason: "hạn mức 5h đang 91%", added_at: "t" }, why: "hạn mức 5h đang 91%" }],
      }} />,
    );
    expect(screen.getByText(/nothing could run/i)).toBeInTheDocument();
    expect(screen.getByText(/91%/)).toBeInTheDocument();
  });
});

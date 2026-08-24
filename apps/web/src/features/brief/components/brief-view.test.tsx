import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { BanTin } from "../lib/tom-tat";

import { BriefView } from "./brief-view";

const PHIEN = {
  id: "s1", slug: "myapp", num: 41, repo: "you/myapp", title: "CSV export",
  phase: "work", worktree: true, status: "done", created_at: null,
  started_at: null, ended_at: null, attempt: 0, needs_human: false,
} as BanTin["daChay"][number]["phien"];

const BASE: BanTin = {
  loai: "co-viec", tu: "t", den: "t",
  daChay: [{ phien: PHIEN, pr: null, issue: null }],
  choDuyet: [], ket: [], conCho: [],
};

describe("BriefView — sáng dậy cầm điện thoại là đọc được", () => {
  it("PR chờ duyệt lên đầu, link thẳng vào trang duyệt", () => {
    render(<BriefView banTin={{ ...BASE, choDuyet: [{ phien: PHIEN, pr: { kind: "pr", url: "u", number: 12, ts: null, title: null }, issue: null }] }} />);
    expect(screen.getByRole("link", { name: /PR #12/ })).toHaveAttribute("href", "/pr/myapp/12");
  });

  it("việc kẹt mang MỘT CÂU vì sao, không phải mã lỗi", () => {
    render(<BriefView banTin={{ ...BASE, ket: [{ phien: PHIEN, viSao: "vượt trần chi $5 USD" }] }} />);
    expect(screen.getByText("vượt trần chi $5 USD")).toBeInTheDocument();
  });

  it("không xếp việc: nói thẳng là chưa xếp, và chỉ đường đi xếp", () => {
    render(<BriefView banTin={{ ...BASE, loai: "khong-xep-viec", daChay: [] }} />);
    expect(screen.getByText(/không có việc nào được xếp/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /bảng dự án/ })).toHaveAttribute("href", "/projects?view=kanban");
  });

  it("có xếp mà không chạy được là MỘT CÂU CHUYỆN KHÁC — không gộp với 'chưa xếp'", () => {
    render(
      <BriefView banTin={{
        ...BASE, loai: "xep-ma-khong-chay", daChay: [],
        conCho: [{ viec: { slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default", status: "waiting", sessionId: null, reason: "hạn mức 5h đang 91%", added_at: "t" }, viSao: "hạn mức 5h đang 91%" }],
      }} />,
    );
    expect(screen.getByText(/không chạy được/i)).toBeInTheDocument();
    expect(screen.getByText(/91%/)).toBeInTheDocument();
  });
});

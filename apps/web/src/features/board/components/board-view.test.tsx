import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BeeIssue } from "@/lib/bee/issues";

import { ghepBang } from "../lib/lanes";
import { BoardKanban } from "./board-kanban";

// Kanban gọi server action (xếp/bỏ hàng đợi) — jsdom không nạp được chuỗi
// next-auth phía sau nó, và bài của file này là bố cục lane chứ không phải
// hành vi hàng đợi (đã có autopilot-controls.test).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../api/queue-actions", () => ({
  themVaoHangDoiAction: vi.fn(async () => ({ ok: true, message: "" })),
  boKhoiHangDoiAction: vi.fn(async () => ({ ok: true, message: "" })),
  doiThuTuAction: vi.fn(async () => ({ ok: true, message: "" })),
}));
import { BoardTable } from "./board-table";
import { BoardToolbar, duongDanBang } from "./board-toolbar";

const REPOS = [
  { slug: "myapp", repo: "you/myapp" },
  { slug: "blog", repo: "you/blog" },
];

const ISSUE: BeeIssue = {
  number: 41,
  title: "Add CSV export to the report screen",
  state: "OPEN",
  url: "https://github.com/you/myapp/issues/41",
  labels: ["enhancement"],
  assignees: [],
  createdAt: "2026-08-17T09:55:00Z",
  updatedAt: "2026-08-17T10:02:00Z",
};

const MUC = ghepBang(
  REPOS,
  { "you/myapp": [ISSUE], "you/blog": [] },
  [
    {
      id: "de300000-0000-4000-8000-000000000001",
      slug: "myapp",
      num: 41,
      repo: "you/myapp",
      title: "CSV export",
      phase: "work",
      worktree: true,
      status: "running",
      created_at: "2026-08-17T09:58:00Z",
      started_at: "2026-08-17T09:58:04Z",
      ended_at: null,
      attempt: 0,
      needs_human: false,
    },
  ],
  {
    "de300000-0000-4000-8000-000000000001": [
      {
        kind: "issue",
        url: "https://github.com/you/myapp/issues/41",
        number: 41,
        ts: null,
        title: null,
      },
    ],
  },
);

describe("BoardTable — an issue row says who is working on it", () => {
  it("shows the issue, its project, and links to the session that owns it", () => {
    render(<BoardTable muc={MUC} />);

    expect(screen.getByText("Add CSV export to the report screen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /#41/ })).toHaveAttribute(
      "href",
      "https://github.com/you/myapp/issues/41",
    );
    expect(screen.getByRole("link", { name: /bee\/myapp-41/ })).toHaveAttribute(
      "href",
      "/sessions/de300000-0000-4000-8000-000000000001",
    );
    expect(screen.getByText("In session")).toBeInTheDocument();
  });

  it("an untouched issue says so instead of showing an empty cell", () => {
    const trong = ghepBang(REPOS, { "you/myapp": [ISSUE], "you/blog": [] }, [], {});
    render(<BoardTable muc={trong} />);
    expect(screen.getByText("no session yet")).toBeInTheDocument();
  });
});

describe("BoardKanban — four lanes in lifecycle order", () => {
  it("puts the issue in its lane and keeps empty lanes visible", () => {
    render(<BoardKanban muc={MUC} />);

    const lanes = screen.getAllByRole("region");
    expect(lanes.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Backlog",
      "Autopilot",
      "In session",
      "In review",
      "Done",
    ]);
    expect(within(lanes[2]!).getByText("Add CSV export to the report screen")).toBeInTheDocument();
    expect(within(lanes[0]!).getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("BoardToolbar — filter and view live in the URL", () => {
  it("builds shareable links and marks the current one", () => {
    expect(duongDanBang(null, "table")).toBe("/projects");
    expect(duongDanBang("blog", "table")).toBe("/projects?p=blog");
    expect(duongDanBang("blog", "kanban")).toBe("/projects?p=blog&view=kanban");

    render(<BoardToolbar repos={REPOS} duAn="blog" view="kanban" soXepHang={2} />);
    expect(screen.getByRole("link", { name: "blog" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Kanban" })).toHaveAttribute("aria-current", "page");
    // Switching view keeps the project filter, and vice versa.
    expect(screen.getByRole("link", { name: "Table" })).toHaveAttribute("href", "/projects?p=blog");
    expect(screen.getByRole("link", { name: "All projects" })).toHaveAttribute(
      "href",
      "/projects?view=kanban",
    );
    // "Run now" nằm ở toolbar chứ không ở riêng lane Autopilot — lane đó chỉ
    // có trong Kanban, mà mặc định là Table.
    expect(screen.getByRole("button", { name: "Run now" })).toBeEnabled();
  });

  it("hàng đợi rỗng thì Run now tắt — không có gì để chạy thì đừng hứa", () => {
    render(<BoardToolbar repos={REPOS} duAn={null} view="table" soXepHang={0} />);
    expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();
  });
});

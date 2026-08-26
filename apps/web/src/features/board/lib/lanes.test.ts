import { describe, expect, it } from "vitest";

import type { BeeIssue } from "@/lib/bee/issues";
import type { BeeArtifact, BeeSession } from "@/lib/bee/types";

import { buildBoard, filterByProject, groupByLane, laneOf } from "./lanes";

const REPOS = [
  { slug: "myapp", repo: "you/myapp" },
  { slug: "blog", repo: "you/blog" },
];

function issue(number: number, state: "OPEN" | "CLOSED" = "OPEN"): BeeIssue {
  return {
    number,
    title: `Issue ${number}`,
    state,
    url: `https://github.com/you/myapp/issues/${number}`,
    labels: [],
    assignees: [],
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
  };
}

function phien(id: string, over: Partial<BeeSession> = {}): BeeSession {
  return {
    id,
    slug: "myapp",
    num: 1,
    repo: "you/myapp",
    title: null,
    phase: "work",
    worktree: true,
    status: "running",
    created_at: "2026-08-01T00:00:00Z",
    started_at: "2026-08-01T00:00:01Z",
    ended_at: null,
    attempt: 0,
    needs_human: false,
    ...over,
  } as BeeSession;
}

const artIssue = (n: number): BeeArtifact => ({
  kind: "issue",
  url: `https://github.com/you/myapp/issues/${n}`,
  number: n,
  ts: "2026-08-01T00:10:00Z",
  title: null,
});
const artPr = (n: number): BeeArtifact => ({
  kind: "pr",
  url: `https://github.com/you/myapp/pull/${n}`,
  number: n,
  ts: "2026-08-01T00:20:00Z",
  title: null,
});

describe("laneOf — the lanes are the bee lifecycle", () => {
  it("closed on GitHub wins over everything else", () => {
    const p = [{ id: "a", title: null, branch: "bee/myapp-1", status: "running" as const, needs_human: false }];
    expect(laneOf(issue(1, "CLOSED"), p, [artPr(9)])).toBe("done");
  });

  it("a running session means working; a starting one counts too", () => {
    const chay = [{ id: "a", title: null, branch: "bee/myapp-1", status: "running" as const, needs_human: false }];
    const start = [{ id: "a", title: null, branch: "bee/myapp-1", status: "starting" as const, needs_human: false }];
    expect(laneOf(issue(1), chay, [])).toBe("working");
    expect(laneOf(issue(1), start, [])).toBe("working");
  });

  it("a PR with no running session means the ball is with the owner", () => {
    const xong = [{ id: "a", title: null, branch: "bee/myapp-1", status: "done" as const, needs_human: false }];
    expect(laneOf(issue(1), xong, [artPr(9)])).toBe("review");
  });

  it("a finished session that produced nothing falls back to backlog", () => {
    const hong = [{ id: "a", title: null, branch: "bee/myapp-1", status: "failed" as const, needs_human: true }];
    expect(laneOf(issue(1), hong, [])).toBe("backlog");
    expect(laneOf(issue(1), [], [])).toBe("backlog");
  });
});

describe("buildBoard — the issue↔session link GitHub cannot know", () => {
  it("attaches sessions by the issue number their run.jsonl logged", () => {
    const muc = buildBoard(
      REPOS,
      { "you/myapp": [issue(41), issue(39)], "you/blog": [] },
      [phien("s1"), phien("s2", { num: 2, status: "done" })],
      { s1: [artIssue(41)], s2: [artIssue(39), artPr(123)] },
    );

    const m41 = muc.find((m) => m.issue.number === 41);
    expect(m41?.phien.map((p) => p.branch)).toEqual(["bee/myapp-1"]);
    expect(m41?.lane).toBe("working");

    const m39 = muc.find((m) => m.issue.number === 39);
    expect(m39?.pr.map((p) => p.number)).toEqual([123]);
    expect(m39?.lane).toBe("review");
  });

  it("never attaches a session from another repo, even on the same number", () => {
    const muc = buildBoard(
      REPOS,
      { "you/myapp": [issue(7)], "you/blog": [{ ...issue(7), url: "https://github.com/you/blog/issues/7" }] },
      [phien("s1", { repo: "you/blog", slug: "blog" })],
      { s1: [artIssue(7)] },
    );
    expect(muc.find((m) => m.slug === "myapp")?.phien).toHaveLength(0);
    expect(muc.find((m) => m.slug === "blog")?.phien).toHaveLength(1);
  });

  it("an issue nothing touched still appears — that IS the backlog", () => {
    const muc = buildBoard(REPOS, { "you/myapp": [issue(5)], "you/blog": [] }, [], {});
    expect(muc).toHaveLength(1);
    expect(muc[0]?.lane).toBe("backlog");
    expect(muc[0]?.phien).toEqual([]);
  });
});

describe("filterByProject / groupByLane", () => {
  const muc = buildBoard(
    REPOS,
    {
      "you/myapp": [issue(41), issue(40, "CLOSED")],
      "you/blog": [{ ...issue(7), url: "https://github.com/you/blog/issues/7" }],
    },
    [phien("s1")],
    { s1: [artIssue(41)] },
  );

  it("filters to one project, and an unknown slug shows nothing rather than everything", () => {
    expect(filterByProject(muc, "blog").map((m) => m.issue.number)).toEqual([7]);
    expect(filterByProject(muc, null)).toHaveLength(3);
    expect(filterByProject(muc, "khong-co")).toEqual([]);
  });

  it("groups into the five lanes with empty ones kept", () => {
    const nhom = groupByLane(muc);
    expect(nhom.working.map((m) => m.issue.number)).toEqual([41]);
    expect(nhom.done.map((m) => m.issue.number)).toEqual([40]);
    expect(nhom.review).toEqual([]);
    // Autopilot chen vào giữa backlog và working (D4) — thứ tự này LÀ vòng đời.
    expect(Object.keys(nhom)).toEqual(["backlog", "autopilot", "working", "review", "done"]);
  });
});

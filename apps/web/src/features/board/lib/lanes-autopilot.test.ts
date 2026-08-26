import { describe, expect, it } from "vitest";

import type { BeeIssue } from "@/lib/bee/issues";
import type { Queue } from "@/lib/bee/types";

import { buildBoard, isDropAllowed, laneOf } from "./lanes";

const issue = (n: number, state: "OPEN" | "CLOSED" = "OPEN"): BeeIssue => ({
  number: n, title: `Issue ${n}`, state,
  url: `https://github.com/you/myapp/issues/${n}`,
  labels: [], assignees: [], createdAt: "", updatedAt: "",
});

const trongHang = (n: number, status: "waiting" | "running" = "waiting"): Queue => ({
  paused: false,
  items: [{
    slug: "myapp", repo: "you/myapp", issue: n, mode: "auto", model: "default",
    status, sessionId: null, reason: null, added_at: "t",
  }],
});

describe("lane Autopilot (D4) — hàng đợi là một TRẠNG THÁI", () => {
  it("issue đã xếp hàng rời khỏi backlog sang autopilot", () => {
    const muc = buildBoard(
      [{ slug: "myapp", repo: "you/myapp" }],
      { "you/myapp": [issue(41)] },
      [], {}, trongHang(41),
    );
    expect(muc[0]?.lane).toBe("autopilot");
  });

  it("nhưng phiên đang chạy vẫn thắng — sự thật quan trọng hơn ý định", () => {
    expect(
      laneOf(issue(41), [{ id: "s", title: null, branch: "b", status: "running", needs_human: false }], [], true),
    ).toBe("working");
  });

  it("issue đóng rồi thì done, kể cả còn nằm trong hàng", () => {
    expect(laneOf(issue(41, "CLOSED"), [], [], true)).toBe("done");
  });

  it("không xếp hàng → vẫn backlog như cũ", () => {
    expect(laneOf(issue(41), [], [], false)).toBe("backlog");
  });
});

describe("isDropAllowed — chỉ Backlog ↔ Autopilot, ba lane kia là hệ quả", () => {
  it("cho thả giữa backlog và autopilot", () => {
    expect(isDropAllowed("backlog", "autopilot").ok).toBe(true);
    expect(isDropAllowed("autopilot", "backlog").ok).toBe(true);
  });

  it("từ chối thả vào working/review/done, kèm lý do đọc được", () => {
    for (const den of ["working", "review", "done"] as const) {
      const k = isDropAllowed("backlog", den);
      expect(k.ok).toBe(false);
      expect(k.reason).not.toBe("");
    }
    expect(isDropAllowed("backlog", "working").reason).toMatch(/phiên|session/i);
    expect(isDropAllowed("backlog", "done").reason).toMatch(/GitHub/i);
  });

  it("kéo một thẻ đang ở working ra ngoài cũng bị từ chối", () => {
    expect(isDropAllowed("working", "backlog").ok).toBe(false);
  });

  it("thả vào chính lane của nó là no-op hợp lệ", () => {
    expect(isDropAllowed("backlog", "backlog").ok).toBe(true);
  });
});

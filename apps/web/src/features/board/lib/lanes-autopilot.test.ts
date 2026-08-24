import { describe, expect, it } from "vitest";

import type { BeeIssue } from "@/lib/bee/issues";
import type { HangDoi } from "@/lib/bee/types";

import { ghepBang, laThaHopLe, xepLane } from "./lanes";

const issue = (n: number, state: "OPEN" | "CLOSED" = "OPEN"): BeeIssue => ({
  number: n, title: `Issue ${n}`, state,
  url: `https://github.com/you/myapp/issues/${n}`,
  labels: [], assignees: [], createdAt: "", updatedAt: "",
});

const trongHang = (n: number, status: "waiting" | "running" = "waiting"): HangDoi => ({
  paused: false,
  items: [{
    slug: "myapp", repo: "you/myapp", issue: n, mode: "auto", model: "default",
    status, sessionId: null, reason: null, added_at: "t",
  }],
});

describe("lane Autopilot (D4) — hàng đợi là một TRẠNG THÁI", () => {
  it("issue đã xếp hàng rời khỏi backlog sang autopilot", () => {
    const muc = ghepBang(
      [{ slug: "myapp", repo: "you/myapp" }],
      { "you/myapp": [issue(41)] },
      [], {}, trongHang(41),
    );
    expect(muc[0]?.lane).toBe("autopilot");
  });

  it("nhưng phiên đang chạy vẫn thắng — sự thật quan trọng hơn ý định", () => {
    expect(
      xepLane(issue(41), [{ id: "s", title: null, branch: "b", status: "running", needs_human: false }], [], true),
    ).toBe("working");
  });

  it("issue đóng rồi thì done, kể cả còn nằm trong hàng", () => {
    expect(xepLane(issue(41, "CLOSED"), [], [], true)).toBe("done");
  });

  it("không xếp hàng → vẫn backlog như cũ", () => {
    expect(xepLane(issue(41), [], [], false)).toBe("backlog");
  });
});

describe("laThaHopLe — chỉ Backlog ↔ Autopilot, ba lane kia là hệ quả", () => {
  it("cho thả giữa backlog và autopilot", () => {
    expect(laThaHopLe("backlog", "autopilot").ok).toBe(true);
    expect(laThaHopLe("autopilot", "backlog").ok).toBe(true);
  });

  it("từ chối thả vào working/review/done, kèm lý do đọc được", () => {
    for (const den of ["working", "review", "done"] as const) {
      const k = laThaHopLe("backlog", den);
      expect(k.ok).toBe(false);
      expect(k.lyDo).not.toBe("");
    }
    expect(laThaHopLe("backlog", "working").lyDo).toMatch(/phiên|session/i);
    expect(laThaHopLe("backlog", "done").lyDo).toMatch(/GitHub/i);
  });

  it("kéo một thẻ đang ở working ra ngoài cũng bị từ chối", () => {
    expect(laThaHopLe("working", "backlog").ok).toBe(false);
  });

  it("thả vào chính lane của nó là no-op hợp lệ", () => {
    expect(laThaHopLe("backlog", "backlog").ok).toBe(true);
  });
});

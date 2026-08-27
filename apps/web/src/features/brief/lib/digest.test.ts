import { describe, expect, it } from "vitest";

import type { BeeArtifact, BeeSession, Queue } from "@/lib/bee/types";

import { recentWindow } from "../api/load";
import { buildDigest } from "./digest";

const TU = new Date("2026-08-24T22:00:00Z");
const DEN = new Date("2026-08-25T07:00:00Z");

function session(over: Partial<BeeSession>): BeeSession {
  return {
    id: "s1", slug: "myapp", num: 1, repo: "you/myapp", title: "Việc đêm",
    phase: "work", worktree: true, status: "done",
    created_at: "2026-08-24T23:00:00Z", started_at: "2026-08-24T23:00:00Z",
    ended_at: "2026-08-24T23:40:00Z", attempt: 0, needs_human: false,
    ...over,
  } as BeeSession;
}

const HANG_RONG: Queue = { items: [], paused: false };

describe("buildDigest — sáng dậy đọc một trang là biết đêm qua ra sao", () => {
  it("chỉ tính phiên trong khoảng đêm, bỏ phiên ban ngày hôm trước", () => {
    const b = buildDigest({
      session: [session({}), session({ id: "cu", ended_at: "2026-08-20T10:00:00Z" })],
      artifacts: {}, queue: HANG_RONG, since: TU, until: DEN,
    });
    expect(b.ran).toHaveLength(1);
  });

  it("xong + có PR → xếp vào 'chờ bạn duyệt', kèm link PR", () => {
    const pr: BeeArtifact = { kind: "pr", url: "https://github.com/you/myapp/pull/12", number: 12, ts: null, title: "CSV export" };
    const b = buildDigest({
      session: [session({})], artifacts: { s1: [pr] }, queue: HANG_RONG, since: TU, until: DEN,
    });
    expect(b.toReview).toHaveLength(1);
    expect(b.toReview[0]?.pr?.number).toBe(12);
  });

  it("xong mà KHÔNG có PR là chuyện khác — không được trộn vào 'chờ duyệt'", () => {
    const b = buildDigest({ session: [session({})], artifacts: {}, queue: HANG_RONG, since: TU, until: DEN });
    expect(b.toReview).toHaveLength(0);
    expect(b.ran).toHaveLength(1);
  });

  it("kẹt: needs_human hoặc failed, và mỗi cái mang MỘT CÂU vì sao", () => {
    const b = buildDigest({
      session: [
        session({ id: "s2", status: "failed", needs_human: true, reason: "vượt trần chi $5 USD" } as Partial<BeeSession>),
        session({ id: "s3", status: "failed" }),
      ],
      artifacts: {}, queue: HANG_RONG, since: TU, until: DEN,
    });
    expect(b.outcome).toHaveLength(2);
    expect(b.outcome[0]?.why).toMatch(/trần chi/);
    // Không có reason thì vẫn phải nói được gì đó đọc hiểu, không để trống.
    expect(b.outcome[1]?.why).not.toBe("");
  });

  it("việc trong hàng chưa chạy được mang theo lý do của phanh", () => {
    const hang: Queue = {
      paused: false,
      items: [{
        slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default",
        status: "waiting", sessionId: null,
        reason: "Not opening a new session: 5h quota is at 91%", added_at: "t",
      }],
    };
    const b = buildDigest({ session: [], artifacts: {}, queue: hang, since: TU, until: DEN });
    expect(b.stillQueued[0]?.why).toMatch(/91%/);
  });

  it("KHÔNG XẾP VIỆC khác hẳn CÓ XẾP MÀ KHÔNG CHẠY — PRD §4.1", () => {
    const within = buildDigest({ session: [], artifacts: {}, queue: HANG_RONG, since: TU, until: DEN });
    expect(within.kind).toBe("khong-xep-viec");

    const digestQueued = buildDigest({
      session: [],
      artifacts: {},
      queue: { paused: false, items: [{ slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default", status: "waiting", sessionId: null, reason: null, added_at: "t" }] },
      since: TU, until: DEN,
    });
    expect(digestQueued.kind).toBe("xep-ma-khong-chay");
  });

  it("có chạy → loại 'có việc', và đếm đúng", () => {
    const b = buildDigest({ session: [session({})], artifacts: {}, queue: HANG_RONG, since: TU, until: DEN });
    expect(b.kind).toBe("co-viec");
  });
});

describe("recentWindow — cửa sổ 24h trượt, không phải mốc 18:00", () => {
  it("3 giờ chiều vẫn thấy việc chạy lúc 2 giờ chiều", () => {
    // Bản cũ cắt từ 18:00 hôm trước, nên mở trang lúc 15:00 là KHÔNG thấy gì
    // chạy trong ngày — trong khi Autopilot chạy suốt ngày. Đó là điểm mù
    // theo giờ trên chính cái trang sinh ra để nói "chuyện gì đã xảy ra".
    const now = new Date("2026-08-26T15:00:00Z");
    const { since, until } = recentWindow(now);
    expect(until).toEqual(now);
    expect(new Date("2026-08-26T14:00:00Z").getTime()).toBeGreaterThan(since.getTime());
    // Và vẫn phủ trọn đêm hôm trước — không đánh đổi ca dùng cũ lấy ca mới.
    expect(new Date("2026-08-26T02:00:00Z").getTime()).toBeGreaterThan(since.getTime());
  });

  it("cắt đúng 24 giờ: cũ hơn thì ra ngoài", () => {
    const { since } = recentWindow(new Date("2026-08-26T15:00:00Z"));
    expect(since.toISOString()).toBe("2026-08-25T15:00:00.000Z");
  });
});

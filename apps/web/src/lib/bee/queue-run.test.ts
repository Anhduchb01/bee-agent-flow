import { describe, expect, it, vi } from "vitest";

import type { Queue, QueueItem } from "./types";
import { runOneTick } from "./queue-run";

const VIEC = {
  slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto" as const,
  model: "default" as const, status: "waiting" as const,
  sessionId: null, reason: null, added_at: "2026-08-24T15:00:00Z",
};
const HANG: Queue = { items: [VIEC], paused: false };

/** Cửa: mở phiên thành công, PAUSE tắt, còn slot. Từng test tự bẻ một cái. */
function moiTruong(over: Partial<Parameters<typeof runOneTick>[0]> = {}) {
  const openSession = vi.fn<(v: QueueItem) => Promise<{ ok: true; id: string } | { ok: false; message: string }>>(
    async () => ({ ok: true as const, id: "de300000-0000-4000-8000-000000000009" }),
  );
  const ghi = vi.fn<(q: Queue) => Promise<void>>(async () => {});
  return {
    queue: HANG,
    paused: false,
    runningCount: 0,
    ...over,
    openSession: (over.openSession ?? openSession) as typeof openSession,
    ghi: (over.ghi ?? ghi) as typeof ghi,
  };
}

describe("runOneTick — cái vòng chạy lúc người đang ngủ", () => {
  it("có việc chờ + mọi cửa mở → mở phiên và ghi sessionId vào hàng", async () => {
    const mt = moiTruong();
    const kq = await runOneTick(mt);

    expect(mt.openSession).toHaveBeenCalledTimes(1);
    expect(kq.opened?.issue).toBe(41);
    const ghi = mt.ghi.mock.calls[0]?.[0] as Queue;
    expect(ghi.items[0]?.status).toBe("running");
    expect(ghi.items[0]?.sessionId).toBe("de300000-0000-4000-8000-000000000009");
  });

  it("PAUSE bật → không mở gì, và nói ĐÚNG lý do", async () => {
    const mt = moiTruong({ paused: true });
    const kq = await runOneTick(mt);
    expect(mt.openSession).not.toHaveBeenCalled();
    expect(kq.reason).toMatch(/PAUSE/i);
  });

  it("hàng đợi ⏸ → không mở, lý do khác PAUSE máy", async () => {
    const mt = moiTruong({ queue: { ...HANG, paused: true } });
    const kq = await runOneTick(mt);
    expect(mt.openSession).not.toHaveBeenCalled();
    expect(kq.reason).toMatch(/tạm dừng|paused/i);
    expect(kq.reason).not.toMatch(/PAUSE/);
  });

  it("đã đủ phiên song song → chờ, không xếp chồng", async () => {
    const mt = moiTruong({ runningCount: 1 });
    const kq = await runOneTick(mt);
    expect(mt.openSession).not.toHaveBeenCalled();
    expect(kq.reason).toMatch(/song song|slot/i);
  });

  it("phanh hạn mức chặn (openSession từ chối) → việc quay lại waiting, KHÔNG mất", async () => {
    const mt = moiTruong({
      openSession: vi.fn(async () => ({ ok: false as const, message: "Not opening a new session: 5h quota is at 91%" })),
    });
    const kq = await runOneTick(mt);

    const ghi = mt.ghi.mock.calls[0]?.[0] as Queue;
    expect(ghi.items[0]?.status).toBe("waiting");
    // Lý do phải ở lại trên việc: sáng dậy đọc bản tin là biết vì sao nó chưa chạy.
    expect(ghi.items[0]?.reason).toMatch(/91%/);
    expect(kq.opened).toBeNull();
  });

  it("hết việc chờ → không lỗi, chỉ là không có gì để làm", async () => {
    const mt = moiTruong({ queue: { items: [], paused: false } });
    const kq = await runOneTick(mt);
    expect(kq.opened).toBeNull();
    expect(kq.reason).toMatch(/nothing left waiting/i);
    expect(mt.ghi).not.toHaveBeenCalled();  // không có gì đổi thì đừng ghi đĩa
  });

  it("chỉ mở MỘT việc mỗi nhịp — tick sau mở tiếp, không dồn cả hàng", async () => {
    const mt = moiTruong({
      queue: { items: [VIEC, { ...VIEC, issue: 39 }, { ...VIEC, issue: 7 }], paused: false },
    });
    await runOneTick(mt);
    expect(mt.openSession).toHaveBeenCalledTimes(1);
  });
});

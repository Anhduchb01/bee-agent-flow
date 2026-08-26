import { describe, expect, it, vi } from "vitest";

import type { HangDoi, ViecTrongHang } from "./types";
import { chayMotNhip } from "./queue-run";

const VIEC = {
  slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto" as const,
  model: "default" as const, status: "waiting" as const,
  sessionId: null, reason: null, added_at: "2026-08-24T15:00:00Z",
};
const HANG: HangDoi = { items: [VIEC], paused: false };

/** Cửa: mở phiên thành công, PAUSE tắt, còn slot. Từng test tự bẻ một cái. */
function moiTruong(over: Partial<Parameters<typeof chayMotNhip>[0]> = {}) {
  const moPhien = vi.fn<(v: ViecTrongHang) => Promise<{ ok: true; id: string } | { ok: false; message: string }>>(
    async () => ({ ok: true as const, id: "de300000-0000-4000-8000-000000000009" }),
  );
  const ghi = vi.fn<(q: HangDoi) => Promise<void>>(async () => {});
  return {
    hangDoi: HANG,
    dangPause: false,
    soPhienDangChay: 0,
    ...over,
    moPhien: (over.moPhien ?? moPhien) as typeof moPhien,
    ghi: (over.ghi ?? ghi) as typeof ghi,
  };
}

describe("chayMotNhip — cái vòng chạy lúc người đang ngủ", () => {
  it("có việc chờ + mọi cửa mở → mở phiên và ghi sessionId vào hàng", async () => {
    const mt = moiTruong();
    const kq = await chayMotNhip(mt);

    expect(mt.moPhien).toHaveBeenCalledTimes(1);
    expect(kq.daMo?.issue).toBe(41);
    const ghi = mt.ghi.mock.calls[0]?.[0] as HangDoi;
    expect(ghi.items[0]?.status).toBe("running");
    expect(ghi.items[0]?.sessionId).toBe("de300000-0000-4000-8000-000000000009");
  });

  it("PAUSE bật → không mở gì, và nói ĐÚNG lý do", async () => {
    const mt = moiTruong({ dangPause: true });
    const kq = await chayMotNhip(mt);
    expect(mt.moPhien).not.toHaveBeenCalled();
    expect(kq.lyDo).toMatch(/PAUSE/i);
  });

  it("hàng đợi ⏸ → không mở, lý do khác PAUSE máy", async () => {
    const mt = moiTruong({ hangDoi: { ...HANG, paused: true } });
    const kq = await chayMotNhip(mt);
    expect(mt.moPhien).not.toHaveBeenCalled();
    expect(kq.lyDo).toMatch(/tạm dừng|paused/i);
    expect(kq.lyDo).not.toMatch(/PAUSE/);
  });

  it("đã đủ phiên song song → chờ, không xếp chồng", async () => {
    const mt = moiTruong({ soPhienDangChay: 1 });
    const kq = await chayMotNhip(mt);
    expect(mt.moPhien).not.toHaveBeenCalled();
    expect(kq.lyDo).toMatch(/song song|slot/i);
  });

  it("phanh hạn mức chặn (moPhien từ chối) → việc quay lại waiting, KHÔNG mất", async () => {
    const mt = moiTruong({
      moPhien: vi.fn(async () => ({ ok: false as const, message: "Not opening a new session: 5h quota is at 91%" })),
    });
    const kq = await chayMotNhip(mt);

    const ghi = mt.ghi.mock.calls[0]?.[0] as HangDoi;
    expect(ghi.items[0]?.status).toBe("waiting");
    // Lý do phải ở lại trên việc: sáng dậy đọc bản tin là biết vì sao nó chưa chạy.
    expect(ghi.items[0]?.reason).toMatch(/91%/);
    expect(kq.daMo).toBeNull();
  });

  it("hết việc chờ → không lỗi, chỉ là không có gì để làm", async () => {
    const mt = moiTruong({ hangDoi: { items: [], paused: false } });
    const kq = await chayMotNhip(mt);
    expect(kq.daMo).toBeNull();
    expect(kq.lyDo).toMatch(/nothing left waiting/i);
    expect(mt.ghi).not.toHaveBeenCalled();  // không có gì đổi thì đừng ghi đĩa
  });

  it("chỉ mở MỘT việc mỗi nhịp — tick sau mở tiếp, không dồn cả hàng", async () => {
    const mt = moiTruong({
      hangDoi: { items: [VIEC, { ...VIEC, issue: 39 }, { ...VIEC, issue: 7 }], paused: false },
    });
    await chayMotNhip(mt);
    expect(mt.moPhien).toHaveBeenCalledTimes(1);
  });
});

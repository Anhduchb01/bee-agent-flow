import { describe, expect, it } from "vitest";

import type { BeeArtifact, BeeSession, HangDoi } from "@/lib/bee/types";

import { dungBanTin } from "./tom-tat";

const TU = new Date("2026-08-24T22:00:00Z");
const DEN = new Date("2026-08-25T07:00:00Z");

function phien(over: Partial<BeeSession>): BeeSession {
  return {
    id: "s1", slug: "myapp", num: 1, repo: "you/myapp", title: "Việc đêm",
    phase: "work", worktree: true, status: "done",
    created_at: "2026-08-24T23:00:00Z", started_at: "2026-08-24T23:00:00Z",
    ended_at: "2026-08-24T23:40:00Z", attempt: 0, needs_human: false,
    ...over,
  } as BeeSession;
}

const HANG_RONG: HangDoi = { items: [], paused: false };

describe("dungBanTin — sáng dậy đọc một trang là biết đêm qua ra sao", () => {
  it("chỉ tính phiên trong khoảng đêm, bỏ phiên ban ngày hôm trước", () => {
    const b = dungBanTin({
      phien: [phien({}), phien({ id: "cu", ended_at: "2026-08-20T10:00:00Z" })],
      artifacts: {}, hangDoi: HANG_RONG, tu: TU, den: DEN,
    });
    expect(b.daChay).toHaveLength(1);
  });

  it("xong + có PR → xếp vào 'chờ bạn duyệt', kèm link PR", () => {
    const pr: BeeArtifact = { kind: "pr", url: "https://github.com/you/myapp/pull/12", number: 12, ts: null, title: "CSV export" };
    const b = dungBanTin({
      phien: [phien({})], artifacts: { s1: [pr] }, hangDoi: HANG_RONG, tu: TU, den: DEN,
    });
    expect(b.choDuyet).toHaveLength(1);
    expect(b.choDuyet[0]?.pr?.number).toBe(12);
  });

  it("xong mà KHÔNG có PR là chuyện khác — không được trộn vào 'chờ duyệt'", () => {
    const b = dungBanTin({ phien: [phien({})], artifacts: {}, hangDoi: HANG_RONG, tu: TU, den: DEN });
    expect(b.choDuyet).toHaveLength(0);
    expect(b.daChay).toHaveLength(1);
  });

  it("kẹt: needs_human hoặc failed, và mỗi cái mang MỘT CÂU vì sao", () => {
    const b = dungBanTin({
      phien: [
        phien({ id: "s2", status: "failed", needs_human: true, reason: "vượt trần chi $5 USD" } as Partial<BeeSession>),
        phien({ id: "s3", status: "failed" }),
      ],
      artifacts: {}, hangDoi: HANG_RONG, tu: TU, den: DEN,
    });
    expect(b.ket).toHaveLength(2);
    expect(b.ket[0]?.viSao).toMatch(/trần chi/);
    // Không có reason thì vẫn phải nói được gì đó đọc hiểu, không để trống.
    expect(b.ket[1]?.viSao).not.toBe("");
  });

  it("việc trong hàng chưa chạy được mang theo lý do của phanh", () => {
    const hang: HangDoi = {
      paused: false,
      items: [{
        slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default",
        status: "waiting", sessionId: null,
        reason: "Không mở phiên mới: hạn mức 5h đang 91%", added_at: "t",
      }],
    };
    const b = dungBanTin({ phien: [], artifacts: {}, hangDoi: hang, tu: TU, den: DEN });
    expect(b.conCho[0]?.viSao).toMatch(/91%/);
  });

  it("KHÔNG XẾP VIỆC khác hẳn CÓ XẾP MÀ KHÔNG CHẠY — PRD §4.1", () => {
    const trong = dungBanTin({ phien: [], artifacts: {}, hangDoi: HANG_RONG, tu: TU, den: DEN });
    expect(trong.loai).toBe("khong-xep-viec");

    const coXep = dungBanTin({
      phien: [],
      artifacts: {},
      hangDoi: { paused: false, items: [{ slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default", status: "waiting", sessionId: null, reason: null, added_at: "t" }] },
      tu: TU, den: DEN,
    });
    expect(coXep.loai).toBe("xep-ma-khong-chay");
  });

  it("có chạy → loại 'có việc', và đếm đúng", () => {
    const b = dungBanTin({ phien: [phien({})], artifacts: {}, hangDoi: HANG_RONG, tu: TU, den: DEN });
    expect(b.loai).toBe("co-viec");
  });
});

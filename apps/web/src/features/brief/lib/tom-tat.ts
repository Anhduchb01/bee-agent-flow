import type { BeeArtifact, BeeSession, HangDoi, ViecTrongHang } from "@/lib/bee/types";

/**
 * Bản tin buổi sáng (FR-5.3) — thuần, không I/O.
 *
 * PRD đòi "chạy gì, xong gì, kẹt gì, **vì sao** — câu đọc được, không phải mã
 * lỗi". Nên mỗi việc kẹt bắt buộc mang một câu; không có `reason` thì suy từ
 * trạng thái chứ không để trống.
 *
 * Và §4.1: **rỗng-vì-hết-việc ≠ rỗng-vì-lỗi**. Ba loại đêm khác hẳn nhau —
 * không xếp việc gì · có xếp mà không chạy được · có chạy — nên `loai` là một
 * trường riêng, không bắt màn hình đoán từ mấy mảng rỗng.
 */

export type LoaiDem = "khong-xep-viec" | "xep-ma-khong-chay" | "co-viec";

export interface MucChay {
  phien: BeeSession;
  pr: BeeArtifact | null;
  issue: BeeArtifact | null;
}

export interface MucKet {
  phien: BeeSession;
  viSao: string;
}

export interface MucCho {
  viec: ViecTrongHang;
  viSao: string;
}

export interface BanTin {
  loai: LoaiDem;
  tu: string;
  den: string;
  daChay: MucChay[];
  choDuyet: MucChay[];
  ket: MucKet[];
  conCho: MucCho[];
}

/** Không có `reason` thì trạng thái vẫn phải dịch ra được tiếng người. */
function viSaoKet(p: BeeSession): string {
  const reason = (p as unknown as Record<string, unknown>).reason;
  if (typeof reason === "string" && reason !== "") return reason;
  if (p.needs_human) return "needs a human — the session failed twice in a row";
  if (p.status === "failed") return "the session ended with an error — open it to read the event stream";
  if (p.status === "stopped") return "stopped part-way";
  return "no reason recorded — open the session and read its event stream";
}

function trongKhoang(p: BeeSession, tu: Date, den: Date): boolean {
  const moc = p.ended_at ?? p.started_at ?? p.created_at;
  if (moc === null) return false;
  const t = new Date(moc).getTime();
  return Number.isFinite(t) && t >= tu.getTime() && t <= den.getTime();
}

export function dungBanTin(input: {
  phien: BeeSession[];
  artifacts: Record<string, BeeArtifact[]>;
  hangDoi: HangDoi;
  tu: Date;
  den: Date;
}): BanTin {
  const trong = input.phien.filter((p) => trongKhoang(p, input.tu, input.den));

  const daChay: MucChay[] = trong.map((p) => {
    const cua = input.artifacts[p.id] ?? [];
    return {
      phien: p,
      pr: cua.find((a) => a.kind === "pr") ?? null,
      issue: cua.find((a) => a.kind === "issue") ?? null,
    };
  });

  // "Chờ duyệt" là phiên xong VÀ có PR. Xong-mà-không-PR là chuyện khác hẳn —
  // trộn hai thứ lại là hứa với người dùng một cái PR không tồn tại.
  const choDuyet = daChay.filter((m) => m.phien.status === "done" && m.pr !== null);

  const ket: MucKet[] = trong
    .filter((p) => p.needs_human || p.status === "failed" || p.status === "stopped")
    .map((p) => ({ phien: p, viSao: viSaoKet(p) }));

  const conCho: MucCho[] = input.hangDoi.items
    .filter((v) => v.status === "waiting")
    .map((v) => ({
      viec: v,
      viSao: v.reason ?? "not its turn yet",
    }));

  const loai: LoaiDem =
    trong.length > 0
      ? "co-viec"
      : input.hangDoi.items.length > 0
        ? "xep-ma-khong-chay"
        : "khong-xep-viec";

  return {
    loai,
    tu: input.tu.toISOString(),
    den: input.den.toISOString(),
    daChay,
    choDuyet,
    ket,
    conCho,
  };
}

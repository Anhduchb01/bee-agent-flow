import type { BeeClaudeAccountUsage, BeeClaudeWindow } from "./types";

/**
 * Phanh hạn mức (FR-3.3) — thuần, không I/O, để luật kiểm được bằng bảng.
 *
 * Đây là hạn mức của **cả tài khoản** (5 giờ + 7 ngày), khác hẳn cửa sổ ngữ
 * cảnh của một phiên (cái đó CLI tự nén). Phanh chỉ chặn **mở phiên MỚI**:
 * phiên đang chạy không bị giết giữa chừng, và `Continue` một phiên cũ không
 * bị chặn — PRD viết "dưới ngưỡng → không mở phiên mới", đúng nghĩa đen.
 *
 * Số cũ thì FAIL-OPEN: tick chết mà làm cả máy không dùng được nữa là đổi một
 * phiền toái nhỏ lấy một phiền toái lớn. Chỗ bắt tick chết là doctor. Nhưng số
 * cũ mà ĐÃ vượt ngưỡng thì vẫn phanh — cũ-và-quá-ngưỡng tệ hơn tươi-và-quá.
 */

export interface KetQuaPhanh {
  moDuoc: boolean;
  /** Câu nói cho người: cửa sổ nào, bao nhiêu %, chờ tới bao giờ. */
  lyDo: string;
}

const CU_SAU_GIO = 3;

function phanTram(w: BeeClaudeWindow | null): number {
  return w === null ? 0 : w.percent;
}

/** "2026-08-24T16:20:00Z" + bây giờ → "reset lúc 16:20 (còn 1h20)". */
function moTaReset(w: BeeClaudeWindow | null, luc: Date): string {
  if (w?.resets_at == null) return "";
  const t = new Date(w.resets_at);
  if (Number.isNaN(t.getTime())) return "";
  const phut = Math.max(0, Math.round((t.getTime() - luc.getTime()) / 60_000));
  const gio = Math.floor(phut / 60);
  const con = gio > 0 ? `${gio}h${String(phut % 60).padStart(2, "0")}` : `${phut} min`;
  return `, resets at ${t.toISOString().slice(11, 16)} (in ${con})`;
}

export function xetHanMuc(
  usage: BeeClaudeAccountUsage | null,
  opts: { nguong: number; luc?: Date },
): KetQuaPhanh {
  const luc = opts.luc ?? new Date();
  // Ngưỡng 0 = tắt phanh. Cửa thoát phải tường minh, không phải tác dụng phụ.
  if (opts.nguong <= 0) return { moDuoc: true, lyDo: "the brake is off (threshold 0)" };
  if (usage === null) {
    return { moDuoc: true, lyDo: "quota has never been measured — opening, but flying blind" };
  }

  const nam = phanTram(usage.five_hour);
  const bay = phanTram(usage.seven_day);
  const qua =
    nam > opts.nguong
      ? { ten: "5h", pct: nam, w: usage.five_hour }
      : bay > opts.nguong
        ? { ten: "7-day", pct: bay, w: usage.seven_day }
        : null;

  const tuoiGio = (luc.getTime() - new Date(usage.fetched_at).getTime()) / 3_600_000;
  const cu = Number.isFinite(tuoiGio) && tuoiGio > CU_SAU_GIO;

  if (qua !== null) {
    return {
      moDuoc: false,
      lyDo: `${qua.ten} quota is at ${qua.pct}% (threshold ${opts.nguong}%)${moTaReset(qua.w, luc)}`,
    };
  }
  if (cu) {
    return {
      moDuoc: true,
      lyDo: `quota numbers are ${Math.round(tuoiGio)}h old — is tick running? Opening, but the brake cannot be trusted`,
    };
  }
  return { moDuoc: true, lyDo: `quota 5h ${nam}% · 7-day ${bay}%` };
}

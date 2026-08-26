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

export interface BrakeResult {
  moDuoc: boolean;
  /** Câu nói cho người: cửa sổ nào, bao nhiêu %, chờ tới bao giờ. */
  reason: string;
}

const CU_SAU_GIO = 3;

function percentOf(w: BeeClaudeWindow | null): number {
  return w === null ? 0 : w.percent;
}

/** "2026-08-24T16:20:00Z" + bây giờ → "reset lúc 16:20 (còn 1h20)". */
function describeReset(w: BeeClaudeWindow | null, at: Date): string {
  if (w?.resets_at == null) return "";
  const t = new Date(w.resets_at);
  if (Number.isNaN(t.getTime())) return "";
  const minutes = Math.max(0, Math.round((t.getTime() - at.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remaining = hours > 0 ? `${hours}h${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
  return `, resets at ${t.toISOString().slice(11, 16)} (in ${remaining})`;
}

export function checkQuota(
  usage: BeeClaudeAccountUsage | null,
  opts: { nguong: number; at?: Date },
): BrakeResult {
  const at = opts.at ?? new Date();
  // Ngưỡng 0 = tắt phanh. Cửa thoát phải tường minh, không phải tác dụng phụ.
  if (opts.nguong <= 0) return { moDuoc: true, reason: "the brake is off (threshold 0)" };
  if (usage === null) {
    return { moDuoc: true, reason: "quota has never been measured — opening, but flying blind" };
  }

  const five = percentOf(usage.five_hour);
  const bay = percentOf(usage.seven_day);
  const past =
    five > opts.nguong
      ? { name: "5h", pct: five, w: usage.five_hour }
      : bay > opts.nguong
        ? { name: "7-day", pct: bay, w: usage.seven_day }
        : null;

  const tuoiGio = (at.getTime() - new Date(usage.fetched_at).getTime()) / 3_600_000;
  const cu = Number.isFinite(tuoiGio) && tuoiGio > CU_SAU_GIO;

  if (past !== null) {
    return {
      moDuoc: false,
      reason: `${past.name} quota is at ${past.pct}% (threshold ${opts.nguong}%)${describeReset(past.w, at)}`,
    };
  }
  if (cu) {
    return {
      moDuoc: true,
      reason: `quota numbers are ${Math.round(tuoiGio)}h old — is tick running? Opening, but the brake cannot be trusted`,
    };
  }
  return { moDuoc: true, reason: `quota 5h ${five}% · 7-day ${bay}%` };
}

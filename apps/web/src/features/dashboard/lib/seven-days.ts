import type { BeeRecentRun } from "@/lib/bee/types";

export interface NgayChay {
  /** `YYYY-MM-DD` theo giờ địa phương. */
  ngay: string;
  /** Nhãn ngắn trên trục: T2…CN, hoặc "Hôm nay". */
  nhan: string;
  xong: number;
  loi: number;
  tong: number;
}

const THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function khoaNgay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Bảy ngày gần nhất, mỗi ngày đếm số lần chạy xong và thất bại.
 *
 * **Luôn trả đủ bảy ngày**, kể cả ngày không có lần chạy nào. Bỏ ngày rỗng đi
 * thì cuối tuần biến mất khỏi biểu đồ và trục thời gian co lại — người đọc sẽ
 * thấy một đường liền mạch ở chỗ thực ra máy đã nằm im hai hôm.
 *
 * `result` do từng rule tự đặt và không phải tập đóng, nên mọi giá trị khác
 * `ok` đều tính là lỗi. Đoán theo danh sách trắng thì một `result` mới xuất
 * hiện sẽ lặng lẽ rơi vào ô "xong".
 */
export function bayNgayQua(runs: BeeRecentRun[], now: Date = new Date()): NgayChay[] {
  const dem = new Map<string, { xong: number; loi: number }>();

  for (const r of runs) {
    const t = Date.parse(r.at);
    if (Number.isNaN(t)) continue;
    const key = khoaNgay(new Date(t));
    const o = dem.get(key) ?? { xong: 0, loi: 0 };
    if (r.result === "ok") o.xong += 1;
    else o.loi += 1;
    dem.set(key, o);
  }

  const out: NgayChay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = khoaNgay(d);
    const o = dem.get(key) ?? { xong: 0, loi: 0 };
    out.push({
      ngay: key,
      nhan: i === 0 ? "Hôm nay" : THU[d.getDay()],
      xong: o.xong,
      loi: o.loi,
      tong: o.xong + o.loi,
    });
  }
  return out;
}

/** Câu tóm tắt dưới biểu đồ. `null` khi bảy ngày không có lần chạy nào. */
export function tomTatBayNgay(days: NgayChay[]): string | null {
  const homNay = days.at(-1);
  const truoc = days.slice(0, -1);
  const tongTruoc = truoc.reduce((n, d) => n + d.tong, 0);
  const loiTruoc = truoc.reduce((n, d) => n + d.loi, 0);

  if (!homNay || (homNay.tong === 0 && tongTruoc === 0)) return null;
  if (homNay.tong === 0) return "Hôm nay chưa có lần chạy nào.";

  const tiLeHomNay = homNay.loi / homNay.tong;
  const tiLeTruoc = tongTruoc === 0 ? 0 : loiTruoc / tongTruoc;

  if (homNay.loi > 0 && tiLeHomNay > tiLeTruoc * 2) {
    return `Hôm nay ${homNay.loi}/${homNay.tong} lần chạy thất bại — cao hơn hẳn sáu ngày trước.`;
  }
  return `Hôm nay ${homNay.xong}/${homNay.tong} lần chạy xong.`;
}

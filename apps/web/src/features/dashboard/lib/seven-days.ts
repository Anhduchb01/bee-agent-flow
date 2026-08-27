import type { BeeRecentRun } from "@/lib/bee/types";

export interface RunDay {
  /** `YYYY-MM-DD` theo giờ địa phương. */
  ngay: string;
  /** Nhãn ngắn trên trục: Mon…Sun, hoặc "Today". */
  label: string;
  finished: number;
  err: number;
  tong: number;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d: Date): string {
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
export function lastSevenDays(runs: BeeRecentRun[], now: Date = new Date()): RunDay[] {
  const counter = new Map<string, { finished: number; err: number }>();

  for (const r of runs) {
    const t = Date.parse(r.at);
    if (Number.isNaN(t)) continue;
    const key = dayKey(new Date(t));
    const o = counter.get(key) ?? { finished: 0, err: 0 };
    if (r.result === "ok") o.finished += 1;
    else o.err += 1;
    counter.set(key, o);
  }

  const out: RunDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    const o = counter.get(key) ?? { finished: 0, err: 0 };
    out.push({
      ngay: key,
      label: i === 0 ? "Today" : WEEKDAY[d.getDay()],
      finished: o.finished,
      err: o.err,
      tong: o.finished + o.err,
    });
  }
  return out;
}

/** Câu tóm tắt dưới biểu đồ. `null` khi bảy ngày không có lần chạy nào. */
export function tomTatBayNgay(days: RunDay[]): string | null {
  const todayRow = days.at(-1);
  const prev = days.slice(0, -1);
  const prevTotal = prev.reduce((n, d) => n + d.tong, 0);
  const prevError = prev.reduce((n, d) => n + d.err, 0);

  if (!todayRow || (todayRow.tong === 0 && prevTotal === 0)) return null;
  if (todayRow.tong === 0) return "No runs today yet.";

  const rateToday = todayRow.err / todayRow.tong;
  const ratePrev = prevTotal === 0 ? 0 : prevError / prevTotal;

  if (todayRow.err > 0 && rateToday > ratePrev * 2) {
    return `${todayRow.err} of ${todayRow.tong} runs failed today — sharply higher than the six days before.`;
  }
  return `${todayRow.finished} of ${todayRow.tong} runs finished today.`;
}

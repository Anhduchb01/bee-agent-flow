/**
 * "Reconciler có thể đã chết" là thông tin quan trọng nhất app này nói được, và
 * là chế độ hỏng duy nhất không có gì đỏ để nhìn — chỉ là không có gì xảy ra.
 *
 * Ngưỡng 10 phút giống dashboard tĩnh (`public/index.html`, STALE_S = 600) và
 * bằng 20 lần chu kỳ tick 30 giây, đủ rộng để một tick chậm không báo động giả.
 */
export const STALE_AFTER_S = 600;

export function heartbeatAge(heartbeat: string, now: Date = new Date()): number | null {
  const t = Date.parse(heartbeat);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now.getTime() - t) / 1000));
}

/** Heartbeat không đọc được cũng tính là cũ — không đoán tốt cho hệ thống. */
export function isHeartbeatStale(heartbeat: string, now: Date = new Date()): boolean {
  const age = heartbeatAge(heartbeat, now);
  return age === null || age > STALE_AFTER_S;
}

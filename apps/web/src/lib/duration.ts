/**
 * Khoảng thời gian, viết cho người đọc.
 *
 * Cùng cách rút gọn với `human_dur()` của reconciler và `dur()` của dashboard
 * tĩnh, để cùng một con số không hiện ra hai kiểu ở hai chỗ.
 */
export function khoangThoiGian(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h < 24) return `${h}h${String(m).padStart(2, "0")}m`;

  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Dạng "waited 3h20m" — cụm dùng nhiều nhất trong hộp thư. */
export function daCho(seconds: number): string {
  return `waited ${khoangThoiGian(seconds)}`;
}

import type { HangDoi, ViecTrongHang } from "./types";

/**
 * Việc kế tiếp để mở phiên — `null` nghĩa là "đừng mở gì lúc này", và có ba
 * lý do khác nhau dẫn tới nó: đang ⏸, đã đủ số phiên song song, hoặc hết việc
 * chờ. Người gọi (tick) phân biệt bằng cách nhìn `q` chứ hàm này không đoán hộ.
 */
export function viecKeTiep(
  q: HangDoi,
  opts: { songSongToiDa?: number } = {},
): ViecTrongHang | null {
  if (q.paused) return null;
  const toiDa = opts.songSongToiDa ?? 1;
  const dangChay = q.items.filter((i) => i.status === "running").length;
  if (dangChay >= toiDa) return null;
  return q.items.find((i) => i.status === "waiting") ?? null;
}

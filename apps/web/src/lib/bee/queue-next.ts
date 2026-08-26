import type { Queue, QueueItem } from "./types";

/**
 * Việc kế tiếp để mở phiên — `null` nghĩa là "đừng mở gì lúc này", và có ba
 * lý do khác nhau dẫn tới nó: đang ⏸, đã đủ số phiên song song, hoặc hết việc
 * chờ. Người gọi (tick) phân biệt bằng cách nhìn `q` chứ hàm này không đoán hộ.
 */
export function nextQueueItem(
  q: Queue,
  opts: { maxParallel?: number } = {},
): QueueItem | null {
  if (q.paused) return null;
  const maxCount = opts.maxParallel ?? 1;
  const running = q.items.filter((i) => i.status === "running").length;
  if (running >= maxCount) return null;
  return q.items.find((i) => i.status === "waiting") ?? null;
}

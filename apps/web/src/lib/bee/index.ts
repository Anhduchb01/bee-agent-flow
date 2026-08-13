import "server-only";

import { createDiskBeeSource } from "./disk";
import { createFixtureBeeSource } from "./fixture";
import type { BeeSource } from "./types";

export * from "./types";
export { heartbeatAge, isHeartbeatStale, STALE_AFTER_S } from "./heartbeat";

/**
 * Cửa duy nhất ra `/srv/bee/`.
 *
 * `BEE_SOURCE` là *chỉ* chỗ chọn giữa fixture và đĩa thật. Nếu một `if` nào đó
 * về fixture xuất hiện ngoài thư mục này thì đường ranh đã hỏng, và việc nối
 * vào dữ liệu thật sẽ thành viết lại thay vì đổi một biến môi trường.
 */
let cached: BeeSource | null = null;

export function getBee(): BeeSource {
  if (cached) return cached;
  cached = process.env.BEE_SOURCE === "disk" ? createDiskBeeSource() : createFixtureBeeSource();
  return cached;
}

/** Chỉ dành cho test — để mỗi bài test tự chọn chế độ mà không dính lẫn nhau. */
export function resetBeeSource(): void {
  cached = null;
}

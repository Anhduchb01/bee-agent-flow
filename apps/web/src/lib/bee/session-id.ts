/**
 * Kiểm id phiên — thuần, không I/O, để cả server action lẫn route SSE dùng
 * chung MỘT định nghĩa. Id đi vào tên unit systemd, đường dẫn thư mục và tên
 * FIFO, nên allowlist regex đứng trước mọi thứ khác (spec session-first §9).
 */
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function isSessionId(id: string): boolean {
  return UUID_RE.test(id);
}

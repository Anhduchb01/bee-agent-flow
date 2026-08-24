import path from "node:path";

/**
 * Ghép các đoạn URL thành một đường dẫn tuyệt đối, hoặc `null` nếu nó không nằm
 * chắc chắn trong gốc bằng chứng.
 *
 * Đây là lỗ hổng chứ không phải tính năng: app chạy dưới user `bee-web` thuộc
 * group `bee`, nên một đường `../../` thoát ra ngoài đọc được mọi `claim.json`
 * dưới `state/` và cả `/etc/bee/orch.env`. Vì vậy hàm này dùng danh sách cho phép chứ không
 * dùng danh sách cấm — thứ không khớp `[A-Za-z0-9._-]` thì bị từ chối, kể cả khi
 * hôm nay nó vô hại. `%2e%2e` bị chặn ở đây luôn, phòng trường hợp một lớp nào
 * đó phía trên quên giải mã.
 *
 * So tiền tố sau `path.resolve` là chốt chặn thứ hai. Một trong hai chốt đủ để
 * chặn, nhưng chốt nào cũng có thể bị sửa hỏng khi refactor.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function resolveEvidencePath(root: string, segments: string[]): string | null {
  if (segments.length === 0) return null;

  for (const seg of segments) {
    if (!SAFE_SEGMENT.test(seg)) return null;
    if (seg === "." || seg === "..") return null;
  }

  const rootAbs = path.resolve(root);
  const full = path.resolve(rootAbs, ...segments);

  if (full === rootAbs) return null;
  if (!full.startsWith(rootAbs + path.sep)) return null;

  return full;
}

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export function contentTypeFor(name: string): string {
  return CONTENT_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}


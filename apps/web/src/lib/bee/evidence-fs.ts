import "server-only";

import fs from "node:fs/promises";

import { contentTypeFor, resolveEvidencePath } from "./evidence-path";

/**
 * Đọc bằng chứng từ một thư mục gốc. Fixture và đĩa thật dùng **chung** hàm này,
 * chỉ khác `root`.
 *
 * Đây là chỗ duy nhất được phép mở file bằng chứng, và vì cả hai chế độ đi qua
 * đúng một đường nên bài test chặn path traversal chạy trên fixture cũng là bài
 * test cho đường chạy thật — không phải một bản mô phỏng gần giống.
 */
export async function readEvidenceFileIn(
  root: string,
  segments: string[],
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const abs = resolveEvidencePath(root, segments);
  if (!abs) return null;

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return null;
    const bytes = await fs.readFile(abs);
    return { bytes, contentType: contentTypeFor(abs) };
  } catch {
    return null;
  }
}

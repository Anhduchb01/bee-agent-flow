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
): Promise<{ bytes: Uint8Array; contentType: string; etag: string } | null> {
  const abs = resolveEvidencePath(root, segments);
  if (!abs) return null;

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return null;
    const bytes = await fs.readFile(abs);
    // Identity from size + mtime, not from a hash of the bytes: a demo video
    // is tens of megabytes and this runs on every frame the browser asks for.
    //
    // It exists because session evidence is NOT immutable. The `<sha>/` layout
    // is — it is keyed by a commit — and the route once cached everything for
    // an hour on the strength of that. Re-recording a demo overwrites
    // `sessions/<id>/evidence/<name>`, and the owner kept being shown the
    // first take with nothing to say why (27/08).
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    return { bytes, contentType: contentTypeFor(abs), etag };
  } catch {
    return null;
  }
}

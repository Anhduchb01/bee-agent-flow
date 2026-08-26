import "server-only";

import fs from "node:fs/promises";

export interface KhucMoi {
  line: string[];
  offset: number;
  /** Khúc đuôi CHƯA có `\n` — giữ lại, ghép với lần đọc sau. */
  rest: string;
}

/**
 * Đọc phần mới của một file JSONL kể từ `offset` byte.
 *
 * Một dòng JSON có thể bị cắt làm đôi giữa hai lần đọc — phát nửa dòng đó ra
 * SSE thì client `JSON.parse` hỏng và mất luôn sự kiện. `rest` là khúc đuôi
 * chưa có `\n`: giữ lại, ghép với lần đọc sau. Đây là một trong bốn tình
 * huống hỏng-im-lặng bắt buộc có test (spec session-first §8).
 *
 * File biến mất giữa chừng (phiên bị dọn) trả về như "chưa có gì mới" —
 * người gọi quyết định đóng stream dựa trên meta.json, không phải dựa trên
 * ENOENT tình cờ.
 */
export async function readMore(file: string, offset: number, rest: string): Promise<KhucMoi> {
  let fh: fs.FileHandle;
  try {
    fh = await fs.open(file, "r");
  } catch {
    return { line: [], offset, rest };
  }
  try {
    const { size } = await fh.stat();
    if (size <= offset) return { line: [], offset, rest };

    const buf = Buffer.allocUnsafe(size - offset);
    await fh.read(buf, 0, buf.length, offset);

    const part = (rest + buf.toString("utf8")).split("\n");
    return {
      line: part.slice(0, -1).filter((d) => d.trim() !== ""),
      offset: size,
      rest: part.at(-1) ?? "",
    };
  } finally {
    await fh.close();
  }
}

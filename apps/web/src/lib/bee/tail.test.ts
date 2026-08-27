import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readMore } from "./tail";

function fileTam(content: string): string {
  const d = mkdtempSync(path.join(os.tmpdir(), "bee-tail-"));
  const f = path.join(d, "run.jsonl");
  writeFileSync(f, content);
  return f;
}

describe("readMore", () => {
  it("dòng JSON bị cắt đôi giữa hai lần đọc không bao giờ bị phát nửa dòng", async () => {
    // Lần ghi 1 dừng GIỮA một dòng — đúng điều xảy ra khi tail đuổi kịp writer.
    const f = fileTam('{"type":"a"}\n{"type":"b","x":');

    const first = await readMore(f, 0, "");
    expect(first.line).toEqual(['{"type":"a"}']);
    expect(first.rest).toBe('{"type":"b","x":');

    appendFileSync(f, '1}\n');
    const second = await readMore(f, first.offset, first.rest);
    expect(second.line).toEqual(['{"type":"b","x":1}']);
    expect(second.rest).toBe("");
  });

  it("không có gì mới thì trả offset và rest nguyên vẹn", async () => {
    const f = fileTam('{"type":"a"}\n');
    const first = await readMore(f, 0, "");
    const second = await readMore(f, first.offset, first.rest);
    expect(second).toEqual({ line: [], offset: first.offset, rest: "" });
  });

  it("file không tồn tại là 'chưa có gì mới', không phải lỗi", async () => {
    const outcome = await readMore("/khong/ton/tai/run.jsonl", 5, "dở");
    expect(outcome).toEqual({ line: [], offset: 5, rest: "dở" });
  });
});

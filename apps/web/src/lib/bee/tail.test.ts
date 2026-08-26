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

    const lan1 = await readMore(f, 0, "");
    expect(lan1.line).toEqual(['{"type":"a"}']);
    expect(lan1.rest).toBe('{"type":"b","x":');

    appendFileSync(f, '1}\n');
    const lan2 = await readMore(f, lan1.offset, lan1.rest);
    expect(lan2.line).toEqual(['{"type":"b","x":1}']);
    expect(lan2.rest).toBe("");
  });

  it("không có gì mới thì trả offset và rest nguyên vẹn", async () => {
    const f = fileTam('{"type":"a"}\n');
    const lan1 = await readMore(f, 0, "");
    const lan2 = await readMore(f, lan1.offset, lan1.rest);
    expect(lan2).toEqual({ line: [], offset: lan1.offset, rest: "" });
  });

  it("file không tồn tại là 'chưa có gì mới', không phải lỗi", async () => {
    const ket = await readMore("/khong/ton/tai/run.jsonl", 5, "dở");
    expect(ket).toEqual({ line: [], offset: 5, rest: "dở" });
  });
});

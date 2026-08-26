import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readQueue, writeQueue } from "./queue-fs";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-queue-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("queue.json — máy tắt không được mất hàng đợi (FR-5.1)", () => {
  it("chưa có file → hàng rỗng, không phải lỗi", async () => {
    expect(await readQueue(dir)).toEqual({ items: [], paused: false });
  });

  it("ghi rồi đọc lại y nguyên", async () => {
    const q = {
      paused: true,
      items: [
        {
          slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto" as const,
          model: "default" as const, status: "waiting" as const,
          sessionId: null, reason: null, added_at: "2026-08-24T15:00:00Z",
        },
      ],
    };
    await writeQueue(dir, q);
    expect(await readQueue(dir)).toEqual(q);
  });

  it("ghi nguyên tử: không để lại file tmp, và không ai đọc trúng nửa file", async () => {
    await writeQueue(dir, { items: [], paused: false });
    const files = await fs.readdir(dir);
    expect(files).toEqual(["queue.json"]);
  });

  it("json hỏng (ghi dở lúc mất điện) → hàng rỗng thay vì ném vào server component", async () => {
    await fs.writeFile(path.join(dir, "queue.json"), '{"items":[{"slug"');
    expect(await readQueue(dir)).toEqual({ items: [], paused: false });
  });

  it("mục sai hình dạng bị loại, mục đúng giữ lại", async () => {
    await fs.writeFile(
      path.join(dir, "queue.json"),
      JSON.stringify({
        paused: false,
        items: [
          { slug: "myapp", repo: "you/myapp", issue: 41, mode: "auto", model: "default", status: "waiting", sessionId: null, reason: null, added_at: "t" },
          { slug: "x", issue: "không phải số" },
          null,
          { repo: "you/x", issue: 9 },
        ],
      }),
    );
    const q = await readQueue(dir);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]?.issue).toBe(41);
  });

  it("status lạ về waiting — dữ liệu ngoài luồng không được lái vòng lặp tick", async () => {
    await fs.writeFile(
      path.join(dir, "queue.json"),
      JSON.stringify({
        items: [{ slug: "a", repo: "you/a", issue: 1, mode: "auto", model: "default", status: "HACK", sessionId: null, reason: null, added_at: "t" }],
      }),
    );
    expect((await readQueue(dir)).items[0]?.status).toBe("waiting");
  });
});

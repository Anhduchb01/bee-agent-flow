import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chayNhipHangDoi } from "./tick";

/**
 * Nhịp Autopilot khi nối vào đĩa thật.
 *
 * Luật thuần đã có test riêng (`queue-run.test.ts`). Bài này giữ đúng một
 * điều: **timer và nút "Run now" dùng CHUNG một bản** — nên bất kỳ cửa nào
 * (PAUSE, ⏸, phanh, lỗi mở phiên) cũng phải chặn y hệt nhau, dù ai gọi.
 */

let dir = "";

async function xepViec(items: unknown[], paused = false) {
  await fs.writeFile(path.join(dir, "queue.json"), JSON.stringify({ paused, items }));
}

const VIEC = {
  slug: "myapp",
  repo: "you/myapp",
  issue: 41,
  status: "waiting",
  added_at: "2026-08-26T00:00:00Z",
  reason: null,
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-tick-"));
  process.env.BEE_SRV = dir;
  process.env.BEE_SOURCE = "disk";
});
afterEach(async () => {
  delete process.env.BEE_SRV;
  delete process.env.BEE_SOURCE;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("chayNhipHangDoi — một bản duy nhất cho timer VÀ nút Run now", () => {
  it("hàng rỗng: nói ra, không đụng gì thêm", async () => {
    expect(await chayNhipHangDoi()).toEqual({ daMo: null, lyDo: "the queue is empty" });
  });

  it("PAUSE của máy chặn cả nút bấm tay — nút rút ngắn CHỜ, không mở thêm cửa", async () => {
    await xepViec([VIEC]);
    await fs.writeFile(path.join(dir, "PAUSE"), "");
    const kq = await chayNhipHangDoi();
    expect(kq.daMo).toBeNull();
    expect(kq.lyDo).toMatch(/PAUSE is on/);
  });

  it("⏸ của riêng hàng đợi cũng chặn, và nói ra là ⏸ chứ không phải PAUSE", async () => {
    await xepViec([VIEC], true);
    const kq = await chayNhipHangDoi();
    expect(kq.daMo).toBeNull();
    expect(kq.lyDo).toMatch(/queue is paused/);
  });

  it("mở phiên hỏng → việc về lại waiting KÈM lý do, không mất và không kẹt running", async () => {
    // Cửa lệnh ngoài đang đóng (BEE_CTL=none, vitest.setup.ts) nên moPhien
    // hỏng ở bước systemctl — đúng hình dạng của một máy đang trục trặc.
    await xepViec([VIEC]);
    const kq = await chayNhipHangDoi();
    expect(kq.daMo).toBeNull();

    const q = JSON.parse(await fs.readFile(path.join(dir, "queue.json"), "utf8"));
    expect(q.items).toHaveLength(1);
    expect(q.items[0].status).toBe("waiting");
    expect(q.items[0].reason).toMatch(/BEE_CTL=none/);
  });
});

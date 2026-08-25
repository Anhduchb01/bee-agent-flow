import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moPhien, tiepTucPhien } from "./session-ctl";

let dir = "";

async function datHanMuc(fiveHour: number, fetchedAt = new Date().toISOString()) {
  await fs.mkdir(path.join(dir, "state"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "state", "claude-usage.json"),
    JSON.stringify({
      five_hour: { percent: fiveHour, resets_at: "2026-08-24T16:20:00Z" },
      seven_day: { percent: 10, resets_at: null },
      fetched_at: fetchedAt,
    }),
  );
}

describe("moPhien — the brake sits at the door every new session goes through", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-brake-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
    delete process.env.QUOTA_BRAKE_PCT;
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    delete process.env.QUOTA_BRAKE_PCT;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("over the threshold: refuses BEFORE writing anything to disk", async () => {
    await datHanMuc(93);
    const ket = await moPhien({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });

    expect(ket.ok).toBe(false);
    if (ket.ok) return;
    expect(ket.message).toMatch(/93%/);
    // Không được để lại phiên nửa vời: đã từ chối thì đĩa phải sạch.
    await expect(fs.readdir(path.join(dir, "sessions"))).rejects.toThrow();
  });

  it("under the threshold: the brake does not get in the way", async () => {
    await datHanMuc(20);
    const ket = await moPhien({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });
    // Cửa lệnh ngoài đóng (BEE_CTL=none) → lỗi ở bước start, KHÔNG phải lỗi
    // phanh, và session.json đã được ghi trước lệnh đó.
    //
    // Chú thích cũ ở đây viết "systemctl không có trong sandbox" — sai, và
    // sai đúng chỗ đắt: trên chính máy bee, `bee-session@.service` là unit
    // static nên start CHẠY THẬT. Ba unit chết trong journal ngày 25/08 mang
    // đúng cái uuid dưới kia. Xem lib/bee/ctl.ts.
    if (!ket.ok) expect(ket.message).not.toMatch(/hạn mức/);
    expect((await fs.readdir(path.join(dir, "sessions"))).length).toBe(1);
  });

  it("QUOTA_BRAKE_PCT tunes the line", async () => {
    await datHanMuc(50);
    process.env.QUOTA_BRAKE_PCT = "40";
    const ket = await moPhien({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });
    expect(ket.ok).toBe(false);
    if (!ket.ok) expect(ket.message).toMatch(/50%/);
  });

  it("Continue on an existing session is NOT braked — it resumes, it does not open", async () => {
    await datHanMuc(99);
    const id = "cc000000-0000-4000-8000-000000000001";
    await fs.mkdir(path.join(dir, "sessions", id), { recursive: true });
    await fs.writeFile(path.join(dir, "sessions", id, "session.json"), JSON.stringify({ id }));

    const ket = await tiepTucPhien(id);
    // Nó đi tới tận bước start rồi mới dừng ở CỬA LỆNH NGOÀI — nghĩa là phanh
    // không chen vào, đúng điều bài này hỏi.
    //
    // Cái uuid ngay trên chính là uuid đã lọt ra journal của máy bee 25/08.
    // Nếu ai đó mở lại cửa, dòng dưới đỏ TRƯỚC khi nó kịp start unit thật.
    expect(ket.ok).toBe(false);
    if (ket.ok) return;
    expect(ket.message).toMatch(/BEE_CTL=none/);
    expect(ket.message).not.toMatch(/hạn mức/);
  });

  it("no usage file at all → opens (flying blind beats being unusable)", async () => {
    const ket = await moPhien({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });
    if (!ket.ok) expect(ket.message).not.toMatch(/hạn mức/);
  });
});

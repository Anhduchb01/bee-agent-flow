import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ctl, ctlEnabled, ctlSpawn } from "./ctl";
import { dungPhien, moPhien, tiepTucPhien } from "./session-ctl";
import { runDoctor, runGc } from "./machine-ctl";

/**
 * Cửa duy nhất cho lệnh ngoài (T18).
 *
 * Bài này không kiểm một tính năng — nó kiểm một GIỚI HẠN: `pnpm test` không
 * bao giờ được với tới cái máy đang chạy. Bằng chứng vì sao cần: journal của
 * bee 25/08 có ba `bee-session@cc000000-…0001.service` failed, uuid lấy
 * thẳng từ fixture. Trước đây chỗ chặn duy nhất là hy vọng `systemctl` vắng
 * mặt trong PATH — mà trên chính máy bee thì nó có mặt, và
 * `bee-session@.service` là unit static nên `start` chạy thật.
 */

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-ctl-"));
  process.env.BEE_SRV = dir;
  process.env.BEE_SOURCE = "disk";
});
afterEach(async () => {
  delete process.env.BEE_SRV;
  delete process.env.BEE_SOURCE;
  process.env.BEE_CTL = "none";
  await fs.rm(dir, { recursive: true, force: true });
});

describe("ctl — cửa lệnh ngoài", () => {
  it("mặc định của CẢ bộ test là đóng", () => {
    // Không bài nào phải tự nhớ đóng cửa. vitest.setup.ts đóng sẵn; muốn chạy
    // lệnh thật thì phải mở tay, và chỗ mở đó đọc được trong diff.
    expect(process.env.BEE_CTL).toBe("none");
    expect(ctlEnabled()).toBe(false);
  });

  it("từ chối bằng LỖI, và lỗi nói ra lệnh nào bị chặn", async () => {
    await expect(ctl("systemctl", ["--user", "start", "bee-session@x.service"])).rejects.toThrow(
      /BEE_CTL=none.*systemctl --user start bee-session@x\.service/,
    );
    // spawn ném ngay chứ không trả về một child chết: caller nào nối stdin
    // vào cái xác đó sẽ TREO thay vì hỏng — im lặng là chế độ hỏng tệ nhất.
    expect(() => ctlSpawn("script", ["-qec", "claude", "/dev/null"])).toThrow(/BEE_CTL=none/);
  });

  it("mọi đường mở/nối/dừng phiên đều dừng ở cửa, không đường nào đi vòng", async () => {
    const kqMo = await moPhien({
      slug: "myapp",
      num: 1,
      repo: "you/myapp",
      title: null,
      worktree: false,
    });
    expect(kqMo.ok).toBe(false);
    if (!kqMo.ok) expect(kqMo.message).toMatch(/BEE_CTL=none/);

    const id = "cc000000-0000-4000-8000-000000000001";
    await fs.mkdir(path.join(dir, "sessions", id), { recursive: true });
    await fs.writeFile(path.join(dir, "sessions", id, "session.json"), JSON.stringify({ id }));

    for (const kq of [await tiepTucPhien(id), await dungPhien(id)]) {
      expect(kq.ok).toBe(false);
      if (!kq.ok) expect(kq.message).toMatch(/BEE_CTL=none/);
    }
  });

  it("unit của máy (doctor, gc) cũng không chạy được từ test", async () => {
    for (const kq of [await runDoctor(), await runGc()]) {
      expect(kq.ok).toBe(false);
      if (!kq.ok) expect(kq.message).toMatch(/BEE_CTL=none/);
    }
  });

  it("mở cửa thì lệnh chạy thật — cái đóng được phải mở lại được", async () => {
    delete process.env.BEE_CTL;
    expect(ctlEnabled()).toBe(true);
    const { stdout } = await ctl("printf", ["cua-mo"]);
    expect(stdout).toBe("cua-mo");
  });
});

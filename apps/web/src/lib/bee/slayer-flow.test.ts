import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ctl } from "./ctl";

/**
 * `tok add <tên> --login` đi qua đúng tay lái với `claude setup-token`, nên
 * nó thừa hưởng cùng những cái bẫy: Enter là CR, và CR phải đến trong cụm
 * riêng. Test này chạy thật qua pty với một `tok` giả — không mạng, không
 * đụng máy, và cố ý đặt mã dài quá ngưỡng "dán".
 */

const MA_THAT = "VikBPU6KBmIOvEbPdfsA4rVU9bhcRuz539o0bdOOnnxgtki6#-4zpz5xQwErTyUi";

const STUB = `#!/usr/bin/env node
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const [, , lenh, ten, co] = process.argv;
if (lenh !== "add" || co !== "--login") { console.log("stub: " + process.argv.slice(2).join(" ")); process.exit(0); }
const cot = process.stdout.columns ?? 80;
const ve = (s) => { for (let i = 0; i < s.length; i += cot) process.stdout.write(s.slice(i, i + cot) + "\\r\\n"); };
ve("Open this URL to authorize:");
ve("https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a&state=" + "s".repeat(60));
process.stdout.write("Paste the code: ");
let buf = "", cum = 0, luc = 0;
process.stdin.on("data", (d) => {
  const now = Date.now();
  if (now - luc > 150) cum = 0;
  luc = now;
  let s = d.toString();
  cum += s.length;
  if (cum > 56) s = s.replace(/\\r/g, "");   // dán: CR là chữ, không phải phím
  buf += s;
  const i = buf.indexOf("\\r");
  if (i === -1) return;
  const code = buf.slice(0, i);
  buf = buf.slice(i + 1);
  if (code.startsWith("MASAI")) { ve("OAuth error: Request failed with status code 400"); return; }
  ve("Added slot " + ten);
  process.exit(0);
});
`;

let tmpDir = "";
let PATH_CU: string | undefined;
let SRC_CU: string | undefined;
let CTL_CU: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-slot-"));
  await fs.mkdir(path.join(tmpDir, "bin"));
  await fs.writeFile(path.join(tmpDir, "bin", "tok"), STUB, { mode: 0o755 });
  PATH_CU = process.env.PATH;
  SRC_CU = process.env.BEE_SOURCE;
  process.env.PATH = `${path.join(tmpDir, "bin")}:${process.env.PATH ?? ""}`;
  process.env.BEE_SOURCE = "disk";
  // Mở CỬA LỆNH NGOÀI cho riêng bài này (T18): mặc định cả bộ test đóng
  // (`BEE_CTL=none` trong vitest.setup.ts) để không bài nào lỡ tay start một
  // unit thật. Ở đây mở là đúng — thứ chạy được là stub trong $PATH trên,
  // và cái đang được kiểm chính là tay lái pty với một tiến trình thật.
  CTL_CU = process.env.BEE_CTL;
  delete process.env.BEE_CTL;
});

afterEach(async () => {
  process.env.PATH = PATH_CU;
  if (SRC_CU === undefined) delete process.env.BEE_SOURCE;
  else process.env.BEE_SOURCE = SRC_CU;
  if (CTL_CU === undefined) delete process.env.BEE_CTL;
  else process.env.BEE_CTL = CTL_CU;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function coScript(): Promise<boolean> {
  try {
    await ctl("script", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

describe("thêm tài khoản Claude qua tok add --login", () => {
  it("trả link duyệt nguyên vẹn, rồi mã dài vẫn gửi đi được", async () => {
    if (!(await coScript())) return;
    const { startAddSlot, finishAddSlot } = await import("./slayer-ctl");

    const link = await startAddSlot("personal");
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(link.url).toMatch(/^https:\/\/claude\.com\/cai\/oauth\/authorize\?code=true&client_id=9d1c250a&state=s+$/);

    expect(await finishAddSlot(MA_THAT)).toEqual({ ok: true });
  }, 30_000);

  it("mã bị từ chối → chính lời của tok, không phải 'hết giờ'", async () => {
    if (!(await coScript())) return;
    const { startAddSlot, finishAddSlot } = await import("./slayer-ctl");

    expect((await startAddSlot("personal")).ok).toBe(true);
    const outcome = await finishAddSlot(`MASAI${MA_THAT}`);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/OAuth error: Request failed with status code 400/);
  }, 30_000);

  it("tên slot bậy bị chặn TRƯỚC khi có tiến trình nào được sinh ra", async () => {
    const { startAddSlot } = await import("./slayer-ctl");
    const outcome = await startAddSlot("personal; rm -rf /");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/Tên slot/);
  });

  it("chưa mở luồng mà gửi mã → nói thẳng, không treo", async () => {
    const { finishAddSlot } = await import("./slayer-ctl");
    const outcome = await finishAddSlot("ABC123");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/Không có luồng đăng nhập nào đang chờ/);
  });
});

describe("đổi tài khoản — luật 'không đổi khi đang chạy' nằm ở lớp dưới", () => {
  it("còn phiên chạy thì từ chối, và nói RÕ vì sao", async () => {
    const { switchSlot } = await import("./slayer-ctl");
    const outcome = await switchSlot("work", 2);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toMatch(/Còn 2 phiên đang chạy/);
      expect(outcome.message).toMatch(/CẢ MÁY/);
    }
  });

  it("không phiên nào chạy thì đổi, và mục tiêu bậy vẫn bị chặn", async () => {
    const { switchSlot } = await import("./slayer-ctl");
    expect(await switchSlot("work", 0)).toEqual({ ok: true });
    const bad = await switchSlot("$(id)", 0);
    expect(bad.ok).toBe(false);
  });
});

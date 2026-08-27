import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ctl } from "./ctl";

/**
 * The setup-token flow, driven the way the web drives it — through a pty,
 * against a stub `claude` that behaves like the real ink UI in the two ways
 * that bit us on 25/08:
 *
 *  · it only accepts the code on CR (a real Enter), never on LF;
 *  · a chunk over 56 bytes is a paste, and a paste keeps its trailing CR as
 *    text — so the CR has to arrive in a chunk of its own;
 *  · it wraps its output at the pty width, so a narrow pty cuts the token.
 *
 * No real claude, no systemctl, no network: the stub is the whole machine.
 */

const TOKEN = `sk-ant-oat01-${"Ab3_x-9Z".repeat(14)}`; // 125 chars — wider than 80

/** A code the length the real ones come in at — long enough to be a paste. */
const MA_THAT = "VikBPU6KBmIOvEbPdfsA4rVU9bhcRuz539o0bdOOnnxgtki6#-4zpz5xQwErTyUi";

const STUB = `#!/usr/bin/env node
// Raw mode, like ink: without it the pty's line discipline turns the CR we
// are testing for into an LF and the distinction disappears.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const width = process.stdout.columns ?? 80;
const emitLine = (s) => {
  // Wrap like ink does: hard break at the pty width.
  for (let i = 0; i < s.length; i += width) process.stdout.write(s.slice(i, i + width) + "\\r\\n");
};
emitLine("Browser didn't open? Use the url below to sign in");
emitLine("https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a&state=" + "s".repeat(60));
process.stdout.write("Paste code here if prompted > ");
let buf = "";
let burst = 0, lastAt = 0;
process.stdin.on("data", (d) => {
  // Paste detection the way the real thing does it: by BURST, not by chunk.
  // A pty splits a big write into several reads, so "is this chunk large?"
  // measures nothing. What counts is how much arrived back-to-back — and a
  // CR riding at the end of a big burst is pasted text, not a keypress.
  const now = Date.now();
  if (now - lastAt > 150) burst = 0;
  lastAt = now;
  let s = d.toString();
  burst += s.length;
  if (burst > 56) s = s.replace(/\\r/g, "");
  buf += s;
  const i = buf.indexOf("\\r");           // CR only — LF is not Enter
  if (i === -1) return;
  const code = buf.slice(0, i);
  buf = buf.slice(i + 1);
  if (code.startsWith("MASAI")) { emitLine("OAuth error: Request failed with status code 400"); emitLine("Press Enter to retry."); return; }
  emitLine("\\u2713 Long-lived authentication token created successfully!");
  emitLine("${TOKEN}");
  process.exit(0);
});
`;

let tmpDir = "";
let PATH_CU: string | undefined;
let SRC_CU: string | undefined;
let SRV_CU: string | undefined;
let CTL_CU: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-setup-"));
  await fs.mkdir(path.join(tmpDir, "bin"));
  await fs.writeFile(path.join(tmpDir, "bin", "claude"), STUB, { mode: 0o755 });
  PATH_CU = process.env.PATH;
  SRC_CU = process.env.BEE_SOURCE;
  SRV_CU = process.env.BEE_SRV;
  process.env.PATH = `${path.join(tmpDir, "bin")}:${process.env.PATH ?? ""}`;
  process.env.BEE_SOURCE = "disk"; // the fixture short-circuit would skip everything
  process.env.BEE_SRV = tmpDir;
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
  if (SRV_CU === undefined) delete process.env.BEE_SRV;
  else process.env.BEE_SRV = SRV_CU;
  if (CTL_CU === undefined) delete process.env.BEE_CTL;
  else process.env.BEE_CTL = CTL_CU;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// util-linux `script` is what gives the flow a pty. Without it there is
// nothing to test — say so instead of failing for the wrong reason.
async function coScript(): Promise<boolean> {
  try {
    await ctl("script", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

describe("claude setup-token, driven through a pty", () => {
  it("hands back the login link, then saves the WHOLE token", async () => {
    if (!(await coScript())) return;
    const { startClaudeSetup, submitClaudeCode } = await import("./machine-ctl");

    const link = await startClaudeSetup();
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    // Whole and single: an 80-column pty would have sliced this in two.
    expect(link.url).toMatch(/^https:\/\/claude\.com\/cai\/oauth\/authorize\?code=true&client_id=9d1c250a&state=s+$/);

    const outcome = await submitClaudeCode(MA_THAT);
    expect(outcome.ok).toBe(true);
    const saved = await fs.readFile(path.join(tmpDir, "claude.env"), "utf8");
    // The whole token, not the first 80 characters of it.
    expect(saved.trim()).toBe(`CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}`);
  }, 30_000);

  it("a code the server refuses comes back as the flow's own words, fast", async () => {
    if (!(await coScript())) return;
    const { startClaudeSetup, submitClaudeCode } = await import("./machine-ctl");

    expect((await startClaudeSetup()).ok).toBe(true);
    const outcome = await submitClaudeCode(`MASAI${MA_THAT}`);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/OAuth error: Request failed with status code 400/);
  }, 30_000);

  it("no flow started → says so instead of hanging", async () => {
    const { submitClaudeCode } = await import("./machine-ctl");
    const outcome = await submitClaudeCode("ABC123");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/No login flow is waiting/);
  });
});

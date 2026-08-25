import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

/**
 * The setup-token flow, driven the way the web drives it — through a pty,
 * against a stub `claude` that behaves like the real ink UI in the two ways
 * that bit us on 25/08:
 *
 *  · it only accepts the code on CR (a real Enter), never on LF;
 *  · it wraps its output at the pty width, so a narrow pty cuts the token.
 *
 * No real claude, no systemctl, no network: the stub is the whole machine.
 */

const TOKEN = `sk-ant-oat01-${"Ab3_x-9Z".repeat(14)}`; // 125 chars — wider than 80

const STUB = `#!/usr/bin/env node
// Raw mode, like ink: without it the pty's line discipline turns the CR we
// are testing for into an LF and the distinction disappears.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const cot = process.stdout.columns ?? 80;
const ve = (s) => {
  // Wrap like ink does: hard break at the pty width.
  for (let i = 0; i < s.length; i += cot) process.stdout.write(s.slice(i, i + cot) + "\\r\\n");
};
ve("Browser didn't open? Use the url below to sign in");
ve("https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a&state=" + "s".repeat(60));
process.stdout.write("Paste code here if prompted > ");
let go = "";
process.stdin.on("data", (d) => {
  go += d.toString();
  const i = go.indexOf("\\r");           // CR only — LF is not Enter
  if (i === -1) return;
  const ma = go.slice(0, i);
  go = go.slice(i + 1);
  if (ma === "MASAI") { ve("OAuth error: Request failed with status code 400"); ve("Press Enter to retry."); return; }
  ve("\\u2713 Long-lived authentication token created successfully!");
  ve("${TOKEN}");
  process.exit(0);
});
`;

let thu = "";
let PATH_CU: string | undefined;
let SRC_CU: string | undefined;
let SRV_CU: string | undefined;

beforeEach(async () => {
  thu = await fs.mkdtemp(path.join(os.tmpdir(), "bee-setup-"));
  await fs.mkdir(path.join(thu, "bin"));
  await fs.writeFile(path.join(thu, "bin", "claude"), STUB, { mode: 0o755 });
  PATH_CU = process.env.PATH;
  SRC_CU = process.env.BEE_SOURCE;
  SRV_CU = process.env.BEE_SRV;
  process.env.PATH = `${path.join(thu, "bin")}:${process.env.PATH ?? ""}`;
  process.env.BEE_SOURCE = "disk"; // the fixture short-circuit would skip everything
  process.env.BEE_SRV = thu;
});

afterEach(async () => {
  process.env.PATH = PATH_CU;
  if (SRC_CU === undefined) delete process.env.BEE_SOURCE;
  else process.env.BEE_SOURCE = SRC_CU;
  if (SRV_CU === undefined) delete process.env.BEE_SRV;
  else process.env.BEE_SRV = SRV_CU;
  await fs.rm(thu, { recursive: true, force: true });
});

// util-linux `script` is what gives the flow a pty. Without it there is
// nothing to test — say so instead of failing for the wrong reason.
async function coScript(): Promise<boolean> {
  try {
    await run("script", ["--version"]);
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

    const ket = await submitClaudeCode("YDoKJJk7p0#LymMTx");
    expect(ket.ok).toBe(true);
    const daLuu = await fs.readFile(path.join(thu, "claude.env"), "utf8");
    // The whole token, not the first 80 characters of it.
    expect(daLuu.trim()).toBe(`CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}`);
  }, 30_000);

  it("a code the server refuses comes back as the flow's own words, fast", async () => {
    if (!(await coScript())) return;
    const { startClaudeSetup, submitClaudeCode } = await import("./machine-ctl");

    expect((await startClaudeSetup()).ok).toBe(true);
    const ket = await submitClaudeCode("MASAI");
    expect(ket.ok).toBe(false);
    if (!ket.ok) expect(ket.message).toMatch(/OAuth error: Request failed with status code 400/);
  }, 30_000);

  it("no flow started → says so instead of hanging", async () => {
    const { submitClaudeCode } = await import("./machine-ctl");
    const ket = await submitClaudeCode("ABC123");
    expect(ket.ok).toBe(false);
    if (!ket.ok) expect(ket.message).toMatch(/No login flow is waiting/);
  });
});

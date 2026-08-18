import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateClaudeToken } from "./claude-token";
import { saveClaudeToken } from "./machine-ctl";

describe("validateClaudeToken", () => {
  it("accepts only long-lived oauth tokens from `claude setup-token`", () => {
    expect(validateClaudeToken("sk-ant-oat01-AbC123_-xyz")).toBe(true);
    expect(validateClaudeToken("  sk-ant-oat01-AbC123  ")).toBe(true); // trimmed
    expect(validateClaudeToken("sk-ant-api03-somekey")).toBe(false); // API key ≠ subscription token
    expect(validateClaudeToken("sk-ant-oat01-")).toBe(false);
    expect(validateClaudeToken("sk-ant-oat01-has space")).toBe(false);
    expect(validateClaudeToken("")).toBe(false);
  });
});

describe("saveClaudeToken (disk mode)", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-claude-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes claude.env for the runner, readable by owner only", async () => {
    const ket = await saveClaudeToken("sk-ant-oat01-AbC123");
    expect(ket.ok).toBe(true);

    const file = path.join(dir, "claude.env");
    expect(await fs.readFile(file, "utf8")).toBe("CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-AbC123\n");
    const mode = (await fs.stat(file)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("rejects anything that is not a setup-token token — nothing gets written", async () => {
    const ket = await saveClaudeToken("sk-ant-api03-realapikey");
    expect(ket.ok).toBe(false);
    await expect(fs.access(path.join(dir, "claude.env"))).rejects.toThrow();
  });
});

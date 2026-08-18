import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readClaudeAuthFrom } from "./doctor-fs";

let dir = "";
let home = "";

describe("readClaudeAuthFrom — live Claude auth status for the setup UI", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-auth-"));
    home = path.join(dir, "home");
    await fs.mkdir(home, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("claude.env with a setup-token token → token", async () => {
    await fs.writeFile(path.join(dir, "claude.env"), "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-abc\n");
    expect(await readClaudeAuthFrom(dir, home)).toBe("token");
  });

  it("interactive credentials on the machine → interactive", async () => {
    await fs.mkdir(path.join(home, ".claude"), { recursive: true });
    await fs.writeFile(path.join(home, ".claude", ".credentials.json"), "{}");
    expect(await readClaudeAuthFrom(dir, home)).toBe("interactive");
  });

  it("neither → none; a claude.env with garbage does not count", async () => {
    expect(await readClaudeAuthFrom(dir, home)).toBe("none");
    await fs.writeFile(path.join(dir, "claude.env"), "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-api03-x\n");
    expect(await readClaudeAuthFrom(dir, home)).toBe("none");
  });
});

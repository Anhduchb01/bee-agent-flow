import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { doiModePhien } from "./session-ctl";
import type { BeeSessionMode } from "./types";

const ID = "cd000000-0000-4000-8000-000000000001";

let dir = "";

async function writeSession(extra: Record<string, unknown> = {}) {
  const sdir = path.join(dir, "sessions", ID);
  await fs.mkdir(sdir, { recursive: true });
  await fs.writeFile(
    path.join(sdir, "session.json"),
    JSON.stringify({ id: ID, slug: "myapp", num: 1, repo: "you/myapp", worktree: true, ...extra }),
  );
}

async function readMode(): Promise<unknown> {
  const raw = await fs.readFile(path.join(dir, "sessions", ID, "session.json"), "utf8");
  return (JSON.parse(raw) as Record<string, unknown>).mode;
}

describe("doiModePhien — V2.5a mode switch", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-mode-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes the new mode into session.json (unit not running → no restart, still ok)", async () => {
    await writeSession();
    const ket = await doiModePhien(ID, "plan");
    expect(ket.ok).toBe(true);
    expect(await readMode()).toBe("plan");
  });

  it("an old session.json without a mode field can still be switched", async () => {
    await writeSession(); // no mode field at all
    expect((await doiModePhien(ID, "edits")).ok).toBe(true);
    expect(await readMode()).toBe("edits");
  });

  it("dirty id and unknown mode are refused before touching the filesystem", async () => {
    expect((await doiModePhien("../../etc", "plan")).ok).toBe(false);
    await writeSession();
    const ket = await doiModePhien(ID, "yolo" as BeeSessionMode);
    expect(ket.ok).toBe(false);
    expect(await readMode()).toBeUndefined();
  });

  it("chat sessions have no tools — mode switch is refused with a reason", async () => {
    await writeSession({ worktree: false });
    const ket = await doiModePhien(ID, "plan");
    expect(ket.ok).toBe(false);
    if (!ket.ok) expect(ket.message).toContain("no tools");
  });
});

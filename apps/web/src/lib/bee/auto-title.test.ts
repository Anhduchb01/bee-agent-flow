import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { autoTitleSession } from "./session-ctl";

const ID = "ab000000-0000-4000-8000-000000000001";

let dir = "";

async function writeMeta(title: string | null) {
  const sdir = path.join(dir, "sessions", ID);
  await fs.mkdir(sdir, { recursive: true });
  await fs.writeFile(
    path.join(sdir, "session.json"),
    JSON.stringify({ id: ID, slug: "myapp", num: 1, title, phase: "interview" }),
  );
}

async function readTitle(): Promise<unknown> {
  const raw = await fs.readFile(path.join(dir, "sessions", ID, "session.json"), "utf8");
  return (JSON.parse(raw) as Record<string, unknown>).title;
}

describe("autoTitleSession — first message names the session, like Claude Code", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-title-"));
    process.env.BEE_SRV = dir;
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("untitled session gets a title derived from the first message", async () => {
    await writeMeta(null);
    await autoTitleSession(ID, "Fix the login redirect\nplus lots of detail");
    expect(await readTitle()).toBe("Fix the login redirect");
  });

  it("a session that already has a title is left alone", async () => {
    await writeMeta("Session 1 đã có tên");
    await autoTitleSession(ID, "something completely different");
    expect(await readTitle()).toBe("Session 1 đã có tên");
  });

  it("empty-string title counts as untitled", async () => {
    await writeMeta("");
    await autoTitleSession(ID, "Build the canvas");
    expect(await readTitle()).toBe("Build the canvas");
  });

  it("bad id or missing file is a silent no-op — naming must never break sending", async () => {
    await expect(autoTitleSession("../../etc/passwd", "x")).resolves.toBeUndefined();
    await expect(autoTitleSession(ID, "x")).resolves.toBeUndefined();
  });
});

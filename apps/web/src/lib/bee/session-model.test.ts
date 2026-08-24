import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { doiModelPhien } from "./session-ctl";
import { docPhienTrong } from "./sessions-fs";

const ID = "bd000000-0000-4000-8000-000000000001";

let dir = "";

async function writeSession(extra: Record<string, unknown> = {}) {
  const sdir = path.join(dir, "sessions", ID);
  await fs.mkdir(sdir, { recursive: true });
  await fs.writeFile(
    path.join(sdir, "session.json"),
    JSON.stringify({ id: ID, slug: "myapp", num: 1, repo: "you/myapp", worktree: true, ...extra }),
  );
}

async function readModel(): Promise<unknown> {
  const raw = await fs.readFile(path.join(dir, "sessions", ID, "session.json"), "utf8");
  return (JSON.parse(raw) as Record<string, unknown>).model;
}

describe("doiModelPhien — V2.7 model switch", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-model-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes the alias into session.json (unit not running → applies next start)", async () => {
    await writeSession();
    expect(await doiModelPhien(ID, "opus[1m]")).toEqual({ ok: true });
    expect(await readModel()).toBe("opus[1m]");
  });

  it("chat sessions may switch model too — a model is not a tool", async () => {
    await writeSession({ worktree: false });
    expect(await doiModelPhien(ID, "haiku")).toEqual({ ok: true });
    expect(await readModel()).toBe("haiku");
  });

  it("refuses an id or alias outside the allowlist — nothing is written", async () => {
    await writeSession({ model: "sonnet" });
    expect((await doiModelPhien(ID, "gpt-4" as never)).ok).toBe(false);
    expect((await doiModelPhien(ID, "claude-fable-5" as never)).ok).toBe(false);
    expect((await doiModelPhien("not-a-uuid", "opus")).ok).toBe(false);
    expect(await readModel()).toBe("sonnet");
  });

  it("the saved alias round-trips back through the session reader", async () => {
    await writeSession();
    await doiModelPhien(ID, "sonnet[1m]");
    const phien = await docPhienTrong(dir, ID);
    expect(phien?.model).toBe("sonnet[1m]");
  });

  it("a session that never chose one reads back as default", async () => {
    await writeSession();
    expect((await docPhienTrong(dir, ID))?.model).toBe("default");
    await fs.writeFile(
      path.join(dir, "sessions", ID, "session.json"),
      JSON.stringify({ id: ID, slug: "myapp", num: 1, repo: "you/myapp", model: "gpt-4" }),
    );
    expect((await docPhienTrong(dir, ID))?.model).toBe("default");
  });
});

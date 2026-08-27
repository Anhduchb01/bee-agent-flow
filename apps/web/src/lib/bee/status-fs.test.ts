import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readStatusIn } from "./status-fs";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-status-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function heartbeat(body: string) {
  await fs.writeFile(path.join(dir, "heartbeat.json"), body);
}

async function repo(slug: string, full: string) {
  await fs.mkdir(path.join(dir, "repos.d"), { recursive: true });
  await fs.writeFile(path.join(dir, "repos.d", `${slug}.env`), `REPO=${full}\n`);
}

describe("readStatusIn — system status from what the runner writes", () => {
  it("no heartbeat yet is 'missing', not an error", async () => {
    const read = await readStatusIn(dir);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe("missing");
  });

  it("a half-written heartbeat is 'malformed', and says so", async () => {
    await heartbeat("{not json");
    const read = await readStatusIn(dir);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe("malformed");
  });

  it("heartbeat without a ts is malformed — the age is the whole point", async () => {
    await heartbeat(JSON.stringify({ sessions_running: 1 }));
    const read = await readStatusIn(dir);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe("malformed");
  });

  it("reads the tick time and how many sessions were running", async () => {
    await heartbeat(JSON.stringify({ ts: "2026-08-27T10:00:00Z", sessions_running: 2, reaped: 0 }));
    const read = await readStatusIn(dir);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.status.heartbeat).toBe("2026-08-27T10:00:00Z");
    expect(read.status.running).toBe(2);
    expect(read.status.mode).toBe("running");
  });

  it("the PAUSE file is the kill switch — mode says paused", async () => {
    await heartbeat(JSON.stringify({ ts: "2026-08-27T10:00:00Z", sessions_running: 0 }));
    await fs.writeFile(path.join(dir, "PAUSE"), "");
    const read = await readStatusIn(dir);
    expect(read.ok && read.status.mode).toBe("paused");
  });

  it("lists the registered repos — the same repos.d doctor checks", async () => {
    await heartbeat(JSON.stringify({ ts: "2026-08-27T10:00:00Z", sessions_running: 0 }));
    await repo("myapp", "you/myapp");
    await repo("blog", "you/blog");
    const read = await readStatusIn(dir);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.status.repos.map((r) => r.slug).sort()).toEqual(["blog", "myapp"]);
  });

  it("a machine with no repos registered still reads ok — that is a fresh install, not a fault", async () => {
    await heartbeat(JSON.stringify({ ts: "2026-08-27T10:00:00Z", sessions_running: 0 }));
    const read = await readStatusIn(dir);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.status.repos).toEqual([]);
  });

  it("a repos.d entry we cannot read is COUNTED, not hidden", async () => {
    await heartbeat(JSON.stringify({ ts: "2026-08-27T10:00:00Z", sessions_running: 0 }));
    await repo("myapp", "you/myapp");
    // Registered, but the file says nothing we can use. Silently dropping it
    // means a project the owner added just never appears, with no clue why.
    await fs.writeFile(path.join(dir, "repos.d", "broken.env"), "# no REPO= line\n");
    const read = await readStatusIn(dir);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.status.repos.map((r) => r.slug)).toEqual(["myapp"]);
    expect(read.dropped).toBe(1);
  });

  it("files that are not .env are not 'dropped' — they were never repos", async () => {
    await heartbeat(JSON.stringify({ ts: "2026-08-27T10:00:00Z", sessions_running: 0 }));
    await repo("myapp", "you/myapp");
    await fs.writeFile(path.join(dir, "repos.d", "README.md"), "notes\n");
    const read = await readStatusIn(dir);
    expect(read.ok && read.dropped).toBe(0);
  });

  it("a missing sessions_running counts as zero, not as unreadable", async () => {
    await heartbeat(JSON.stringify({ ts: "2026-08-27T10:00:00Z" }));
    const read = await readStatusIn(dir);
    expect(read.ok && read.status.running).toBe(0);
  });
});

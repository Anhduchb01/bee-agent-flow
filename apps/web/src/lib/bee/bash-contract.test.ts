import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ctl } from "./ctl";
import { readDoctorFrom } from "./doctor-fs";
import { readGcIn } from "./gc-fs";
import { readSessionSliceFrom } from "./services-fs";
import { listSessionsIn, readSessionIn } from "./sessions-fs";

/**
 * The contract between bash and TypeScript.
 *
 * bash writes doctor.json, gc.json, meta.json and services.json; TypeScript
 * reads them. Nothing else in the suite covers that seam: every other disk
 * test writes its fixture in TypeScript and reads it back, so a key renamed
 * on BOTH sides stays green while the real files — written by the shell —
 * stop parsing.
 *
 * That is exactly the hole a regex-driven rename (T31) can fall into, so this
 * file runs the ACTUAL scripts and hands their output to the ACTUAL readers.
 * No fixtures, no hand-written JSON.
 */

const RUNNER = path.resolve(__dirname, "../../../../runner");
let dir = "";
let binDir = "";
let ctlBefore: string | undefined;

/** A stub for every outside command doctor/gc reach for. */
async function stub(name: string, body: string) {
  await fs.writeFile(path.join(binDir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

/**
 * Through `ctl`, not straight to execFile — the same door everything else
 * uses, opened deliberately in beforeEach. That is the rule T18 put in place
 * and the eslint rule that enforces it caught this file on the first try,
 * which is the rule working.
 */
async function runScript(script: string, args: string[] = []) {
  return ctl("bash", [path.join(RUNNER, "bin", script), ...args], {
    env: { ...process.env, BEE_ROOT: dir, PATH: `${binDir}:${process.env.PATH}` },
  });
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-contract-"));
  binDir = path.join(dir, "bin");
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(path.join(dir, "sessions"), { recursive: true });
  await fs.mkdir(path.join(dir, "work"), { recursive: true });
  await fs.mkdir(path.join(dir, "services"), { recursive: true });
  for (const c of ["gh", "loginctl", "curl", "systemctl", "docker", "ss"]) {
    await stub(c, "exit 1");
  }
  // Open the outside-command door for this file only. What runs is the real
  // runner against a temp BEE_ROOT with every other binary stubbed — which is
  // exactly what makes this a contract test rather than a fixture.
  ctlBefore = process.env.BEE_CTL;
  delete process.env.BEE_CTL;
});
afterEach(async () => {
  if (ctlBefore === undefined) delete process.env.BEE_CTL;
  else process.env.BEE_CTL = ctlBefore;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("doctor.sh → readDoctorFrom", () => {
  it("the real doctor.json parses, with every check readable", async () => {
    await runScript("doctor.sh", ["--exit-zero"]);
    const doctor = await readDoctorFrom(dir);

    // null here means the shape changed and every /setup visit would show
    // "machine not verified yet" on a machine that just verified itself.
    expect(doctor).not.toBeNull();
    expect(doctor!.checks.length).toBeGreaterThan(0);
    for (const c of doctor!.checks) {
      expect(typeof c.id).toBe("string");
      expect(c.id).not.toBe("");
      expect(typeof c.detail).toBe("string");
    }
  });

  it("the ids the UI singles out still come back", async () => {
    // /setup drives buttons off these exact ids (LingerButton, PatForm…), and
    // T30 renamed three of them. A drift here disables a button silently.
    await runScript("doctor.sh", ["--exit-zero"]);
    const ids = (await readDoctorFrom(dir))!.checks.map((c) => c.id);
    for (const id of ["pat", "claude", "linger", "reaper", "clean-host", "session-disk", "disk", "web", "services"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("gc.sh → readGcIn", () => {
  it("a KEPT worktree comes back with its reason", async () => {
    const id = "aa000000-0000-4000-8000-000000000001";
    await fs.mkdir(path.join(dir, "work", id), { recursive: true });
    await fs.mkdir(path.join(dir, "sessions", id), { recursive: true });
    // No meta.json on purpose: gc must keep it and say why.
    await runScript("gc.sh");

    const gc = await readGcIn(dir);
    expect(gc).not.toBeNull();
    expect(gc!.items.length).toBe(1);
    expect(gc!.items[0]!.action).toBe("kept");
    expect(gc!.items[0]!.reason).not.toBe("");
  });

  it("a REMOVED worktree comes back with its byte count", async () => {
    // The kept branch alone is not enough: `bytes` and `freed_bytes` are 0
    // there, so a reader looking at the wrong key returns 0 and nothing
    // notices. Only a real removal puts a non-zero number on both sides of
    // the seam. (Found by breaking gc-fs on purpose and watching the kept
    // case stay green.)
    const id = "dd000000-0000-4000-8000-000000000004";
    const wt = path.join(dir, "work", id);
    const sdir = path.join(dir, "sessions", id);
    await fs.mkdir(wt, { recursive: true });
    await fs.mkdir(sdir, { recursive: true });
    await fs.writeFile(path.join(wt, "big"), "x".repeat(50_000));
    // A slug whose bare repo does not exist: gc's own rule says there is no
    // branch left to lose, so it reclaims.
    await fs.writeFile(
      path.join(sdir, "session.json"),
      JSON.stringify({ id, slug: "gone", num: 1, repo: "you/gone", worktree: true }),
    );
    await fs.writeFile(
      path.join(sdir, "meta.json"),
      JSON.stringify({ status: "done", ended_at: "2020-01-01T00:00:00Z", needs_human: false }),
    );
    await runScript("gc.sh");

    const gc = await readGcIn(dir);
    const item = gc!.items.find((i) => i.id === id);
    expect(item?.action).toBe("removed");
    expect(item!.bytes).toBeGreaterThan(0);
    expect(gc!.removed).toBe(1);
    expect(gc!.freed_bytes).toBeGreaterThan(0);
  });
});

describe("session-run.sh → listSessionsIn / readSessionIn", () => {
  it("a session refused at the PAUSE gate is still readable by the web", async () => {
    // The cheapest way to make the runner write a real meta.json without a
    // repo, a clone or claude: let PAUSE stop it at the door. What it writes
    // there is the same meta.json shape every other exit path writes.
    const id = "bb000000-0000-4000-8000-000000000002";
    const sdir = path.join(dir, "sessions", id);
    await fs.mkdir(sdir, { recursive: true });
    await fs.writeFile(
      path.join(sdir, "session.json"),
      JSON.stringify({ id, slug: "myapp", num: 7, repo: "you/myapp", title: null, worktree: false }),
    );
    await fs.writeFile(path.join(dir, "PAUSE"), "");
    try {
      await runScript("session-run.sh", [id]);
    } catch {
      // Refusing is the point; it exits non-zero.
    }

    const one = await readSessionIn(dir, id);
    expect(one).not.toBeNull();
    expect(one!.slug).toBe("myapp");
    expect(one!.num).toBe(7);
    // bash wrote this status; the web has to recognise it.
    expect(["failed", "stopped", "done"]).toContain(one!.status);

    const all = await listSessionsIn(dir);
    expect(all.map((s) => s.id)).toContain(id);
  });
});

describe("service-slice.sh → readSessionSliceFrom", () => {
  it("the real services.json parses, and its password never comes out", async () => {
    const id = "cc000000-0000-4000-8000-000000000003";
    await fs.mkdir(path.join(dir, "sessions", id), { recursive: true });
    await fs.mkdir(path.join(dir, "work", id), { recursive: true });
    await fs.writeFile(
      path.join(dir, "sessions", id, "session.json"),
      JSON.stringify({ id, slug: "myapp", num: 1, repo: "you/myapp", worktree: true }),
    );
    await fs.writeFile(
      path.join(dir, "work", id, "docker-compose.yml"),
      "services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7\n",
    );
    await fs.writeFile(
      path.join(dir, "services", "compose.yml"),
      "services:\n  postgres:\n    image: postgres:16\n",
    );
    await stub("docker", "exit 0");

    await runScript("service-slice.sh", ["provision", id]);

    const slice = await readSessionSliceFrom(dir, id);
    expect(slice).not.toBeNull();
    expect(slice!.slice).toBe("bee_cc000000");
    // `at` falls back to "" when the reader looks at the wrong key, so an
    // assertion on the shape alone would not notice. Pin the value.
    expect(slice!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(slice!.items.map((i) => i.service).sort()).toEqual(["cache", "db"]);
    expect(slice!.items.find((i) => i.service === "db")!.in_pool).toBe(true);
    expect(slice!.items.find((i) => i.service === "cache")!.in_pool).toBe(false);

    // The file on disk holds a password; what the web reads must not.
    const onDisk = await fs.readFile(path.join(dir, "sessions", id, "services.json"), "utf8");
    expect(onDisk).toContain("password");
    expect(JSON.stringify(slice)).not.toContain("password");
  });
});

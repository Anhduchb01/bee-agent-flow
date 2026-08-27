import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deleteEnvFile, listEnvFiles, saveEnvFile } from "./machine-ctl";

let dir = "";

describe("env.d via web — per-repo env files without touching a shell", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-envd-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("save creates nested paths owner-only; list reads them back with content", async () => {
    expect((await saveEnvFile("myapp", ".env", "API_KEY=abc\n")).ok).toBe(true);
    expect((await saveEnvFile("myapp", "apps/web/.env.local", "DB=x\n")).ok).toBe(true);

    const file = path.join(dir, "env.d", "myapp", "apps", "web", ".env.local");
    expect(((await fs.stat(file)).mode & 0o777)).toBe(0o600);

    const entries = await listEnvFiles("myapp");
    expect(entries.map((f) => f.path)).toEqual([".env", "apps/web/.env.local"]);
    expect(entries[0]!.content).toBe("API_KEY=abc\n");
  });

  it("dirty paths never reach the filesystem", async () => {
    for (const bad of ["../../etc/cron.d/x", "/etc/passwd", "a/../../b", "", "a//b", "a/", ".."]) {
      const outcome = await saveEnvFile("myapp", bad, "x");
      expect(outcome.ok, bad).toBe(false);
    }
    expect((await saveEnvFile("../etc", ".env", "x")).ok).toBe(false);
    await expect(fs.access(path.join(dir, "env.d"))).rejects.toThrow();
  });

  it("delete removes one file; list of an unknown repo is empty", async () => {
    await saveEnvFile("myapp", ".env", "A=1");
    expect((await deleteEnvFile("myapp", ".env")).ok).toBe(true);
    expect(await listEnvFiles("myapp")).toEqual([]);
    expect(await listEnvFiles("missing")).toEqual([]);
    expect((await deleteEnvFile("myapp", "../x")).ok).toBe(false);
  });

  it("oversized content is refused — env files are keys, not databases", async () => {
    const outcome = await saveEnvFile("myapp", ".env", "x".repeat(70_000));
    expect(outcome.ok).toBe(false);
  });
});

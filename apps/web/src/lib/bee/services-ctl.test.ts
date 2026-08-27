import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPoolCompose, savePoolCompose, setPoolRunning } from "./services-ctl";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-svc-"));
  process.env.BEE_SRV = dir;
  process.env.BEE_SOURCE = "disk";
  await fs.mkdir(path.join(dir, "services"), { recursive: true });
});
afterEach(async () => {
  delete process.env.BEE_SRV;
  delete process.env.BEE_SOURCE;
  await fs.rm(dir, { recursive: true, force: true });
});

const compose = (body: string) => fs.writeFile(path.join(dir, "services", "compose.yml"), body);

async function slice(sessionId: string) {
  const sdir = path.join(dir, "sessions", sessionId);
  await fs.mkdir(sdir, { recursive: true });
  await fs.writeFile(
    path.join(sdir, "services.json"),
    JSON.stringify({
      slice: "bee_11111111",
      at: "2026-08-27T10:00:00Z",
      items: [{ service: "postgres", image: "postgres:16", kind: "postgres", in_pool: true }],
    }),
  );
}

describe("readPoolCompose", () => {
  it("hands back the file the machine actually runs", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    expect((await readPoolCompose()).text).toContain("postgres:16");
  });

  it("a machine with no pool yet gets a starting point, not an error", async () => {
    const read = await readPoolCompose();
    expect(read.text).toContain("services:");
    expect(read.exists).toBe(false);
  });
});

describe("savePoolCompose", () => {
  it("refuses text that is not a compose file — an unparseable pool refuses every session", async () => {
    const outcome = await savePoolCompose("this is not: [yaml");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/compose|yaml|parse/i);
  });

  it("refuses a file with no services key — nothing to share", async () => {
    const outcome = await savePoolCompose("volumes:\n  data: {}\n");
    expect(outcome.ok).toBe(false);
  });

  it("refuses something enormous — this file names services, it does not carry data", async () => {
    const outcome = await savePoolCompose(`services:\n  a:\n    image: x\n# ${"y".repeat(70_000)}`);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/large/i);
  });

  it("writes a good file, and does not leave the old one half-replaced", async () => {
    await compose("services:\n  old:\n    image: old:1\n");
    const outcome = await savePoolCompose("services:\n  postgres:\n    image: postgres:16\n");
    expect(outcome.ok).toBe(true);
    expect((await readPoolCompose()).text).toContain("postgres:16");
    const left = await fs.readdir(path.join(dir, "services"));
    expect(left.filter((f) => f.includes("tmp"))).toEqual([]);
  });

  it("a rejected save leaves the previous file untouched", async () => {
    await compose("services:\n  good:\n    image: good:1\n");
    await savePoolCompose("nonsense: [");
    expect((await readPoolCompose()).text).toContain("good:1");
  });
});

describe("setPoolRunning — off is the dangerous direction", () => {
  it("refuses to stop the pool while a session holds a slice of it", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");

    const outcome = await setPoolRunning(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/1 session/i);
  });

  it("names the sessions, so the owner knows what they are about to break", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");
    await slice("bbbbbbbb-1111-4222-8333-444444444444");

    const outcome = await setPoolRunning(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/2 sessions/i);
  });

  it("force stops anyway — the owner may know something we do not", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");

    // BEE_CTL=none in the suite: systemctl refuses, so this proves the GATE
    // opened, not that the unit stopped.
    const outcome = await setPoolRunning(false, { force: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).not.toMatch(/holds a slice/i);
  });

  it("starting needs no permission — nothing is destroyed by turning it on", async () => {
    await compose("services:\n  postgres:\n    image: postgres:16\n");
    await slice("aaaaaaaa-1111-4222-8333-444444444444");

    const outcome = await setPoolRunning(true);
    if (!outcome.ok) expect(outcome.message).not.toMatch(/holds a slice/i);
  });

  it("refuses to start an empty pool — a unit that comes up with nothing is a lie", async () => {
    await compose("services: {}\n");
    const outcome = await setPoolRunning(true);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/no service/i);
  });
});

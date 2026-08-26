import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runQueueTick } from "./tick";

/**
 * The Autopilot tick once it is wired to real disk.
 *
 * The pure rule has its own tests (`queue-run.test.ts`). This file holds one
 * thing only: the timer and the "Run now" button share ONE copy, so every
 * gate — PAUSE, the queue pause, the brake, a failed start — must block
 * identically no matter who called.
 */

let dir = "";

async function queueItems(items: unknown[], paused = false) {
  await fs.writeFile(path.join(dir, "queue.json"), JSON.stringify({ paused, items }));
}

const ITEM = {
  slug: "myapp",
  repo: "you/myapp",
  issue: 41,
  status: "waiting",
  added_at: "2026-08-26T00:00:00Z",
  reason: null,
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-tick-"));
  process.env.BEE_SRV = dir;
  process.env.BEE_SOURCE = "disk";
});
afterEach(async () => {
  delete process.env.BEE_SRV;
  delete process.env.BEE_SOURCE;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("runQueueTick — one copy for the timer AND the Run now button", () => {
  it("empty queue: says so, touches nothing else", async () => {
    expect(await runQueueTick()).toEqual({ opened: null, reason: "the queue is empty" });
  });

  it("machine PAUSE blocks the button too — it shortens the wait, not the rules", async () => {
    await queueItems([ITEM]);
    await fs.writeFile(path.join(dir, "PAUSE"), "");
    const out = await runQueueTick();
    expect(out.opened).toBeNull();
    expect(out.reason).toMatch(/PAUSE is on/);
  });

  it("the queue pause blocks as well, and names itself rather than PAUSE", async () => {
    await queueItems([ITEM], true);
    const out = await runQueueTick();
    expect(out.opened).toBeNull();
    expect(out.reason).toMatch(/queue is paused/);
  });

  it("a failed start puts the item back to waiting WITH a reason — never lost, never stuck running", async () => {
    // The outside-command door is shut (BEE_CTL=none, vitest.setup.ts) so the
    // start fails at systemctl — the same shape as a machine in trouble.
    await queueItems([ITEM]);
    const out = await runQueueTick();
    expect(out.opened).toBeNull();

    const q = JSON.parse(await fs.readFile(path.join(dir, "queue.json"), "utf8"));
    expect(q.items).toHaveLength(1);
    expect(q.items[0].status).toBe("waiting");
    expect(q.items[0].reason).toMatch(/BEE_CTL=none/);
  });
});

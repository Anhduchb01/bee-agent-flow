import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openSession, continueSession } from "./session-ctl";

let dir = "";

async function setQuota(fiveHour: number, fetchedAt = new Date().toISOString()) {
  await fs.mkdir(path.join(dir, "state"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "state", "claude-usage.json"),
    JSON.stringify({
      five_hour: { percent: fiveHour, resets_at: "2026-08-24T16:20:00Z" },
      seven_day: { percent: 10, resets_at: null },
      fetched_at: fetchedAt,
    }),
  );
}

describe("openSession — the brake sits at the door every new session goes through", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-brake-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
    delete process.env.QUOTA_BRAKE_PCT;
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    delete process.env.QUOTA_BRAKE_PCT;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("over the threshold: refuses BEFORE writing anything to disk", async () => {
    await setQuota(93);
    const ket = await openSession({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });

    expect(ket.ok).toBe(false);
    if (ket.ok) return;
    expect(ket.message).toMatch(/93%/);
    // Không được để lại phiên nửa vời: đã từ chối thì đĩa phải sạch.
    await expect(fs.readdir(path.join(dir, "sessions"))).rejects.toThrow();
  });

  it("under the threshold: the brake does not get in the way", async () => {
    await setQuota(20);
    const ket = await openSession({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });
    // The outside-command door is shut (BEE_CTL=none) → the failure is at
    // start, NOT at the brake, and session.json was written before it.
    //
    // The old comment here said "no systemctl in the sandbox" — wrong, and
    // wrong in the expensive place: on the bee machine itself
    // `bee-session@.service` is a static unit, so start REALLY RUNS. The
    // three dead units in the 25/08 journal carry the uuid below. See
    // lib/bee/ctl.ts.
    if (!ket.ok) expect(ket.message).not.toMatch(/hạn mức/);
    expect((await fs.readdir(path.join(dir, "sessions"))).length).toBe(1);
  });

  it("QUOTA_BRAKE_PCT tunes the line", async () => {
    await setQuota(50);
    process.env.QUOTA_BRAKE_PCT = "40";
    const ket = await openSession({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });
    expect(ket.ok).toBe(false);
    if (!ket.ok) expect(ket.message).toMatch(/50%/);
  });

  it("Continue on an existing session is NOT braked — it resumes, it does not open", async () => {
    await setQuota(99);
    const id = "cc000000-0000-4000-8000-000000000001";
    await fs.mkdir(path.join(dir, "sessions", id), { recursive: true });
    await fs.writeFile(path.join(dir, "sessions", id, "session.json"), JSON.stringify({ id }));

    const ket = await continueSession(id);
    // It gets all the way to start and stops at the OUTSIDE-COMMAND DOOR —
    // which is the point: the brake never got in the way.
    //
    // The uuid above is the one that reached bee's journal on 25/08. If
    // anyone reopens that door, the line below goes red BEFORE a real unit
    // can start.
    expect(ket.ok).toBe(false);
    if (ket.ok) return;
    expect(ket.message).toMatch(/BEE_CTL=none/);
    expect(ket.message).not.toMatch(/hạn mức/);
  });

  it("no usage file at all → opens (flying blind beats being unusable)", async () => {
    const ket = await openSession({ slug: "myapp", num: 1, repo: "you/myapp", title: null, worktree: true });
    if (!ket.ok) expect(ket.message).not.toMatch(/hạn mức/);
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readDoctorFrom } from "./doctor-fs";

let dir = "";

describe("readDoctorFrom", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-doctor-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads the doctor.json the runner writes", async () => {
    await fs.writeFile(
      path.join(dir, "doctor.json"),
      JSON.stringify({
        checked_at: "2026-08-18T09:30:00Z",
        ok: false,
        paused: true,
        checks: [
          { id: "pat", ok: true, detail: "fine-grained PAT" },
          { id: "linger", ok: false, detail: "chưa bật" },
        ],
      }),
    );
    const doc = await readDoctorFrom(dir);
    expect(doc).not.toBeNull();
    expect(doc!.ok).toBe(false);
    expect(doc!.paused).toBe(true);
    expect(doc!.checks).toHaveLength(2);
    expect(doc!.checks[1]).toEqual({ id: "linger", ok: false, detail: "chưa bật" });
  });

  it("no doctor.json → null — the machine simply has not run doctor yet", async () => {
    expect(await readDoctorFrom(dir)).toBeNull();
  });

  it("corrupt JSON → null, never a throw to the UI", async () => {
    await fs.writeFile(path.join(dir, "doctor.json"), "{half");
    expect(await readDoctorFrom(dir)).toBeNull();
  });

  it("malformed check entries are dropped, valid ones survive", async () => {
    await fs.writeFile(
      path.join(dir, "doctor.json"),
      JSON.stringify({
        checked_at: "2026-08-18T09:30:00Z",
        ok: true,
        paused: false,
        checks: [{ id: "pat", ok: true, detail: "ok" }, { bogus: 1 }, "junk", null],
      }),
    );
    const doc = await readDoctorFrom(dir);
    expect(doc!.checks).toEqual([{ id: "pat", ok: true, detail: "ok" }]);
  });
});

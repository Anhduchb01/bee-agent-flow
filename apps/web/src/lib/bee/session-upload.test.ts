import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveUploadToSession } from "./session-ctl";

const ID = "ab000000-0000-4000-8000-000000000001";

let dir = "";

describe("saveUploadToSession — chat attachments into the worktree", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-upload-"));
    process.env.BEE_SRV = dir;
    process.env.BEE_SOURCE = "disk";
    await fs.mkdir(path.join(dir, "work", ID), { recursive: true });
  });
  afterEach(async () => {
    delete process.env.BEE_SRV;
    delete process.env.BEE_SOURCE;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes the file under .bee/uploads/ and returns its worktree-relative path", async () => {
    const ket = await saveUploadToSession(ID, "bug screen.png", new Uint8Array([1, 2, 3]));
    expect(ket.ok).toBe(true);
    if (!ket.ok) return;
    expect(ket.relPath).toMatch(/^\.bee\/uploads\/\d+-bug_screen\.png$/);
    const content = await fs.readFile(path.join(dir, "work", ID, ket.relPath));
    expect([...content]).toEqual([1, 2, 3]);
  });

  it("a hostile filename cannot escape the uploads dir", async () => {
    const ket = await saveUploadToSession(ID, "../../../../etc/passwd", new Uint8Array([1]));
    expect(ket.ok).toBe(true);
    if (!ket.ok) return;
    // Sanitized to underscores and pinned behind the timestamp prefix.
    expect(ket.relPath).toMatch(/^\.bee\/uploads\/\d+-[A-Za-z0-9._-]+$/);
    expect(ket.relPath).not.toContain("/../");
    const files = await fs.readdir(path.join(dir, "work", ID, ".bee", "uploads"));
    expect(files).toHaveLength(1);
  });

  it("refuses: bad id, empty file, oversized file, session without worktree", async () => {
    expect((await saveUploadToSession("not-a-uuid", "a.png", new Uint8Array([1]))).ok).toBe(false);
    expect((await saveUploadToSession(ID, "a.png", new Uint8Array())).ok).toBe(false);
    const qua = new Uint8Array(20 * 1024 * 1024 + 1);
    expect((await saveUploadToSession(ID, "a.png", qua)).ok).toBe(false);
    await fs.rm(path.join(dir, "work", ID), { recursive: true });
    const ket = await saveUploadToSession(ID, "a.png", new Uint8Array([1]));
    expect(ket).toEqual({ ok: false, message: "This session has no worktree to attach files to." });
  });

  it("fixture mode pretends success so the UI slice runs without a machine", async () => {
    process.env.BEE_SOURCE = "fixture";
    const ket = await saveUploadToSession(ID, "a.png", new Uint8Array([1]));
    expect(ket.ok).toBe(true);
    if (!ket.ok) return;
    expect(ket.relPath).toMatch(/^\.bee\/uploads\//);
  });
});

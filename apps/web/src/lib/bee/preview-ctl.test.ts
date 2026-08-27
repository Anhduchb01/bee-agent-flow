import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listPreviews, stopPreview } from "./machine-ctl";
import { readPreviewIn } from "./sessions-fs";

const ID = "aa110000-0000-4000-8000-000000000001";

let dir = "";

async function seedSession(previewLine: string | null) {
  const sessionDir = path.join(dir, "sessions", ID);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, "session.json"),
    JSON.stringify({ id: ID, slug: "myapp", num: 5, repo: "you/myapp", worktree: true }),
  );
  const line = [
    JSON.stringify({ type: "bee_lifecycle", text: "started" }),
    ...(previewLine === null ? [] : [previewLine]),
  ];
  await fs.writeFile(path.join(sessionDir, "run.jsonl"), line.join("\n"));
}

const PREVIEW_LINE = JSON.stringify({
  type: "bee_preview",
  unit: "bee-preview-myapp-5",
  url: "https://ducba.example.ts.net:3405",
  port: 3405,
  ts: "2026-08-20T10:00:00Z",
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-preview-"));
  process.env.BEE_SRV = dir;
  process.env.BEE_SOURCE = "disk";
});
afterEach(async () => {
  delete process.env.BEE_SRV;
  delete process.env.BEE_SOURCE;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("readPreviewIn", () => {
  it("reads the LAST bee_preview line; dirty unit names are dropped", async () => {
    await seedSession(PREVIEW_LINE);
    const p = await readPreviewIn(dir, ID);
    expect(p).toEqual({
      sessionId: ID,
      unit: "bee-preview-myapp-5",
      url: "https://ducba.example.ts.net:3405",
      port: 3405,
      ts: "2026-08-20T10:00:00Z",
    });

    await seedSession(
      JSON.stringify({ type: "bee_preview", unit: "evil; rm -rf /", url: "https://x", port: 1 }),
    );
    expect(await readPreviewIn(dir, ID)).toBeNull();
  });
});

describe("listPreviews", () => {
  it("keeps only previews whose unit is still active", async () => {
    await seedSession(PREVIEW_LINE);
    const song = vi.fn(async () => ({ stdout: "active" }));
    const outcome = await listPreviews({ runCtl: song });
    expect(outcome).toHaveLength(1);
    expect(outcome[0]).toMatchObject({ slug: "myapp", unit: "bee-preview-myapp-5", port: 3405 });
    expect(song).toHaveBeenCalledWith("systemctl", [
      "--user",
      "is-active",
      "bee-preview-myapp-5.service",
    ]);

    const throws = vi.fn(async () => {
      throw new Error("inactive");
    });
    expect(await listPreviews({ runCtl: throws })).toEqual([]);
  });
});

describe("stopPreview", () => {
  it("stops the unit and releases the tailscale serve port", async () => {
    const runCtl = vi.fn(async () => ({ stdout: "" }));
    const outcome = await stopPreview("bee-preview-myapp-5", 3405, { runCtl });
    expect(outcome.ok).toBe(true);
    expect(runCtl.mock.calls).toEqual([
      ["systemctl", ["--user", "stop", "bee-preview-myapp-5.service"]],
      ["tailscale", ["serve", "--https=3405", "off"]],
    ]);
  });

  it("dirty unit or port never reaches argv", async () => {
    const runCtl = vi.fn();
    expect((await stopPreview("bee-session@x", 3405, { runCtl })).ok).toBe(false);
    expect((await stopPreview("bee-preview-myapp-5", 80, { runCtl })).ok).toBe(false);
    expect(runCtl).not.toHaveBeenCalled();
  });
});

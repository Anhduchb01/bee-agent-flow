import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { docGcTrong } from "./gc-fs";

let dir = "";

const GC = {
  ts: "2026-08-24T15:00:00Z",
  removed: 5,
  freed_bytes: 1_932_735_283,
  age_hours: 24,
  items: [
    { id: "a", action: "removed", reason: "đã push hết lên origin/bee/x-5", bytes: 943_718_400 },
    { id: "b", action: "kept", reason: "mới kết thúc 12 phút trước (< 24h)", bytes: 0 },
  ],
};

describe("docGcTrong — gc.json is disk state the UI must render honestly", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-gc-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads the last run: what went, what stayed, and why", async () => {
    await fs.writeFile(path.join(dir, "gc.json"), JSON.stringify(GC));
    const gc = await docGcTrong(dir);

    expect(gc).not.toBeNull();
    expect(gc?.removed).toBe(5);
    expect(gc?.freed_bytes).toBe(1_932_735_283);
    // The kept reasons are the whole point: a disk that stays full must be
    // explainable without opening a terminal.
    expect(gc?.items.find((i) => i.action === "kept")?.reason).toMatch(/< 24h/);
  });

  it("never ran → null, which is a state the UI shows, not an error", async () => {
    expect(await docGcTrong(dir)).toBeNull();
  });

  it("malformed json → null instead of throwing into a server component", async () => {
    await fs.writeFile(path.join(dir, "gc.json"), "{ this is not json");
    expect(await docGcTrong(dir)).toBeNull();
  });

  it("drops items that do not have the shape, keeps the rest", async () => {
    await fs.writeFile(
      path.join(dir, "gc.json"),
      JSON.stringify({ ...GC, items: [...GC.items, { id: 1 }, null, { action: "removed" }] }),
    );
    const gc = await docGcTrong(dir);
    expect(gc?.items).toHaveLength(2);
  });

  it("missing numbers degrade to 0 rather than rendering NaN", async () => {
    await fs.writeFile(path.join(dir, "gc.json"), JSON.stringify({ ts: "t", items: [] }));
    const gc = await docGcTrong(dir);
    expect(gc).toMatchObject({ removed: 0, freed_bytes: 0 });
  });
});

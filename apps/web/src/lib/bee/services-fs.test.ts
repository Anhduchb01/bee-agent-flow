import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { docPool, readSessionSliceFrom, readSlicesFrom } from "./services-fs";

let dir = "";

async function ghiLat(id: string, body: unknown) {
  await fs.mkdir(path.join(dir, "sessions", id), { recursive: true });
  await fs.writeFile(path.join(dir, "sessions", id, "services.json"), JSON.stringify(body));
}

const ID_A = "aa000000-0000-4000-8000-000000000001";
const ID_B = "bb000000-0000-4000-8000-000000000002";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-slices-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("docPool — whatever the script printed is untrusted shape", () => {
  it("keeps well-formed rows", () => {
    expect(docPool([{ service: "postgres", image: "postgres:16", kind: "postgres" }])).toEqual([
      { service: "postgres", image: "postgres:16", kind: "postgres" },
    ]);
  });

  it("an unrecognised image keeps an EMPTY kind — it must not be dropped", () => {
    // Dropping it would hide exactly the case the pool panel exists to warn
    // about: bee cannot place this image, so every session runs its own copy.
    expect(docPool([{ service: "blob", image: "acme/blob:2", kind: "" }])).toEqual([
      { service: "blob", image: "acme/blob:2", kind: "" },
    ]);
  });

  it("drops rows with no service name, and survives non-arrays", () => {
    expect(docPool([{ image: "postgres:16" }, null, 7])).toEqual([]);
    expect(docPool({ nope: true })).toEqual([]);
    expect(docPool(null)).toEqual([]);
  });
});

describe("readSessionSliceFrom", () => {
  it("reads a slice and its items", async () => {
    await ghiLat(ID_A, {
      slice: "bee_aa000000",
      at: "2026-08-26T10:00:00Z",
      items: [
        { service: "db", image: "postgres:16", kind: "postgres", in_pool: true, pool_service: "postgres", slice: "bee_aa000000" },
        { service: "cache", image: "redis:7", kind: "redis", in_pool: false },
      ],
    });
    const lat = await readSessionSliceFrom(dir, ID_A);
    expect(lat?.slice).toBe("bee_aa000000");
    expect(lat?.items.map((i) => i.in_pool)).toEqual([true, false]);
  });

  it("never carries the password out of the file", async () => {
    // Nothing on a web page needs it, and a value that never leaves disk
    // cannot leak through a screenshot or a shared link.
    await ghiLat(ID_A, {
      slice: "bee_aa000000",
      at: "t",
      items: [{ service: "db", image: "postgres:16", kind: "postgres", in_pool: true, password: "hunter2" }],
    });
    const lat = await readSessionSliceFrom(dir, ID_A);
    expect(JSON.stringify(lat)).not.toContain("hunter2");
  });

  it("a dirty session id is refused before touching the filesystem", async () => {
    expect(await readSessionSliceFrom(dir, "../../etc/passwd")).toBeNull();
  });

  it("missing or corrupt file → null, never a throw", async () => {
    expect(await readSessionSliceFrom(dir, ID_A)).toBeNull();
    await fs.mkdir(path.join(dir, "sessions", ID_B), { recursive: true });
    await fs.writeFile(path.join(dir, "sessions", ID_B, "services.json"), "{ not json");
    expect(await readSessionSliceFrom(dir, ID_B)).toBeNull();
  });
});

describe("readSlicesFrom", () => {
  it("lists every held slice, newest first", async () => {
    await ghiLat(ID_A, { slice: "bee_aa000000", at: "2026-08-25T10:00:00Z", items: [] });
    await ghiLat(ID_B, { slice: "bee_bb000000", at: "2026-08-26T10:00:00Z", items: [] });
    expect((await readSlicesFrom(dir)).map((s) => s.slice)).toEqual(["bee_bb000000", "bee_aa000000"]);
  });

  it("sessions without a slice are simply not listed", async () => {
    await fs.mkdir(path.join(dir, "sessions", ID_A), { recursive: true });
    expect(await readSlicesFrom(dir)).toEqual([]);
  });

  it("no sessions dir at all → empty, not an error", async () => {
    expect(await readSlicesFrom(path.join(dir, "khong-co"))).toEqual([]);
  });
});

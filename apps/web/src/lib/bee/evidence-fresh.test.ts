import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readEvidenceFileIn } from "./evidence-fs";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-ev-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/**
 * A re-recorded demo must not be served as the old one.
 *
 * Reported 27/08: the agent recorded a demo, the video had a scroll artifact,
 * the owner asked for it again — and the canvas kept showing the first take.
 * The node was right and the bytes on disk were right; the BROWSER was serving
 * a cached response, because the route sent `max-age=3600`.
 *
 * That header came from a true statement about the other evidence layout —
 * `<slug>/<num>/<sha>/` really is immutable, it is keyed by a commit. Session
 * evidence lives at `sessions/<id>/evidence/<name>` and is overwritten every
 * time a demo is re-recorded. One assumption, two layouts, and it silently
 * stopped holding for the one people actually look at.
 */
describe("evidence identity — a re-recorded file is a different file", () => {
  it("hands back something that changes when the bytes change", async () => {
    const evidence = path.join(dir, "sessions", "s1", "evidence");
    await fs.mkdir(evidence, { recursive: true });
    const file = path.join(evidence, "demo.webm");

    await fs.writeFile(file, "first take");
    const before = await readEvidenceFileIn(path.join(dir, "sessions"), [
      "s1",
      "evidence",
      "demo.webm",
    ]);

    // Same name, new content — exactly what re-recording does.
    await fs.writeFile(file, "second take, longer");
    const after = await readEvidenceFileIn(path.join(dir, "sessions"), [
      "s1",
      "evidence",
      "demo.webm",
    ]);

    expect(before?.etag).toBeTruthy();
    expect(after?.etag).toBeTruthy();
    expect(after!.etag).not.toBe(before!.etag);
  });

  it("the same untouched file keeps its identity — revalidation must stay cheap", async () => {
    const evidence = path.join(dir, "evidence", "myapp", "1", "abc");
    await fs.mkdir(evidence, { recursive: true });
    await fs.writeFile(path.join(evidence, "shot.png"), "bytes");

    const read = () =>
      readEvidenceFileIn(path.join(dir, "evidence"), ["myapp", "1", "abc", "shot.png"]);
    expect((await read())!.etag).toBe((await read())!.etag);
  });

  it("a missing file is still null, not an etag for nothing", async () => {
    expect(await readEvidenceFileIn(path.join(dir, "evidence"), ["nope.png"])).toBeNull();
  });
});

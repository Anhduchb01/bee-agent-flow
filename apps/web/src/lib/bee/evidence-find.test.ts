import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findEvidenceForArtifact } from "./sessions-fs";

const ID = "ef000000-0000-4000-8000-000000000001";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bee-evfind-"));
  const sdir = path.join(dir, "sessions", ID);
  await fs.mkdir(path.join(sdir, "evidence"), { recursive: true });
  await fs.writeFile(
    path.join(sdir, "session.json"),
    JSON.stringify({ id: ID, slug: "myapp", num: 3, repo: "you/myapp", worktree: true }),
  );
  await fs.writeFile(
    path.join(sdir, "run.jsonl"),
    [
      JSON.stringify({
        type: "bee_artifact",
        kind: "pr",
        url: "https://github.com/you/myapp/pull/12",
        number: 12,
        ts: "t",
        title: "Add export",
      }),
    ].join("\n"),
  );
  await fs.writeFile(path.join(sdir, "evidence", "demo-export.webm"), "fake");
  await fs.writeFile(path.join(sdir, "evidence", "shot-mobile.png"), "fake");
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("findEvidenceForArtifact — the review panel's evidence lookup", () => {
  it("finds the session that logged the PR and types its evidence files", async () => {
    const ket = await findEvidenceForArtifact(dir, "you/myapp", "pr", 12);
    expect(ket).not.toBeNull();
    expect(ket!.sessionId).toBe(ID);
    expect(ket!.files).toEqual([
      {
        name: "demo-export.webm",
        url: `/api/evidence/session/${ID}/demo-export.webm`,
        loai: "video",
      },
      {
        name: "shot-mobile.png",
        url: `/api/evidence/session/${ID}/shot-mobile.png`,
        loai: "image",
      },
    ]);
  });

  it("no session logged that artifact → null; wrong repo → null", async () => {
    expect(await findEvidenceForArtifact(dir, "you/myapp", "issue", 12)).toBeNull();
    expect(await findEvidenceForArtifact(dir, "someone/else", "pr", 12)).toBeNull();
  });
});

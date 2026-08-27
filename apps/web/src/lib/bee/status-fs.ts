import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { listReposIn } from "./sessions-fs";
import type { StatusRead } from "./types";

/**
 * System status, built from what the runner ACTUALLY writes.
 *
 * Until 27/08 this came from `public/status.json`, a file only the reconciler
 * ever wrote — so on a runner-only machine the health banner said "No data
 * from the runner yet" forever, and nothing was wrong. The runner's own
 * sources are:
 *
 *   - `heartbeat.json`  ← reaper, every tick: `{ts, sessions_running, reaped}`
 *   - `PAUSE`           ← the machine-wide kill switch, a file's existence
 *   - `repos.d/*.env`   ← the registered repos, same list doctor checks
 *
 * The three "not ok" outcomes are still outcomes, not exceptions: no file yet
 * (fresh install), unreadable, or malformed (caught mid-write). The dangerous
 * one is a heartbeat that is merely OLD — that reads ok here and is judged by
 * `deriveHealth`, because a dead runner has nothing red to show on its own.
 */
export async function readStatusIn(root: string): Promise<StatusRead> {
  let text: string;
  try {
    text = await fs.readFile(path.join(root, "heartbeat.json"), "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return err.code === "ENOENT"
      ? { ok: false, reason: "missing", detail: "heartbeat.json not found" }
      : { ok: false, reason: "unreadable", detail: err.message };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "malformed", detail: "heartbeat.json is not JSON" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "malformed", detail: "heartbeat.json is not an object" };
  }

  const hb = raw as Record<string, unknown>;
  // No `ts` means no age, and the age is the only thing this file is for.
  if (typeof hb.ts !== "string" || hb.ts === "") {
    return { ok: false, reason: "malformed", detail: "heartbeat.json has no ts" };
  }

  const paused = await fs
    .access(path.join(root, "PAUSE"))
    .then(() => true)
    .catch(() => false);

  const repos = await listReposIn(root);

  return {
    ok: true,
    dropped: await unreadableRepos(root, repos.length),
    status: {
      heartbeat: hb.ts,
      mode: paused ? "paused" : "running",
      running: typeof hb.sessions_running === "number" ? hb.sessions_running : 0,
      repos: repos.map((r) => ({ slug: r.slug, repo: r.repo })),
    },
  };
}

/**
 * How many `repos.d/*.env` files exist that `listReposIn` could not use.
 *
 * It skips a bad slug or a missing `REPO=` line without a word, which is the
 * right call for a list — but a project the owner registered and that then
 * simply never appears, with no clue why, is the kind of silence this system
 * is built to avoid. Counted here so the screen can say "1 dropped".
 *
 * Only `.env` files count: a README in that directory was never a repo.
 */
async function unreadableRepos(root: string, usable: number): Promise<number> {
  try {
    const files = await fs.readdir(path.join(root, "repos.d"));
    return Math.max(0, files.filter((f) => f.endsWith(".env")).length - usable);
  } catch {
    return 0;
  }
}

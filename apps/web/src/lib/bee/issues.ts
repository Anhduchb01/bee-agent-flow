import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ctl } from "./ctl";

/**
 * Issue list of a registered repo — the board's raw material.
 *
 * Same discipline as artifact-detail: allowlist regex before anything
 * reaches argv, the repo must be REGISTERED (repos.d) so `gh` only ever
 * runs against repos the owner signed up, and failures come back as data.
 *
 * GitHub is the truth for issues (architecture §"Ai giữ sự thật"); bee only
 * adds what GitHub cannot know — which session worked on which issue.
 */

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Hard ceiling per repo: a board is for reading, not for paging 5k issues. */
const GIOI_HAN = 100;
const TTL_MS = 60_000;

export interface BeeIssue {
  number: number;
  title: string;
  /** OPEN · CLOSED — GitHub's own states, kept uppercase like artifact-detail. */
  state: "OPEN" | "CLOSED";
  url: string;
  labels: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
}

type RunGh = (args: string[]) => Promise<{ stdout: string }>;

function isFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

async function isRegistered(repo: string): Promise<boolean> {
  try {
    const dir = path.join(root(), "repos.d");
    for (const f of await fs.readdir(dir)) {
      if (!f.endsWith(".env")) continue;
      const noiDung = await fs.readFile(path.join(dir, f), "utf8");
      if (/^REPO=(.+)$/m.exec(noiDung)?.[1]?.trim() === repo) return true;
    }
  } catch {
    // No repos.d → nothing is registered.
  }
  return false;
}

function chuoi(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function ten(v: unknown, khoa: "name" | "login"): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => chuoi(((x ?? {}) as Record<string, unknown>)[khoa]))
    .filter((s) => s !== "");
}

/** gh's JSON rows are untrusted input like any other external data. */
function docIssue(raw: unknown): BeeIssue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const number = o.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return null;
  const url = chuoi(o.url);
  if (!url.startsWith("https://github.com/")) return null;
  return {
    number,
    title: chuoi(o.title, `#${number}`).slice(0, 200),
    state: chuoi(o.state).toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN",
    url,
    labels: ten(o.labels, "name"),
    assignees: ten(o.assignees, "login"),
    createdAt: chuoi(o.createdAt),
    updatedAt: chuoi(o.updatedAt),
  };
}

const FIXTURE: Record<string, BeeIssue[]> = {
  "you/myapp": [
    {
      number: 41,
      title: "Add CSV export to the report screen",
      state: "OPEN",
      url: "https://github.com/you/myapp/issues/41",
      labels: ["enhancement"],
      assignees: [],
      createdAt: "2026-08-17T09:55:00Z",
      updatedAt: "2026-08-17T10:02:00Z",
    },
    {
      number: 40,
      title: "Legal pages share one layout",
      state: "CLOSED",
      url: "https://github.com/you/myapp/issues/40",
      labels: [],
      assignees: [],
      createdAt: "2026-08-13T08:40:00Z",
      updatedAt: "2026-08-13T09:20:00Z",
    },
    {
      number: 39,
      title: "Report filters lose state on reload",
      state: "OPEN",
      url: "https://github.com/you/myapp/issues/39",
      labels: ["bug"],
      assignees: [],
      createdAt: "2026-08-12T07:00:00Z",
      updatedAt: "2026-08-12T07:00:00Z",
    },
  ],
  "you/blog": [
    {
      number: 7,
      title: "Fix RSS feed encoding",
      state: "OPEN",
      url: "https://github.com/you/blog/issues/7",
      labels: ["bug"],
      assignees: [],
      createdAt: "2026-08-16T21:00:00Z",
      updatedAt: "2026-08-16T23:41:00Z",
    },
  ],
};

/** The reason lives INSIDE the cache: reading short and then going quiet
 *  60 seconds later means the cache itself is lying. */
const cache = new Map<string, { luc: number; issues: BeeIssue[]; loi: string | null }>();

/** Test hook — the cache is per-process and bee-web is long-lived. */
export function resetIssuesCache(): void {
  cache.clear();
}

/**
 * Issues of one repo. Never throws: an unreachable `gh`, an expired PAT or
 * an unregistered repo all come back as an empty list plus a reason, so one
 * broken repo cannot blank the whole board.
 */
export async function fetchRepoIssues(
  repo: string,
  opts?: { runGh?: RunGh; now?: () => number },
): Promise<{ issues: BeeIssue[]; loi: string | null }> {
  if (!REPO_RE.test(repo)) return { issues: [], loi: "Invalid repository." };
  if (isFixture()) return { issues: FIXTURE[repo] ?? [], loi: null };

  const now = opts?.now ?? Date.now;
  const cu = cache.get(repo);
  if (cu !== undefined && now() - cu.luc < TTL_MS) return { issues: cu.issues, loi: cu.loi };

  if (!(await isRegistered(repo))) {
    return { issues: [], loi: `${repo} is not a registered repo on this machine.` };
  }

  const runGh = opts?.runGh ?? ((args: string[]) => ctl("gh", args));
  try {
    const { stdout } = await runGh([
      "issue",
      "list",
      "-R",
      repo,
      "--state",
      "all",
      "--limit",
      String(GIOI_HAN),
      "--json",
      "number,title,state,url,labels,assignees,createdAt,updatedAt",
    ]);
    const raw: unknown = JSON.parse(stdout);
    // gh exited 0 but did not answer with a list: an empty board here would
    // look exactly like "this repo has no issues", which is a different fact.
    if (!Array.isArray(raw)) {
      return { issues: [], loi: `${repo}: gh answered with something that is not an issue list.` };
    }
    const doc = raw.map(docIssue);
    const issues = doc
      .filter((i): i is BeeIssue => i !== null)
      .sort((a, b) => b.number - a.number);
    // Malformed rows are still DROPPED — we do not trust gh's output shape —
    // but how many were dropped has to be said. If gh changes its JSON, an
    // empty board is the only symptom, and a silent empty board reads exactly
    // like "this repo has no issues yet".
    const bo = doc.length - issues.length;
    const loi =
      bo === 0 ? null : `${repo}: skipped ${bo} of ${doc.length} rows gh returned — they did not look like issues.`;
    cache.set(repo, { luc: now(), issues, loi });
    return { issues, loi };
  } catch (e) {
    return { issues: [], loi: `Could not read issues of ${repo}: ${(e as Error).message}` };
  }
}

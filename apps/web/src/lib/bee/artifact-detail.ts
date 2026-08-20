import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Issue/PR detail for the in-app viewer. Same discipline as machine-ctl:
 * allowlist regex before anything reaches argv, the repo must be one the
 * machine has REGISTERED (repos.d) — a run.jsonl line can name any URL,
 * but `gh` only ever runs against repos the owner signed up — and
 * failures come back as data.
 */

const run = promisify(execFile);

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface BeeArtifactComment {
  author: string;
  createdAt: string;
  body: string;
}

export interface BeeArtifactDetail {
  kind: "issue" | "pr";
  number: number;
  url: string;
  title: string;
  /** OPEN · CLOSED · MERGED — GitHub's uppercase states, shown as-is. */
  state: string;
  body: string;
  author: string;
  createdAt: string;
  labels: string[];
  comments: BeeArtifactComment[];
  pr: {
    draft: boolean;
    base: string;
    head: string;
    additions: number;
    deletions: number;
    changedFiles: number;
    checks: "pass" | "fail" | "pending" | null;
  } | null;
}

export type KetQuaArtifact =
  | { ok: true; detail: BeeArtifactDetail }
  | { ok: false; message: string };

type RunGh = (args: string[]) => Promise<{ stdout: string }>;

function isFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

/** The repo must be registered in repos.d — the same list doctor verifies. */
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

function so(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function docComments(v: unknown): BeeArtifactComment[] {
  if (!Array.isArray(v)) return [];
  return v.slice(-20).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const author = (o.author ?? {}) as Record<string, unknown>;
    return {
      author: chuoi(author.login, "unknown"),
      createdAt: chuoi(o.createdAt),
      body: chuoi(o.body),
    };
  });
}

function docLabels(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((l) => chuoi(((l ?? {}) as Record<string, unknown>).name))
    .filter((n) => n !== "");
}

/** Fold GitHub's per-check rollup into one verdict: fail > pending > pass. */
function docChecks(v: unknown): "pass" | "fail" | "pending" | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  let pending = false;
  for (const c of v) {
    const o = (c ?? {}) as Record<string, unknown>;
    const state = `${chuoi(o.conclusion)}${chuoi(o.state)}`.toUpperCase();
    if (/FAILURE|ERROR|TIMED_OUT|CANCELLED|ACTION_REQUIRED/.test(state)) return "fail";
    if (!/SUCCESS|NEUTRAL|SKIPPED|COMPLETED/.test(state) || state === "") pending = true;
  }
  return pending ? "pending" : "pass";
}

const FIXTURE_DETAIL: BeeArtifactDetail = {
  kind: "pr",
  number: 12,
  url: "https://github.com/you/myapp/pull/12",
  title: "Add CSV export to the report screen",
  state: "OPEN",
  body: "## Summary\nCSV export behind the existing report filter.\n\n## Snapshots\nSee `.bee/evidence/`.",
  author: "bee-agent",
  createdAt: "2026-08-19T09:00:00Z",
  labels: ["enhancement"],
  comments: [
    {
      author: "pm-linh",
      createdAt: "2026-08-19T10:00:00Z",
      body: "Looks good — please add a header row.",
    },
  ],
  pr: {
    draft: true,
    base: "main",
    head: "bee/myapp-41",
    additions: 120,
    deletions: 8,
    changedFiles: 6,
    checks: "pass",
  },
};

export async function fetchArtifactDetail(
  repo: string,
  kind: "issue" | "pr",
  number: number,
  opts?: { runGh?: RunGh },
): Promise<KetQuaArtifact> {
  if (!REPO_RE.test(repo)) return { ok: false, message: "Invalid repository." };
  if (kind !== "issue" && kind !== "pr") return { ok: false, message: "Invalid kind." };
  if (!Number.isInteger(number) || number <= 0) return { ok: false, message: "Invalid number." };

  if (isFixture()) return { ok: true, detail: { ...FIXTURE_DETAIL, kind, number } };

  if (!(await isRegistered(repo))) {
    return { ok: false, message: `${repo} is not a registered repo on this machine.` };
  }

  const runGh = opts?.runGh ?? ((args: string[]) => run("gh", args));
  const chung = "number,title,state,body,author,createdAt,url,labels,comments";
  const args =
    kind === "issue"
      ? ["issue", "view", String(number), "-R", repo, "--json", chung]
      : [
          "pr",
          "view",
          String(number),
          "-R",
          repo,
          "--json",
          `${chung},isDraft,baseRefName,headRefName,additions,deletions,changedFiles,statusCheckRollup`,
        ];

  let goc: Record<string, unknown>;
  try {
    const { stdout } = await runGh(args);
    goc = JSON.parse(stdout) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, message: `Could not load ${kind} #${number}: ${(e as Error).message}` };
  }

  const author = (goc.author ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    detail: {
      kind,
      number: so(goc.number) || number,
      url: chuoi(goc.url),
      title: chuoi(goc.title, `${kind} #${number}`),
      state: chuoi(goc.state, "OPEN"),
      body: chuoi(goc.body),
      author: chuoi(author.login, "unknown"),
      createdAt: chuoi(goc.createdAt),
      labels: docLabels(goc.labels),
      comments: docComments(goc.comments),
      pr:
        kind === "pr"
          ? {
              draft: goc.isDraft === true,
              base: chuoi(goc.baseRefName),
              head: chuoi(goc.headRefName),
              additions: so(goc.additions),
              deletions: so(goc.deletions),
              changedFiles: so(goc.changedFiles),
              checks: docChecks(goc.statusCheckRollup),
            }
          : null,
    },
  };
}

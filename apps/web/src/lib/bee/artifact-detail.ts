import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ctl } from "./ctl";

/**
 * Issue/PR detail for the in-app viewer. Same discipline as machine-ctl:
 * allowlist regex before anything reaches argv, the repo must be one the
 * machine has REGISTERED (repos.d) — a run.jsonl line can name any URL,
 * but `gh` only ever runs against repos the owner signed up — and
 * failures come back as data.
 */

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

export type ArtifactResult =
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
      const content = await fs.readFile(path.join(dir, f), "utf8");
      if (/^REPO=(.+)$/m.exec(content)?.[1]?.trim() === repo) return true;
    }
  } catch {
    // No repos.d → nothing is registered.
  }
  return false;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function readComments(v: unknown): BeeArtifactComment[] {
  if (!Array.isArray(v)) return [];
  return v.slice(-20).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const author = (o.author ?? {}) as Record<string, unknown>;
    return {
      author: str(author.login, "unknown"),
      createdAt: str(o.createdAt),
      body: str(o.body),
    };
  });
}

function readLabels(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((l) => str(((l ?? {}) as Record<string, unknown>).name))
    .filter((n) => n !== "");
}

/** Fold GitHub's per-check rollup into one verdict: fail > pending > pass. */
function readChecks(v: unknown): "pass" | "fail" | "pending" | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  let pending = false;
  for (const c of v) {
    const o = (c ?? {}) as Record<string, unknown>;
    const state = `${str(o.conclusion)}${str(o.state)}`.toUpperCase();
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

// The doomed-call memo and a short TTL cache. Both are per-process, which
// is exactly the lifetime we want: bee-web is one long-lived server.
// - patKhongDocDuocChecks: once GraphQL refused statusCheckRollup for this
//   PAT, every later PR fetch skips that call instead of re-failing it.
// - cache: reopening the same panel within TTL_MS is instant; 60s is
//   short enough that a merged/closed state never looks stale for long.
let patKhongDocDuocChecks = false;
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; detail: BeeArtifactDetail }>();

/** Test hook — resets the memo and cache between cases. */
export function resetArtifactDetailCache(): void {
  patKhongDocDuocChecks = false;
  cache.clear();
}

export async function fetchArtifactDetail(
  repo: string,
  kind: "issue" | "pr",
  number: number,
  opts?: { runGh?: RunGh; now?: () => number },
): Promise<ArtifactResult> {
  if (!REPO_RE.test(repo)) return { ok: false, message: "Invalid repository." };
  if (kind !== "issue" && kind !== "pr") return { ok: false, message: "Invalid kind." };
  if (!Number.isInteger(number) || number <= 0) return { ok: false, message: "Invalid number." };

  if (isFixture()) return { ok: true, detail: { ...FIXTURE_DETAIL, kind, number } };

  if (!(await isRegistered(repo))) {
    return { ok: false, message: `${repo} is not a registered repo on this machine.` };
  }

  const now = opts?.now ?? Date.now;
  const key = `${repo}#${kind}#${number}`;
  const cu = cache.get(key);
  if (cu !== undefined && now() - cu.at < TTL_MS) return { ok: true, detail: cu.detail };

  const runGh = opts?.runGh ?? ((args: string[]) => ctl("gh", args));
  const chung = "number,title,state,body,author,createdAt,url,labels,comments";
  const prFields = `${chung},isDraft,baseRefName,headRefName,headRefOid,additions,deletions,changedFiles`;
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
          patKhongDocDuocChecks ? prFields : `${prFields},statusCheckRollup`,
        ];

  // Personal fine-grained PATs cannot read GitHub Actions check RUNS
  // (no "Checks" permission in the UI), which kills the whole GraphQL
  // query. Fallback: refetch without the field, then take the verdict
  // from the commit-status REST API — that one only needs
  // "Commit statuses: read" and covers deploy checks like Vercel.
  async function readStatusRest(baseDir: Record<string, unknown>): Promise<"pass" | "fail" | "pending" | null> {
    const sha = str(baseDir.headRefOid);
    if (!/^[0-9a-f]{40}$/.test(sha)) return null;
    try {
      const { stdout } = await runGh(["api", `repos/${repo}/commits/${sha}/status`]);
      const st = JSON.parse(stdout) as Record<string, unknown>;
      if (count(st.total_count) === 0) return null;
      const state = str(st.state);
      return state === "success" ? "pass" : state === "pending" ? "pending" : "fail";
    } catch {
      return null; // status API refused too — show no verdict
    }
  }

  let baseDir: Record<string, unknown>;
  let checksThayThe: "pass" | "fail" | "pending" | null | undefined;
  try {
    const { stdout } = await runGh(args);
    baseDir = JSON.parse(stdout) as Record<string, unknown>;
    // Memoized skip: the rollup field never ran, get the verdict via REST.
    if (kind === "pr" && patKhongDocDuocChecks) checksThayThe = await readStatusRest(baseDir);
  } catch (e) {
    const msg = (e as Error).message;
    if (kind === "pr" && /not accessible by personal access token/i.test(msg)) {
      patKhongDocDuocChecks = true; // remember — stop paying for this call
      try {
        const { stdout } = await runGh([
          "pr", "view", String(number), "-R", repo, "--json", prFields,
        ]);
        baseDir = JSON.parse(stdout) as Record<string, unknown>;
      } catch (e2) {
        return { ok: false, message: `Could not load pr #${number}: ${(e2 as Error).message}` };
      }
      checksThayThe = await readStatusRest(baseDir);
    } else {
      return { ok: false, message: `Could not load ${kind} #${number}: ${msg}` };
    }
  }

  const author = (baseDir.author ?? {}) as Record<string, unknown>;
  const detail: BeeArtifactDetail = {
    kind,
    number: count(baseDir.number) || number,
    url: str(baseDir.url),
    title: str(baseDir.title, `${kind} #${number}`),
    state: str(baseDir.state, "OPEN"),
    body: str(baseDir.body),
    author: str(author.login, "unknown"),
    createdAt: str(baseDir.createdAt),
    labels: readLabels(baseDir.labels),
    comments: readComments(baseDir.comments),
    pr:
      kind === "pr"
        ? {
            draft: baseDir.isDraft === true,
            base: str(baseDir.baseRefName),
            head: str(baseDir.headRefName),
            additions: count(baseDir.additions),
            deletions: count(baseDir.deletions),
            changedFiles: count(baseDir.changedFiles),
            checks:
              checksThayThe !== undefined ? checksThayThe : readChecks(baseDir.statusCheckRollup),
          }
        : null,
  };
  cache.set(key, { at: now(), detail });
  return { ok: true, detail };
}

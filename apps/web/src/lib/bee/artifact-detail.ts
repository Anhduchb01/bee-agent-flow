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

// The doomed-call memo and a short TTL cache. Both are per-process, which
// is exactly the lifetime we want: bee-web is one long-lived server.
// - patKhongDocDuocChecks: once GraphQL refused statusCheckRollup for this
//   PAT, every later PR fetch skips that call instead of re-failing it.
// - cache: reopening the same panel within TTL_MS is instant; 60s is
//   short enough that a merged/closed state never looks stale for long.
let patKhongDocDuocChecks = false;
const TTL_MS = 60_000;
const cache = new Map<string, { luc: number; detail: BeeArtifactDetail }>();

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
): Promise<KetQuaArtifact> {
  if (!REPO_RE.test(repo)) return { ok: false, message: "Invalid repository." };
  if (kind !== "issue" && kind !== "pr") return { ok: false, message: "Invalid kind." };
  if (!Number.isInteger(number) || number <= 0) return { ok: false, message: "Invalid number." };

  if (isFixture()) return { ok: true, detail: { ...FIXTURE_DETAIL, kind, number } };

  if (!(await isRegistered(repo))) {
    return { ok: false, message: `${repo} is not a registered repo on this machine.` };
  }

  const now = opts?.now ?? Date.now;
  const khoa = `${repo}#${kind}#${number}`;
  const cu = cache.get(khoa);
  if (cu !== undefined && now() - cu.luc < TTL_MS) return { ok: true, detail: cu.detail };

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
  async function docStatusRest(goc: Record<string, unknown>): Promise<"pass" | "fail" | "pending" | null> {
    const sha = chuoi(goc.headRefOid);
    if (!/^[0-9a-f]{40}$/.test(sha)) return null;
    try {
      const { stdout } = await runGh(["api", `repos/${repo}/commits/${sha}/status`]);
      const st = JSON.parse(stdout) as Record<string, unknown>;
      if (so(st.total_count) === 0) return null;
      const state = chuoi(st.state);
      return state === "success" ? "pass" : state === "pending" ? "pending" : "fail";
    } catch {
      return null; // status API refused too — show no verdict
    }
  }

  let goc: Record<string, unknown>;
  let checksThayThe: "pass" | "fail" | "pending" | null | undefined;
  try {
    const { stdout } = await runGh(args);
    goc = JSON.parse(stdout) as Record<string, unknown>;
    // Memoized skip: the rollup field never ran, get the verdict via REST.
    if (kind === "pr" && patKhongDocDuocChecks) checksThayThe = await docStatusRest(goc);
  } catch (e) {
    const msg = (e as Error).message;
    if (kind === "pr" && /not accessible by personal access token/i.test(msg)) {
      patKhongDocDuocChecks = true; // remember — stop paying for this call
      try {
        const { stdout } = await runGh([
          "pr", "view", String(number), "-R", repo, "--json", prFields,
        ]);
        goc = JSON.parse(stdout) as Record<string, unknown>;
      } catch (e2) {
        return { ok: false, message: `Could not load pr #${number}: ${(e2 as Error).message}` };
      }
      checksThayThe = await docStatusRest(goc);
    } else {
      return { ok: false, message: `Could not load ${kind} #${number}: ${msg}` };
    }
  }

  const author = (goc.author ?? {}) as Record<string, unknown>;
  const detail: BeeArtifactDetail = {
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
            checks:
              checksThayThe !== undefined ? checksThayThe : docChecks(goc.statusCheckRollup),
          }
        : null,
  };
  cache.set(khoa, { luc: now(), detail });
  return { ok: true, detail };
}

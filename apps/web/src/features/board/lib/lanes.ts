import type { BeeIssue } from "@/lib/bee/issues";
import type { BeeArtifact, BeeSession } from "@/lib/bee/types";

/**
 * Pure board logic: which session is working on which issue, and which lane
 * an issue sits in. No I/O — the board's whole meaning is testable from
 * fixtures, the way parse-events is.
 */

/** The four lanes ARE the bee lifecycle, not a generic todo board. */
export const CAC_LANE = ["backlog", "working", "review", "done"] as const;
export type Lane = (typeof CAC_LANE)[number];

export const NHAN_LANE: Record<Lane, string> = {
  backlog: "Backlog",
  working: "In session",
  review: "In review",
  done: "Done",
};

export const MOTA_LANE: Record<Lane, string> = {
  backlog: "No session has picked it up",
  working: "A session is running on it",
  review: "PR open, waiting for you",
  done: "Closed on GitHub",
};

/** One session that touched an issue — enough to render a row, no more. */
export interface PhienCuaIssue {
  id: string;
  title: string | null;
  branch: string;
  status: BeeSession["status"];
  needs_human: boolean;
}

export interface MucBang {
  issue: BeeIssue;
  /** Registered repo the issue belongs to. */
  slug: string;
  repo: string;
  /** Sessions that logged this issue, newest first. */
  phien: PhienCuaIssue[];
  /** PRs opened by those sessions — the "in review" signal. */
  pr: BeeArtifact[];
  lane: Lane;
}

function laPhien(p: BeeSession): PhienCuaIssue {
  return {
    id: p.id,
    title: p.title,
    branch: `bee/${p.slug}-${p.num}`,
    status: p.status,
    needs_human: p.needs_human,
  };
}

/**
 * Lane rules, in order — first match wins:
 *   closed on GitHub            → done
 *   a session is running        → working
 *   a session opened a PR       → review   (the ball is in the owner's court)
 *   a session ran but is over   → review only if it left a PR, else backlog
 *   nothing touched it          → backlog
 *
 * A finished session with no PR deliberately falls back to backlog: nothing
 * came out of it, so the issue really is unstarted work again.
 */
export function xepLane(
  issue: BeeIssue,
  phien: PhienCuaIssue[],
  pr: BeeArtifact[],
): Lane {
  if (issue.state === "CLOSED") return "done";
  if (phien.some((p) => p.status === "running" || p.status === "starting")) return "working";
  if (pr.length > 0) return "review";
  return "backlog";
}

/**
 * Join issues to the sessions that logged them. The link comes from
 * `bee_artifact` lines in run.jsonl — GitHub cannot know it, and it is the
 * one thing this board adds on top of GitHub's own issue list.
 */
export function ghepBang(
  repos: { slug: string; repo: string }[],
  issuesTheoRepo: Record<string, BeeIssue[]>,
  phien: BeeSession[],
  artifactsTheoPhien: Record<string, BeeArtifact[]>,
): MucBang[] {
  const ra: MucBang[] = [];

  for (const { slug, repo } of repos) {
    // Sessions of this repo, newest first — the order rows inherit.
    const phienCuaRepo = phien
      .filter((p) => p.repo === repo)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

    for (const issue of issuesTheoRepo[repo] ?? []) {
      const lienQuan = phienCuaRepo.filter((p) =>
        (artifactsTheoPhien[p.id] ?? []).some(
          (a) => a.kind === "issue" && a.number === issue.number,
        ),
      );
      const pr = lienQuan.flatMap((p) =>
        (artifactsTheoPhien[p.id] ?? []).filter((a) => a.kind === "pr"),
      );
      const dsPhien = lienQuan.map(laPhien);
      ra.push({
        issue,
        slug,
        repo,
        phien: dsPhien,
        pr,
        lane: xepLane(issue, dsPhien, pr),
      });
    }
  }

  return ra;
}

/** `p` from the URL. An unknown slug filters to nothing — better than lying by showing everything. */
export function locTheoDuAn(muc: MucBang[], slug: string | null): MucBang[] {
  return slug === null ? muc : muc.filter((m) => m.slug === slug);
}

export function nhomTheoLane(muc: MucBang[]): Record<Lane, MucBang[]> {
  const ra = { backlog: [], working: [], review: [], done: [] } as Record<Lane, MucBang[]>;
  for (const m of muc) ra[m.lane].push(m);
  return ra;
}

import type { BeeIssue } from "@/lib/bee/issues";
import type { BeeArtifact, BeeSession, Queue, QueueItem } from "@/lib/bee/types";

/**
 * Pure board logic: which session is working on which issue, and which lane
 * an issue sits in. No I/O — the board's whole meaning is testable from
 * fixtures, the way parse-events is.
 */

/** The four lanes ARE the bee lifecycle, not a generic todo board. */
export const LANES = ["backlog", "autopilot", "working", "review", "done"] as const;
export type Lane = (typeof LANES)[number];

export const LANE_LABEL: Record<Lane, string> = {
  backlog: "Backlog",
  autopilot: "Autopilot",
  working: "In session",
  review: "In review",
  done: "Done",
};

export const LANE_HINT: Record<Lane, string> = {
  backlog: "No session has picked it up",
  autopilot: "Queued — bee opens these in order",
  working: "A session is running on it",
  review: "PR open, waiting for you",
  done: "Closed on GitHub",
};

/** One session that touched an issue — enough to render a row, no more. */
export interface IssueSession {
  id: string;
  title: string | null;
  branch: string;
  status: BeeSession["status"];
  needs_human: boolean;
}

export interface BoardRow {
  issue: BeeIssue;
  /** Registered repo the issue belongs to. */
  slug: string;
  repo: string;
  /** Sessions that logged this issue, newest first. */
  session: IssueSession[];
  /** PRs opened by those sessions — the "in review" signal. */
  pr: BeeArtifact[];
  /** Mục trong hàng đợi Autopilot, `null` = chưa xếp hàng. */
  queue: QueueItem | null;
  lane: Lane;
}

function isSession(p: BeeSession): IssueSession {
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
export function laneOf(
  issue: BeeIssue,
  session: IssueSession[],
  pr: BeeArtifact[],
  daXepHang = false,
): Lane {
  if (issue.state === "CLOSED") return "done";
  if (session.some((p) => p.status === "running" || p.status === "starting")) return "working";
  if (pr.length > 0) return "review";
  // Xếp hàng là một TRẠNG THÁI (D4), nhưng đứng SAU mọi sự thật: một issue
  // vừa nằm trong hàng vừa có phiên đang chạy thì nó đang chạy, không phải
  // đang chờ. Ý định không được che sự thật.
  if (daXepHang) return "autopilot";
  return "backlog";
}

/**
 * Thả thẻ vào lane nào là hợp lệ (D4). Chỉ `Backlog ↔ Autopilot` — ba lane còn
 * lại là HỆ QUẢ của sự thật: thả thẻ vào "In session" không làm phiên chạy,
 * thả vào "Done" không đóng issue trên GitHub. Cho kéo vào đó là dạy người
 * dùng một lời nói dối, nên thả sai bị từ chối kèm lý do.
 */
export function isDropAllowed(since: Lane, until: Lane): { ok: boolean; reason: string } {
  if (since === until) return { ok: true, reason: "" };
  const allowed = new Set<Lane>(["backlog", "autopilot"]);
  if (allowed.has(since) && allowed.has(until)) return { ok: true, reason: "" };
  const vi: Record<Lane, string> = {
    backlog: "",
    autopilot: "",
    working: "whether a session is running is a fact — you cannot drag one into being",
    review: "this lane is decided by the PR, not by dragging",
    done: "an issue reaches Done by being closed on GitHub",
  };
  return { ok: false, reason: vi[until] !== "" ? vi[until] : vi[since] };
}

/**
 * Join issues to the sessions that logged them. The link comes from
 * `bee_artifact` lines in run.jsonl — GitHub cannot know it, and it is the
 * one thing this board adds on top of GitHub's own issue list.
 */
export function buildBoard(
  repos: { slug: string; repo: string }[],
  issuesByRepo: Record<string, BeeIssue[]>,
  session: BeeSession[],
  artifactsBySession: Record<string, BeeArtifact[]>,
  queue: Queue = { items: [], paused: false },
): BoardRow[] {
  const ra: BoardRow[] = [];

  for (const { slug, repo } of repos) {
    // Sessions of this repo, newest first — the order rows inherit.
    const sessionsOfRepo = session
      .filter((p) => p.repo === repo)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

    for (const issue of issuesByRepo[repo] ?? []) {
      const related = sessionsOfRepo.filter((p) =>
        (artifactsBySession[p.id] ?? []).some(
          (a) => a.kind === "issue" && a.number === issue.number,
        ),
      );
      const pr = related.flatMap((p) =>
        (artifactsBySession[p.id] ?? []).filter((a) => a.kind === "pr"),
      );
      const sessionList = related.map(isSession);
      const inQueue = queue.items.find(
        (v) => v.repo === repo && v.issue === issue.number,
      );
      ra.push({
        issue,
        slug,
        repo,
        session: sessionList,
        pr,
        queue: inQueue ?? null,
        lane: laneOf(issue, sessionList, pr, inQueue?.status === "waiting"),
      });
    }
  }

  return ra;
}

/** `p` from the URL. An unknown slug filters to nothing — better than lying by showing everything. */
export function filterByProject(row: BoardRow[], slug: string | null): BoardRow[] {
  return slug === null ? row : row.filter((m) => m.slug === slug);
}

export function groupByLane(row: BoardRow[]): Record<Lane, BoardRow[]> {
  const ra = { backlog: [], autopilot: [], working: [], review: [], done: [] } as Record<Lane, BoardRow[]>;
  for (const m of row) ra[m.lane].push(m);
  return ra;
}

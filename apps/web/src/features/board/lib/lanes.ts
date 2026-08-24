import type { BeeIssue } from "@/lib/bee/issues";
import type { BeeArtifact, BeeSession, HangDoi, ViecTrongHang } from "@/lib/bee/types";

/**
 * Pure board logic: which session is working on which issue, and which lane
 * an issue sits in. No I/O — the board's whole meaning is testable from
 * fixtures, the way parse-events is.
 */

/** The four lanes ARE the bee lifecycle, not a generic todo board. */
export const CAC_LANE = ["backlog", "autopilot", "working", "review", "done"] as const;
export type Lane = (typeof CAC_LANE)[number];

export const NHAN_LANE: Record<Lane, string> = {
  backlog: "Backlog",
  autopilot: "Autopilot",
  working: "In session",
  review: "In review",
  done: "Done",
};

export const MOTA_LANE: Record<Lane, string> = {
  backlog: "No session has picked it up",
  autopilot: "Queued — bee opens these in order",
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
  /** Mục trong hàng đợi Autopilot, `null` = chưa xếp hàng. */
  hangDoi: ViecTrongHang | null;
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
  daXepHang = false,
): Lane {
  if (issue.state === "CLOSED") return "done";
  if (phien.some((p) => p.status === "running" || p.status === "starting")) return "working";
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
export function laThaHopLe(tu: Lane, den: Lane): { ok: boolean; lyDo: string } {
  if (tu === den) return { ok: true, lyDo: "" };
  const duoc = new Set<Lane>(["backlog", "autopilot"]);
  if (duoc.has(tu) && duoc.has(den)) return { ok: true, lyDo: "" };
  const vi: Record<Lane, string> = {
    backlog: "",
    autopilot: "",
    working: "một phiên đang chạy hay không là sự thật, không kéo vào được",
    review: "lane này do PR quyết định, không do kéo thả",
    done: "issue đóng trên GitHub mới sang Done",
  };
  return { ok: false, lyDo: vi[den] !== "" ? vi[den] : vi[tu] };
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
  hangDoi: HangDoi = { items: [], paused: false },
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
      const trongHang = hangDoi.items.find(
        (v) => v.repo === repo && v.issue === issue.number,
      );
      ra.push({
        issue,
        slug,
        repo,
        phien: dsPhien,
        pr,
        hangDoi: trongHang ?? null,
        lane: xepLane(issue, dsPhien, pr, trongHang?.status === "waiting"),
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
  const ra = { backlog: [], autopilot: [], working: [], review: [], done: [] } as Record<Lane, MucBang[]>;
  for (const m of muc) ra[m.lane].push(m);
  return ra;
}

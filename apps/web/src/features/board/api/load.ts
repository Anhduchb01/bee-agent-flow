import "server-only";

import { getBee } from "@/lib/bee";
import { fetchRepoIssues, type BeeIssue } from "@/lib/bee/issues";
import { readQueue } from "@/lib/bee/queue-fs";
import type { BeeArtifact, Queue } from "@/lib/bee/types";

import { buildBoard, type BoardRow } from "../lib/lanes";

export interface BoardData {
  muc: BoardRow[];
  repos: { slug: string; repo: string }[];
  /** Hàng đợi Autopilot — lane thứ năm đọc từ đây (D4). */
  queue: Queue;
  /** Repos whose issue list could not be read — shown, never swallowed. */
  loi: { repo: string; message: string }[];
}

/**
 * The board = GitHub's issues joined to bee's sessions.
 *
 * Both fan-outs run in parallel and each is bounded by what the machine has
 * registered (repos.d) and by the session list — no unbounded traversal.
 * `gh` results are cached for 60s inside fetchRepoIssues, so refreshing the
 * page does not spawn a subprocess per repo every time.
 */
export async function loadBoard(): Promise<BoardData> {
  const bee = getBee();
  const [repos, phien, queue] = await Promise.all([
    bee.listRepos(),
    bee.listSessions(),
    readQueue(process.env.BEE_SRV ?? "/srv/bee"),
  ]);

  const [issueResults, artifactPairs] = await Promise.all([
    Promise.all(
      repos.map(async (r) => ({ repo: r.repo, ...(await fetchRepoIssues(r.repo)) })),
    ),
    // Only sessions with a repo can carry issue artifacts; chat sessions cannot.
    Promise.all(
      phien
        .filter((p) => p.repo !== "")
        .map(async (p) => [p.id, await bee.sessionArtifacts(p.id)] as const),
    ),
  ]);

  const issuesByRepo: Record<string, BeeIssue[]> = {};
  const loi: { repo: string; message: string }[] = [];
  for (const k of issueResults) {
    issuesByRepo[k.repo] = k.issues;
    if (k.loi !== null) loi.push({ repo: k.repo, message: k.loi });
  }

  const artifactsBySession: Record<string, BeeArtifact[]> = Object.fromEntries(artifactPairs);

  return {
    muc: buildBoard(repos, issuesByRepo, phien, artifactsBySession, queue),
    repos,
    queue,
    loi,
  };
}

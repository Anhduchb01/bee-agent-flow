import "server-only";

import { getBee } from "@/lib/bee";
import { fetchRepoIssues, type BeeIssue } from "@/lib/bee/issues";
import { docHangDoi } from "@/lib/bee/queue-fs";
import type { BeeArtifact, HangDoi } from "@/lib/bee/types";

import { ghepBang, type MucBang } from "../lib/lanes";

export interface DuLieuBang {
  muc: MucBang[];
  repos: { slug: string; repo: string }[];
  /** Hàng đợi Autopilot — lane thứ năm đọc từ đây (D4). */
  hangDoi: HangDoi;
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
export async function loadBoard(): Promise<DuLieuBang> {
  const bee = getBee();
  const [repos, phien, hangDoi] = await Promise.all([
    bee.listRepos(),
    bee.listSessions(),
    docHangDoi(process.env.BEE_SRV ?? "/srv/bee"),
  ]);

  const [ketQuaIssues, capArtifact] = await Promise.all([
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

  const issuesTheoRepo: Record<string, BeeIssue[]> = {};
  const loi: { repo: string; message: string }[] = [];
  for (const k of ketQuaIssues) {
    issuesTheoRepo[k.repo] = k.issues;
    if (k.loi !== null) loi.push({ repo: k.repo, message: k.loi });
  }

  const artifactsTheoPhien: Record<string, BeeArtifact[]> = Object.fromEntries(capArtifact);

  return {
    muc: ghepBang(repos, issuesTheoRepo, phien, artifactsTheoPhien, hangDoi),
    repos,
    hangDoi,
    loi,
  };
}

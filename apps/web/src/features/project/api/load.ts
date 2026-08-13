import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeRepo, BeeRunning } from "@/lib/bee/types";
import { getGithub } from "@/lib/github";
import type { GhTask } from "@/lib/github/types";

export interface ProjectView {
  slug: string;
  full: string;
  /** `null` khi repo có trên GitHub nhưng reconciler chưa biết tới nó. */
  repo: BeeRepo | null;
  running: BeeRunning[];
  tasks: GhTask[];
  prs: GhTask[];
}

export async function loadProjects(): Promise<ProjectView[]> {
  const [repos, tasks, statusRead] = await Promise.all([
    getGithub().listRepos(),
    getGithub().listTasks(),
    getBee().readStatus(),
  ]);

  const beeRepos = statusRead.ok ? statusRead.status.repos : [];
  const running = statusRead.ok ? statusRead.status.running : [];

  return repos.map((r) => {
    const cua = tasks.filter((t) => t.slug === r.slug && t.state === "open");
    return {
      slug: r.slug,
      full: r.full,
      repo: beeRepos.find((b) => b.slug === r.slug) ?? null,
      running: running.filter((x) => x.repo === r.slug),
      tasks: cua,
      prs: cua.filter((t) => t.pull !== null),
    };
  });
}

export async function loadProject(slug: string): Promise<ProjectView | null> {
  return (await loadProjects()).find((p) => p.slug === slug) ?? null;
}

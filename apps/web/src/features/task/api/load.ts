import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeRunning, EvidenceRun } from "@/lib/bee/types";
import { getGithub } from "@/lib/github";
import type { GhComment, GhTask } from "@/lib/github/types";

export interface TaskView {
  task: GhTask;
  timeline: GhComment[];
  /** Bằng chứng của **đúng SHA đang là head** của PR, không phải của mọi lần chạy. */
  evidence: EvidenceRun | null;
  /** Các lần chạy cũ, để biết bằng chứng đang xem thuộc commit nào. */
  evidenceCu: EvidenceRun[];
  /** Việc reconciler đang chạy cho task này, nếu có. */
  dangChay: BeeRunning | null;
}

export async function loadTask(slug: string, num: number): Promise<TaskView | null> {
  const gh = getGithub();
  const bee = getBee();

  const task = await gh.getTask(slug, num);
  if (!task) return null;

  const [timeline, statusRead, evidenceRuns] = await Promise.all([
    gh.listTimeline(slug, num),
    bee.readStatus(),
    task.pull ? bee.listEvidence(slug, task.pull.number) : Promise.resolve([]),
  ]);

  const headSha = task.pull?.head_sha;
  const evidence = evidenceRuns.find((r) => r.sha === headSha) ?? null;

  // Reconciler đánh số việc theo issue (rule 07/08) hoặc theo PR (rule 02/04),
  // nên phải nhìn cả hai số mới biết task này có đang chạy hay không.
  const dangChay =
    (statusRead.ok
      ? statusRead.status.running.find(
          (r) =>
            r.repo === slug && (r.number === num || (task.pull && r.number === task.pull.number)),
        )
      : undefined) ?? null;

  return {
    task,
    timeline,
    evidence,
    evidenceCu: evidenceRuns.filter((r) => r.sha !== headSha),
    dangChay,
  };
}

import type { Stat } from "@/components/stat-grid";
import type { EvidenceRun } from "@/lib/bee/types";
import type { GhTask } from "@/lib/github/types";

const CHECK: Record<string, { label: string; tone: Stat["tone"] }> = {
  success: { label: "Xanh", tone: "ok" },
  failure: { label: "Red", tone: "down" },
  pending: { label: "Running", tone: "warn" },
  neutral: { label: "Inconclusive", tone: "idle" },
};

/**
 * Ba ô đầu trang task: ba câu phải trả lời được **trước khi** đọc hợp đồng —
 * test có xanh không, ai đã duyệt, có bằng chứng chưa.
 *
 * Chúng lặp lại thông tin có trong khối trạng thái bên dưới, và đó là chủ ý:
 * khối đó là bảng tra cứu đầy đủ, còn đây là câu trả lời nhanh cho người chỉ
 * muốn biết có phải bấm gì không.
 */
export function thongKeTask({
  task,
  evidence,
}: {
  task: GhTask;
  evidence: EvidenceRun | null;
}): Stat[] {
  const test = task.pull?.checks.find((c) => c.name === "bee/test");
  const approvals = task.pull?.reviews.filter((r) => r.state === "APPROVED") ?? [];

  return [
    {
      label: "bee/test",
      value: task.pull ? (CHECK[test?.conclusion ?? ""]?.label ?? "Not run") : "No PR yet",
      tone: task.pull ? CHECK[test?.conclusion ?? ""]?.tone : undefined,
      hint: task.pull ? `PR #${task.pull.number}` : "agent has not built it",
      kind: "chu",
    },
    {
      label: "Approved",
      value: String(approvals.length),
      hint:
        approvals.length === 0
          ? "nobody has approved"
          : approvals.map((r) => r.author.name).join(", "),
      tone: approvals.length > 0 ? "ok" : undefined,
    },
    {
      label: "Evidence",
      value: evidence ? String(evidence.files.length) : "0",
      hint: evidence ? `matches ${evidence.sha}` : "none for this commit",
      tone: evidence ? "ok" : undefined,
    },
  ];
}

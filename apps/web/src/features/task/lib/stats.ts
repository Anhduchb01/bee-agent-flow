import type { Stat } from "@/components/stat-grid";
import type { EvidenceRun } from "@/lib/bee/types";
import type { GhTask } from "@/lib/github/types";

const CHECK: Record<string, { label: string; tone: Stat["tone"] }> = {
  success: { label: "Xanh", tone: "ok" },
  failure: { label: "Đỏ", tone: "down" },
  pending: { label: "Đang chạy", tone: "warn" },
  neutral: { label: "Không kết luận", tone: "idle" },
};

/**
 * Bốn ô đầu trang task: bốn câu phải trả lời được **trước khi** đọc hợp đồng —
 * task đang ở đâu, test có xanh không, ai đã duyệt, có bằng chứng chưa.
 *
 * Chúng lặp lại thông tin có trong khối trạng thái bên dưới, và đó là chủ ý:
 * khối đó là bảng tra cứu đầy đủ, còn đây là câu trả lời nhanh cho người vừa mở
 * trang từ một tin Slack và chỉ muốn biết có phải bấm gì không.
 */
export function thongKeTask({
  task,
  stageLabel,
  stageTone,
  evidence,
}: {
  task: GhTask;
  stageLabel: string;
  stageTone: Stat["tone"];
  evidence: EvidenceRun | null;
}): Stat[] {
  const test = task.pull?.checks.find((c) => c.name === "bee/test");
  const approvals = task.pull?.reviews.filter((r) => r.state === "APPROVED") ?? [];

  return [
    { label: "Giai đoạn", value: stageLabel, tone: stageTone, kind: "chu" },
    {
      label: "bee/test",
      value: task.pull ? (CHECK[test?.conclusion ?? ""]?.label ?? "Chưa chạy") : "Chưa có PR",
      tone: task.pull ? CHECK[test?.conclusion ?? ""]?.tone : undefined,
      hint: task.pull ? `PR #${task.pull.number}` : "agent chưa dựng",
      kind: "chu",
    },
    {
      label: "Đã duyệt",
      value: String(approvals.length),
      hint:
        approvals.length === 0
          ? "chưa ai duyệt"
          : approvals.map((r) => r.author.name).join(", "),
      tone: approvals.length > 0 ? "ok" : undefined,
    },
    {
      label: "Bằng chứng",
      value: evidence ? String(evidence.files.length) : "0",
      hint: evidence ? `khớp ${evidence.sha}` : "chưa có cho commit này",
      tone: evidence ? "ok" : undefined,
    },
  ];
}

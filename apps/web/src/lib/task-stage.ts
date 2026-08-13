import type { Tone } from "@/components/status-dot";
import type { GhTask } from "@/lib/github/types";

/*
 * Nằm ở `lib/` chứ không ở `features/project/` vì **hai** feature cần nó:
 * bảng kanban của dự án, và biểu đồ phân bố ở Tổng quan. Theo AGENTS.md §4 thì
 * nâng lên khi có feature thứ hai cần, không nâng theo dự đoán.
 *
 * Nó cũng phải là module thuần: barrel của `features/project` xuất cả server
 * action, nên import qua barrel kéo theo next-auth và làm hỏng mọi bài test cho
 * một hàm không chạm mạng.
 */

/**
 * Giai đoạn của một task trong vòng đời thật của reconciler.
 *
 * Luồng: `status:draft` → (người) `status:ready-for-spec` → (rule 08)
 * `status:spec-review` → (người duyệt spec) `agent:build` → (người opt-in)
 * `agent:eligible` → rule 07 dựng → PR → duyệt → merge trên GitHub.
 *
 * Nhãn là **tập hợp**, không phải một trường trạng thái: một issue có thể mang
 * `agent:build` lẫn `needs-human` cùng lúc. Nên giai đoạn phải suy ra theo thứ
 * tự ưu tiên, và thứ tự đó là "trạng thái cụ thể nhất thắng" — giống hệt luật
 * của hộp thư, vì cùng một lý do: một task đứng ở đúng một chỗ.
 */
export type Stage =
  | "nhap"
  | "cho-spec"
  | "cho-giao"
  | "agent-lam"
  | "cho-duyet"
  | "can-nguoi";

/** Thứ tự trái → phải trên bảng kanban, theo đúng chiều công việc chảy. */
export const STAGES: Stage[] = [
  "nhap",
  "cho-spec",
  "cho-giao",
  "agent-lam",
  "cho-duyet",
  "can-nguoi",
];

export const STAGE_LABEL: Record<Stage, string> = {
  nhap: "Draft",
  "cho-spec": "Spec review",
  "cho-giao": "Ready to assign",
  "agent-lam": "Agent working",
  "cho-duyet": "PR review",
  "can-nguoi": "Needs human",
};

export const STAGE_TONE: Record<Stage, Tone> = {
  nhap: "idle",
  "cho-spec": "ok",
  "cho-giao": "warn",
  "agent-lam": "agent",
  "cho-duyet": "ok",
  "can-nguoi": "down",
};

/** Một câu trả lời cho "đang chờ gì" — hiện dưới tên cột, không phải chú thích. */
export const STAGE_HINT: Record<Stage, string> = {
  nhap: "PM still writing, agent hasn't looked",
  "cho-spec": "rule 08 scores clarity, then a human approves",
  "cho-giao": "spec approved, waiting for someone to add agent:eligible",
  "agent-lam": "running, or queued on the machine",
  "cho-duyet": "PR open, waiting for review and merge on GitHub",
  "can-nguoi": "agent stopped, needs a human to unblock",
};

export function stageOf(task: GhTask): Stage {
  const l = new Set(task.labels);

  if (l.has("needs-human")) return "can-nguoi";
  if (task.pull && !task.pull.draft) return "cho-duyet";
  if (l.has("agent:running") || (l.has("agent:build") && l.has("agent:eligible"))) {
    return "agent-lam";
  }
  if (l.has("agent:build")) return "cho-giao";
  if (l.has("status:ready-for-spec") || l.has("status:spec-review")) return "cho-spec";
  return "nhap";
}

export interface Cot {
  stage: Stage;
  tasks: GhTask[];
}

/**
 * Xếp task vào cột. **Luôn trả về đủ sáu cột**, kể cả cột rỗng: một bảng kanban
 * mất cột khi không có thẻ nào thì mỗi lần mở lên lại có hình dạng khác, và
 * người dùng không còn học được vị trí của thứ gì.
 */
export function xepTheoStage(tasks: GhTask[]): Cot[] {
  const nhom = new Map<Stage, GhTask[]>(STAGES.map((s) => [s, []]));
  for (const t of tasks) {
    if (t.state !== "open") continue;
    nhom.get(stageOf(t))!.push(t);
  }
  return STAGES.map((stage) => ({
    stage,
    // Mới cập nhật lên trước — thẻ vừa động đậy là thẻ đáng nhìn.
    tasks: nhom.get(stage)!.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  }));
}

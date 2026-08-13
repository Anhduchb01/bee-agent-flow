import type { Actor, GhComment, GhTask } from "@/lib/github/types";

/**
 * Năm loại mục của hộp thư, theo `docs/specs/web.md` §4.1.
 *
 * Điều kiện lấy từ `rule_scan()` của từng rule chứ không từ spec: spec viết
 * `status:approved`, nhãn đó không tồn tại trong `repo_sync_labels()`. Rule 07
 * chạy khi issue có **cả** `agent:build` lẫn `agent:eligible`, nên "chờ cho
 * phép nhận task" = có `agent:build` mà thiếu `agent:eligible` — đúng như mô tả
 * của chính nhãn đó: "opt-in, người gắn".
 */
export type InboxKind =
  | "can-nguoi"
  | "agent-hoi-nguoc"
  | "duyet-pr"
  | "duyet-spec"
  | "cho-phep-nhan-task";

export type ActionKind = "mo-task" | "giao-agent" | "duyet-spec" | "duyet-pr" | "tra-loi";

export interface InboxItem {
  key: string;
  kind: InboxKind;
  slug: string;
  number: number;
  title: string;
  /** Chờ từ lúc nào — đây là khoá xếp hạng duy nhất. */
  waitingSince: string;
  waitingS: number;
  priority: boolean;
  prNumber: number | null;
  prUrl: string | null;
  action: { kind: ActionKind; label: string };
}

export interface InboxInput {
  tasks: GhTask[];
  /** Khoá `<slug>#<số issue>`. */
  timelines: Record<string, GhComment[]>;
  hasEvidence: (slug: string, prNumber: number, sha: string) => boolean;
  actor: Actor;
  now?: Date;
}

export const KIND_LABEL: Record<InboxKind, string> = {
  "can-nguoi": "Cần người",
  "agent-hoi-nguoc": "Agent hỏi ngược",
  "duyet-pr": "Duyệt PR",
  "duyet-spec": "Duyệt spec",
  "cho-phep-nhan-task": "Cho phép nhận task",
};

/**
 * Một task chỉ sinh **một** mục.
 *
 * Không có luật này thì #49 — có PR nháp, đang chờ trả lời agent, và có
 * `agent:build` — xuất hiện ba lần trong một danh sách phẳng, và người đọc phải
 * tự nhận ra đó là cùng một việc. Thứ tự dưới đây là thứ tự "lý do chặn cụ thể
 * nhất thắng".
 */
const PRECEDENCE: InboxKind[] = [
  "can-nguoi",
  "agent-hoi-nguoc",
  "duyet-pr",
  "duyet-spec",
  "cho-phep-nhan-task",
];

function lastComment(comments: GhComment[]): GhComment | undefined {
  return [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
}

/** Người cuối cùng nói chuyện trong task, không tính agent. */
function lastHuman(comments: GhComment[]): string | null {
  const humans = comments.filter((c) => !c.from_agent);
  return humans.length > 0 ? (lastComment(humans)?.author.login ?? null) : null;
}

function agentDangHoi(comments: GhComment[]): GhComment | null {
  const last = lastComment(comments);
  if (!last?.from_agent) return null;
  return last.body.trimEnd().endsWith("?") ? last : null;
}

/** `bee/test` xanh là điều kiện cứng — không ai duyệt một PR chưa qua test. */
function testXanh(task: GhTask): boolean {
  return task.pull?.checks.some((c) => c.name === "bee/test" && c.conclusion === "success") ?? false;
}

interface Candidate {
  kind: InboxKind;
  waitingSince: string;
  action: { kind: ActionKind; label: string };
}

function candidates(task: GhTask, input: InboxInput): Candidate[] {
  const { actor } = input;
  const comments = input.timelines[`${task.slug}#${task.number}`] ?? [];
  const labels = new Set(task.labels);
  const out: Candidate[] = [];

  if (labels.has("needs-human")) {
    out.push({
      kind: "can-nguoi",
      waitingSince: task.updated_at,
      action: { kind: "mo-task", label: "Mở task" },
    });
  }

  const hoi = agentDangHoi(comments);
  if (hoi) {
    // Câu hỏi chặn ở người cuối cùng đã nói chuyện; chưa ai nói thì chặn ở
    // người mở task. Hỏi vào khoảng không thì không ai trả lời.
    const nguoiBiChan = lastHuman(comments) ?? task.author.login;
    if (nguoiBiChan === actor.login) {
      out.push({
        kind: "agent-hoi-nguoc",
        waitingSince: hoi.created_at,
        action: { kind: "tra-loi", label: "Trả lời" },
      });
    }
  }

  if (task.pull && !task.pull.draft && testXanh(task)) {
    const coBangChung = input.hasEvidence(task.slug, task.pull.number, task.pull.head_sha);
    const daDuyet = task.pull.reviews.some(
      (r) => r.author.login === actor.login && r.state === "APPROVED",
    );
    if (coBangChung && !daDuyet) {
      out.push({
        kind: "duyet-pr",
        waitingSince: task.updated_at,
        action:
          actor.role === "pm"
            ? { kind: "duyet-pr", label: "Duyệt" }
            : { kind: "mo-task", label: "Xem PR" },
      });
    }
  }

  // Duyệt spec là việc của PM — TL sống ở diff, không ở AC.
  if (labels.has("status:spec-review") && actor.role === "pm") {
    out.push({
      kind: "duyet-spec",
      waitingSince: task.updated_at,
      action: { kind: "duyet-spec", label: "Duyệt spec" },
    });
  }

  if (labels.has("agent:build") && !labels.has("agent:eligible") && !labels.has("agent:running")) {
    out.push({
      kind: "cho-phep-nhan-task",
      waitingSince: task.updated_at,
      action: { kind: "giao-agent", label: "Giao cho agent" },
    });
  }

  return out;
}

export function deriveInbox(input: InboxInput): InboxItem[] {
  const now = input.now ?? new Date();
  const items: InboxItem[] = [];

  for (const task of input.tasks) {
    if (task.state !== "open") continue;

    const found = candidates(task, input);
    if (found.length === 0) continue;

    const chosen = found.sort(
      (a, b) => PRECEDENCE.indexOf(a.kind) - PRECEDENCE.indexOf(b.kind),
    )[0];

    const waitingS = Math.max(
      0,
      Math.round((now.getTime() - Date.parse(chosen.waitingSince)) / 1000),
    );

    items.push({
      key: `${task.slug}#${task.number}`,
      kind: chosen.kind,
      slug: task.slug,
      number: task.number,
      title: task.title,
      waitingSince: chosen.waitingSince,
      waitingS: Number.isFinite(waitingS) ? waitingS : 0,
      priority: task.labels.includes("priority:high"),
      prNumber: task.pull?.number ?? null,
      prUrl: task.pull?.url ?? null,
      action: chosen.action,
    });
  }

  // Chờ lâu nhất lên đầu. Không phân trang, không tab, không board — spec §4.1.
  // `priority:high` hiện thành nhãn chứ không chen chỗ: nó là ưu tiên của hàng
  // đợi máy, còn thứ tự ở đây trả lời "ai đã chờ tôi lâu nhất".
  return items.sort((a, b) => b.waitingS - a.waitingS || a.key.localeCompare(b.key));
}

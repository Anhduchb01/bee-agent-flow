import type {
  BeeSessionMode,
  BeeSessionModel,
  Queue,
  ItemStatus,
  QueueItem,
} from "@/lib/bee/types";

export type { Queue, ItemStatus, QueueItem };
export { nextQueueItem } from "@/lib/bee/queue-next";

/**
 * Hàng đợi Autopilot — thuần, không I/O.
 *
 * Ba chốt của chủ dự án (spec V3 D5) nằm cả trong file này:
 *   · **luôn sống**, không phải khung giờ "tối nay" → chỉ có cờ `paused`;
 *   · **chỉ nhận issue** → mỗi mục bắt buộc repo + số issue, không prompt tự do;
 *   · **xong vẫn ở lại** → `done`/`failed` không bị xoá khỏi hàng, chúng là
 *     lịch sử đêm qua mà bản tin sáng (T10) sẽ đọc.
 *
 * Thứ tự trong mảng LÀ thứ tự chạy — trên cùng chạy trước, đúng như lane
 * kanban người dùng nhìn thấy.
 */

export interface NewItem {
  slug: string;
  repo: string;
  issue: number;
  mode?: BeeSessionMode;
  model?: BeeSessionModel;
}

/** Khoá của một việc là (repo, issue) — cùng số issue ở hai repo là hai việc. */
function same(a: { repo: string; issue: number }, repo: string, issue: number): boolean {
  return a.repo === repo && a.issue === issue;
}

export function addQueueItem(q: Queue, v: NewItem, at = new Date()): Queue {
  if (q.items.some((i) => same(i, v.repo, v.issue))) return q;
  return {
    ...q,
    items: [
      ...q.items,
      {
        slug: v.slug,
        repo: v.repo,
        issue: v.issue,
        mode: v.mode ?? "auto",
        model: v.model ?? "default",
        status: "waiting",
        sessionId: null,
        reason: null,
        added_at: at.toISOString(),
      },
    ],
  };
}

export function removeQueueItem(q: Queue, repo: string, issue: number): Queue {
  return { ...q, items: q.items.filter((i) => !same(i, repo, issue)) };
}

/** Đổi thứ tự một bậc. Ở đầu/cuối rồi thì không đi đâu cả — không quay vòng. */
export function reorderQueueItem(q: Queue, repo: string, issue: number, buoc: -1 | 1): Queue {
  const i = q.items.findIndex((x) => same(x, repo, issue));
  if (i === -1) return q;
  const j = i + buoc;
  if (j < 0 || j >= q.items.length) return q;
  const items = [...q.items];
  [items[i], items[j]] = [items[j]!, items[i]!];
  return { ...q, items };
}


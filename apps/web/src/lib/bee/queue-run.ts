import { nextQueueItem } from "./queue-next";
import type { Queue, QueueItem } from "./types";

/**
 * Một nhịp của hàng đợi Autopilot — hàm THUẦN theo nghĩa mọi tác dụng phụ đều
 * đi qua tham số (`openSession`, `ghi`). Nhờ vậy cái vòng chạy lúc 2 giờ sáng được
 * kiểm bằng test bàn giấy, không phải bằng cách thức đêm nhìn nó.
 *
 * Ba nguyên tắc:
 *  · **Mỗi nhịp mở nhiều nhất MỘT phiên.** Tick sau mở tiếp. Dồn cả hàng vào
 *    một nhịp là cách nhanh nhất để đốt hạn mức và lấp đĩa cùng lúc.
 *  · **Không nuốt lý do.** Từ chối vì PAUSE, vì ⏸, vì hết slot, vì phanh hạn
 *    mức — bốn chuyện khác nhau, và sáng dậy người dùng cần biết cái nào.
 *  · **Từ chối không được làm mất việc.** `openSession` hỏng thì việc quay lại
 *    `waiting` kèm lý do, không phải biến mất hay kẹt ở `running`.
 */

export interface TickResult {
  opened: QueueItem | null;
  reason: string;
}

export interface TickPorts {
  queue: Queue;
  /** File PAUSE của cả máy — khác với ⏸ của riêng hàng đợi. */
  paused: boolean;
  runningCount: number;
  maxParallel?: number;
  openSession: (v: QueueItem) => Promise<{ ok: true; id: string } | { ok: false; message: string }>;
  writer: (q: Queue) => Promise<void>;
}

function patch(q: Queue, v: QueueItem, swapWith: Partial<QueueItem>): Queue {
  return {
    ...q,
    items: q.items.map((i) =>
      i.repo === v.repo && i.issue === v.issue ? { ...i, ...swapWith } : i,
    ),
  };
}

export async function runOneTick(owner: TickPorts): Promise<TickResult> {
  const maxCount = owner.maxParallel ?? 1;

  if (owner.paused) return { opened: null, reason: "PAUSE is on — the machine opens no sessions" };
  if (owner.queue.paused) return { opened: null, reason: "the queue is paused (⏸)" };
  if (owner.runningCount >= maxCount) {
    return { opened: null, reason: `${maxCount} session(s) already running — waiting for a slot` };
  }

  const item = nextQueueItem(owner.queue, { maxParallel: maxCount });
  if (item === null) return { opened: null, reason: "nothing left waiting in the queue" };

  const outcome = await owner.openSession(item);
  if (!outcome.ok) {
    // Phanh hạn mức (T5) trả lời ở đây. Việc KHÔNG mất và KHÔNG kẹt: nó về lại
    // waiting kèm lý do, nhịp sau thử lại khi hạn mức đã reset.
    await owner.writer(patch(owner.queue, item, { status: "waiting", reason: outcome.message }));
    return { opened: null, reason: outcome.message };
  }

  await owner.writer(
    patch(owner.queue, item, { status: "running", sessionId: outcome.id, reason: null }),
  );
  return { opened: item, reason: `opened a session for ${item.repo}#${item.issue}` };
}

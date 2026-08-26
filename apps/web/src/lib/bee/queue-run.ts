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
  ghi: (q: Queue) => Promise<void>;
}

function capNhat(q: Queue, v: QueueItem, thay: Partial<QueueItem>): Queue {
  return {
    ...q,
    items: q.items.map((i) =>
      i.repo === v.repo && i.issue === v.issue ? { ...i, ...thay } : i,
    ),
  };
}

export async function runOneTick(cua: TickPorts): Promise<TickResult> {
  const toiDa = cua.maxParallel ?? 1;

  if (cua.paused) return { opened: null, reason: "PAUSE is on — the machine opens no sessions" };
  if (cua.queue.paused) return { opened: null, reason: "the queue is paused (⏸)" };
  if (cua.runningCount >= toiDa) {
    return { opened: null, reason: `${toiDa} session(s) already running — waiting for a slot` };
  }

  const viec = nextQueueItem(cua.queue, { maxParallel: toiDa });
  if (viec === null) return { opened: null, reason: "nothing left waiting in the queue" };

  const ket = await cua.openSession(viec);
  if (!ket.ok) {
    // Phanh hạn mức (T5) trả lời ở đây. Việc KHÔNG mất và KHÔNG kẹt: nó về lại
    // waiting kèm lý do, nhịp sau thử lại khi hạn mức đã reset.
    await cua.ghi(capNhat(cua.queue, viec, { status: "waiting", reason: ket.message }));
    return { opened: null, reason: ket.message };
  }

  await cua.ghi(
    capNhat(cua.queue, viec, { status: "running", sessionId: ket.id, reason: null }),
  );
  return { opened: viec, reason: `opened a session for ${viec.repo}#${viec.issue}` };
}

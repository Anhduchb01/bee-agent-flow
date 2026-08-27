import "server-only";

import { getBee } from "@/lib/bee";
import { readQueue } from "@/lib/bee/queue-fs";
import type { BeeArtifact } from "@/lib/bee/types";

import { buildDigest, type Digest } from "../lib/digest";

/**
 * Cửa sổ của trang Activity: **24 giờ trượt**, không phải "từ 18:00 hôm qua".
 *
 * Bản đầu cắt theo mốc 18:00 vì hình dung việc chỉ chạy ban đêm. Nhưng
 * Autopilot chưa bao giờ có khung giờ — `bee-tick.timer` gõ mỗi 30 phút suốt
 * ngày, và giờ có thêm nút "Run now". Một cửa sổ bắt đầu lúc 18:00 sẽ GIẤU
 * mọi thứ chạy trong ngày cho tới khi trời tối: mở trang lúc 3 giờ chiều thấy
 * "chưa chạy gì" trong khi ba phiên vừa xong lúc 2 giờ. Trang này tồn tại để
 * nói ra chuyện gì đã xảy ra, nên nó không được có điểm mù nào theo giờ.
 */
export function recentWindow(at = new Date(), hours = 24): { since: Date; until: Date } {
  return { since: new Date(at.getTime() - hours * 3_600_000), until: at };
}

export async function loadDigest(at = new Date()): Promise<Digest> {
  const bee = getBee();
  const { since, until } = recentWindow(at);
  const [session, queue] = await Promise.all([
    bee.listSessions(),
    readQueue(process.env.BEE_SRV ?? "/srv/bee"),
  ]);

  // Chỉ lấy artifact của phiên trong khoảng — n phiên cũ không đáng một lượt
  // đọc đĩa mỗi lần mở trang.
  const within = session.filter((p) => {
    const stamp = p.ended_at ?? p.started_at ?? p.created_at;
    return stamp !== null && new Date(stamp).getTime() >= since.getTime();
  });
  const artifacts: Record<string, BeeArtifact[]> = Object.fromEntries(
    await Promise.all(within.map(async (p) => [p.id, await bee.sessionArtifacts(p.id)] as const)),
  );

  return buildDigest({ session, artifacts, queue, since, until });
}

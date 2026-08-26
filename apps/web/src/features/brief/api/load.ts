import "server-only";

import { getBee } from "@/lib/bee";
import { docHangDoi } from "@/lib/bee/queue-fs";
import type { BeeArtifact } from "@/lib/bee/types";

import { dungBanTin, type BanTin } from "../lib/tom-tat";

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
export function recentWindow(luc = new Date(), soGio = 24): { tu: Date; den: Date } {
  return { tu: new Date(luc.getTime() - soGio * 3_600_000), den: luc };
}

export async function loadBanTin(luc = new Date()): Promise<BanTin> {
  const bee = getBee();
  const { tu, den } = recentWindow(luc);
  const [phien, hangDoi] = await Promise.all([
    bee.listSessions(),
    docHangDoi(process.env.BEE_SRV ?? "/srv/bee"),
  ]);

  // Chỉ lấy artifact của phiên trong khoảng — n phiên cũ không đáng một lượt
  // đọc đĩa mỗi lần mở trang.
  const trong = phien.filter((p) => {
    const moc = p.ended_at ?? p.started_at ?? p.created_at;
    return moc !== null && new Date(moc).getTime() >= tu.getTime();
  });
  const artifacts: Record<string, BeeArtifact[]> = Object.fromEntries(
    await Promise.all(trong.map(async (p) => [p.id, await bee.sessionArtifacts(p.id)] as const)),
  );

  return dungBanTin({ phien, artifacts, hangDoi, tu, den });
}

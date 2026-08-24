import "server-only";

import { getBee } from "@/lib/bee";
import { docHangDoi } from "@/lib/bee/queue-fs";
import type { BeeArtifact } from "@/lib/bee/types";

import { dungBanTin, type BanTin } from "../lib/tom-tat";

/**
 * "Đêm qua" = từ 18:00 hôm qua tới lúc mở trang. Không phải 00:00–24:00: người
 * xếp việc lúc tối muộn và đọc bản tin lúc sáng, nên cắt theo mốc đó mới khớp
 * với cách dùng thật.
 */
export function khoangDem(luc = new Date()): { tu: Date; den: Date } {
  const tu = new Date(luc);
  tu.setHours(18, 0, 0, 0);
  if (tu.getTime() > luc.getTime()) tu.setDate(tu.getDate() - 1);
  return { tu, den: luc };
}

export async function loadBanTin(luc = new Date()): Promise<BanTin> {
  const bee = getBee();
  const { tu, den } = khoangDem(luc);
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

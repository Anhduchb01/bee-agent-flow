import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeSession } from "@/lib/bee/types";

export interface NhomPhien {
  repo: string;
  phien: BeeSession[];
}

/**
 * Danh sách phiên nhóm theo repo — màn hình gốc mới của app. Thứ tự nhóm theo
 * phiên mới nhất của nhóm; phiên `needs_human` không cần xếp riêng ở đây,
 * component tô đỏ và người dùng thấy ngay vì nhóm nào cũng chỉ vài dòng.
 */
export async function loadSessions(): Promise<NhomPhien[]> {
  const tatCa = await getBee().listSessions();
  const nhom = new Map<string, BeeSession[]>();
  for (const p of tatCa) {
    const ds = nhom.get(p.repo) ?? [];
    ds.push(p);
    nhom.set(p.repo, ds);
  }
  return [...nhom.entries()].map(([repo, phien]) => ({ repo, phien }));
}

export async function loadSession(id: string): Promise<BeeSession | null> {
  return getBee().readSession(id);
}

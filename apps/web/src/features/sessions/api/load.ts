import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeArtifact, BeeSession } from "@/lib/bee/types";

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
    // Phiên chat không repo gom vào một nhóm riêng — "Chats" là nhãn, không
    // phải tên repo, và ở cuối danh sách cho đỡ lẫn.
    const khoa = p.repo === "" ? "Chats" : p.repo;
    const ds = nhom.get(khoa) ?? [];
    ds.push(p);
    nhom.set(khoa, ds);
  }
  return [...nhom.entries()]
    .map(([repo, phien]) => ({ repo, phien }))
    .sort((a, b) => (a.repo === "Chats" ? 1 : b.repo === "Chats" ? -1 : 0));
}

/** Repo đã đăng ký — cho dropdown của form tạo phiên. */
export async function loadRepos() {
  return getBee().listRepos();
}

export async function loadSession(id: string): Promise<BeeSession | null> {
  return getBee().readSession(id);
}

/** Dữ liệu cho trang canvas: nhóm phiên + artifact + preview câu cuối. */
export async function loadCanvas(): Promise<{
  nhom: NhomPhien[];
  artifacts: Record<string, BeeArtifact[]>;
  xemTruoc: Record<string, string | null>;
}> {
  const nhom = await loadSessions();
  const bee = getBee();
  const artifacts: Record<string, BeeArtifact[]> = {};
  const xemTruoc: Record<string, string | null> = {};
  await Promise.all(
    nhom.flatMap((g) =>
      g.phien.map(async (p) => {
        [artifacts[p.id], xemTruoc[p.id]] = await Promise.all([
          bee.sessionArtifacts(p.id),
          bee.sessionPreview(p.id),
        ]);
      }),
    ),
  );
  return { nhom, artifacts, xemTruoc };
}

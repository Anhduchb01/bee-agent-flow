import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeArtifact, BeeSession } from "@/lib/bee/types";

export interface SessionGroup {
  repo: string;
  phien: BeeSession[];
}

/**
 * Danh sách phiên nhóm theo repo — màn hình gốc mới của app. Thứ tự nhóm theo
 * phiên mới nhất của nhóm; phiên `needs_human` không cần xếp riêng ở đây,
 * component tô đỏ và người dùng thấy ngay vì nhóm nào cũng chỉ vài dòng.
 */
export async function loadSessions(): Promise<SessionGroup[]> {
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

/** Dữ liệu cho trang canvas: nhóm phiên + artifact + preview câu cuối + demo. */
export async function loadCanvas(): Promise<{
  nhom: SessionGroup[];
  artifacts: Record<string, BeeArtifact[]>;
  xemTruoc: Record<string, string | null>;
  videos: Record<string, { name: string; url: string }[]>;
}> {
  const nhom = await loadSessions();
  const bee = getBee();
  const artifacts: Record<string, BeeArtifact[]> = {};
  const xemTruoc: Record<string, string | null> = {};
  const videos: Record<string, { name: string; url: string }[]> = {};
  await Promise.all(
    nhom.flatMap((g) =>
      g.phien.map(async (p) => {
        let evidence;
        [artifacts[p.id], xemTruoc[p.id], evidence] = await Promise.all([
          bee.sessionArtifacts(p.id),
          bee.sessionPreview(p.id),
          bee.listSessionEvidence(p.id),
        ]);
        // Chỉ video mọc node 🎬 — ảnh đã sống trong panel duyệt PR.
        videos[p.id] = evidence
          .filter((f) => f.loai === "video")
          .map((f) => ({ name: f.name, url: f.url }));
      }),
    ),
  );
  return { nhom, artifacts, xemTruoc, videos };
}

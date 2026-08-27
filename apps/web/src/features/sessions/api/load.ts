import "server-only";

import { getBee } from "@/lib/bee";
import type { BeeArtifact, BeeSession } from "@/lib/bee/types";

export interface SessionGroup {
  repo: string;
  session: BeeSession[];
}

/**
 * Danh sách phiên nhóm theo repo — màn hình gốc mới của app. Thứ tự nhóm theo
 * phiên mới nhất của nhóm; phiên `needs_human` không cần xếp riêng ở đây,
 * component tô đỏ và người dùng thấy ngay vì nhóm nào cũng chỉ vài dòng.
 */
export async function loadSessions(): Promise<SessionGroup[]> {
  const everything = await getBee().listSessions();
  const groups = new Map<string, BeeSession[]>();
  for (const p of everything) {
    // Phiên chat không repo gom vào một nhóm riêng — "Chats" là nhãn, không
    // phải tên repo, và ở cuối danh sách cho đỡ lẫn.
    const key = p.repo === "" ? "Chats" : p.repo;
    const bucket = groups.get(key) ?? [];
    bucket.push(p);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([repo, session]) => ({ repo, session }))
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
  groups: SessionGroup[];
  artifacts: Record<string, BeeArtifact[]>;
  previewOf: Record<string, string | null>;
  videos: Record<string, { name: string; url: string }[]>;
}> {
  const groups = await loadSessions();
  const bee = getBee();
  const artifacts: Record<string, BeeArtifact[]> = {};
  const previewOf: Record<string, string | null> = {};
  const videos: Record<string, { name: string; url: string }[]> = {};
  await Promise.all(
    groups.flatMap((g) =>
      g.session.map(async (p) => {
        let evidence;
        [artifacts[p.id], previewOf[p.id], evidence] = await Promise.all([
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
  return { groups, artifacts, previewOf, videos };
}

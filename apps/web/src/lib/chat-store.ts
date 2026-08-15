import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Lịch sử các phiên chat của app, theo dự án.
 *
 * Cùng luật với `repos-store`: **không** nằm dưới `/srv/bee` — app chỉ được đọc
 * chỗ đó, và unit systemd gắn nó ở chế độ chỉ-đọc. Không đặt
 * `BEE_WEB_STATE_DIR` thì lịch sử sống trong bộ nhớ và mất khi khởi động lại.
 *
 * Chỉ lưu TÊN phiên và một dòng tiêu đề. Nội dung hội thoại nằm trong home của
 * `bee-agent` và ở nguyên đó — chép nó ra đây là chép cả những gì người dùng gõ
 * vào một chỗ có luật giữ khác hẳn.
 */
export interface PhienChat {
  session_id: string;
  /** Câu đầu tiên người dùng gõ, cắt ngắn. */
  title: string;
  at: string;
  login: string;
}

const DIR = process.env.BEE_WEB_STATE_DIR;
const KEY = Symbol.for("bee.web.chats");
const GIU = 20;

function boNho(): Record<string, PhienChat[]> {
  const g = globalThis as unknown as Record<symbol, Record<string, PhienChat[]> | undefined>;
  g[KEY] ??= {};
  return g[KEY];
}

const FILE = (slug: string) => path.join(DIR!, "chats", `${slug}.json`);

export async function docPhien(slug: string): Promise<PhienChat[]> {
  if (!DIR) return [...(boNho()[slug] ?? [])];
  try {
    const raw: unknown = JSON.parse(await fs.readFile(FILE(slug), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is PhienChat => typeof p?.session_id === "string" && typeof p?.title === "string",
    );
  } catch {
    return [];
  }
}

export async function luuPhien(slug: string, phien: PhienChat): Promise<void> {
  const cu = await docPhien(slug);
  // Cùng `session_id` nghĩa là cùng cuộc hội thoại đang tiếp diễn — cập nhật
  // chứ không thêm dòng mới, nếu không thì mỗi lượt chat đẻ ra một mục lịch sử.
  const moi = [phien, ...cu.filter((p) => p.session_id !== phien.session_id)].slice(0, GIU);

  if (!DIR) {
    boNho()[slug] = moi;
    return;
  }
  await fs.mkdir(path.dirname(FILE(slug)), { recursive: true });
  // Ghi tạm rồi đổi tên: hai tab cùng chat thì kết quả là một trong hai danh
  // sách, không phải một file JSON đứt đôi.
  const tmp = `${FILE(slug)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(moi, null, 2), "utf8");
  await fs.rename(tmp, FILE(slug));
}

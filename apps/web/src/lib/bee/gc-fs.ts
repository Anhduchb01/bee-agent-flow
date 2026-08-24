import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

/**
 * `gc.json` — kết quả lần gc gần nhất. Đọc, không ghi.
 *
 * Thứ đáng giá nhất trong file này không phải con số byte mà là **lý do giữ**:
 * đĩa còn đầy sau khi gc chạy là chuyện phải giải thích được ngay trên màn
 * hình, không phải chuyện người dùng phải mở terminal ra đoán.
 */

export interface BeeGcItem {
  id: string;
  action: "removed" | "kept";
  reason: string;
  bytes: number;
}

export interface BeeGc {
  ts: string;
  removed: number;
  freed_bytes: number;
  age_hours: number;
  items: BeeGcItem[];
}

function laObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function so(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Một dòng của gc — thiếu hình dạng thì bỏ, không kéo cả file xuống. */
function docItem(raw: unknown): BeeGcItem | null {
  if (!laObject(raw)) return null;
  if (typeof raw.id !== "string") return null;
  if (raw.action !== "removed" && raw.action !== "kept") return null;
  return {
    id: raw.id,
    action: raw.action,
    reason: typeof raw.reason === "string" ? raw.reason : "",
    bytes: so(raw.bytes),
  };
}

export async function docGcTrong(root: string): Promise<BeeGc | null> {
  let text: string;
  try {
    text = await fs.readFile(path.join(root, "gc.json"), "utf8");
  } catch {
    return null; // gc chưa chạy lần nào — một trạng thái, không phải lỗi
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!laObject(raw)) return null;
  return {
    ts: typeof raw.ts === "string" ? raw.ts : "",
    removed: so(raw.removed),
    freed_bytes: so(raw.freed_bytes),
    age_hours: so(raw.age_hours),
    items: Array.isArray(raw.items)
      ? raw.items.map(docItem).filter((i): i is BeeGcItem => i !== null)
      : [],
  };
}

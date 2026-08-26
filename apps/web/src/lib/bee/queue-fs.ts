import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import {
  SESSION_MODES,
  SESSION_MODELS,
  type BeeSessionMode,
  type BeeSessionModel,
  type Queue,
  type TrangThaiViec,
  type QueueItem,
} from "./types";

/**
 * `queue.json` — hàng đợi Autopilot trên đĩa. FR-5.1 đòi "máy tắt không mất",
 * nên nó là file, không phải state trong RAM của web.
 *
 * Đọc theo cùng kỷ luật của cả lib/bee: JSON từ đĩa là `unknown`. Ở đây còn
 * gắt hơn một bậc — nội dung file này quyết định **tick sẽ mở phiên nào**, nên
 * một `status` lạ không được phép lái vòng lặp đó.
 */

const RONG: Queue = { items: [], paused: false };
const CAC_TRANG_THAI: TrangThaiViec[] = ["waiting", "running", "done", "failed"];

function laObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function docViec(raw: unknown): QueueItem | null {
  if (!laObject(raw)) return null;
  const { slug, repo, issue } = raw;
  if (typeof slug !== "string" || typeof repo !== "string") return null;
  if (typeof issue !== "number" || !Number.isInteger(issue) || issue <= 0) return null;
  const mode = SESSION_MODES.includes(raw.mode as BeeSessionMode)
    ? (raw.mode as BeeSessionMode)
    : "auto";
  const model = SESSION_MODELS.includes(raw.model as BeeSessionModel)
    ? (raw.model as BeeSessionModel)
    : "default";
  return {
    slug,
    repo,
    issue,
    mode,
    model,
    status: CAC_TRANG_THAI.includes(raw.status as TrangThaiViec)
      ? (raw.status as TrangThaiViec)
      : "waiting",
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : null,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    added_at: typeof raw.added_at === "string" ? raw.added_at : "",
  };
}

export async function readQueue(root: string): Promise<Queue> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(root, "queue.json"), "utf8"));
  } catch {
    return RONG; // chưa có hàng đợi, hoặc file hỏng — cả hai đều là "rỗng"
  }
  if (!laObject(raw)) return RONG;
  return {
    paused: raw.paused === true,
    items: Array.isArray(raw.items)
      ? raw.items.map(docViec).filter((v): v is QueueItem => v !== null)
      : [],
  };
}

/** tmp + rename: tick và web cùng chạm file này, không ai được thấy nửa file. */
export async function writeQueue(root: string, q: Queue): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, "queue.json");
  const tmp = path.join(root, ".queue.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(q, null, 2));
  await fs.rename(tmp, file);
}

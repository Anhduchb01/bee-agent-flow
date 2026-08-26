import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { BeeClaudeAccountUsage, BeeClaudeWindow } from "./types";

/**
 * Đọc `state/claude-usage.json` — số hạn mức cả tài khoản do tick ghi.
 * Tách riêng khỏi `machine-ctl` (nơi GHI) để phanh chỉ cần đọc, và để
 * `session-ctl` không kéo theo cả họ hàm điều khiển máy.
 */

function laObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function cuaSo(v: unknown): BeeClaudeWindow | null {
  if (!laObject(v) || typeof v.percent !== "number") return null;
  return {
    percent: v.percent,
    resets_at: typeof v.resets_at === "string" ? v.resets_at : null,
  };
}

export async function readAccountUsage(root: string): Promise<BeeClaudeAccountUsage | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(root, "state", "claude-usage.json"), "utf8"));
  } catch {
    return null; // chưa đo lần nào — phanh sẽ mở và nói rõ là đang bay mù
  }
  if (!laObject(raw)) return null;
  return {
    five_hour: cuaSo(raw.five_hour),
    seven_day: cuaSo(raw.seven_day),
    fetched_at: typeof raw.fetched_at === "string" ? raw.fetched_at : "",
  };
}

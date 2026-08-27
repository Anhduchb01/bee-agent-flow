import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { GhRepo } from "./types";

/**
 * Danh sách dự án của **app**, không phải của reconciler.
 *
 * App không có sudo, không có token orch, và không được sửa state của
 * reconciler — nên `be repo add` vẫn phải chạy tay trên máy. Giữa hai thời điểm
 * ấy thẻ dự án mang nhãn "reconciler chưa biết dự án này"; `loadProjects()` so
 * danh sách này với `status.json` để biết.
 *
 * Cùng luật với `NOTIFY_STATE_DIR`: **không** nằm dưới `/srv/bee` — app chỉ
 * được đọc chỗ đó. Không đặt `BEE_WEB_STATE_DIR` thì danh sách sống trong bộ
 * nhớ và mất khi khởi động lại; chấp nhận được lúc thử, không chấp nhận được
 * khi chạy thật.
 */
const DIR = process.env.BEE_WEB_STATE_DIR;
const KEY = Symbol.for("bee.web.repos");

function memory(): GhRepo[] {
  const g = globalThis as unknown as Record<symbol, GhRepo[] | undefined>;
  g[KEY] ??= [];
  return g[KEY];
}

const FILE = () => path.join(DIR!, "repos.json");

export async function readRepos(): Promise<GhRepo[]> {
  if (!DIR) return [...memory()];
  try {
    const raw: unknown = JSON.parse(await fs.readFile(FILE(), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is GhRepo => typeof r?.slug === "string" && typeof r?.full === "string")
      .map((r) => ({ slug: r.slug, full: r.full }));
  } catch {
    // Chưa có file là trạng thái bình thường của một bản cài mới.
    return [];
  }
}

export async function writeRepos(repos: GhRepo[]): Promise<void> {
  if (!DIR) {
    const b = memory();
    b.length = 0;
    b.push(...repos);
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  // Ghi ra file tạm rồi đổi tên: hai người bấm "thêm dự án" cùng lúc thì kết
  // quả là một trong hai danh sách, chứ không phải một file JSON đứt đôi.
  const tmp = `${FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(repos, null, 2), "utf8");
  await fs.rename(tmp, FILE());
}

/** Chuẩn hoá thứ người dùng dán vào ô nhập thành `org/repo`. */
export function normalise(input: string): { full: string; slug: string } {
  const cleaned = input
    .trim()
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(cleaned)) {
    throw new Error("Repository name must look like org/repo.");
  }
  return { full: cleaned, slug: cleaned.split("/")[1] };
}

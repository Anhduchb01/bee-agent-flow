import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { contentTypeFor, evidenceKind, resolveEvidencePath } from "./evidence-path";
import type { EvidenceFile, EvidenceRun } from "./types";

/**
 * Đọc bằng chứng từ một thư mục gốc. Fixture và đĩa thật dùng **chung** hàm này,
 * chỉ khác `root`.
 *
 * Đây là chỗ duy nhất được phép mở file bằng chứng, và vì cả hai chế độ đi qua
 * đúng một đường nên bài test chặn path traversal chạy trên fixture cũng là bài
 * test cho đường chạy thật — không phải một bản mô phỏng gần giống.
 */
async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function collect(root: string, base: string, prefix: string): Promise<EvidenceFile[]> {
  const out: EvidenceFile[] = [];
  for (const name of (await listDir(base)).sort()) {
    const abs = path.join(base, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...(await collect(root, abs, rel)));
    } else {
      out.push({ rel, name, kind: evidenceKind(name), size: stat.size });
    }
  }
  return out;
}

export async function listEvidenceIn(
  root: string,
  slug: string,
  num: number,
): Promise<EvidenceRun[]> {
  const base = resolveEvidencePath(root, [slug, String(num)]);
  if (!base) return [];

  const runs: EvidenceRun[] = [];
  for (const sha of (await listDir(base)).sort()) {
    const shaDir = resolveEvidencePath(root, [slug, String(num), sha]);
    if (!shaDir) continue;
    runs.push({ slug, number: num, sha, files: await collect(root, shaDir, "") });
  }
  return runs;
}

export async function readEvidenceFileIn(
  root: string,
  segments: string[],
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const abs = resolveEvidencePath(root, segments);
  if (!abs) return null;

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return null;
    const bytes = await fs.readFile(abs);
    return { bytes, contentType: contentTypeFor(abs) };
  } catch {
    return null;
  }
}

import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { listEvidenceIn, readEvidenceFileIn } from "./evidence-fs";
import { parseRecentLine, parseStatus } from "./parse";
import type { BeeRecentRun, BeeSource, StatusRead } from "./types";

/**
 * Đọc `/srv/bee/` thật. Chỉ đọc — app chạy dưới user `bee-web`, và mọi cách để
 * bảo máy làm gì đó đều đi qua GitHub rồi chờ reconciler nhặt.
 *
 * Phần này chỉ nghiệm thu được ở pha B, khi có một máy đã cài xong: hình dạng
 * `status.json` thật khớp `types.ts` là một trong bốn thứ fixture không chứng
 * minh được. Mọi lệch phát hiện lúc đó phải sửa ở `lib/`, không phải ở màn hình.
 */
const ROOT = process.env.BEE_SRV ?? "/srv/bee";

export function createDiskBeeSource(): BeeSource {
  return {
    async readStatus(): Promise<StatusRead> {
      const file = path.join(ROOT, "public", "status.json");
      let text: string;
      try {
        text = await fs.readFile(file, "utf8");
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return { ok: false, reason: "missing", detail: `${file} chưa tồn tại` };
        }
        return { ok: false, reason: "unreadable", detail: `${file}: ${code ?? String(e)}` };
      }
      return parseStatus(text);
    },

    async readRecent(limit = 20): Promise<BeeRecentRun[]> {
      let text: string;
      try {
        text = await fs.readFile(path.join(ROOT, "state", "recent.jsonl"), "utf8");
      } catch {
        return [];
      }
      return text
        .split("\n")
        .map(parseRecentLine)
        .filter((r): r is BeeRecentRun => r !== null)
        .reverse()
        .slice(0, limit);
    },

    listEvidence: (slug, num) => listEvidenceIn(path.join(ROOT, "evidence"), slug, num),
    readEvidenceFile: (segments) => readEvidenceFileIn(path.join(ROOT, "evidence"), segments),
  };
}
